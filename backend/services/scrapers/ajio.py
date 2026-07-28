"""AJIO public search API adapter."""
import logging
from urllib.parse import urljoin

import requests

from services.normalizer import normalized_product

from .base import fetch_html, fetch_json

LOGGER = logging.getLogger(__name__)


def _is_ajio_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "ajio.com" in lowered and "/p/" in lowered


def _classify_ajio_error(error: Exception) -> RuntimeError:
    text = str(error).lower()
    if isinstance(error, requests.Timeout) or "timeout" in text:
        return RuntimeError("Request timeout")
    if isinstance(error, requests.HTTPError):
        status = getattr(getattr(error, "response", None), "status_code", None)
        if status in {401, 403, 429}:
            return RuntimeError("Bot protection detected")
        if status and status >= 500:
            return RuntimeError("Website unavailable")
        return RuntimeError("Website unavailable")
    if "access denied" in text or "captcha" in text or "blocked" in text:
        return RuntimeError("Bot protection detected")
    if "json" in text or "expecting value" in text or "parse" in text:
        return RuntimeError("Parsing failed")
    if "extract" in text:
        return RuntimeError("Parsing failed")
    return RuntimeError(str(error) or "Website unavailable")


def _extract_ajio_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1, [itemprop='name']")
    price_node = soup.select_one("[itemprop='price'], .prod-sp, .price .price-value")
    original_price_node = soup.select_one(".price .strike, .price .orginal-price")
    image_node = soup.select_one("img[src], img")
    rating_node = soup.select_one(".rating, [itemprop='ratingValue']")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get("content") if price_node and price_node.get("content") else price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "rating": rating_node.get("content") if rating_node and rating_node.get("content") else rating_node.get_text(" ", strip=True) if rating_node else None,
            "availability": "In stock",
            "url": query,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "AJIO",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Parsing failed")


def search_ajio(query):
    try:
        if _is_ajio_product_url(query):
            return _extract_ajio_product_page(query)
        try:
            payload = fetch_json(
                "https://www.ajio.com/api/search",
                params={"query": query},
            )
        except Exception as error:
            raise _classify_ajio_error(error) from error

        if not isinstance(payload, dict):
            raise RuntimeError("Parsing failed")

        products = []
        for item in payload.get("products", [])[:16]:
            images = item.get("images") or []
            image = next(
                (entry.get("url") for entry in images if entry.get("imageType") == "PRIMARY"),
                None,
            )
            price = item.get("offerPrice") or item.get("price") or {}
            original_price = item.get("wasPriceData") or {}
            brand = (item.get("fnlColorVariantData") or {}).get("brandName")
            name = item.get("name")
            product = normalized_product(
                {
                    "title": " ".join(part for part in (brand, name) if part),
                    "current_price": price.get("value"),
                    "original_price": original_price.get("value"),
                    "discount": item.get("discountPercent"),
                    "availability": "In stock",
                    "url": urljoin("https://www.ajio.com", item.get("url") or ""),
                    "image_url": image,
                },
                "AJIO",
            )
            if product["title"] and product["current_price"] and product["url"]:
                products.append(product)
        return products
    except Exception as error:
        LOGGER.warning("AJIO scrape failed for %r: %s", query, error)
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
        raise _classify_ajio_error(error) from error
