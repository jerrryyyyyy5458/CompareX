"""HTTP and browser extraction primitives for live marketplace adapters."""
import logging
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from services.normalizer import normalized_product
from urllib3.util.retry import Retry

LOGGER = logging.getLogger(__name__)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/149.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}
REQUEST_TIMEOUT = (5, 12)


def fetch_html(url):
    """Fetch fresh public search HTML with browser-like request headers."""
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
        return BeautifulSoup(response.text, "html.parser")


def fetch_json(url, params=None):
    """Fetch a public marketplace JSON endpoint with retries."""
    retry = Retry(
        total=2,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
        respect_retry_after_header=True,
    )
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=retry))
        response = session.get(
            url,
            params=params,
            headers={**HEADERS, "Accept": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()


def _selectors(value):
    return value if isinstance(value, (list, tuple)) else [value]


def _select_one(item, selectors):
    for selector in _selectors(selectors):
        element = item.select_one(selector)
        if element:
            return element
    return None


def _text(item, selectors):
    element = _select_one(item, selectors)
    return element.get_text(" ", strip=True) if element else None


def _field_value(item, field):
    """Resolve a field from a CSS selector, attribute map, or prioritized list."""
    if isinstance(field, (list, tuple)):
        for candidate in field:
            value = _field_value(item, candidate)
            if value:
                return value
        return None
    if isinstance(field, dict):
        element = _select_one(item, field["selectors"])
        if not element:
            return None
        attribute = field.get("attribute")
        return (element.get(attribute) or element.get_text(" ", strip=True)) if attribute else element.get_text(" ", strip=True)
    return _text(item, field)


def extract_products(html, store, base_url, item_selector, fields, limit=16):
    """Normalize cards from either Requests or Playwright HTML."""
    soup = BeautifulSoup(html, "html.parser") if isinstance(html, str) else html
    products = []
    for item in soup.select(item_selector)[:limit]:
        raw = {
            key: _field_value(item, selector)
            for key, selector in fields.items()
            if key not in {"url", "image_url"}
        }
        link = _select_one(item, fields.get("url", "a[href]"))
        image = _select_one(item, fields.get("image_url", "img"))
        href = link.get("href") if link else None
        raw["url"] = urljoin(base_url, href) if href else None
        raw["image_url"] = (
            image.get("src")
            or image.get("data-src")
            or image.get("data-original")
            if image else None
        )
        product = normalized_product(raw, store)
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
    return products


def selector_search(query, store, url_template, item_selector, fields):
    """Use Requests for marketplaces whose result HTML is server-rendered."""
    url = url_template.format(query=quote_plus(query))
    return extract_products(fetch_html(url), store, url, item_selector, fields)


def playwright_search(
    query,
    store,
    url_template,
    item_selector,
    fields,
    wait_selector=None,
    timeout_ms=15_000,
):
    """Render a JavaScript marketplace in Chromium and parse its fresh DOM."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is not installed. Run 'pip install -r requirements.txt' "
            "and 'playwright install chromium'."
        ) from error

    url = url_template.format(query=quote_plus(query))
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
        page.set_default_timeout(timeout_ms)
        try:
            page.goto(url, wait_until="commit", timeout=timeout_ms)
            page.wait_for_selector(wait_selector or item_selector, timeout=timeout_ms)
            page.wait_for_timeout(800)
            html = page.content()
        finally:
            context.close()
            browser.close()
    return extract_products(html, store, url, item_selector, fields)
