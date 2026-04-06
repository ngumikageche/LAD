from .auth import bp as auth_bp
from .courses import bp as courses_bp
from .departments import bp as departments_bp
from .institutions import bp as institutions_bp
from .notifications import bp as notifications_bp
from .roles import bp as roles_bp
from .students import bp as students_bp
from .trainers import bp as trainers_bp
from .users import bp as users_bp

__all__ = [
	"auth_bp",
	"courses_bp",
	"departments_bp",
	"institutions_bp",
	"notifications_bp",
	"roles_bp",
	"students_bp",
	"trainers_bp",
	"users_bp",
]
