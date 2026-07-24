"""Live marketplace metadata endpoints."""
from flask import Blueprint, jsonify
from services.search_service import marketplace_catalog

catalog_blueprint = Blueprint("catalog", __name__)


@catalog_blueprint.get("/stores")
def stores():
    return jsonify({"stores": marketplace_catalog(), "source": "live-adapters"})
