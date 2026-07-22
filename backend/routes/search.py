"""Search endpoint combining stored catalog records and live marketplace adapters."""
from flask import Blueprint, jsonify, request
from models.models import Product
from services.search_service import search_marketplaces

search_blueprint = Blueprint("search", __name__)


@search_blueprint.get("/search")
def search():
    query = request.args.get("query", "").strip()
    if len(query) < 2: return jsonify({"message": "Search query must contain at least 2 characters."}), 400
    stores = request.args.getlist("store") or None
    cached = Product.query.filter(Product.title.ilike(f"%{query}%")).limit(30).all()
    if cached: return jsonify({"products": [product.to_dict() for product in cached], "source": "catalog", "errors": []})
    result = search_marketplaces(query, stores)
    return jsonify({**result, "source": "live"})
