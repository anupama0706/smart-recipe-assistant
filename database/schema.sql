CREATE DATABASE IF NOT EXISTS smart_recipe_assistant;
USE smart_recipe_assistant;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_recipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    dish_name VARCHAR(150) NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    servings INT NOT NULL DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_saved_recipes_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
