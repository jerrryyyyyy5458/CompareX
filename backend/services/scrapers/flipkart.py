"""Flipkart browser-rendered search adapter with explicit diagnostics."""
import logging
from urllib.parse import quote_plus, urlsplit

from services.normalizer import normalized_product
from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
FLIPKART_URL = "https://www.flipkart.com/search?q={query}"
FLIPKART_ITEM_SELECTOR = "div[data-id], div._75nlfW, div.slAVV4"
FLIPKART_FIELDS = {
    "title": [
        "div.KzDlHZ",
        "div._4rR01T",
        "div.WKTcLC",
        "a[title]",
        "div.RG5Slk",
    ],
    "current_price": [
        "div.Nx9bqj",
        "div._30jeq3",
        "div.hZ3P6w.DeU9vF",
        "div.yRaY8j + div",
    ],
    "original_price": ["div.yRaY8j", "div._3I9_wc", "div.kRYCnD.gxR4EY"],
    "discount": ["div.UkUFwK", "div._3Ay6Sb", "span.VRRtJQ"],
    "rating": ["div.XQDdHH", "div._3LWZlK", "span.Y1HWO0"],
    "review_count": ["span.Wphh3N", "span._2_R_DZ", "span.PvbNMB"],
    "availability": ["div._16FRp0", "div.MaiFhH", "div._3xgqrA"],
    "url": ["a[href*='/p/']", "a.CGtC98[href]", "a[href]"],
    "image_url": "img",
}


def _is_flipkart_blocked(html):
    lowered = html.lower()
    markers = (
        "flipkart health+",
        "complete security check",
        "access denied",
        "unable to verify that you are human",
        "captcha",
        "bot protection",
    )
    return any(marker in lowered for marker in markers)


def _is_flipkart_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "flipkart.com" in lowered and "/p/" in lowered


def _extract_flipkart_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("span.VU-ZEz, span.B_NuCI, h1")
    price_node = soup.select_one("div.Nx9bqj.CxhGGd, div.Nx9bqj, div._30jeq3")
    original_price_node = soup.select_one("div.yRaY8j, div._3I9_wc")
    image_node = soup.select_one("img.DByuf4, img._396cs4, img")
    rating_node = soup.select_one("div.XQDdHH, div._3LWZlK")
    review_count_node = soup.select_one("span.Wphh3N, span._2_R_DZ")
    availability_node = soup.select_one("div._16FRp0, div.m-cM89, .DOjaWF")

    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "rating": rating_node.get_text(" ", strip=True) if rating_node else None,
            "review_count": review_count_node.get_text(" ", strip=True) if review_count_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Flipkart",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError(
        "Flipkart product page loaded but exact product extraction failed "
        f"(title={product['title']!r}, price={product['current_price']!r}, image={bool(product['image_url'])})."
    )


def _playwright_flipkart(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else FLIPKART_URL.format(query=quote_plus(query))
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
            page.wait_for_timeout(1200)
            html = page.content()
            if _is_flipkart_blocked(html):
                raise RuntimeError(f"Flipkart returned a blocked/CAPTCHA page for {'URL' if product_page else 'query'} {query!r}.")
            if product_page:
                return _extract_flipkart_product_page(html, page.url)
            try:
                page.wait_for_selector(FLIPKART_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                page_title = page.title()
                raise RuntimeError(
                    f"Flipkart search page exposed no result cards for query {query!r} "
                    f"(title={page_title!r})."
                ) from error

            products = extract_products(
                page.content(),
                "Flipkart",
                page.url,
                FLIPKART_ITEM_SELECTOR,
                FLIPKART_FIELDS,
            )
            if products:
                return products

            raise RuntimeError(
                f"Flipkart page loaded cards but title/price/url extraction failed for query {query!r}."
            )
        finally:
            context.close()
            browser.close()

def search_flipkart(query):
    try:
        if _is_flipkart_product_url(query):
            return _playwright_flipkart(query, product_page=True)
        return _playwright_flipkart(query)
    except Exception as error:
        LOGGER.warning("Flipkart scrape failed for %r: %s", query, error)
        raise
