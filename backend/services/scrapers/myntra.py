"""Myntra search-state adapter with explicit block and extraction diagnostics."""
import json
import logging
from urllib.parse import quote_plus, urljoin, urlsplit

from services.normalizer import normalized_product

from .base import fetch_html

LOGGER = logging.getLogger(__name__)


def _is_myntra_blocked(soup):
    text = soup.get_text(" ", strip=True).lower()
    markers = (
        "access denied",
        "please enable js",
        "captcha",
        "robot",
        "request blocked",
        "forbidden",
    )
    return any(marker in text for marker in markers)


def _extract_state_script(soup):
    script = next(
        (
            node.get_text()
            for node in soup.select("script")
            if node.get_text().startswith("window.__myx = ")
        ),
        None,
    )
    if script:
        return script

    fallback = next(
        (
            node.get_text()
            for node in soup.select("script")
            if "searchData" in node.get_text() and "__myx" in node.get_text()
        ),
        None,
    )
    return fallback


def _is_myntra_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "myntra.com" in lowered and "/buy" not in lowered


def _extract_myntra_product_page(soup, page_url):
    state_script = _extract_state_script(soup)
    state = {}
    if state_script:
        payload = state_script.split("window.__myx = ", 1)[-1].rstrip(";")
        try:
            state = json.loads(payload)
        except json.JSONDecodeError:
            state = {}

    product_data = (
        state.get("pdpData", {}).get("product")
        or state.get("pdpData", {}).get("productData")
        or state.get("productData")
        or {}
    )
    image_url = (
        product_data.get("searchImage")
        or product_data.get("defaultImages", {}).get("search")
        or product_data.get("styleImages", {}).get("default", {}).get("imageURL")
    )
    if image_url and image_url.startswith("http://"):
        image_url = f"https://{image_url.removeprefix('http://')}"
    product = normalized_product(
        {
            "title": product_data.get("productName") or product_data.get("name") or product_data.get("brand"),
            "current_price": product_data.get("price") or product_data.get("discountedPrice"),
            "original_price": product_data.get("mrp"),
            "discount": product_data.get("discountDisplayLabel"),
            "rating": product_data.get("rating"),
            "review_count": product_data.get("ratingCount"),
            "availability": "In stock" if product_data else "Check availability",
            "url": page_url,
            "image_url": image_url,
        },
        "Myntra",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]

    title_node = soup.select_one("h1.pdp-title, h1")
    price_node = soup.select_one("span.pdp-price, span.product-discountedPrice, span")
    image_node = soup.select_one("img[src], picture img")
    fallback = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "availability": "Check availability",
            "url": page_url,
            "image_url": image_node.get("src") if image_node else None,
        },
        "Myntra",
    )
    if fallback["title"] and fallback["current_price"] and fallback["url"]:
        return [fallback]
    raise RuntimeError("Myntra product page loaded but exact product extraction failed.")


def search_myntra(query):
    source = query if _is_myntra_product_url(query) else f"https://www.myntra.com/{quote_plus(query)}"
    soup = fetch_html(source)
    if _is_myntra_blocked(soup):
        message = f"Myntra returned a blocked/CAPTCHA page for query {query!r}."
        LOGGER.warning(message)
        raise RuntimeError(message)
    if _is_myntra_product_url(query):
        return _extract_myntra_product_page(soup, query)

    state_script = _extract_state_script(soup)
    if not state_script:
        page_title = soup.title.get_text(" ", strip=True) if soup.title else "unknown title"
        message = (
            f"Myntra search data was not present in the response for query {query!r} "
            f"(title={page_title!r})."
        )
        LOGGER.warning(message)
        raise RuntimeError(message)

    payload = state_script.split("window.__myx = ", 1)[-1].rstrip(";")
    try:
        state = json.loads(payload)
    except json.JSONDecodeError as error:
        message = f"Myntra search state JSON could not be parsed for query {query!r}: {error}."
        LOGGER.warning(message)
        raise RuntimeError(message) from error

    items = state.get("searchData", {}).get("results", {}).get("products", [])
    if not items:
        message = f"Myntra search state contained no product results for query {query!r}."
        LOGGER.warning(message)
        raise RuntimeError(message)

    products = []
    for item in items[:16]:
        inventory = item.get("inventoryInfo") or []
        image_url = item.get("searchImage") or item.get("defaultImages", {}).get("search")
        if image_url and image_url.startswith("http://"):
            image_url = f"https://{image_url.removeprefix('http://')}"
        product_url = urljoin(
            "https://www.myntra.com/",
            item.get("landingPageUrl") or item.get("productBaseInfoV1", {}).get("pdpUrl") or "",
        )
        current_price = (
            item.get("price")
            or item.get("discountedPrice")
            or item.get("priceInfo", {}).get("discountedPrice")
        )
        original_price = (
            item.get("mrp")
            or item.get("priceInfo", {}).get("mrp")
            or item.get("priceInfo", {}).get("originalPrice")
        )
        product = normalized_product(
            {
                "title": item.get("productName") or item.get("product") or item.get("brand"),
                "current_price": current_price,
                "original_price": original_price,
                "discount": item.get("discountDisplayLabel"),
                "rating": item.get("rating"),
                "review_count": item.get("ratingCount"),
                "availability": (
                    "In stock"
                    if any(stock.get("available") for stock in inventory)
                    else "Out of stock"
                ),
                "url": product_url,
                "image_url": image_url,
            },
            "Myntra",
        )
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
    if not products:
        sample = items[0] if items else {}
        message = (
            f"Myntra returned products for query {query!r} but extraction failed "
            f"(sample_title={sample.get('productName') or sample.get('product')!r}, "
            f"sample_price={sample.get('price') or sample.get('discountedPrice')!r}, "
            f"sample_url={sample.get('landingPageUrl')!r})."
        )
        LOGGER.warning(message)
        raise RuntimeError(message)
    return products
