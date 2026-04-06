import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import SubjectsPage from './pages/SubjectsPage';
import ProgressPage from './pages/ProgressPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import InstitutionsPage from './pages/InstitutionsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import CoursesPage from './pages/CoursesPage';
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
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/institutions" element={<InstitutionsPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/students" element={<StudentsPage />} />
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

