"""Amazon India server-rendered search adapter."""
from .base import playwright_search, selector_search


def search_amazon(query):
    args = (
        query,
        "Amazon India",
        "https://www.amazon.in/s?k={query}",
        '[data-component-type="s-search-result"]',
        {
            "title": {
                "selectors": ["h2[aria-label]", "[data-cy='title-recipe'] h2[aria-label]", "h2"],
                "attribute": "aria-label",
            },
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
            return products
    except Exception:
        pass
    return playwright_search(*args)
