
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
# from .extra import bp as extra_bp
from .subjects import bp as subjects_bp
from .trainer_subjects import bp as trainer_subjects_bp
from .student_subjects import bp as student_subjects_bp
from .scores import bp as scores_bp
from .analytics import bp as analytics_bp
from .announcements import bp as announcements_bp
from .admin_analytics import bp as admin_analytics_bp
from .admin_management import bp as admin_management_bp
from .admin_dashboard import bp as admin_dashboard_bp
from .admin_users import bp as admin_users_bp
from .admin_institutions import bp as admin_institutions_bp
from .admin_departments import bp as admin_departments_bp
from .admin_courses import bp as admin_courses_bp
from .admin_subjects import bp as admin_subjects_bp
from .admin_trainers import bp as admin_trainers_bp
from .admin_students import bp as admin_students_bp
from .trainer_portal import bp as trainer_portal_bp
from .admin_reports import bp as admin_reports_bp
from .admin_scores import bp as admin_scores_bp
from .scores_v1 import bp as scores_v1_bp
from .student_portal import bp as student_portal_bp
from .announcements_v1 import bp as announcements_v1_bp
from .reports import bp as reports_bp
from .trainer_reports import bp as trainer_reports_bp
from .student_reports import bp as student_reports_bp
from .admin_reports_v2 import bp as admin_reports_v2_bp
from .advanced_analytics import bp as advanced_analytics_bp
from .advanced_reports import bp as advanced_reports_bp
from .documents import bp as documents_bp
from .bulk_marks import bp as bulk_marks_bp
from .attendance import bp as attendance_bp
from .online_exams import bp as online_exams_bp
from .practical_assessments import bp as practical_assessments_bp
from .permissions import trainer_or_admin_required  # re-exported for convenience

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
	"subjects_bp",
	"trainer_subjects_bp",
	"student_subjects_bp",
	"scores_bp",
	"analytics_bp",
	"announcements_bp",
	"admin_analytics_bp",
	"admin_management_bp",
	"admin_dashboard_bp",
	"admin_users_bp",
	"admin_institutions_bp",
	"admin_departments_bp",
	"admin_courses_bp",
	"admin_subjects_bp",
	"admin_trainers_bp",
	"admin_students_bp",
	"admin_reports_bp",
	"admin_scores_bp",
	"trainer_portal_bp",
	"scores_v1_bp",
	"student_portal_bp",
	"announcements_v1_bp",
	"reports_bp",
	"trainer_reports_bp",
	"student_reports_bp",
	"admin_reports_v2_bp",
	"advanced_analytics_bp",
	"advanced_reports_bp",
	"documents_bp",
	"bulk_marks_bp",
	"attendance_bp",
	"online_exams_bp",
	"practical_assessments_bp",
]
