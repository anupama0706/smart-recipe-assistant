from flask import Flask, jsonify, redirect

from config import Config
from routes.auth_routes import auth_bp
from routes.chat_routes import chat_bp
from routes.recipe_routes import generate_recipe_route, recipe_bp
from routes.view_routes import view_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.register_blueprint(auth_bp)
    app.register_blueprint(recipe_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(view_bp)

    @app.get("/")
    def index():
        return redirect("/login")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)