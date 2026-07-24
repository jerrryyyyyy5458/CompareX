"""AJIO public search API adapter."""
from urllib.parse import urljoin

from services.normalizer import normalized_product

from .base import fetch_json


def search_ajio(query):
    payload = fetch_json(
        "https://www.ajio.com/api/search",
        params={"query": query},
    )
    products = []
    for item in payload.get("products", [])[:16]:
        images = item.get("images") or []
        image = next(
            (entry.get("url") for entry in images if entry.get("imageType") == "PRIMARY"),
            None,
        )
        price = item.get("offerPrice") or item.get("price") or {}
        original_price = item.get("wasPriceData") or {}
        product = normalized_product(
            {
                "title": " ".join(
                    part for part in (
                        (item.get("fnlColorVariantData") or {}).get("brandName"),
                        item.get("name"),
                    )
                    if part
                ),
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
