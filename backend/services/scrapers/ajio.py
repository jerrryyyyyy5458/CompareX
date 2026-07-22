"""AJIO adapter; kept independent from the other marketplace implementations."""
from .base import selector_search
def search_ajio(query):
    return selector_search(query, "AJIO", "https://www.ajio.com/search/?text={query}", "div.item", {"title": ".nameCls", "current_price": ".price", "original_price": ".orginal-price", "rating": ".rating", "url": "a", "image_url": "img"})
