import unittest

from services.ingredient_service import find_missing_ingredients, normalize_ingredients


class IngredientServiceTests(unittest.TestCase):
    def test_normalization_and_missing_ingredients(self):
        available = normalize_ingredients(" Tomato, onions, bell pepper, tomato ")

        self.assertEqual(available, ["tomato", "onion", "capsicum"])
        self.assertEqual(find_missing_ingredients(["tomatoes", "rice", "onion"], available), ["rice"])


if __name__ == "__main__":
    unittest.main()
