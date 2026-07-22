"""Database models covering users, catalog metadata and price tracking."""
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
    wishlists = db.relationship("Wishlist", back_populates="user", cascade="all, delete-orphan")

    def set_password(self, password): self.password_hash = generate_password_hash(password)
    def verify_password(self, password): return check_password_hash(self.password_hash, password)
    def to_dict(self): return {"id": self.id, "email": self.email, "name": self.name}


class Store(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(60), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    color = db.Column(db.String(12), nullable=False, default="#2874f0")
    description = db.Column(db.String(200), nullable=True)
    enabled = db.Column(db.Boolean, default=True, nullable=False)

    def to_dict(self):
        return {"id": self.id, "slug": self.slug, "name": self.name, "color": self.color, "description": self.description, "mark": self.name[0]}


class Brand(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False)
    def to_dict(self): return {"id": self.id, "name": self.name, "slug": self.slug}


class Product(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    external_id = db.Column(db.String(160), nullable=True, index=True)
    title = db.Column(db.String(500), nullable=False, index=True)
    normalized_title = db.Column(db.String(500), nullable=True, index=True)
    product_url = db.Column(db.Text, nullable=False)
    image_url = db.Column(db.Text, nullable=True)
    current_price = db.Column(db.Float, nullable=False)
    original_price = db.Column(db.Float, nullable=True)
    discount = db.Column(db.Integer, default=0)
    rating = db.Column(db.Float, nullable=True)
    availability = db.Column(db.String(40), default="In stock")
    store_id = db.Column(db.Integer, db.ForeignKey("store.id"), nullable=False)
    brand_id = db.Column(db.Integer, db.ForeignKey("brand.id"), nullable=True)
    store = db.relationship("Store")
    brand = db.relationship("Brand")

    def to_dict(self):
        return {"id": self.id, "title": self.title, "image_url": self.image_url, "current_price": self.current_price, "original_price": self.original_price, "discount": self.discount, "rating": self.rating, "availability": self.availability, "url": self.product_url, "store": self.store.name, "store_mark": self.store.name[0], "brand": self.brand.name if self.brand else None}


class Wishlist(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False)
    user = db.relationship("User", back_populates="wishlists")
    product = db.relationship("Product")
    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="unique_user_product_wishlist"),)


class PriceHistory(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False, index=True)
    price = db.Column(db.Float, nullable=False)


class SavedSearch(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    query = db.Column(db.String(300), nullable=False)


class ComparisonSession(TimestampMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    product_ids = db.Column(db.Text, nullable=False)
