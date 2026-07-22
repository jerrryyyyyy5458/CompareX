"""Reliance Digital adapter for public product listing markup."""
from .base import selector_search
def search_reliance(query):
    return selector_search(query, "Reliance Digital", "https://www.reliancedigital.in/search?q={query}", "li.sp__product", {"title": ".sp__name", "current_price": ".TextWeb__Text-sc-1cyx778-0", "original_price": ".sp__mrp", "rating": ".sp__rating", "url": "a", "image_url": "img"})
