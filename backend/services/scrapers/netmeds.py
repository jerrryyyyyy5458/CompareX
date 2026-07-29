"""Netmeds search adapter with direct product URL extraction."""
import logging

from services.normalizer import normalized_product

from .base import fetch_html, selector_search

LOGGER = logging.getLogger(__name__)


def _is_netmeds_product_url(query):
    lowered = (query or "").strip().lower()
    return (
        lowered.startswith(("http://", "https://"))
        and "netmeds.com" in lowered
        and ("/non-prescriptions/" in lowered or "/prescriptions/" in lowered or "/p/" in lowered)
    )


def _extract_netmeds_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1.product-title, h1[itemprop='name'], h1")
    price_node = soup.select_one(".final-price, .price-box .price, [itemprop='price']")
    original_price_node = soup.select_one(".price-box .mrp, s, del")
    image_node = soup.select_one("img[itemprop='image'], img")
    availability_node = soup.select_one(".stock_status, .availability, [itemprop='availability']")
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
        "Netmeds",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("Netmeds product page loaded but exact product extraction failed.")


def search_netmeds(query):
    try:
        if _is_netmeds_product_url(query):
            return _extract_netmeds_product_page(query)
        return selector_search(
            query,
            "Netmeds",
            "https://www.netmeds.com/catalogsearch/result?q={query}",
            "div.cat-item, li.product-item, div[class*='ProductCard']",
            {
                "title": ["h3", "h2", ".product-title", "a[title]"],
                "current_price": [".final-price", ".price", ".offer-price"],
                "original_price": [".mrp", "s", "del"],
                "availability": [".stock", ".availability"],
                "url": ["a[href*='/non-prescriptions/']", "a[href*='/prescriptions/']", "a[href]"],
                "image_url": "img",
            },
        )
    except Exception as error:
        LOGGER.warning("Netmeds scrape failed for %r: %s", query, error)
        raise
