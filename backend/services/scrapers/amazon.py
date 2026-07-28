"""Amazon India search adapter with explicit block/extraction diagnostics."""
import logging
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from services.normalizer import normalize_title, normalized_product
from urllib3.util.retry import Retry

from .base import HEADERS, REQUEST_TIMEOUT, extract_products

SPONSORED_PREFIX = "Sponsored Ad - "
LOGGER = logging.getLogger(__name__)
AMAZON_SEARCH_URL = "https://www.amazon.in/s?k={query}"
AMAZON_ITEM_SELECTOR = '[data-component-type="s-search-result"]'
AMAZON_FIELDS = {
    # Product-link spans first — bare h2/span often matches brand-only nodes.
    "title": [
        "a.a-link-normal.s-line-clamp-2 span",
        "a.a-link-normal h2 span",
        {"selectors": ["h2[aria-label]"], "attribute": "aria-label"},
        "h2 span",
        "h2",
    ],
    "current_price": [".a-price:not(.a-text-price) .a-offscreen", ".a-price-whole"],
    "original_price": [".a-text-price .a-offscreen", "[data-a-strike='true'] .a-offscreen"],
    "discount": [".savingsPercentage", "[aria-label*='% off']"],
    "rating": [".a-icon-alt", "[aria-label*='out of 5 stars']"],
    "review_count": ["[aria-label$='ratings']", ".s-underline-text"],
    "availability": [".a-color-price", ".a-color-success"],
    "url": ["h2 a[href]", "a.a-link-normal[href]"],
    "image_url": "img.s-image",
}


def _is_captcha_page(text):
    markers = (
        "enter the characters you see below",
        "type the characters you see in this image",
        "sorry, we just need to make sure you're not a robot",
        "/errors/validatecaptcha",
        "api-services-support@amazon.com",
    )
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def _is_blocked_or_challenge_page(text):
    markers = (
        "automated access to amazon data",
        "to discuss automated access to amazon data please contact",
        "important message",
        "we couldn't find that page",
        "dogsofamazon",
    )
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def _fetch_amazon_html(query):
    """Return (html, url) with explicit anti-bot diagnostics."""
    url = AMAZON_SEARCH_URL.format(query=quote_plus(query))
    return _fetch_amazon_url(url, f"query {query!r}")


def _fetch_amazon_url(url, label):
    """Return (html, resolved_url) with explicit anti-bot diagnostics."""
    retry = Retry(
        total=2,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        respect_retry_after_header=True,
    )
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=retry))
        response = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        text = response.text or ""
        if _is_captcha_page(text):
            raise RuntimeError(
                f"Amazon returned a CAPTCHA challenge for {label}."
            )
        if _is_blocked_or_challenge_page(text):
            raise RuntimeError(
                f"Amazon returned an anti-bot or blocked page for {label}."
            )
        return text, response.url


def _is_amazon_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "amazon." in lowered and (
        "/dp/" in lowered or "/gp/product/" in lowered or "/gp/aw/d/" in lowered
    )


def _extract_amazon_product_page(html, page_url):
    """Extract one exact Amazon product from its product page."""
    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("#productTitle")
    price_node = soup.select_one(
        "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen, "
        "#corePrice_feature_div .a-price .a-offscreen, "
        "#apex_desktop .a-price .a-offscreen, "
        ".a-price.aok-align-center .a-offscreen"
    )
    image_node = soup.select_one("#landingImage, #imgTagWrapperId img, #ebooksImgBlkFront")
    original_price_node = soup.select_one(
        "#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen, "
        "#corePrice_feature_div .a-text-price .a-offscreen"
    )
    rating_node = soup.select_one("#acrPopover, [data-hook='rating-out-of-text']")
    review_count_node = soup.select_one("#acrCustomerReviewText")
    availability_node = soup.select_one("#availability span, #outOfStock span")

    title = title_node.get_text(" ", strip=True) if title_node else None
    current_price = (
        price_node.get_text(" ", strip=True)
        if price_node else None
    )
    original_price = (
        original_price_node.get_text(" ", strip=True)
        if original_price_node else None
    )
    image_url = None
    if image_node:
        image_url = (
            image_node.get("src")
            or image_node.get("data-old-hires")
            or image_node.get("data-a-dynamic-image")
        )
    rating = None
    if rating_node:
        rating = rating_node.get("title") or rating_node.get_text(" ", strip=True)
    review_count = review_count_node.get_text(" ", strip=True) if review_count_node else None
    availability = availability_node.get_text(" ", strip=True) if availability_node else "Check availability"

    product = normalized_product(
        {
            "title": title,
            "current_price": current_price,
            "original_price": original_price,
            "rating": rating,
            "review_count": review_count,
            "availability": availability,
            "url": page_url,
            "image_url": image_url,
        },
        "Amazon India",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [_clean_amazon_products([product])[0]]

    raise RuntimeError(
        "Amazon product page loaded but exact product extraction failed "
        f"(title={title!r}, price={current_price!r}, image={bool(image_url)})."
    )


def _extract_amazon_products(html, base_url, query, source_label):
    """Extract Amazon search cards and report exactly what failed."""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(AMAZON_ITEM_SELECTOR)
    if not cards:
        page_title = soup.title.get_text(" ", strip=True) if soup.title else "unknown title"
        raise RuntimeError(
            f"Amazon {source_label} page contained no search result cards for query {query!r} "
            f"(title={page_title!r})."
        )

    products = _clean_amazon_products(
        extract_products(soup, "Amazon India", base_url, AMAZON_ITEM_SELECTOR, AMAZON_FIELDS)
    )
    if products:
        return products

    sample_title = None
    sample_image = None
    sample_price = None
    first_card = cards[0]
    title_node = first_card.select_one("a.a-link-normal.s-line-clamp-2 span, a.a-link-normal h2 span, h2[aria-label], h2 span, h2")
    image_node = first_card.select_one("img.s-image, img")
    price_node = first_card.select_one(".a-price:not(.a-text-price) .a-offscreen, .a-price-whole")
    if title_node:
        sample_title = title_node.get("aria-label") or title_node.get_text(" ", strip=True)
    if image_node:
        sample_image = image_node.get("src") or image_node.get("data-src")
    if price_node:
        sample_price = price_node.get_text(" ", strip=True)

    raise RuntimeError(
        f"Amazon {source_label} page loaded cards but product extraction failed for query {query!r} "
        f"(sample_title={sample_title!r}, sample_price={sample_price!r}, sample_image={bool(sample_image)})."
    )


def _playwright_amazon_search(query):
    """Fallback to a rendered browser session with explicit diagnostics."""
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = AMAZON_SEARCH_URL.format(query=quote_plus(query))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--disable-http2"],
        )
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            viewport={"width": 1440, "height": 1000},
            ignore_https_errors=True,
            extra_http_headers={
                "Accept-Language": HEADERS["Accept-Language"],
                "Cache-Control": "no-cache",
            },
        )
        page = context.new_page()
        page.set_default_timeout(15_000)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=15_000)
            page.wait_for_timeout(1000)
            html = page.content()
            if _is_captcha_page(html):
                raise RuntimeError(
                    f"Amazon Playwright page hit a CAPTCHA challenge for query {query!r}."
                )
            if _is_blocked_or_challenge_page(html):
                raise RuntimeError(
                    f"Amazon Playwright page returned an anti-bot or blocked page for query {query!r}."
                )
            try:
                page.wait_for_selector(AMAZON_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                page_title = page.title()
                raise RuntimeError(
                    f"Amazon Playwright page never exposed search result cards for query {query!r} "
                    f"(title={page_title!r})."
                ) from error
            return _extract_amazon_products(page.content(), page.url, query, "Playwright")
        finally:
            context.close()
            browser.close()


def _clean_amazon_products(products):
    """Strip sponsored aria-label chrome from titles when present."""
    cleaned = []
    for product in products:
        title = (product.get("title") or "").strip()
        if title.startswith(SPONSORED_PREFIX):
            title = title[len(SPONSORED_PREFIX):].strip()
            product = {
                **product,
                "title": title,
                "normalized_title": normalize_title(title),
            }
        cleaned.append(product)
    return cleaned


def search_amazon(query):
    if _is_amazon_product_url(query):
        product_page_error = None
        try:
            html, resolved_url = _fetch_amazon_url(query.strip(), "Amazon product URL")
            return _extract_amazon_product_page(html, resolved_url)
        except Exception as error:
            product_page_error = error
            LOGGER.warning("Amazon product URL extraction failed for %r: %s", query, error)
            raise RuntimeError(
                f"Amazon product URL extraction failed for {query!r}: {product_page_error}."
            ) from error

    request_error = None
    try:
        html, resolved_url = _fetch_amazon_html(query)
        return _extract_amazon_products(html, resolved_url, query, "HTTP")
    except Exception as error:
        request_error = error
        LOGGER.warning("Amazon HTTP scrape failed for %r: %s", query, error)

    try:
        return _playwright_amazon_search(query)
    except Exception as playwright_error:
        LOGGER.warning("Amazon Playwright scrape failed for %r: %s", query, playwright_error)
        if request_error:
            raise RuntimeError(
                f"Amazon scrape failed for query {query!r}. "
                f"HTTP path: {request_error}. Playwright path: {playwright_error}."
            ) from playwright_error
        raise
