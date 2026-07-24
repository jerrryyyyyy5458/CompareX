"""Vijay Sales public GraphQL search adapter."""
import json

from services.normalizer import normalized_product

from .base import fetch_json


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
