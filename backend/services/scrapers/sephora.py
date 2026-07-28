"""Sephora search adapter with direct product URL extraction."""
import logging
from urllib.parse import quote_plus

from services.normalizer import normalized_product

from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
SEPHORA_SEARCH_URL = "https://sephora.nnnow.com/search?q={query}"
SEPHORA_ITEM_SELECTOR = "div.product, div[class*='ProductCard'], li.product-item, a[href*='/p/']"
SEPHORA_FIELDS = {
    "title": ["h3 a", "h2 a", ".product-title", "[class*='title']", "a[title]"],
    "current_price": [".sp", ".price", ".final-price", "[class*='Price']"],
    "original_price": [".mrp", "s", "del"],
    "discount": [".discount", "[class*='discount']"],
    "availability": [".stock", ".availability"],
    "url": ["a[href*='/p/']", "a[href*='/product/']", "a[href]"],
    "image_url": "img",
}


def _is_sephora_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "sephora.nnnow.com" in lowered
        and ("/p/" in lowered or "/product/" in lowered or "/pd/" in lowered)
    )


def _is_sephora_blocked(html):
    lowered = html.lower()
    return any(marker in lowered for marker in ("access denied", "captcha", "blocked", "verify you are human"))


def _extract_sephora_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1.pdp__title, h1.product-title, h1")
    price_node = soup.select_one(".pdp__price, .pdp__offerPrice, .price, [itemprop='price']")
    original_price_node = soup.select_one(".pdp__mrp, .pdp__MRP, s, del")
    discount_node = soup.select_one(".discount, .pdp__discount, [class*='discount']")
    image_node = soup.select_one("img.pdp__img, [itemprop='image'], img")
    availability_node = soup.select_one(".pdp__stock, .stock-status, [itemprop='availability']")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": (
                price_node.get("content")
                if price_node and price_node.get("content")
                else price_node.get_text(" ", strip=True) if price_node else None
            ),
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "discount": discount_node.get_text(" ", strip=True) if discount_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Sephora",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Sephora product page loaded but exact product extraction failed.")


def _playwright_sephora(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else SEPHORA_SEARCH_URL.format(query=quote_plus(query))
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
            if _is_sephora_blocked(html):
                raise RuntimeError(f"Sephora returned a blocked/CAPTCHA page for {query!r}.")
            if product_page:
                return _extract_sephora_product_page(html, page.url)
            try:
                page.wait_for_selector(SEPHORA_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                raise RuntimeError(
                    f"Sephora search page exposed no result cards for query {query!r}."
                ) from error
            products = extract_products(page.content(), "Sephora", page.url, SEPHORA_ITEM_SELECTOR, SEPHORA_FIELDS)
            if products:
                return products
            raise RuntimeError(f"Sephora page loaded cards but extraction failed for query {query!r}.")
        finally:
            context.close()
            browser.close()


def search_sephora(query):
    try:
        if _is_sephora_product_url(query):
            return _playwright_sephora(query, product_page=True)
        return _playwright_sephora(query)
    except Exception as error:
        LOGGER.warning("Sephora scrape failed for %r: %s", query, error)
        raise
