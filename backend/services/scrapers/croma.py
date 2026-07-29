"""Croma JavaScript-rendered search adapter with explicit diagnostics."""
import logging
from urllib.parse import quote_plus

from services.normalizer import normalized_product
from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
CROMA_URL = "https://www.croma.com/search/?q={query}%3Arelevance%3AZAStatusFlag%3Atrue&text={query}"
CROMA_ITEM_SELECTOR = "li.product-item, div.product-item, li[data-testid='product-card']"
CROMA_FIELDS = {
    "title": [
        "h3.product-title a",
        "h2.product-title a",
        "a.product-title",
        "h3 a",
        "h2 a",
        "[data-testid='product-title']",
    ],
    "current_price": [
        ".amount",
        ".new-price",
        ".product-price .amount",
        "[data-testid='price']",
    ],
    "original_price": [".old-price", ".mrp", "del", "[data-testid='mrp']"],
    "discount": [".discount", ".discount-label", "[data-testid='discount']"],
    "rating": [".rating-text", ".rating", "[data-testid='rating']"],
    "review_count": [".review-count", ".rating-count", "[data-testid='review-count']"],
    "availability": [".stock-status", ".availability", ".out-of-stock-label"],
    "url": ["a[href*='/p/']", "a[href*='/buy-']", "a[href]"],
    "image_url": "img",
}


def _is_croma_blocked(html):
    lowered = html.lower()
    markers = (
        "access denied",
        "captcha",
        "verify you are human",
        "request unsuccessful",
        "temporarily blocked",
        "forbidden",
    )
    return any(marker in lowered for marker in markers)


def _is_croma_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "croma.com" in lowered and ("/p/" in lowered or "/buy-" in lowered)


def _extract_croma_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1.product-title, h1")
    price_node = soup.select_one(".amount, .new-price, [data-testid='price']")
    original_price_node = soup.select_one(".old-price, .mrp, del")
    image_node = soup.select_one("img[src], img")
    rating_node = soup.select_one(".rating-text, .rating, [data-testid='rating']")
    availability_node = soup.select_one(".stock-status, .availability, .out-of-stock-label")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "rating": rating_node.get_text(" ", strip=True) if rating_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Croma",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Croma product page loaded but exact product extraction failed.")


def _playwright_croma(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else CROMA_URL.format(query=quote_plus(query))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--disable-http2"],
        )
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="en-IN",
            viewport={"width": 1440, "height": 1000},
            ignore_https_errors=True,
            extra_http_headers={
                "Accept-Language": HEADERS["Accept-Language"],
                "Cache-Control": "no-cache",
                "Referer": "https://www.google.com/",
            },
        )
        page = context.new_page()
        page.set_default_timeout(18_000)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=18_000)
            page.wait_for_timeout(1500)
            html = page.content()
            if _is_croma_blocked(html):
                raise RuntimeError(f"Croma returned a blocked/CAPTCHA page for {'URL' if product_page else 'query'} {query!r}.")
            if product_page:
                return _extract_croma_product_page(html, page.url)
            try:
                page.wait_for_selector(CROMA_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                page_title = page.title()
                raise RuntimeError(
                    f"Croma search page exposed no result cards for query {query!r} "
                    f"(title={page_title!r})."
                ) from error

            products = extract_products(
                page.content(),
                "Croma",
                page.url,
                CROMA_ITEM_SELECTOR,
                CROMA_FIELDS,
            )
            if products:
                return products

            raise RuntimeError(
                f"Croma page loaded cards but title/price/url extraction failed for query {query!r}."
            )
        finally:
            context.close()
            browser.close()

def search_croma(query):
    try:
        if _is_croma_product_url(query):
            return _playwright_croma(query, product_page=True)
        return _playwright_croma(query)
    except Exception as error:
        LOGGER.warning("Croma scrape failed for %r: %s", query, error)
        raise
