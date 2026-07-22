"""Shared SQLAlchemy extension and database initialization helpers."""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def initialize_database(app):
    """Create development tables; production uses a migration runner instead."""
    with app.app_context():
        db.create_all()
