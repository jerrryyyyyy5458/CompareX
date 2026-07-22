"""Nykaa adapter for public product listing responses."""
from .base import selector_search
def search_nykaa(query):
    return selector_search(query, "Nykaa", "https://www.nykaa.com/search/result/?q={query}", "div.css-1rd7vky", {"title": ".css-xrzmfa", "current_price": ".css-111z9ua", "original_price": ".css-d5z3ro", "rating": ".css-1j2r7zh", "url": "a", "image_url": "img"})
