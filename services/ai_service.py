import json
import os
import re
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()

from google import genai
from google.genai import errors, types


class AIServiceError(RuntimeError):
    pass


__all__ = [
    "AIServiceError",
    "DEFAULT_MODEL",
    "sanitize_model",
    "get_client",
    "suggest_dishes",
    "generate_ingredients",
    "generate_substitutions",
    "generate_recipe",
    "chat_with_recipe",
]

DEFAULT_MODEL = "gemini-2.5-flash"


def sanitize_model(model: str) -> str:
    if not model:
        return DEFAULT_MODEL
    cleaned = str(model).strip().strip('"').strip("'")
    if cleaned.startswith("models/"):
        cleaned = cleaned.replace("models/", "", 1)
    if any(old in cleaned for old in ["gemini-2.0", "gemini-1.5"]):
        return DEFAULT_MODEL
    return cleaned


FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-flash-latest",
]
MODEL_NAME = sanitize_model(os.getenv("GEMINI_MODEL", DEFAULT_MODEL))

_client = None


def get_client() -> genai.Client:
    """Initialize and return genai.Client instance."""
    global _client
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise AIServiceError("Gemini is not configured.")
    if _client is None:
        _client = genai.Client(api_key=api_key)
    return _client


def _json_schema(properties, required):
    return {"type": "object", "properties": properties, "required": required}


DISHES_SCHEMA = _json_schema(
    {
        "dishes": {
            "type": "array",
            "minItems": 4,
            "maxItems": 5,
            "items": _json_schema(
                {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "available_ingredients_used": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                ["name", "description", "available_ingredients_used"],
            ),
        }
    },
    ["dishes"],
)

INGREDIENTS_SCHEMA = _json_schema(
    {
        "dish_name": {"type": "string"},
        "servings": {"type": "integer"},
        "ingredients": {
            "type": "array",
            "items": _json_schema(
                {
                    "name": {"type": "string"},
                    "quantity": {"type": "string"},
                    "category": {
                        "type": "string",
                    },
                },
                ["name", "quantity"],
            ),
        },
    },
    ["dish_name", "servings", "ingredients"],
)

SUBSTITUTIONS_SCHEMA = _json_schema(
    {
        "missing_ingredient": {"type": "string"},
        "substitutes": {
            "type": "array",
            "minItems": 1,
            "items": _json_schema(
                {
                    "name": {"type": "string"},
                    "quantity": {"type": "string"},
                    "reason": {"type": "string"},
                    "effect": {"type": "string"},
                },
                ["name", "quantity", "reason", "effect"],
            ),
        },
    },
    ["missing_ingredient", "substitutes"],
)

RECIPE_SCHEMA = _json_schema(
    {
        "dish_name": {"type": "string"},
        "servings": {"type": "integer"},
        "preparation_time": {"type": "string"},
        "cook_time": {"type": "string"},
        "ingredients": {
            "type": "array",
            "minItems": 1,
            "items": _json_schema(
                {
                    "name": {"type": "string"},
                    "quantity": {"type": "string"},
                },
                ["name", "quantity"],
            ),
        },
        "instructions": {
            "type": "array",
            "minItems": 5,
            "maxItems": 8,
            "items": {"type": "string"},
        },
    },
    [
        "dish_name",
        "servings",
        "preparation_time",
        "cook_time",
        "ingredients",
        "instructions",
    ],
)

CHAT_SCHEMA = _json_schema({"answer": {"type": "string"}}, ["answer"])

def _call_gemini_with_retries(client, contents, config, retries=2, delay=1.0):
    raw_env_model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    configured_model = sanitize_model(raw_env_model)
    
    models_to_try = [configured_model]
    for fb in FALLBACK_MODELS:
        clean_fb = sanitize_model(fb)
        if clean_fb not in models_to_try:
            models_to_try.append(clean_fb)

    last_error = None

    for model_name in models_to_try:
        clean_model = sanitize_model(model_name)
        for attempt in range(retries):
            try:
                return client.models.generate_content(
                    model=clean_model,
                    contents=contents,
                    config=config,
                )
            except errors.APIError as err:
                last_error = err
                err_str = str(err).lower()
                is_transient = any(code in err_str for code in ["503", "unavailable", "429", "exhausted", "rate limit"])
                if is_transient and attempt < retries - 1:
                    time.sleep(delay * (attempt + 1))
                    continue
                # If 404 or unsupported on this specific model, break inner loop to try next model
                break
            except Exception as err:
                last_error = err
                break

    if last_error:
        raise last_error
    raise AIServiceError("All candidate Gemini models failed to generate content.")

def _generate_json(prompt, schema=None, system_instruction=None):
    client = get_client()

    config_params = {
        "response_mime_type": "application/json",
        "temperature": 0.4,
    }
    if system_instruction:
        config_params["system_instruction"] = system_instruction

    config = types.GenerateContentConfig(**config_params)

    formatted_prompt = prompt
    if schema:
        formatted_prompt += f"\n\nReturn strictly valid JSON conforming to this schema:\n{json.dumps(schema)}"

    try:
        response = _call_gemini_with_retries(client, formatted_prompt, config)

        if isinstance(response.parsed, dict):
            data = response.parsed
        elif hasattr(response.parsed, "model_dump"):
            data = response.parsed.model_dump()
        elif hasattr(response.parsed, "dict"):
            data = response.parsed.dict()
        else:
            text = (response.text or "").strip()
            if "```" in text:
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
                if match:
                    text = match.group(1).strip()
                else:
                    lines = text.splitlines()
                    if lines and lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    text = "\n".join(lines).strip()
            data = json.loads(text)
        if not isinstance(data, dict):
            raise AIServiceError("Gemini returned an invalid response structure.")

        if schema and isinstance(schema, dict):
            required = schema.get("required", [])
            missing = [f for f in required if f not in data]
            if missing:
                raise ValueError(f"Schema validation error: Missing required fields {missing}")
    except (errors.APIError, ValueError, TypeError, json.JSONDecodeError, RuntimeError) as exc:
        print(f"\n[AI SERVICE ERROR]: {type(exc).__name__}: {exc}\n")
        traceback.print_exc()
        raise AIServiceError(f"Gemini could not generate a valid response: {exc}") from exc
    except Exception as exc:
        print(f"\n[AI SERVICE ERROR]: {type(exc).__name__}: {exc}\n")
        traceback.print_exc()
        raise AIServiceError(f"Gemini could not generate a valid response: {exc}") from exc

    return data


def suggest_dishes(available_ingredients):
    return _generate_json(
        "Suggest four or five practical dishes using these available ingredients: "
        f"{json.dumps(available_ingredients)}. Prefer dishes that use most of them and do not claim "
        "unavailable ingredients are present.",
        DISHES_SCHEMA,
    )


def generate_ingredients(dish_name, servings=2):
    prompt = (
        f"Generate the complete ingredient list for {dish_name!r} for {servings} servings. "
        "Use approximate quantities. Classify every ingredient as core, seasoning, or optional."
    )
    data = _generate_json(prompt, INGREDIENTS_SCHEMA)

    ingredients = data.get("ingredients", [])
    if not isinstance(ingredients, list):
        ingredients = []

    cleaned = []
    for item in ingredients:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            qty = str(item.get("quantity", "")).strip() or "as needed"
            cat = str(item.get("category", "core")).strip().lower()
            if cat not in ["core", "seasoning", "optional"]:
                cat = "core"
            if name:
                cleaned.append({"name": name, "quantity": qty, "category": cat})
        elif isinstance(item, str) and item.strip():
            cleaned.append({"name": item.strip(), "quantity": "as needed", "category": "core"})

    if not cleaned:
        raise AIServiceError(f"No ingredients could be generated for {dish_name}.")

    return {
        "dish_name": str(data.get("dish_name", dish_name)),
        "servings": int(data.get("servings", servings) or servings),
        "ingredients": cleaned,
    }


def generate_substitutions(dish_name, missing_ingredient, current_ingredients):
    if isinstance(current_ingredients, list):
        clean_current = [
            item.get("name", str(item)).strip() if isinstance(item, dict) else str(item).strip()
            for item in current_ingredients
        ]
    elif isinstance(current_ingredients, str):
        clean_current = [c.strip() for c in current_ingredients.split(",") if c.strip()]
    else:
        clean_current = []

    clean_current = [c for c in clean_current if c]

    prompt = (
        f"For the dish {dish_name!r}, suggest practical culinary substitutes for the missing ingredient {missing_ingredient!r}. "
        f"Other ingredients in the recipe: {json.dumps(clean_current)}. "
        "Keep the suggestions culinary and realistic."
    )
    data = _generate_json(prompt, SUBSTITUTIONS_SCHEMA)

    raw_subs = data.get("substitutes", [])
    if not isinstance(raw_subs, list):
        raw_subs = []

    cleaned_subs = []
    for item in raw_subs:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            qty = str(item.get("quantity", "")).strip() or "as needed"
            reason = str(item.get("reason", "")).strip()
            effect = str(item.get("effect", "")).strip()
            if name:
                cleaned_subs.append({
                    "name": name,
                    "quantity": qty,
                    "reason": reason,
                    "effect": effect,
                })
        elif isinstance(item, str) and item.strip():
            cleaned_subs.append({
                "name": item.strip(),
                "quantity": "as needed",
                "reason": "Alternative ingredient",
                "effect": "Maintains dish balance",
            })

    return {
        "missing_ingredient": str(data.get("missing_ingredient", missing_ingredient)),
        "substitutes": cleaned_subs,
    }


def generate_recipe(dish_name, servings, final_ingredients):
    try:
        system_instruction = (
            "Provide 5 to 8 detailed, sequential cooking steps. "
            "Each step must detail flame/heat control, cookware, timing, sensory cues (aroma, color, texture), and finishing techniques. "
            "Never output placeholder or generic instructions."
        )
        prompt = (
            f"Create a comprehensive, chef-grade recipe for {dish_name!r} serving {servings}. "
            f"Use only these final ingredients: {json.dumps(final_ingredients)}.\n\n"
            "Provide 5 to 8 detailed, sequential cooking steps. "
            "Each step must detail flame/heat control, cookware, timing, sensory cues (aroma, color, texture), and finishing techniques. "
            "Never output placeholder or generic instructions.\n\n"
            "For each phase (prep, sear/sauté, simmer/roast, and finish/garnish), include:\n"
            "- Flame and heat management (e.g., medium-high, gentle simmer, low flame)\n"
            "- Precise pan, pot, or oven preparation (preheating temperature, oil shimmering, pan type)\n"
            "- Clear sensory doneness cues (visual color changes, aroma release, sizzle sound, texture/feel)\n"
            "- Resting times, and chef pro-tips for optimal flavor and texture."
        )
        return _generate_json(prompt, RECIPE_SCHEMA, system_instruction=system_instruction)
    except Exception:
        traceback.print_exc()
        raise


def chat_with_recipe(current_recipe_dict, user_message):
    system_instruction = (
        "You are Chef AI, an expert, encouraging culinary assistant. "
        "You are helping a home cook prepare this recipe. Answer their question directly and concisely "
        "(2-4 sentences max). Use the recipe as primary context, but feel free to suggest realistic cooking "
        "modifications, seasoning/spice enhancements, troubleshooting advice, pairings, or technique tips "
        "that complement this specific dish. Never refuse a cooking or flavor adjustment simply because it "
        "was not explicitly written in the ingredients."
    )
    prompt = (
        f"Recipe Context:\n{json.dumps(current_recipe_dict, indent=2)}\n\n"
        f"User Question: {user_message}\n\n"
        "Provide a direct, practical culinary response in JSON."
    )
    return _generate_json(prompt, CHAT_SCHEMA, system_instruction=system_instruction)