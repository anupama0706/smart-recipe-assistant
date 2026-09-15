import json
import traceback

from flask import Blueprint, request, session

from database.db import DatabaseError, execute_query
from routes.auth_routes import failure, success
from services.ai_service import AIServiceError, generate_ingredients, generate_recipe, generate_substitutions, suggest_dishes
from services.ingredient_service import find_missing_ingredients, normalize_ingredients


recipe_bp = Blueprint("recipe", __name__)


def _payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _logged_in():
    return session.get("user_id") is not None


def _servings(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 20 else None


def _recipe_ingredients():
    return session.get("final_ingredients") or session.get("required_ingredients", [])


@recipe_bp.post("/api/suggest-dishes")
def suggest_dishes_route():
    data = _payload()
    if data is None:
        return failure("Request body must be valid JSON.")
    ingredients = normalize_ingredients(data.get("ingredients", data.get("available_ingredients", [])))
    if not ingredients:
        return failure("Please provide at least one ingredient.")
    try:
        dishes = suggest_dishes(ingredients)
    except AIServiceError as exc:
        print(f"API Error in /api/suggest-dishes: {exc}")
        import traceback
        traceback.print_exc()
        return failure("Recipe service is temporarily unavailable.", 503)
    session["available_ingredients"] = ingredients
    session["input_mode"] = "ingredients"
    return success(dishes)


@recipe_bp.post("/api/select-dish")
def select_dish():
    data = _payload()
    dish_name = str(data.get("dish", "")).strip() if data else ""
    if not dish_name or len(dish_name) > 150:
        return failure("Please provide a valid dish name.")
    session["selected_dish"] = dish_name
    if "available_ingredients" in data:
        session["available_ingredients"] = normalize_ingredients(data["available_ingredients"])
    return success({"dish_name": dish_name})


@recipe_bp.route("/api/ingredients", methods=["GET", "POST"])
@recipe_bp.route("/api/generate-ingredients", methods=["GET", "POST"])
def generate_ingredients_route():
    if request.method == "GET":
        dish_name = str(request.args.get("dish", request.args.get("dish_name", session.get("selected_dish", "")))).strip()
        servings = _servings(request.args.get("servings", session.get("servings", 2)))
    else:
        data = _payload() or {}
        dish_name = str(data.get("dish", data.get("dish_name", session.get("selected_dish", "")))).strip()
        servings = _servings(data.get("servings", session.get("servings", 2)))

    if not dish_name or servings is None:
        return failure("A valid dish name and servings value from 1 to 20 are required.", 400)
    try:
        ingredients = generate_ingredients(dish_name, servings)
    except AIServiceError as exc:
        import traceback
        traceback.print_exc()
        return failure(str(exc) or "Recipe service is temporarily unavailable.", 503)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return failure(f"Failed to generate ingredients: {str(exc)}", 500)

    session["selected_dish"] = dish_name
    session["servings"] = servings
    session["required_ingredients"] = ingredients.get("ingredients", [])
    session.pop("final_ingredients", None)
    return success(ingredients)


@recipe_bp.post("/api/check-missing")
def check_missing():
    data = _payload()
    if data is None:
        return failure("Request body must be valid JSON.")
    required = data.get("required_ingredients", session.get("required_ingredients", []))
    available = data.get("available_ingredients", session.get("available_ingredients", []))
    if not required:
        return failure("Generate the required ingredients first.")
    missing = find_missing_ingredients(required, available)
    session["available_ingredients"] = normalize_ingredients(available)
    session["missing_ingredients"] = missing
    return success({"missing_ingredients": missing})


@recipe_bp.post("/api/substitutions")
@recipe_bp.post("/api/substitute")
def substitutions():
    data = _payload()
    if data is None:
        return failure("Request body must be valid JSON.")
    dish_name = str(data.get("dish", session.get("selected_dish", ""))).strip()
    missing = normalize_ingredients(data.get("missing_ingredient", data.get("ingredient", "")))
    if not missing:
        missing = session.get("missing_ingredients", [])[:1]
    if not dish_name or not missing:
        return failure("A selected dish and missing ingredient are required.")
    missing_name = missing[0]
    current = data.get("current_ingredients", _recipe_ingredients())
    try:
        options = generate_substitutions(dish_name, missing_name, current)
    except AIServiceError as exc:
        print(f"API Error in /api/substitutions: {exc}")
        import traceback
        traceback.print_exc()
        return failure("Recipe service is temporarily unavailable.", 503)
    substitutions_by_ingredient = session.get("substitutions", {})
    substitutions_by_ingredient[missing_name] = options["substitutes"]
    session["substitutions"] = substitutions_by_ingredient
    return success(options)


@recipe_bp.post("/api/select-substitution")
def select_substitution():
    data = _payload()
    if data is None:
        return failure("Request body must be valid JSON.")
    missing = normalize_ingredients(data.get("missing_ingredient", ""))
    selected_name = str(data.get("substitute", data.get("substitute_name", ""))).strip()
    if not missing or not selected_name:
        return failure("A missing ingredient and substitute selection are required.")
    missing_name = missing[0]
    options = session.get("substitutions", {}).get(missing_name, [])
    selected = next((item for item in options if item["name"].lower() == selected_name.lower()), None)
    if selected is None:
        return failure("Select a substitute from the generated options.")
    final_ingredients = []
    replaced = False
    for ingredient in session.get("required_ingredients", []):
        if normalize_ingredients(ingredient) == [missing_name]:
            final_ingredients.append({"name": selected["name"], "quantity": selected["quantity"], "category": "core"})
            replaced = True
        else:
            final_ingredients.append(ingredient)
    if not replaced:
        return failure("The missing ingredient is not in the current recipe.")
    session["final_ingredients"] = final_ingredients
    return success({"missing_ingredient": missing_name, "selected_substitute": selected, "final_ingredients": final_ingredients})


@recipe_bp.post("/api/generate-recipe")
def generate_recipe_route():
    data = _payload()
    if data is None:
        return failure("Request body must be valid JSON.")
    dish_name = str(data.get("dish_name", data.get("dish", session.get("selected_dish", "")))).strip()
    servings = _servings(data.get("servings", session.get("servings", 2)))
    ingredients = data.get("ingredients", data.get("final_ingredients", _recipe_ingredients()))
    if not dish_name or servings is None or not ingredients:
        return failure("A dish, servings value, and final ingredients are required.")
    try:
        recipe = generate_recipe(dish_name, servings, ingredients)
    except AIServiceError as exc:
        print(f"API Error in /api/generate-recipe: {exc}")
        import traceback
        traceback.print_exc()
        return failure("Recipe service is temporarily unavailable.", 503)
    except Exception as exc:
        print(f"Unexpected Error in /api/generate-recipe: {exc}")
        import traceback
        traceback.print_exc()
        return failure("Recipe service is temporarily unavailable.", 500)
    session["final_recipe"] = recipe
    session["final_ingredients"] = recipe["ingredients"]
    return success(recipe)


@recipe_bp.post("/api/recipes/save")
@recipe_bp.post("/api/save-recipe")
def save_recipe():
    if not _logged_in():
        return failure("Please log in to save recipes.", 401)
    data = _payload() or {}
    recipe = data.get("recipe") or session.get("final_recipe")
    if not isinstance(recipe, dict):
        return failure("Generate a recipe before saving it.")
    try:
        result = execute_query(
            "INSERT INTO saved_recipes (user_id, dish_name, ingredients, instructions, servings) VALUES (%s, %s, %s, %s, %s)",
            (session["user_id"], recipe["dish_name"], json.dumps(recipe["ingredients"]), json.dumps(recipe["instructions"]), recipe["servings"]),
        )
    except DatabaseError:
        return failure("Unable to save recipe right now.", 503)
    return success({"message": "Recipe saved successfully.", "recipe_id": result["lastrowid"]})


@recipe_bp.get("/api/recipes")
def list_recipes():
    if not _logged_in():
        return failure("Please log in to view saved recipes.", 401)
    try:
        recipes = execute_query(
            "SELECT id, dish_name, ingredients, instructions, servings, created_at FROM saved_recipes WHERE user_id = %s ORDER BY created_at DESC",
            (session["user_id"],),
            fetch_all=True,
        )
    except DatabaseError:
        return failure("Unable to load saved recipes right now.", 503)
    return success({"recipes": recipes})


@recipe_bp.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id):
    if not _logged_in():
        return failure("Please log in to delete recipes.", 401)
    try:
        result = execute_query("DELETE FROM saved_recipes WHERE id = %s AND user_id = %s", (recipe_id, session["user_id"]))
    except DatabaseError:
        return failure("Unable to delete recipe right now.", 503)
    if result["rowcount"] == 0:
        return failure("Saved recipe not found.", 404)
    return success({"message": "Recipe deleted successfully."})
