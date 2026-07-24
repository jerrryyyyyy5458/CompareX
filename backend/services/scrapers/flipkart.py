"""Flipkart browser-rendered search adapter."""
from .base import playwright_search


def search_flipkart(query):
    return playwright_search(
        query,
        "Flipkart",
        "https://www.flipkart.com/search?q={query}",
        "div[data-id]",
        {
            "title": ["div.RG5Slk", "a[title]", "div.KzDlHZ", "div._4rR01T"],
            "current_price": ["div.hZ3P6w.DeU9vF", "div.Nx9bqj", "div._30jeq3"],
            "original_price": ["div.kRYCnD.gxR4EY", "div.yRaY8j", "div._3I9_wc"],
            "discount": ["div.HQe8jr", "div.UkUFwK", "div._3Ay6Sb"],
            "rating": ["div.MKiFS6", "div.XQDdHH", "div._3LWZlK"],
            "review_count": ["span.PvbNMB", "span.Wphh3N", "span._2_R_DZ"],
            "availability": ["div.MaiFhH", "div._16FRp0", "div._3xgqrA"],
            "url": ["a[href*='/p/']", "a[href]"],
            "image_url": "img",
        },
    )
