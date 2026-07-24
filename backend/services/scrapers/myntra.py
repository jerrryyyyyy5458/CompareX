"""Myntra server-rendered search-state adapter."""
import json
from urllib.parse import quote_plus, urljoin

from services.normalizer import normalized_product

from .base import fetch_html


def search_myntra(query):
    soup = fetch_html(f"https://www.myntra.com/{quote_plus(query)}")
    state_script = next(
        (
            script.get_text()
            for script in soup.select("script")
            if script.get_text().startswith("window.__myx = ")
        ),
        None,
    )
    if not state_script:
        raise RuntimeError("Myntra search data was not present in the response.")

    state = json.loads(state_script.removeprefix("window.__myx = ").rstrip(";"))
    items = state.get("searchData", {}).get("results", {}).get("products", [])
    products = []
    for item in items[:16]:
        inventory = item.get("inventoryInfo") or []
        image_url = item.get("searchImage")
        if image_url and image_url.startswith("http://"):
            image_url = f"https://{image_url.removeprefix('http://')}"
        product = normalized_product(
            {
                "title": item.get("productName") or item.get("product"),
                "current_price": item.get("price"),
                "original_price": item.get("mrp"),
                "discount": item.get("discountDisplayLabel"),
                "rating": item.get("rating"),
                "review_count": item.get("ratingCount"),
                "availability": (
                    "In stock"
                    if any(stock.get("available") for stock in inventory)
                    else "Out of stock"
                ),
                "url": urljoin(
                    "https://www.myntra.com/",
                    item.get("landingPageUrl") or "",
                ),
                "image_url": image_url,
            },
            "Myntra",
        )
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
    return products
