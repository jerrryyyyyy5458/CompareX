"""CompareX Flask application factory and local development entry point."""
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from database.database import db, initialize_database
from models.models import Store
from routes.auth import auth_blueprint
from routes.catalog import catalog_blueprint
from routes.search import search_blueprint

DEFAULT_STORES = [
    ("amazon", "Amazon", "#202531", "Electronics, home & more"),
    ("flipkart", "Flipkart", "#2874f0", "India's shopping destination"),
    ("myntra", "Myntra", "#f44380", "Fashion & lifestyle"),
    ("ajio", "AJIO", "#222222", "Curated fashion"),
    ("nykaa", "Nykaa", "#ed5f7f", "Beauty & wellness"),
    ("reliance", "Reliance Digital", "#e31d3b", "Tech & appliances"),
]


def seed_stores():
    """Add supported stores once so the frontend is useful before product ingestion."""
    if Store.query.count(): return
    db.session.add_all([Store(slug=slug, name=name, color=color, description=description) for slug, name, color, description in DEFAULT_STORES])
    db.session.commit()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    JWTManager(app)
    CORS(app, origins=app.config["CORS_ORIGINS"])
    app.register_blueprint(search_blueprint)
    app.register_blueprint(catalog_blueprint)
    app.register_blueprint(auth_blueprint)
    initialize_database(app)
    with app.app_context(): seed_stores()

    @app.get("/health")
    def health(): return jsonify({"status": "ok", "service": "comparex-api"})

    @app.errorhandler(404)
    def missing_route(_): return jsonify({"message": "Resource not found."}), 404

    return app


if __name__ == "__main__":
    create_app().run(debug=True, host="127.0.0.1", port=5000)
