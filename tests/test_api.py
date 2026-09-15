import unittest

from app import create_app


class ApiResponseTests(unittest.TestCase):
    def setUp(self):
        app = create_app()
        app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.client = app.test_client()

    def test_index_uses_the_standard_success_envelope(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            "success": True,
            "data": {"message": "Smart Recipe Assistant API is running."},
        })

    def test_dashboard_view_renders_unified_workspace(self):
        response = self.client.get("/dashboard")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("workspace-container", html)
        self.assertIn("Discovery Co-Pilot", html)
        self.assertIn("Interactive Recipe Studio", html)

    def test_recipe_routes_redirect_to_dashboard(self):
        for path in ("/recipe", "/recipe-studio"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers.get("Location"), "/dashboard")

    def test_save_recipe_alias_endpoint(self):
        # Unauthenticated request returns 401
        response = self.client.post("/api/save-recipe", json={})
        self.assertEqual(response.status_code, 401)

    def test_substitute_alias_endpoint_requires_data(self):
        # Missing payload returns 400
        response = self.client.post("/api/substitute", json={})
        self.assertEqual(response.status_code, 400)

    def test_ingredients_endpoint_validation(self):
        # Missing dish name returns 400 with structured JSON
        response = self.client.post("/api/ingredients", json={})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["success"], False)

        # Invalid servings returns 400
        response2 = self.client.post("/api/ingredients", json={"dish": "Pasta", "servings": 99})
        self.assertEqual(response2.status_code, 400)
        self.assertEqual(response2.get_json()["success"], False)

    def test_generate_recipe_system_prompt_enforcement(self):
        from unittest.mock import patch
        from services.ai_service import generate_recipe

        with patch("services.ai_service._generate_json") as mock_gen:
            mock_gen.return_value = {
                "dish_name": "Paneer Butter Masala",
                "servings": 2,
                "preparation_time": "15 mins",
                "cook_time": "20 mins",
                "ingredients": [{"name": "Paneer", "quantity": "200g"}],
                "instructions": [
                    "Step 1: Prep cookware and aromatics over medium heat.",
                    "Step 2: Sauté onions until golden brown.",
                    "Step 3: Add tomato puree and simmer until oil separates.",
                    "Step 4: Gently fold in paneer cubes.",
                    "Step 5: Garnish with kasuri methi and fresh cream.",
                ],
            }

            result = generate_recipe("Paneer Butter Masala", 2, [{"name": "Paneer", "quantity": "200g"}])
            self.assertEqual(result["dish_name"], "Paneer Butter Masala")

            # Check that system_instruction and prompt demand 5 to 8 detailed steps
            call_args, call_kwargs = mock_gen.call_args
            prompt = call_args[0]
            system_instruction = call_kwargs.get("system_instruction", "")

            expected_phrase = (
                "Provide 5 to 8 detailed, sequential cooking steps. "
                "Each step must detail flame/heat control, cookware, timing, sensory cues (aroma, color, texture), and finishing techniques. "
                "Never output placeholder or generic instructions."
            )
            self.assertIn(expected_phrase, system_instruction)
            self.assertIn(expected_phrase, prompt)

    def test_generate_recipe_route_surfaces_error_without_mock_stubs(self):
        from unittest.mock import patch
        from services.ai_service import AIServiceError

        with patch("routes.recipe_routes.generate_recipe") as mock_gen, \
             patch("traceback.print_exc") as mock_traceback:
            mock_gen.side_effect = AIServiceError("Gemini quota exceeded.")

            response = self.client.post("/api/generate-recipe", json={
                "dish": "Biryani",
                "servings": 4,
                "ingredients": [{"name": "Rice", "quantity": "2 cups"}]
            })

            self.assertEqual(response.status_code, 503)
            data = response.get_json()
            self.assertFalse(data["success"])
            self.assertEqual(data["error"], "Recipe service is temporarily unavailable.")
            # Verify traceback was printed
            mock_traceback.assert_called()

    def test_generate_json_traceback_on_error(self):
        from unittest.mock import MagicMock, patch
        from services.ai_service import AIServiceError, _generate_json

        with patch("services.ai_service.get_client") as mock_get_client, \
             patch("services.ai_service._call_gemini_with_retries") as mock_call, \
             patch("traceback.print_exc") as mock_tb:
            mock_client = MagicMock()
            mock_get_client.return_value = mock_client
            mock_call.side_effect = RuntimeError("API Call crashed")

            with self.assertRaises(AIServiceError):
                _generate_json("test prompt")

            mock_tb.assert_called()

    def test_model_sanitization(self):
        from services.ai_service import DEFAULT_MODEL, sanitize_model

        self.assertEqual(DEFAULT_MODEL, "gemini-2.5-flash")
        self.assertEqual(sanitize_model("models/gemini-2.5-flash"), "gemini-2.5-flash")
        self.assertEqual(sanitize_model('"models/gemini-2.5-flash"'), "gemini-2.5-flash")
        self.assertEqual(sanitize_model("gemini-2.5-flash"), "gemini-2.5-flash")
        self.assertEqual(sanitize_model(""), "gemini-2.5-flash")

    def test_call_gemini_with_retries_uses_sanitized_model(self):
        import os
        from unittest.mock import MagicMock, patch
        from services.ai_service import DEFAULT_MODEL, _call_gemini_with_retries

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch.dict(os.environ, {"GEMINI_MODEL": "models/gemini-2.5-flash"}):
            res = _call_gemini_with_retries(mock_client, "contents", config={})
            self.assertEqual(res, mock_response)
            mock_client.models.generate_content.assert_called_once()
            called_model = mock_client.models.generate_content.call_args.kwargs["model"]
            self.assertEqual(called_model, "gemini-2.5-flash")
            self.assertEqual(called_model, DEFAULT_MODEL)

    def test_dashboard_section_titles_and_containers(self):
        response = self.client.get("/dashboard")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)

        self.assertIn("Ingredients", html)
        self.assertNotIn("Ingredient Checklist &amp; Pantry Match", html)
        self.assertIn("Recipe", html)
        self.assertIn('id="studio-ingredients-section"', html)
        self.assertIn('id="studio-instructions-section"', html)
        self.assertIn('id="studio-chat-section"', html)

        # Ensure studio-instructions-section is between studio-ingredients-section and studio-chat-section
        ing_pos = html.find('id="studio-ingredients-section"')
        recipe_pos = html.find('id="studio-instructions-section"')
        chat_pos = html.find('id="studio-chat-section"')
        self.assertTrue(ing_pos < recipe_pos < chat_pos)

    def test_generate_recipe_route_payload_dish_name(self):
        from unittest.mock import patch

        with patch("routes.recipe_routes.generate_recipe") as mock_gen:
            mock_gen.return_value = {
                "dish_name": "Tacos",
                "servings": 3,
                "preparation_time": "10 mins",
                "cook_time": "15 mins",
                "ingredients": [{"name": "Tortilla", "quantity": "3"}],
                "instructions": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
            }

            response = self.client.post("/api/generate-recipe", json={
                "dish_name": "Tacos",
                "servings": 3,
                "ingredients": [{"name": "Tortilla", "quantity": "3"}]
            })

            self.assertEqual(response.status_code, 200)
            mock_gen.assert_called_once_with("Tacos", 3, [{"name": "Tortilla", "quantity": "3"}])


if __name__ == "__main__":
    unittest.main()
