"""Meesho search adapter with direct product URL extraction."""
import logging
from urllib.parse import quote_plus

from services.normalizer import normalized_product

from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
MEESHO_SEARCH_URL = "https://www.meesho.com/search?q={query}"
MEESHO_ITEM_SELECTOR = "a[href*='/p/'], div[class*='ProductCard'], div[class*='Card']"
MEESHO_FIELDS = {
    "title": ["p", "h2", "h3", "[class*='ProductTitle']", "[class*='title']"],
    "current_price": ["[class*='Price'], span[class*='price']", "h5", "h4"],
    "original_price": ["s", "del", "[class*='Strike']"],
    "availability": ["[class*='stock']", ".availability"],
    "url": ["a[href*='/p/']", "a[href]"],
    "image_url": "img",
}


def _is_meesho_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "meesho.com" in lowered and "/p/" in lowered


def _is_meesho_blocked(html):
    lowered = html.lower()
    return any(marker in lowered for marker in ("access denied", "captcha", "blocked", "verify you are human"))


def _extract_meesho_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1, [class*='ProductTitle'], span[class*='title']")
    price_node = soup.select_one("[class*='Price'], h4, h5")
    original_price_node = soup.select_one("s, del, [class*='Strike']")
    image_node = soup.select_one("img[src], img")
    availability_node = soup.select_one("[class*='stock'], .availability")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Meesho",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Meesho product page loaded but exact product extraction failed.")


def _playwright_meesho(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else MEESHO_SEARCH_URL.format(query=quote_plus(query))
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
            if _is_meesho_blocked(html):
                raise RuntimeError(f"Meesho returned a blocked/CAPTCHA page for {query!r}.")
            if product_page:
                return _extract_meesho_product_page(html, page.url)
            try:
                page.wait_for_selector(MEESHO_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                raise RuntimeError(
                    f"Meesho search page exposed no result cards for query {query!r}."
                ) from error
            products = extract_products(page.content(), "Meesho", page.url, MEESHO_ITEM_SELECTOR, MEESHO_FIELDS)
            if products:
                return products
            raise RuntimeError(f"Meesho page loaded cards but extraction failed for query {query!r}.")
        finally:
            context.close()
            browser.close()


def search_meesho(query):
    try:
        if _is_meesho_product_url(query):
            return _playwright_meesho(query, product_page=True)
        return _playwright_meesho(query)
    except Exception as error:
        LOGGER.warning("Meesho scrape failed for %r: %s", query, error)
        raise
