"""Croma JavaScript-rendered search adapter."""
from .base import playwright_search


def search_croma(query):
    return playwright_search(
        query,
        "Croma",
        "https://www.croma.com/search/?q={query}%3Arelevance%3AZAStatusFlag%3Atrue&text={query}",
        "li.product-item, .product-item",
        {
            "title": [".product-title", "h3 a", "h2 a"],
            "current_price": [".amount", ".new-price", ".product-price"],
            "original_price": [".old-price", ".mrp", "del"],
            "discount": [".discount", ".discount-label"],
            "rating": [".rating-text", ".rating"],
            "review_count": [".review-count", ".rating-count"],
            "availability": [".stock-status", ".availability"],
            "url": ["a[href*='/p/']", "a[href]"],
            "image_url": "img",
        },
    )
