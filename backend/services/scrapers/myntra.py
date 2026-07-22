"""Myntra adapter with a conservative failure boundary."""
from .base import selector_search
def search_myntra(query):
    return selector_search(query, "Myntra", "https://www.myntra.com/{query}", "li.product-base", {"title": "h4.product-product", "current_price": "span.product-discountedPrice", "original_price": "span.product-strike", "rating": "div.product-ratingsContainer", "url": "a", "image_url": "img"})
