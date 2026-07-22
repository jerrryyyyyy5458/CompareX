"""Amazon public search adapter; selectors are isolated for easy maintenance."""
from .base import selector_search
def search_amazon(query):
    return selector_search(query, "Amazon", "https://www.amazon.in/s?k={query}", '[data-component-type="s-search-result"]', {"title": "h2 span", "current_price": ".a-price-whole", "original_price": ".a-text-price .a-offscreen", "rating": ".a-icon-alt", "url": "h2 a", "image_url": "img.s-image"})
