"""Apollo Pharmacy search adapter with direct product URL extraction."""
import logging

from services.normalizer import normalized_product

from .base import fetch_html, selector_search

LOGGER = logging.getLogger(__name__)


def _is_apollo_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "apollopharmacy.in" in lowered
        and ("/medicine/" in lowered or "/product/" in lowered or "/p/" in lowered or "/pd/" in lowered)
    )


def _extract_apollo_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1.pdp__title, h1.product-title, h1")
    price_node = soup.select_one(".pdp__price, .pdp__offerPrice, .price, [itemprop='price']")
    original_price_node = soup.select_one(".pdp__mrp, .pdp__MRP, s, del")
    discount_node = soup.select_one(".discount, .pdp__discount, [class*='discount']")
    image_node = soup.select_one("img.pdp__img, [itemprop='image'], img")
    availability_node = soup.select_one(".pdp__stock, .stock-status, [itemprop='availability']")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": (
                price_node.get("content")
                if price_node and price_node.get("content")
                else price_node.get_text(" ", strip=True) if price_node else None
            ),
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "discount": discount_node.get_text(" ", strip=True) if discount_node else None,
            "availability": availability_node.get_text(" ", strip=True) if availability_node else "Check availability",
            "url": query,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "Apollo Pharmacy",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Apollo Pharmacy product page loaded but exact product extraction failed.")


def search_apollo(query):
    try:
        if _is_apollo_product_url(query):
            return _extract_apollo_product_page(query)
        return selector_search(
            query,
            "Apollo Pharmacy",
            "https://www.apollopharmacy.in/search-medicines/{query}",
            "div.product, div[class*='ProductCard'], li.product-item",
            {
                "title": ["h3 a", "h2 a", ".product-title", "a[title]"],
                "current_price": [".sp", ".price", ".final-price", "[data-price]"],
                "original_price": [".mrp", "s", "del"],
                "discount": [".discount", "[class*='discount']"],
                "availability": [".stock", ".availability"],
                "url": ["a[href*='/medicine/']", "a[href*='/product/']", "a[href]"],
                "image_url": "img",
            },
        )
    except Exception as error:
        LOGGER.warning("Apollo Pharmacy scrape failed for %r: %s", query, error)
        raise
