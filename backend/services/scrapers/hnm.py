"""H&M search adapter with direct product URL extraction."""
import logging
from urllib.parse import quote_plus

from services.normalizer import normalized_product

from .base import HEADERS, extract_products

LOGGER = logging.getLogger(__name__)
HNM_SEARCH_URL = "https://www2.hm.com/en_in/search-results.html?q={query}"
HNM_ITEM_SELECTOR = "article, li.product-item, div[class*='product-item'], a[href*='/productpage']"
HNM_FIELDS = {
    "title": ["h2", "h3", ".item-heading", "[class*='ProductTitle']", "a[title]"],
    "current_price": [".price", "[class*='Price']", "span[class*='price']"],
    "original_price": ["s", "del", "[class*='Strike']", ".old-price"],
    "discount": [".discount", "[class*='discount']"],
    "availability": [".stock", ".availability"],
    "url": ["a[href*='/productpage']", "a[href*='/product/']", "a[href]"],
    "image_url": "img",
}


def _is_hnm_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "hm.com" in lowered
        and ("/productpage" in lowered or "/product/" in lowered)
    )


def _is_hnm_blocked(html):
    lowered = html.lower()
    return any(marker in lowered for marker in ("access denied", "captcha", "blocked", "verify you are human"))


def _extract_hnm_product_page(html, page_url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1, [class*='ProductTitle'], .product-title")
    price_node = soup.select_one(".price, [class*='Price'], [itemprop='price']")
    original_price_node = soup.select_one("s, del, .old-price, [class*='Strike']")
    discount_node = soup.select_one(".discount, [class*='discount']")
    image_node = soup.select_one("img[src], img[itemprop='image'], img")
    availability_node = soup.select_one(".stock, .availability, [itemprop='availability']")
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
        "H&M",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("H&M product page loaded but exact product extraction failed.")


def _playwright_hnm(query, product_page=False):
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = query if product_page else HNM_SEARCH_URL.format(query=quote_plus(query))
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
            if _is_hnm_blocked(html):
                raise RuntimeError(f"H&M returned a blocked/CAPTCHA page for {query!r}.")
            if product_page:
                return _extract_hnm_product_page(html, page.url)
            try:
                page.wait_for_selector(HNM_ITEM_SELECTOR, timeout=8_000)
            except PlaywrightTimeoutError as error:
                raise RuntimeError(
                    f"H&M search page exposed no result cards for query {query!r}."
                ) from error
            products = extract_products(page.content(), "H&M", page.url, HNM_ITEM_SELECTOR, HNM_FIELDS)
            if products:
                return products
            raise RuntimeError(f"H&M page loaded cards but extraction failed for query {query!r}.")
        finally:
            context.close()
            browser.close()


def search_hnm(query):
    try:
        if _is_hnm_product_url(query):
            return _playwright_hnm(query, product_page=True)
        return _playwright_hnm(query)
    except Exception as error:
        LOGGER.warning("H&M scrape failed for %r: %s", query, error)
        raise
