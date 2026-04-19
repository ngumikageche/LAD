
from .auth import bp as auth_bp
from .courses import bp as courses_bp
from .departments import bp as departments_bp
from .institutions import bp as institutions_bp
from .notifications import bp as notifications_bp
from .roles import bp as roles_bp
from .students import bp as students_bp
from .trainers import bp as trainers_bp
from .users import bp as users_bp
from .modules import bp as modules_bp
from .extra import bp as extra_bp
from .subjects import bp as subjects_bp
from .trainer_subjects import bp as trainer_subjects_bp
from .student_subjects import bp as student_subjects_bp
from .scores import bp as scores_bp

__all__ = [
	"auth_bp",
	"courses_bp",
	"departments_bp",
	"institutions_bp",
	"notifications_bp",
	"roles_bp",
	"students_bp",
	"modules_bp",
	"trainers_bp",
	"users_bp",
	"extra_bp",
	"subjects_bp",
	"trainer_subjects_bp",
	"student_subjects_bp",
	"scores_bp",
]
