"""PharmEasy search adapter with direct product URL extraction."""
import logging

from services.normalizer import normalized_product

from .base import fetch_html, selector_search

LOGGER = logging.getLogger(__name__)


def _is_pharmeasy_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "pharmeasy.in" in lowered
        and (
            "/online-medicine-order/" in lowered
            or "/health-care/products/" in lowered
            or "/otc/" in lowered
        )
    )


def _extract_pharmeasy_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1[class*='ProductTitle'], h1[itemprop='name'], h1")
    price_node = soup.select_one("[class*='ProductPrice'], [itemprop='price'], .PriceInfo")
    original_price_node = soup.select_one("[class*='ProductMrp'], s, del")
    image_node = soup.select_one("img[itemprop='image'], img[class*='ProductImage'], img")
    availability_node = soup.select_one("[class*='ProductAvailability'], .availability, [itemprop='availability']")
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
        "PharmEasy",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("PharmEasy product page loaded but exact product extraction failed.")


def search_pharmeasy(query):
    try:
        if _is_pharmeasy_product_url(query):
            return _extract_pharmeasy_product_page(query)
        return selector_search(
            query,
            "PharmEasy",
            "https://pharmeasy.in/search/all?name={query}",
            "div[class*='ProductCard'], li[class*='ProductCard'], div[class*='SearchResult']",
            {
                "title": ["h2", "h3", "[class*='ProductName']", "a[title]"],
                "current_price": ["[class*='ProductPrice']", ".price", "[class*='OfferPrice']"],
                "original_price": ["[class*='ProductMrp']", "s", "del"],
                "availability": ["[class*='ProductAvailability']", ".availability"],
                "url": [
                    "a[href*='/online-medicine-order/']",
                    "a[href*='/health-care/products/']",
                    "a[href*='/otc/']",
                    "a[href]",
                ],
                "image_url": "img",
            },
        )
    except Exception as error:
        LOGGER.warning("PharmEasy scrape failed for %r: %s", query, error)
        raise
