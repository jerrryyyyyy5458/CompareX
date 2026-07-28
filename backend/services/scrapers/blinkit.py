"""Blinkit search adapter using Playwright + layout search API."""
import logging
import re
from urllib.parse import quote_plus

from services.normalizer import normalized_product, parse_price

from .base import HEADERS

LOGGER = logging.getLogger(__name__)
BLINKIT_HOME = "https://blinkit.com/"
BLINKIT_SEARCH_URL = "https://blinkit.com/s/?q={query}"
DEFAULT_LOCATION = {"latitude": 12.9716, "longitude": 77.5946}


def _is_blinkit_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "blinkit.com" in lowered and "/prn/" in lowered


def _classify_blinkit_error(error: Exception) -> RuntimeError:
    text = str(error).lower()
    if "playwright" in text and ("install" in text or "executable" in text):
        return RuntimeError("Website unavailable")
    if "timeout" in text:
        return RuntimeError("Request timeout")
    if any(marker in text for marker in ("captcha", "access denied", "blocked", "waf")):
        return RuntimeError("Bot protection detected")
    if "location" in text:
        return RuntimeError("Delivery location required")
    if "layout changed" in text or "no result cards" in text or "selector" in text:
        return RuntimeError("Website layout changed")
    if "parsing" in text or "extract" in text:
        return RuntimeError("Parsing failed")
    if "no matching" in text or "no products" in text:
        return RuntimeError("No matching products")
    return RuntimeError(str(error) or "Website unavailable")


def _is_blinkit_blocked(html: str) -> bool:
    lowered = (html or "").lower()
    return any(marker in lowered for marker in ("access denied", "captcha", "verify you are human", "blocked"))


def _text_value(node):
    if node is None:
        return None
    if isinstance(node, dict):
        return node.get("text") or node.get("title") or node.get("value")
    return str(node) if node else None


def _products_from_layout_payload(payload):
    snippets = ((payload or {}).get("response") or {}).get("snippets") or []
    products = []
    for snippet in snippets:
        data = snippet.get("data") or {}
        name = _text_value(data.get("name"))
        if not name:
            continue
        product_id = str(((data.get("identity") or {}).get("id") or "")).strip()
        if not product_id or not product_id.isdigit():
            deeplink = (((data.get("click_action") or {}).get("blinkit_deeplink") or {}).get("url") or "")
            match = re.search(r"product_id=(\d+)", deeplink)
            product_id = match.group(1) if match else ""
        price = parse_price(_text_value(data.get("normal_price")) or _text_value(data.get("price")))
        original = parse_price(_text_value(data.get("mrp")))
        image = (data.get("image") or {}).get("url")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "product"
        url = f"https://blinkit.com/prn/{slug}/prid/{product_id}" if product_id else None
        inventory = data.get("inventory")
        availability = "In stock" if inventory not in (0, "0", None) else "Out of stock"
        if inventory is None:
            availability = "Check availability"
        product = normalized_product(
            {
                "title": name,
                "current_price": price,
                "original_price": original,
                "availability": availability,
                "url": url,
                "image_url": image,
            },
            "Blinkit",
        )
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
        if len(products) >= 16:
            break
    return products


def _launch_browser(playwright):
    args = ["--disable-blink-features=AutomationControlled", "--disable-http2"]
    try:
        return playwright.chromium.launch(headless=True, args=args)
    except Exception:
        return playwright.chromium.launch(channel="chrome", headless=True, args=args)


def _extract_blinkit_product_page(page, page_url):
    details = page.evaluate(
        """() => {
            const title = document.querySelector('h1')?.innerText?.trim() || '';
            const body = document.body?.innerText || '';
            const priceMatch = body.match(/\\u20b9\\s?[\\d,]+/);
            const img = document.querySelector('img[src*="cdn.grofers"], img[src]')?.src || null;
            return { title, price: priceMatch ? priceMatch[0] : null, img };
        }"""
    )
    product = normalized_product(
        {
            "title": details.get("title"),
            "current_price": details.get("price"),
            "availability": "Check availability",
            "url": page_url,
            "image_url": details.get("img"),
        },
        "Blinkit",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Parsing failed")


def _playwright_blinkit(query, product_page=False):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError("Website unavailable") from error

    search_url = query if product_page else BLINKIT_SEARCH_URL.format(query=quote_plus(query))
    with sync_playwright() as playwright:
        browser = _launch_browser(playwright)
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="en-IN",
            viewport={"width": 1440, "height": 1000},
            ignore_https_errors=True,
            geolocation=DEFAULT_LOCATION,
            permissions=["geolocation"],
            extra_http_headers={
                "Accept-Language": HEADERS["Accept-Language"],
                "Cache-Control": "no-cache",
                "Referer": "https://www.google.com/",
                "lat": str(DEFAULT_LOCATION["latitude"]),
                "lon": str(DEFAULT_LOCATION["longitude"]),
                "app_client": "consumer_web",
            },
        )
        page = context.new_page()
        page.set_default_timeout(20_000)
        try:
            page.goto(BLINKIT_HOME, wait_until="domcontentloaded", timeout=20_000)
            page.wait_for_timeout(800)
            page.evaluate(
                """({latitude, longitude}) => {
                    try {
                        localStorage.setItem(
                            'gr_location',
                            JSON.stringify({lat: latitude, lon: longitude, city: 'Bengaluru'})
                        );
                    } catch (error) {}
                }""",
                DEFAULT_LOCATION,
            )

            if product_page:
                page.goto(search_url, wait_until="domcontentloaded", timeout=20_000)
                page.wait_for_timeout(1500)
                html = page.content()
                if _is_blinkit_blocked(html):
                    raise RuntimeError("Bot protection detected")
                return _extract_blinkit_product_page(page, page.url)

            payload = None
            with page.expect_response(
                lambda response: (
                    "/v1/layout/search" in response.url
                    and "search_type=" in response.url
                    and response.status == 200
                ),
                timeout=18_000,
            ) as pending:
                page.goto(search_url, wait_until="domcontentloaded", timeout=20_000)
            try:
                payload = pending.value.json()
            except Exception as error:
                raise RuntimeError("Internal API unavailable") from error

            page.wait_for_timeout(500)
            html = page.content()
            if _is_blinkit_blocked(html):
                raise RuntimeError("Bot protection detected")

            body_text = (page.inner_text("body") or "").lower()
            products = _products_from_layout_payload(payload)
            if products:
                return products

            if "provide your delivery location" in body_text or "detect my location" in body_text:
                # Retry once via in-page fetch after location prompt is visible.
                payload = page.evaluate(
                    """async (query) => {
                        const response = await fetch(
                          `/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`,
                          { headers: { Accept: 'application/json' }, credentials: 'include' }
                        );
                        if (!response.ok) throw new Error('api ' + response.status);
                        return await response.json();
                    }""",
                    query,
                )
                products = _products_from_layout_payload(payload)
                if products:
                    return products
                raise RuntimeError("Delivery location required")

            if ((payload or {}).get("is_success") is False):
                raise RuntimeError("Internal API unavailable")
            return []
        finally:
            context.close()
            browser.close()


def search_blinkit(query):
    try:
        if _is_blinkit_product_url(query):
            return _playwright_blinkit(query, product_page=True)
        return _playwright_blinkit(query)
    except Exception as error:
        LOGGER.warning("Blinkit scrape failed for %r: %s", query, error)
        if isinstance(error, RuntimeError) and str(error) in {
            "No matching products",
            "Delivery location required",
            "Website unavailable",
            "Parsing failed",
            "Website layout changed",
            "Bot protection detected",
            "Internal API unavailable",
            "Request timeout",
        }:
            raise
        raise _classify_blinkit_error(error) from error
