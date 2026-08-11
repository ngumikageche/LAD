import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const SubjectsPage = lazy(() => import('./pages/SubjectsPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ModulesPage = lazy(() => import('./pages/ModulesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const InstitutionsPage = lazy(() => import('./pages/InstitutionsPage'));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const TrainersPage = lazy(() => import('./pages/TrainersPage'));
const DataImportPage = lazy(() => import('./pages/DataImportPage'));
const TrainerDashboardPage = lazy(() => import('./pages/TrainerDashboardPage'));
const TrainerReportsPage = lazy(() => import('./pages/TrainerReportsPage'));
const ProvideFeedbackPage = lazy(() => import('./pages/ProvideFeedbackPage'));
const TrainerStudentProfilePage = lazy(() => import('./pages/TrainerStudentProfilePage'));
const StudentDashboardPage = lazy(() => import('./pages/StudentDashboardPage'));
const StudentMarksPage = lazy(() => import('./pages/StudentMarksPage'));
const StudentSubjectsPage = lazy(() => import('./pages/StudentSubjectsPage'));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage'));
const StudentNotificationsPage = lazy(() => import('./pages/StudentNotificationsPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminSystemAnalyticsPage = lazy(() => import('./pages/AdminSystemAnalyticsPage'));
const AdminScoreManagementPage = lazy(() => import('./pages/AdminScoreManagementPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const BulkMarksUploadPage = lazy(() => import('./pages/BulkMarksUploadPage'));
const AdminNotificationsPage = lazy(() => import('./pages/AdminNotificationsPage'));
const ReportCardPage = lazy(() => import('./pages/ReportCardPage'));
const StudentPracticalAssessmentPage = lazy(() => import('./pages/StudentPracticalAssessmentPage'));
const AttendanceReportPage = lazy(() => import('./pages/AttendanceReportPage'));
const ClassPerformancePage = lazy(() => import('./pages/ClassPerformancePage'));
const SyllabusCoveragePage = lazy(() => import('./pages/SyllabusCoveragePage'));
const TrainerAttendancePage = lazy(() => import('./pages/TrainerAttendancePage'));
const TrainerManualAttendancePage = lazy(() => import('./pages/TrainerManualAttendancePage'));
const AdminExamResultsPage = lazy(() => import('./pages/AdminExamResultsPage'));
const AdminEnrolmentPage = lazy(() => import('./pages/AdminEnrolmentPage'));
const AdminAttendancePage = lazy(() => import('./pages/AdminAttendancePage'));
const DisciplinaryRecordsPage = lazy(() => import('./pages/DisciplinaryRecordsPage'));
const TrainerAttendanceSessionPage = lazy(() => import('./pages/TrainerAttendanceSessionPage'));
const StudentAttendanceCheckInPage = lazy(() => import('./pages/StudentAttendanceCheckInPage'));
const OnlineExamDesignerPage = lazy(() => import('./pages/OnlineExamDesignerPage'));
const StudentOnlineExamsPage = lazy(() => import('./pages/StudentOnlineExamsPage'));
const TrainerPracticalAssessmentPage = lazy(() => import('./pages/TrainerPracticalAssessmentPage'));
const TrainerEnrollmentPage = lazy(() => import('./pages/TrainerEnrollmentPage'));
const AdminCompliancePage = lazy(() => import('./pages/AdminCompliancePage'));
const StudentFeedbackPage = lazy(() => import('./pages/StudentFeedbackPage'));
const StudentDisciplinaryRecordsPage = lazy(() => import('./pages/StudentDisciplinaryRecordsPage'));
const StudentTrainerFeedbackPage = lazy(() => import('./pages/StudentTrainerFeedbackPage'));
const TrainerFeedbackInboxPage = lazy(() => import('./pages/TrainerFeedbackInboxPage'));
const PracticalAssessmentReportsPage = lazy(() => import('./pages/PracticalAssessmentReportsPage'));
const ExamResultsAnalysisPage = lazy(() => import('./pages/ExamResultsAnalysisPage'));
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute, { UserTypeRoute, PermissionRoute, hasPermission } from './auth/ProtectedRoute';

/**
 * Shown while a route's chunk downloads. Deliberately quiet — a route chunk is
 * small enough that a spinner would usually flash and vanish.
 */
const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading page">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
  </div>
);

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.user_type === 'student') {
    return <Navigate to="/student/dashboard" replace />;
  }
  if (user.user_type === 'trainer') {
    return <Navigate to="/trainer-hub" replace />;
  }
  // Staff accounts without a student or trainer profile report as "admin".
  // The admin dashboard is permission-gated, so a role that has not been
  // granted it must land somewhere reachable — otherwise the denial bounces
  // back here and the two redirects loop forever.
  if (hasPermission(user, 'admin.analytics.read')) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/reports" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<RouteFallback />}>
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
                <Route path="/student/practical-assessments" element={<StudentPracticalAssessmentPage />} />
                <Route path="/student/attendance/checkin" element={<StudentAttendanceCheckInPage />} />
                <Route path="/student/documents" element={<DocumentsPage />} />
                <Route path="/student/online-exams" element={<StudentOnlineExamsPage />} />
                <Route path="/student/feedback" element={<StudentFeedbackPage />} />
                <Route path="/student/rate-trainers" element={<StudentTrainerFeedbackPage />} />
                <Route path="/student/disciplinary-records" element={<StudentDisciplinaryRecordsPage />} />
              </Route>
              <Route element={<UserTypeRoute allowedTypes={['trainer']} />}>
                <Route path="/trainer-hub" element={<TrainerDashboardPage />} />
                <Route path="/trainer/reports" element={<TrainerReportsPage />} />
                <Route path="/trainer/feedback" element={<ProvideFeedbackPage />} />
                <Route path="/trainer/student-profile" element={<TrainerStudentProfilePage />} />
                <Route path="/trainer/class-performance" element={<ClassPerformancePage />} />
                <Route path="/trainer/practical-assessments" element={<TrainerPracticalAssessmentPage />} />
                <Route path="/trainer/syllabus" element={<SyllabusCoveragePage />} />
                <Route path="/trainer/attendance" element={<TrainerAttendancePage />} />
                <Route path="/trainer/attendance/manual" element={<TrainerManualAttendancePage />} />
                <Route path="/trainer/documents" element={<DocumentsPage />} />
                <Route path="/trainer/online-exams" element={<OnlineExamDesignerPage />} />
                <Route path="/trainer/enrollment" element={<TrainerEnrollmentPage />} />
              </Route>
              {/* Attendance session management: trainer OR admin, never student */}
              <Route element={<PermissionRoute permissionKey="attendance.create" deniedTypes={['student']} />}>
                <Route path="/trainer/attendance-session" element={<TrainerAttendanceSessionPage />} />
              </Route>
              <Route element={<UserTypeRoute allowedTypes={['trainer', 'admin']} />}>
                <Route path="/disciplinary-records" element={<DisciplinaryRecordsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="users.read" deniedTypes={['student']} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="data.import" deniedTypes={['student']} />}>
                <Route path="/data-import" element={<DataImportPage />} />
              </Route>

              {/* Shared staff pages — open to any role granted the permission, not admins only */}
              <Route element={<PermissionRoute permissionKey="scores.create" deniedTypes={['student']} />}>
                <Route path="/admin/scores/bulk-upload" element={<BulkMarksUploadPage />} />
                <Route path="/scores/bulk-upload" element={<BulkMarksUploadPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="reports.student.write" deniedTypes={['student']} />}>
                <Route path="/admin/student-reports" element={<ProvideFeedbackPage />} />
                <Route path="/student-reports" element={<ProvideFeedbackPage />} />
              </Route>
              {/* Trainers always reach their own inbox; the API scopes it to them. */}
              <Route element={<PermissionRoute permissionKey="feedback.trainer.view" allowedTypes={['trainer']} deniedTypes={['student']} />}>
                <Route path="/trainer/feedback-received" element={<TrainerFeedbackInboxPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="admin.scores.read" deniedTypes={['student']} />}>
                <Route path="/admin/scores" element={<AdminScoreManagementPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="students.read" deniedTypes={['student']} />}>
                <Route path="/students" element={<StudentsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="trainers.read" deniedTypes={['student']} />}>
                <Route path="/trainers" element={<TrainersPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="subjects.read" deniedTypes={['student']} />}>
                <Route path="/subjects" element={<SubjectsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="modules.read" deniedTypes={['student']} />}>
                <Route path="/modules" element={<ModulesPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="courses.read" deniedTypes={['student']} />}>
                <Route path="/courses" element={<CoursesPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey={['scores.read', 'analytics.read']} deniedTypes={['student']} />}>
                <Route path="/progress" element={<ProgressPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="reports.admin.pass_rate" deniedTypes={['student']} />}>
                <Route path="/admin/reports/exam-results" element={<AdminExamResultsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="reports.admin.enrolment" deniedTypes={['student']} />}>
                <Route path="/admin/reports/enrolment" element={<AdminEnrolmentPage />} />
              </Route>
              {/* Assessment reporting — granted by permission, so a trainer or
                  manager can hold it without being made an admin. */}
              <Route element={<PermissionRoute permissionKey="reports.practical.assessment" deniedTypes={['student']} />}>
                <Route path="/reports/assessments/practical" element={<PracticalAssessmentReportsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="reports.admin.pass_rate" deniedTypes={['student']} />}>
                <Route path="/reports/assessments/exams" element={<ExamResultsAnalysisPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="documents.read" deniedTypes={['student']} />}>
                <Route path="/admin/documents" element={<DocumentsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="attendance.create" deniedTypes={['student']} />}>
                <Route path="/admin/attendance/manual" element={<TrainerManualAttendancePage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="practical.assessments.manage" allowedTypes={['trainer', 'admin']} deniedTypes={['student']} />}>
                <Route path="/admin/practical-assessments" element={<TrainerPracticalAssessmentPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="online_exams.manage" allowedTypes={['trainer', 'admin']} deniedTypes={['student']} />}>
                <Route path="/admin/online-exams" element={<OnlineExamDesignerPage />} />
              </Route>

              {/* Institution governance and school-wide oversight.
                  Admins always pass; every other role reaches these only when
                  the matching key is granted from the Roles page, so a trainer
                  (or any custom role) can be given an admin screen without
                  being made an admin. */}
              <Route element={<PermissionRoute permissionKey="admin.analytics.read" />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/analytics" element={<AdminSystemAnalyticsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="notifications.read" />}>
                <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="attendance.report.view" />}>
                <Route path="/admin/attendance" element={<AdminAttendancePage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="reports.admin.compliance" />}>
                <Route path="/admin/compliance" element={<AdminCompliancePage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="roles.read" />}>
                <Route path="/roles" element={<RolesPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="institutions.read" />}>
                <Route path="/institutions" element={<InstitutionsPage />} />
              </Route>
              <Route element={<PermissionRoute permissionKey="departments.read" />}>
                <Route path="/departments" element={<DepartmentsPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
