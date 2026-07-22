"""Read-only product, store and brand catalog endpoints."""
from flask import Blueprint, jsonify
from models.models import Brand, Product, Store

catalog_blueprint = Blueprint("catalog", __name__)


@catalog_blueprint.get("/product/<int:product_id>")
def product(product_id):
    item = Product.query.get_or_404(product_id)
    return jsonify({"product": item.to_dict()})


@catalog_blueprint.get("/stores")
def stores():
    return jsonify({"stores": [store.to_dict() for store in Store.query.filter_by(enabled=True).order_by(Store.name).all()]})


@catalog_blueprint.get("/brands")
def brands():
    return jsonify({"brands": [brand.to_dict() for brand in Brand.query.order_by(Brand.name).all()]})
