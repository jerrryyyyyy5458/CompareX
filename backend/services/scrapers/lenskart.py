"""Lenskart search adapter with direct product URL extraction."""
import logging

from services.normalizer import normalized_product

from .base import fetch_html, selector_search

LOGGER = logging.getLogger(__name__)


def _is_lenskart_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "lenskart.com" in lowered
        and ("/p/" in lowered or "/product/" in lowered or "/eyeglasses/" in lowered or "/sunglasses/" in lowered)
    )


def _extract_lenskart_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1[class*='Product'], h1[itemprop='name'], h1")
    price_node = soup.select_one("[class*='Price'], [itemprop='price'], .PriceDisplay")
    original_price_node = soup.select_one("[class*='MarketPrice'], s, del")
    image_node = soup.select_one("img[itemprop='image'], img[class*='Product'], img")
    availability_node = soup.select_one("[class*='Stock'], .availability, [itemprop='availability']")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": (
                price_node.get("content")
                if price_node and price_node.get("content")
                else price_node.get_text(" ", strip=True) if price_node else None
            ),
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": query,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Lenskart",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Lenskart product page loaded but exact product extraction failed.")


def search_lenskart(query):
    try:
        if _is_lenskart_product_url(query):
            return _extract_lenskart_product_page(query)
        return selector_search(
            query,
            "Lenskart",
            "https://www.lenskart.com/search?q={query}",
            "div[class*='ProductCard'], div[class*='product-card'], li[class*='Product']",
            {
                "title": ["h2", "h3", "[class*='ProductTitle']", "a[title]"],
                "current_price": ["[class*='Price']", ".price", "[class*='offerPrice']"],
                "original_price": ["[class*='MarketPrice']", "s", "del"],
                "availability": ["[class*='Stock']", ".availability"],
                "url": ["a[href*='/p/']", "a[href*='/eyeglasses/']", "a[href*='/sunglasses/']", "a[href]"],
                "image_url": "img",
            },
        )
    except Exception as error:
        LOGGER.warning("Lenskart scrape failed for %r: %s", query, error)
        raise
