"""Database models for account data only; products are always searched live."""
from datetime import datetime
from werkzeug.security import check_password_hash, generate_password_hash
from database.database import db


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class User(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=True)

    def set_password(self, password): self.password_hash = generate_password_hash(password)
    def verify_password(self, password): return check_password_hash(self.password_hash, password)
    def to_dict(self): return {"id": self.id, "email": self.email, "name": self.name}
