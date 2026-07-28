"""Nike search adapter with direct product URL extraction."""
import logging
from urllib.parse import quote_plus

from services.normalizer import normalized_product

from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
NIKE_SEARCH_URL = "https://www.nike.com/in/w?q={query}"
NIKE_ITEM_SELECTOR = "div.product-card, div[class*='product-card'], a[href*='/t/']"
NIKE_FIELDS = {
    "title": ["h3", ".product-card__title", "[class*='title']", "a[title]"],
    "current_price": [".product-price", "[class*='Price']", "span[class*='price']"],
    "original_price": ["s", "del", "[class*='Strike']"],
    "discount": [".discount", "[class*='discount']"],
    "availability": [".stock", ".availability"],
    "url": ["a[href*='/t/']", "a[href*='/product/']", "a[href]"],
    "image_url": "img",
}


def _is_nike_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "nike.com" in lowered
        and ("/t/" in lowered or "/product/" in lowered or "/p/" in lowered)
    )


def _is_nike_blocked(html):
    lowered = html.lower()
    return any(marker in lowered for marker in ("access denied", "captcha", "blocked", "verify you are human"))


def _extract_nike_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1, [data-test='product-title'], .product-title")
    price_node = soup.select_one("[data-test='product-price'], .product-price, [class*='Price']")
    original_price_node = soup.select_one("s, del, [class*='Strike']")
    discount_node = soup.select_one(".discount, [class*='discount']")
    image_node = soup.select_one("img[src], img[data-test='product-image'], img")
    availability_node = soup.select_one(".stock, .availability")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "discount": discount_node.get_text(" ", strip=True) if discount_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Nike",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Nike product page loaded but exact product extraction failed.")


def _playwright_nike(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else NIKE_SEARCH_URL.format(query=quote_plus(query))
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
            if _is_nike_blocked(html):
                raise RuntimeError(f"Nike returned a blocked/CAPTCHA page for {query!r}.")
            if product_page:
                return _extract_nike_product_page(html, page.url)
            try:
                page.wait_for_selector(NIKE_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                raise RuntimeError(
                    f"Nike search page exposed no result cards for query {query!r}."
                ) from error
            products = extract_products(page.content(), "Nike", page.url, NIKE_ITEM_SELECTOR, NIKE_FIELDS)
            if products:
                return products
            raise RuntimeError(f"Nike page loaded cards but extraction failed for query {query!r}.")
        finally:
            context.close()
            browser.close()


def search_nike(query):
    try:
        if _is_nike_product_url(query):
            return _playwright_nike(query, product_page=True)
        return _playwright_nike(query)
    except Exception as error:
        LOGGER.warning("Nike scrape failed for %r: %s", query, error)
        raise
