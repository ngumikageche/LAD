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

/**
 * Blocks access based on permission key AND user_type exclusion.
 * Students are always denied even if a permission key somehow matches.
 * Admins always pass (wildcard). Trainers pass if they have the permission.
 */
export const PermissionRoute = ({
  permissionKey,
  deniedTypes = [],
}: {
  permissionKey: string;
  deniedTypes?: string[];
}) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/" replace />;

  // Hard block for explicitly denied user types (e.g. student)
  if (deniedTypes.includes(user.user_type)) {
    return <Navigate to="/" replace />;
  }

  // Admins have wildcard access
  if (user.user_type === 'admin' || user.permissions['*'] === true) {
    return <Outlet />;
  }

  const hasPermission =
    user.permissions[permissionKey] === true
    || user.permissions[`${permissionKey}.view`] === true
    || user.permissions[`${permissionKey}.read`] === true;

  if (!hasPermission) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
