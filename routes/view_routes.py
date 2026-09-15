from flask import Blueprint, redirect, render_template, session, url_for

view_bp = Blueprint("views", __name__)


@view_bp.get("/login")
def login_view():
    if session.get("user_id"):
        return redirect(url_for("views.dashboard_view"))
    return render_template("login.html")


@view_bp.get("/signup")
def signup_view():
    if session.get("user_id"):
        return redirect(url_for("views.dashboard_view"))
    return render_template("signup.html")


@view_bp.get("/dashboard")
def dashboard_view():
    return render_template("dashboard.html")


@view_bp.get("/recipe")
@view_bp.get("/recipe-studio")
def recipe_view():
    return redirect(url_for("views.dashboard_view"))


@view_bp.get("/saved-recipes")
def saved_recipes_view():
    return render_template("saved_recipes.html")
