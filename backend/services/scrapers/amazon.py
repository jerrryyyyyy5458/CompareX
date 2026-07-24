"""Amazon India server-rendered search adapter."""
from services.normalizer import normalize_title

from .base import playwright_search, selector_search

SPONSORED_PREFIX = "Sponsored Ad - "


def _clean_amazon_products(products):
    """Strip sponsored aria-label chrome from titles when present."""
    cleaned = []
    for product in products:
        title = (product.get("title") or "").strip()
        if title.startswith(SPONSORED_PREFIX):
            title = title[len(SPONSORED_PREFIX):].strip()
            product = {
                **product,
                "title": title,
                "normalized_title": normalize_title(title),
            }
        cleaned.append(product)
    return cleaned


def search_amazon(query):
    args = (
        query,
        "Amazon India",
        "https://www.amazon.in/s?k={query}",
        '[data-component-type="s-search-result"]',
        {
            # Product-link spans first — bare h2/span often matches brand-only nodes.
            "title": [
                "a.a-link-normal.s-line-clamp-2 span",
                "a.a-link-normal h2 span",
                {"selectors": ["h2[aria-label]"], "attribute": "aria-label"},
                "h2 span",
                "h2",
            ],
            "current_price": [".a-price:not(.a-text-price) .a-offscreen", ".a-price-whole"],
            "original_price": [".a-text-price .a-offscreen", "[data-a-strike='true'] .a-offscreen"],
            "discount": [".savingsPercentage", "[aria-label*='% off']"],
            "rating": [".a-icon-alt", "[aria-label*='out of 5 stars']"],
            "review_count": ["[aria-label$='ratings']", ".s-underline-text"],
            "availability": [".a-color-price", ".a-color-success"],
            "url": ["h2 a[href]", "a.a-link-normal[href]"],
            "image_url": "img.s-image",
        },
    )
    try:
        products = selector_search(*args)
        if products:
            return _clean_amazon_products(products)
    except Exception:
        pass
    return _clean_amazon_products(playwright_search(*args))
