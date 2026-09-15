import re

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from database.db import DatabaseError, execute_query


auth_bp = Blueprint("auth", __name__)
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def success(data):
    return jsonify({"success": True, "data": data})


def failure(message, status=400):
    return jsonify({"success": False, "error": message}), status


def signup_fields(payload):
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not 2 <= len(name) <= 100:
        return None, "Name must be between 2 and 100 characters."
    if not EMAIL_PATTERN.fullmatch(email) or len(email) > 150:
        return None, "A valid email address is required."
    if len(password) < 8:
        return None, "Password must be at least 8 characters long."
    return (name, email, password), None


@auth_bp.post("/signup")
def signup():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return failure("Request body must be valid JSON.")

    fields, error = signup_fields(payload)
    if error:
        return failure(error)
    name, email, password = fields

    try:
        if execute_query("SELECT id FROM users WHERE email = %s", (email,), fetch_one=True):
            return failure("An account with this email already exists.", 409)
        result = execute_query(
            "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
            (name, email, generate_password_hash(password)),
        )
    except DatabaseError:
        return failure("Unable to create account right now.", 503)

    return success({"message": "Account created successfully.", "user_id": result["lastrowid"]}), 201


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return failure("Request body must be valid JSON.")

    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not EMAIL_PATTERN.fullmatch(email) or not password:
        return failure("Email and password are required.")

    try:
        user = execute_query(
            "SELECT id, name, password_hash FROM users WHERE email = %s", (email,), fetch_one=True
        )
    except DatabaseError:
        return failure("Unable to log in right now.", 503)

    if not user or not check_password_hash(user["password_hash"], password):
        return failure("Invalid email or password.", 401)

    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    return success({"message": "Logged in successfully.", "user": {"id": user["id"], "name": user["name"]}})


@auth_bp.get("/logout")
def logout():
    session.clear()
    return success({"message": "Logged out successfully."})
