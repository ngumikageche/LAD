import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import StudentDashboardPage from './pages/StudentDashboardPage';
import StudentMarksPage from './pages/StudentMarksPage';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/student/dashboard" element={<StudentDashboardPage />} />
              <Route path="/student/marks" element={<StudentMarksPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/institutions" element={<InstitutionsPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/trainers" element={<TrainersPage />} />
              <Route path="/trainer-hub" element={<TrainerDashboardPage />} />
              <Route path="/modules" element={<ModulesPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

