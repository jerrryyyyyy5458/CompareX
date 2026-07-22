"""Flipkart public search adapter."""
from .base import selector_search
def search_flipkart(query):
    return selector_search(query, "Flipkart", "https://www.flipkart.com/search?q={query}", "div[data-id]", {"title": "a[title]", "current_price": "div.Nx9bqj", "original_price": "div.yRaY8j", "rating": "div.XQDdHH", "url": "a", "image_url": "img"})
