from flask import Blueprint, request, session

from routes.auth_routes import failure, success
from services.ai_service import AIServiceError, chat_with_recipe


chat_bp = Blueprint("chat", __name__)


@chat_bp.post("/api/chat")
def chat():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return failure("Request body must be valid JSON.")
    message = str(data.get("message", "")).strip()
    recipe = data.get("recipe") or session.get("final_recipe")
    if not message:
        return failure("Please provide a message.")
    if not isinstance(recipe, dict):
        return failure("Generate a recipe before starting chat.")
    try:
        response = chat_with_recipe(recipe, message)
    except AIServiceError:
        return failure("Recipe chat is temporarily unavailable.", 503)
    return success(response)
