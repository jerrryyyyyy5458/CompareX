"""Vijay Sales public GraphQL search adapter."""
import json

from services.normalizer import normalized_product

from .base import fetch_html, fetch_json


SEARCH_QUERY = """
query SearchProducts($term: String!) {
  products(search: $term, pageSize: 16) {
    items {
      name
      sku
      product_url
      mrp
      vsp
      discount_percentage
      rating_summary
      review_count
      stock_status
      image { url }
      price_range {
        maximum_price {
          final_price { value }
        }
      }
    }
  }
}
"""


def search_vijay_sales(query):
    lowered = (query or "").strip().lower()
    if lowered.startswith(("http://", "https://")) and "vijaysales.com" in lowered:
        soup = fetch_html(query)
        title_node = soup.select_one("h1, [itemprop='name']")
        price_node = soup.select_one("[itemprop='price'], .price, .product-price")
        image_node = soup.select_one("img[src], img")
        rating_node = soup.select_one("[itemprop='ratingValue'], .rating")
        product = normalized_product(
            {
                "title": title_node.get_text(" ", strip=True) if title_node else None,
                "current_price": price_node.get("content") if price_node and price_node.get("content") else price_node.get_text(" ", strip=True) if price_node else None,
                "rating": rating_node.get("content") if rating_node and rating_node.get("content") else rating_node.get_text(" ", strip=True) if rating_node else None,
                "availability": "Check availability",
                "url": query,
                "image_url": image_node.get("src") or image_node.get("data-src") if image_node else None,
            },
            "Vijay Sales",
        )
        if product["title"] and product["current_price"] and product["url"]:
            return [product]
        raise RuntimeError("Vijay Sales product page loaded but exact product extraction failed.")

    payload = fetch_json(
        "https://vsprod.vijaysales.com/graphql",
        params={
            "query": SEARCH_QUERY,
            "variables": json.dumps({"term": query}),
        },
    )
    items = payload.get("data", {}).get("products", {}).get("items", [])
    products = []
    for item in items:
        final_price = (
            item.get("price_range", {})
            .get("maximum_price", {})
            .get("final_price", {})
            .get("value")
        )
        rating_summary = item.get("rating_summary")
        product = normalized_product(
            {
                "title": item.get("name"),
                "current_price": item.get("vsp") or final_price,
                "original_price": item.get("mrp"),
                "discount": item.get("discount_percentage"),
                "rating": rating_summary / 20 if rating_summary else None,
                "review_count": item.get("review_count"),
                "availability": (
                    "In stock"
                    if item.get("stock_status") == "IN_STOCK"
                    else "Out of stock"
                ),
                "url": item.get("product_url"),
                "image_url": (item.get("image") or {}).get("url"),
            },
            "Vijay Sales",
        )
        if product["title"] and product["current_price"] and product["url"]:
            products.append(product)
    return products
