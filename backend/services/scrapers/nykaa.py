"""Nykaa server-rendered search adapter."""
from .base import selector_search


def search_nykaa(query):
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
