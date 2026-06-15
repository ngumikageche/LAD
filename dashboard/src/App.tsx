import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import SubjectsPage from './pages/SubjectsPage';
import ProgressPage from './pages/ProgressPage';
import ReportsPage from './pages/ReportsPage';
import ModulesPage from './pages/ModulesPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import InstitutionsPage from './pages/InstitutionsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import CoursesPage from './pages/CoursesPage';
import TrainersPage from './pages/TrainersPage';
import TrainerDashboardPage from './pages/TrainerDashboardPage';
import TrainerReportsPage from './pages/TrainerReportsPage';
import ProvideFeedbackPage from './pages/ProvideFeedbackPage';
import TrainerStudentProfilePage from './pages/TrainerStudentProfilePage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import StudentMarksPage from './pages/StudentMarksPage';
import StudentSubjectsPage from './pages/StudentSubjectsPage';
import StudentProfilePage from './pages/StudentProfilePage';
import StudentNotificationsPage from './pages/StudentNotificationsPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminSystemAnalyticsPage from './pages/AdminSystemAnalyticsPage';
import AdminScoreManagementPage from './pages/AdminScoreManagementPage';
import DocumentsPage from './pages/DocumentsPage';
import BulkMarksUploadPage from './pages/BulkMarksUploadPage';
import AdminNotificationsPage from './pages/AdminNotificationsPage';
import ReportCardPage from './pages/ReportCardPage';
import AttendanceReportPage from './pages/AttendanceReportPage';
import FeeStatementPage from './pages/FeeStatementPage';
import ClassPerformancePage from './pages/ClassPerformancePage';
import SyllabusCoveragePage from './pages/SyllabusCoveragePage';
import TrainerAttendancePage from './pages/TrainerAttendancePage';
import TrainerManualAttendancePage from './pages/TrainerManualAttendancePage';
import AdminExamResultsPage from './pages/AdminExamResultsPage';
import AdminFeeCollectionPage from './pages/AdminFeeCollectionPage';
import AdminEnrolmentPage from './pages/AdminEnrolmentPage';
import AdminAttendancePage from './pages/AdminAttendancePage';
import TrainerAttendanceSessionPage from './pages/TrainerAttendanceSessionPage';
import StudentAttendanceCheckInPage from './pages/StudentAttendanceCheckInPage';
import OnlineExamDesignerPage from './pages/OnlineExamDesignerPage';
import StudentOnlineExamsPage from './pages/StudentOnlineExamsPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute, { UserTypeRoute, PermissionRoute } from './auth/ProtectedRoute';

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.user_type === 'student') {
    return <Navigate to="/student/dashboard" replace />;
  } else if (user.user_type === 'trainer') {
    return <Navigate to="/trainer-hub" replace />;
  } else {
    return <Navigate to="/admin/dashboard" replace />;
  }
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<DashboardRedirect />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route element={<UserTypeRoute allowedTypes={['student']} />}>
                <Route path="/student/dashboard" element={<StudentDashboardPage />} />
                <Route path="/student/marks" element={<StudentMarksPage />} />
                <Route path="/student/scores" element={<StudentMarksPage />} />
                <Route path="/student/subjects" element={<StudentSubjectsPage />} />
                <Route path="/student/profile" element={<StudentProfilePage />} />
                <Route path="/student/notifications" element={<StudentNotificationsPage />} />
                <Route path="/student/report-card" element={<ReportCardPage />} />
                <Route path="/student/attendance-report" element={<AttendanceReportPage />} />
                <Route path="/student/fee-statement" element={<FeeStatementPage />} />
                <Route path="/student/attendance/checkin" element={<StudentAttendanceCheckInPage />} />
                <Route path="/student/documents" element={<DocumentsPage />} />
                <Route path="/student/online-exams" element={<StudentOnlineExamsPage />} />
              </Route>
              <Route element={<UserTypeRoute allowedTypes={['trainer']} />}>
                <Route path="/trainer-hub" element={<TrainerDashboardPage />} />
                <Route path="/trainer/reports" element={<TrainerReportsPage />} />
                <Route path="/trainer/feedback" element={<ProvideFeedbackPage />} />
                <Route path="/trainer/student-profile" element={<TrainerStudentProfilePage />} />
                <Route path="/trainer/class-performance" element={<ClassPerformancePage />} />
                <Route path="/trainer/syllabus" element={<SyllabusCoveragePage />} />
                <Route path="/trainer/attendance" element={<TrainerAttendancePage />} />
                <Route path="/trainer/attendance/manual" element={<TrainerManualAttendancePage />} />
                <Route path="/trainer/documents" element={<DocumentsPage />} />
                <Route path="/trainer/online-exams" element={<OnlineExamDesignerPage />} />
              </Route>
              {/* Attendance session management: trainer OR admin, never student */}
              <Route element={<PermissionRoute permissionKey="attendance.create" deniedTypes={['student']} />}>
                <Route path="/trainer/attendance-session" element={<TrainerAttendanceSessionPage />} />
              </Route>
              <Route element={<UserTypeRoute allowedTypes={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/analytics" element={<AdminSystemAnalyticsPage />} />
                <Route path="/admin/scores" element={<AdminScoreManagementPage />} />
                <Route path="/admin/scores/bulk-upload" element={<BulkMarksUploadPage />} />
                <Route path="/admin/scores/bulk-upload" element={<BulkMarksUploadPage />} />
                <Route path="/admin/documents" element={<DocumentsPage />} />
                <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
                <Route path="/admin/student-reports" element={<ProvideFeedbackPage />} />
                <Route path="/admin/online-exams" element={<OnlineExamDesignerPage />} />
                <Route path="/admin/reports/exam-results" element={<AdminExamResultsPage />} />
                <Route path="/admin/reports/fees" element={<AdminFeeCollectionPage />} />
                <Route path="/admin/reports/enrolment" element={<AdminEnrolmentPage />} />
                <Route path="/admin/attendance" element={<AdminAttendancePage />} />
                <Route path="/admin/attendance/manual" element={<TrainerManualAttendancePage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/institutions" element={<InstitutionsPage />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/students" element={<StudentsPage />} />
                <Route path="/trainers" element={<TrainersPage />} />
                <Route path="/modules" element={<ModulesPage />} />
                <Route path="/subjects" element={<SubjectsPage />} />
                <Route path="/progress" element={<ProgressPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
