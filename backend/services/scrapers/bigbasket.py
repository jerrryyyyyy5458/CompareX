"""BigBasket search adapter with direct product URL extraction."""
import logging
from urllib.parse import urljoin

from services.normalizer import normalized_product

from .base import fetch_html

LOGGER = logging.getLogger(__name__)


def _is_bigbasket_product_url(query):
    lowered = (query or "").strip().lower()
    return lowered.startswith(("http://", "https://")) and "bigbasket.com" in lowered and "/pd/" in lowered


def _extract_bigbasket_search_page(query):
    soup = fetch_html(f"https://www.bigbasket.com/ps/?q={query}")
    products = []
    for card in soup.select("div[class*='SkuDeck___StyledDiv'], a[href*='/pd/'], div[data-testid='product-card']")[:16]:
        link = card.select_one("a[href*='/pd/'], a[href]")
        title = card.select_one("h3, h2, [data-testid='product-name']")
        price = card.select_one("[data-testid='price'], span[class*='Pricing']")
        original_price = card.select_one("s, del")
        image = card.select_one("img")
        product = normalized_product(
            {
                "title": title.get_text(" ", strip=True) if title else None,
                "current_price": price.get_text(" ", strip=True) if price else None,
                "original_price": original_price.get_text(" ", strip=True) if original_price else None,
                "availability": "In stock",
                "url": urljoin("https://www.bigbasket.com", link.get("href")) if link else None,
                "image_url": image.get("src") or image.get("data-src") if image else None,
            },
            "BigBasket",
        )
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
    if products:
        return products
    raise RuntimeError(f"BigBasket search page loaded but extraction failed for query {query!r}.")


def _extract_bigbasket_product_page(query):
    soup = fetch_html(query)
    title_node = soup.select_one("h1, [data-testid='product-name']")
    price_node = soup.select_one("[data-testid='price'], span[class*='Pricing']")
    original_price_node = soup.select_one("s, del")
    image_node = soup.select_one("img[src], img")
    product = normalized_product(
        {
            "title": title_node.get_text(" ", strip=True) if title_node else None,
            "current_price": price_node.get_text(" ", strip=True) if price_node else None,
            "original_price": original_price_node.get_text(" ", strip=True) if original_price_node else None,
            "availability": "In stock",
            "url": query,
            "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
        },
        "BigBasket",
    )
    if product["title"] and product["current_price"] and product["url"]:
        return [product]
    raise RuntimeError("BigBasket product page loaded but exact product extraction failed.")


def search_bigbasket(query):
    try:
        if _is_bigbasket_product_url(query):
            return _extract_bigbasket_product_page(query)
        return _extract_bigbasket_search_page(query)
    except Exception as error:
        LOGGER.warning("BigBasket scrape failed for %r: %s", query, error)
        raise
