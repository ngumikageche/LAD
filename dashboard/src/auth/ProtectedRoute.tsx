import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ProtectedRoute = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Checking session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export const UserTypeRoute = ({ allowedTypes }: { allowedTypes: string[] }) => {
  const { user } = useAuth();

  if (!user || !allowedTypes.includes(user.user_type)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
