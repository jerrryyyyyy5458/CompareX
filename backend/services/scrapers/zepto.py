"""Zepto search adapter using Playwright session + BFF search API."""
import logging
import re
from urllib.parse import quote_plus

from services.normalizer import normalized_product, parse_price

from .base import HEADERS

LOGGER = logging.getLogger(__name__)
ZEPTO_SEARCH_URL = "https://www.zepto.com/search?query={query}"
DEFAULT_LOCATION = {"latitude": 12.9716, "longitude": 77.5946}


def _is_zepto_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "zepto" in lowered and "/pn/" in lowered


def _classify_zepto_error(error: Exception) -> RuntimeError:
    text = str(error).lower()
    if "playwright" in text and ("install" in text or "executable" in text):
        return RuntimeError("Website unavailable")
    if "timeout" in text:
        return RuntimeError("Request timeout")
    if any(marker in text for marker in ("captcha", "access denied", "blocked", "waf", "aws waf", "gokuprops")):
        return RuntimeError("Bot protection detected")
    if "location" in text or "serviceable" in text:
        return RuntimeError("Delivery location required")
    if "layout" in text or "selector" in text:
        return RuntimeError("Website layout changed")
    if "parsing" in text or "extract" in text:
        return RuntimeError("Parsing failed")
    if "api" in text or "internal" in text:
        return RuntimeError("Internal API unavailable")
    if "no matching" in text or "no products" in text:
        return RuntimeError("No matching products")
    return RuntimeError(str(error) or "Website unavailable")


def _is_zepto_blocked(html: str) -> bool:
    """Detect a hard AWS WAF interstitial (tiny challenge page), not normal app HTML."""
    text = html or ""
    lowered = text.lower()
    if len(text) < 6000 and any(marker in lowered for marker in ("awswaf", "gokuprops", "captcha", "access denied")):
        return True
    if "awswafcookiedomainlist" in lowered and "user-search-service" not in lowered and len(text) < 20000:
        # Challenge shell before the app hydrates.
        if "<title></title>" in lowered or "token.awswaf.com" in lowered:
            return True
    return False


def _launch_browser(playwright):
    args = ["--disable-blink-features=AutomationControlled", "--disable-http2"]
    # Prefer installed Chrome — AWS WAF is less aggressive than bundled Chromium.
    try:
        return playwright.chromium.launch(channel="chrome", headless=True, args=args)
    except Exception:
        try:
            return playwright.chromium.launch(headless=True, args=args)
        except Exception:
            return playwright.chromium.launch(channel="msedge", headless=True, args=args)


def _deep_find_products(node, bucket):
    """Walk Zepto search layout JSON for product-like objects."""
    if len(bucket) >= 40:
        return
    if isinstance(node, list):
        for item in node:
            _deep_find_products(item, bucket)
        return
    if not isinstance(node, dict):
        return

    product = node.get("product") if isinstance(node.get("product"), dict) else None
    variant = None
    if product:
        raw_variant = product.get("productVariant")
        if isinstance(raw_variant, dict):
            variant = raw_variant
        elif isinstance(raw_variant, list) and raw_variant:
            variant = raw_variant[0] if isinstance(raw_variant[0], dict) else None
        variants = product.get("productVariants")
        if variant is None and isinstance(variants, list) and variants:
            variant = variants[0] if isinstance(variants[0], dict) else None

    # Some cards nest the sellable unit directly under data.productVariant.
    if variant is None and isinstance(node.get("productVariant"), dict):
        variant = node.get("productVariant")
        product = product or node.get("product") or {}

    candidate = variant or {}
    name = (
        candidate.get("name")
        or candidate.get("productName")
        or (product or {}).get("name")
        or (product or {}).get("productName")
        or node.get("name")
    )
    brand = (product or {}).get("brand") or candidate.get("brand") or node.get("brand")
    price = (
        candidate.get("sellingPrice")
        or candidate.get("discountedSellingPrice")
        or candidate.get("price")
        or node.get("sellingPrice")
    )
    mrp = candidate.get("mrp") or candidate.get("originalPrice") or node.get("mrp")

    if name and price is not None:
        # Zepto amounts are commonly expressed in paise.
        if isinstance(price, (int, float)) and price >= 1000 and float(price).is_integer():
            # Heuristic: values like 19900 => ₹199.00; keep smaller web prices as-is.
            if price >= 1000:
                price = price / 100.0
        if isinstance(mrp, (int, float)) and mrp >= 1000 and float(mrp).is_integer():
            if mrp >= 1000:
                mrp = mrp / 100.0

        images = candidate.get("images") or candidate.get("image") or (product or {}).get("images") or []
        image_url = None
        if isinstance(images, list) and images:
            first = images[0]
            path = first.get("path") if isinstance(first, dict) else first
            if path and str(path).startswith("http"):
                image_url = path
            elif path:
                image_url = f"https://cdn.zeptonow.com/production/{path}"
        elif isinstance(images, dict):
            path = images.get("path") or images.get("url")
            if path:
                image_url = path if str(path).startswith("http") else f"https://cdn.zeptonow.com/production/{path}"
        elif isinstance(images, str):
            image_url = images

        pvid = (
            candidate.get("id")
            or candidate.get("productVariantId")
            or node.get("objectId")
            or node.get("id")
        )
        slug = re.sub(r"[^a-z0-9]+", "-", f"{brand or ''} {name}".lower()).strip("-") or "product"
        url = f"https://www.zepto.com/pn/{slug}/pvid/{pvid}" if pvid else None
        if brand and name and name.lower().startswith(str(brand).lower()):
            title = name
        else:
            title = " ".join(part for part in (brand, name) if part)
        bucket.append(
            {
                "title": title,
                "current_price": price,
                "original_price": mrp,
                "url": url,
                "image_url": image_url,
                "availability": "In stock",
            }
        )

    for value in node.values():
        if isinstance(value, (dict, list)):
            _deep_find_products(value, bucket)


def _products_from_search_payload(payload):
    raw_items = []
    _deep_find_products(payload, raw_items)
    products = []
    seen = set()
    for item in raw_items:
        product = normalized_product(item, "Zepto")
        key = (product.get("title"), product.get("current_price"), product.get("url"))
        if key in seen:
            continue
        if product["title"] and product["current_price"] and product["url"]:
            seen.add(key)
            products.append(product)
        if len(products) >= 16:
            break
    return products


def _extract_zepto_product_page(page, page_url):
    details = page.evaluate(
        """() => {
            const title = document.querySelector('h1')?.innerText?.trim() || '';
            const body = document.body?.innerText || '';
            const priceMatch = body.match(/\\u20b9\\s?[\\d,]+/);
            const img = document.querySelector('img[src]')?.src || null;
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
        "Zepto",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Parsing failed")


def _playwright_zepto(query, product_page=False):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError("Website unavailable") from error

    url = query if product_page else ZEPTO_SEARCH_URL.format(query=quote_plus(query))
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
            },
        )
        page = context.new_page()
        page.set_default_timeout(25_000)
        captured = {"response": None}

        def on_response(response):
            try:
                if (
                    "user-search-service/api/v3/search" in response.url
                    and "/filters" not in response.url
                    and response.status == 200
                    and captured["response"] is None
                ):
                    captured["response"] = response
            except Exception:
                return

        page.on("response", on_response)
        try:
            if product_page:
                page.goto(url, wait_until="domcontentloaded", timeout=25_000)
                page.wait_for_timeout(2000)
                if _is_zepto_blocked(page.content()):
                    raise RuntimeError("Bot protection detected")
                return _extract_zepto_product_page(page, page.url)

            try:
                with page.expect_response(
                    lambda response: (
                        "user-search-service/api/v3/search" in response.url
                        and "/filters" not in response.url
                        and response.status == 200
                    ),
                    timeout=25_000,
                ) as pending:
                    page.goto(url, wait_until="domcontentloaded", timeout=25_000)
                captured["response"] = pending.value
            except Exception:
                # Fallback: wait for the listener / allow WAF cookies to settle.
                if captured["response"] is None:
                    page.wait_for_timeout(2000)
                    for _ in range(30):
                        if captured["response"] is not None:
                            break
                        page.wait_for_timeout(500)
                if captured["response"] is None:
                    page.reload(wait_until="domcontentloaded", timeout=25_000)
                    for _ in range(30):
                        if captured["response"] is not None:
                            break
                        page.wait_for_timeout(500)

            if captured["response"] is None:
                if _is_zepto_blocked(page.content()):
                    raise RuntimeError("Bot protection detected")
                raise RuntimeError("Internal API unavailable")

            try:
                payload = captured["response"].json()
            except Exception as error:
                raise RuntimeError("Parsing failed") from error

            title_text = ""
            for widget in payload.get("layout") or []:
                resolver = ((widget.get("data") or {}).get("resolver") or {})
                data = resolver.get("data") or {}
                if data.get("title"):
                    title_text = str(data.get("title"))
                    break

            products = _products_from_search_payload(payload)
            if products:
                return products
            if "could not find" in title_text.lower() or "no products" in title_text.lower():
                return []
            body = (page.inner_text("body") or "").lower()
            if "select location" in body or "detect my location" in body:
                raise RuntimeError("Delivery location required")
            return []
        finally:
            context.close()
            browser.close()


def search_zepto(query):
    try:
        if _is_zepto_product_url(query):
            return _playwright_zepto(query, product_page=True)
        return _playwright_zepto(query)
    except Exception as error:
        LOGGER.warning("Zepto scrape failed for %r: %s", query, error)
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
        raise _classify_zepto_error(error) from error
