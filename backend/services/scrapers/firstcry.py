"""FirstCry search adapter with direct product URL extraction."""
import logging
from urllib.parse import urljoin

from services.normalizer import normalized_product

from .base import fetch_html, selector_search

LOGGER = logging.getLogger(__name__)


def _is_firstcry_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "firstcry.com" in lowered
        and ("/product-detail/" in lowered or "/p/" in lowered)
    )


def _extract_firstcry_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1.pdp_product_name, h1[itemprop='name'], h1")
    price_node = soup.select_one(".prod-price, .price-after, [itemprop='price']")
    original_price_node = soup.select_one(".prod-mrp, .price-before, s, del")
    image_node = soup.select_one("img[itemprop='image'], img")
    availability_node = soup.select_one(".stock_txt, .availability, [itemprop='availability']")
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
        "FirstCry",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("FirstCry product page loaded but exact product extraction failed.")


def search_firstcry(query):
    try:
        if _is_firstcry_product_url(query):
            return _extract_firstcry_product_page(query)
        products = selector_search(
            query,
            "FirstCry",
            "https://www.firstcry.com/search?q={query}",
            "li.list_item, div.product_block, div[class*='ProductBlock']",
            {
                "title": ["h2", "h3", ".prod-title", "a[title]"],
                "current_price": [".rupee", ".price", ".prod-price"],
                "original_price": [".mrp", "s", "del"],
                "availability": [".stock", ".availability"],
                "url": ["a[href*='/product-detail/']", "a[href]"],
                "image_url": "img",
            },
        )
        for product in products:
            if product.get("url") and not product["url"].startswith("http"):
                product["url"] = urljoin("https://www.firstcry.com", product["url"])
        return products
    except Exception as error:
        LOGGER.warning("FirstCry scrape failed for %r: %s", query, error)
        raise
