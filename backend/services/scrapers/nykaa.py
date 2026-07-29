"""Nykaa server-rendered search adapter."""
from services.normalizer import normalized_product

from .base import fetch_html, selector_search


def _is_nykaa_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "nykaa.com" in lowered and "/p/" in lowered


def _extract_nykaa_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1, [data-testid='product-title']")
    price_node = soup.select_one("[data-testid='offer-price'], .css-111z9ua")
    original_price_node = soup.select_one("[data-testid='mrp-price']")
    image_node = soup.select_one("img[src], img")
    rating_node = soup.select_one("[data-testid='rating'], div[aria-label*='out of 5 star']")
    review_count_node = soup.select_one("[data-testid='review-count']")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "rating": rating_node.get("aria-label") if rating_node and rating_node.get("aria-label") else rating_node.get_text(" ", strip=True) if rating_node else None,
            "review_count": review_count_node.get_text(" ", strip=True) if review_count_node else None,
            "availability": "In stock",
            "url": query,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Nykaa",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Nykaa product page loaded but exact product extraction failed.")


def search_nykaa(query):
    if _is_nykaa_product_url(query):
        return _extract_nykaa_product_page(query)
    return selector_search(
        query,
        "Nykaa",
        "https://www.nykaa.com/search/result/?q={query}",
        "div.productWrapper",
        {
            "title": ["h2.css-xrzmfa", "h2", "[data-testid='product-name']"],
            "current_price": [".css-111z9ua", "[data-testid='offer-price']"],
            "original_price": "[data-testid='mrp-price']",
            "discount": "[data-testid='discount']",
            "rating": {
                "selectors": ["div[aria-label*='out of 5 star']", "[data-testid='rating']"],
                "attribute": "aria-label",
            },
            "review_count": ["[data-testid='review-count']", ".css-1qbvrhp"],
            "url": "a[href*='/p/']",
            "image_url": "img",
        },
    )
