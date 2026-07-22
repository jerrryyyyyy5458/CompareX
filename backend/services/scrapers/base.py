"""Request and HTML extraction primitives used by individual marketplace adapters."""
import logging
from urllib.parse import quote_plus
import requests
from bs4 import BeautifulSoup
from services.normalizer import normalized_product

LOGGER = logging.getLogger(__name__)
HEADERS = {"User-Agent": "CompareXBot/1.0 (+https://comparex.in/contact)", "Accept-Language": "en-IN,en;q=0.9"}


def fetch_html(url):
    """Fetch public product search HTML with a short timeout and no retries."""
    response = requests.get(url, headers=HEADERS, timeout=8)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def selector_search(query, store, url_template, item_selector, fields):
    """Declarative scraper for stores whose public markup can be selected reliably."""
    soup = fetch_html(url_template.format(query=quote_plus(query)))
    products = []
    for item in soup.select(item_selector)[:12]:
        raw = {key: (item.select_one(selector).get_text(" ", strip=True) if item.select_one(selector) else None) for key, selector in fields.items() if key not in {"url", "image_url"}}
        link = item.select_one(fields.get("url", "a"))
        image = item.select_one(fields.get("image_url", "img"))
        raw["url"] = link.get("href") if link else None
        raw["image_url"] = image.get("src") if image else None
        if raw.get("title") and raw.get("current_price") and raw["url"]: products.append(normalized_product(raw, store))
    return products
