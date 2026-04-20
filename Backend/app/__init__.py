from flask import Flask
from flask_cors import CORS
from pathlib import Path
from .extensions import db, migrate
from .config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS")}})

    db.init_app(app)
    migrate.init_app(app, db)

  
    from . import models # Ensure models are registered before migrations




    from .routes import (
        auth_bp,
        courses_bp,
        departments_bp,
        institutions_bp,
        notifications_bp,
        roles_bp,
        students_bp,
        modules_bp,
        trainers_bp,
        users_bp,
        # extra_bp,
        subjects_bp,
        trainer_subjects_bp,
        student_subjects_bp,
        scores_bp,
        analytics_bp,
        announcements_bp,
        admin_analytics_bp,
        admin_management_bp,
        admin_dashboard_bp,
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(courses_bp)
    app.register_blueprint(departments_bp)
    app.register_blueprint(institutions_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(roles_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(modules_bp)
    app.register_blueprint(trainers_bp)
    app.register_blueprint(users_bp)
    # app.register_blueprint(extra_bp)
    app.register_blueprint(subjects_bp)
    app.register_blueprint(trainer_subjects_bp)
    app.register_blueprint(student_subjects_bp)
    app.register_blueprint(scores_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(announcements_bp)
    app.register_blueprint(admin_analytics_bp)
    app.register_blueprint(admin_management_bp)
    app.register_blueprint(admin_dashboard_bp)

    @app.get("/")
    def health_check():
        return {"status": "ok", "app": "LAD Backend"}, 200

    return app
