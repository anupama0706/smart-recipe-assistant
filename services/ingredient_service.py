ALIASES = {
    "tomatoes": "tomato",
    "onions": "onion",
    "potatoes": "potato",
    "capsicums": "capsicum",
    "bell pepper": "capsicum",
    "bell peppers": "capsicum",
    "chilies": "chilli",
    "chilis": "chilli",
    "coriander leaves": "coriander",
}


def normalize_ingredients(input_data):
    """Return unique, canonical ingredient names in their original order."""
    values = []

    def collect(item):
        if isinstance(item, dict):
            collect(item.get("name", ""))
        elif isinstance(item, (list, tuple, set)):
            for value in item:
                collect(value)
        elif isinstance(item, str):
            values.extend(part.strip().lower() for part in item.split(","))

    collect(input_data)
    normalized = []
    seen = set()
    for value in values:
        value = " ".join(value.split())
        value = ALIASES.get(value, value)
        if value and value not in seen:
            normalized.append(value)
            seen.add(value)
    return normalized


def find_missing_ingredients(required_ingredients, available_ingredients):
    """Return normalized required ingredients that are not available."""
    required = normalize_ingredients(required_ingredients)
    available = set(normalize_ingredients(available_ingredients))
    return [ingredient for ingredient in required if ingredient in set(required) - available]
