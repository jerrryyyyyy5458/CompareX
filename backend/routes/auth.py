"""Registration, sign-in and profile APIs using JWT bearer authentication."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from models.models import User
from database.database import db

auth_blueprint = Blueprint("auth", __name__)


@auth_blueprint.post("/register")
def register():
    payload = request.get_json(silent=True) or {}
    email, password = payload.get("email", "").lower().strip(), payload.get("password", "")
    if "@" not in email or len(password) < 8: return jsonify({"message": "Use a valid email and a password with at least 8 characters."}), 400
    if User.query.filter_by(email=email).first(): return jsonify({"message": "An account already exists for this email."}), 409
    user = User(email=email, name=payload.get("name", "").strip() or None); user.set_password(password)
    db.session.add(user); db.session.commit()
    return jsonify({"user": user.to_dict(), "access_token": create_access_token(identity=str(user.id))}), 201


@auth_blueprint.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    user = User.query.filter_by(email=payload.get("email", "").lower().strip()).first()
    if not user or not user.verify_password(payload.get("password", "")): return jsonify({"message": "Incorrect email or password."}), 401
    return jsonify({"user": user.to_dict(), "access_token": create_access_token(identity=str(user.id))})


@auth_blueprint.get("/profile")
@jwt_required()
def profile():
    user = db.session.get(User, int(get_jwt_identity()))
    return jsonify({"user": user.to_dict()})
