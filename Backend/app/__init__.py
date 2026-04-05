from flask import Flask
from pathlib import Path
from .extensions import db, migrate
from .config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

  
    from . import models # Ensure models are registered before migrations

    from .routes import auth_bp, roles_bp, users_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(roles_bp)
    app.register_blueprint(users_bp)

    @app.get("/")
    def health_check():
        return {"status": "ok", "app": "LAD Backend"}, 200

    return app
