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

type PermissionSubject = {
  user_type?: string;
  role_name?: string | null;
  permissions?: Record<string, boolean>;
} | null | undefined;

/**
 * Mirrors the backend's `_is_admin`: the wildcard grant or an Admin role name.
 *
 * Deliberately does NOT trust `user_type`, which the API sets to "admin" for
 * every account without a student or trainer profile — a Manager included.
 * Treating that as a wildcard would hand non-admin staff the whole dashboard.
 */
export const isAdminUser = (user: PermissionSubject): boolean => {
  if (!user) return false;
  if (user.permissions?.['*'] === true) return true;
  const roleName = (user.role_name ?? '').toLowerCase();
  return roleName === 'admin' || roleName === 'super admin';
};

/** True when the user holds `key`, or its `.view` / `.read` variant. */
export const hasPermission = (user: PermissionSubject, key: string): boolean => {
  if (isAdminUser(user)) return true;
  const permissions = user?.permissions;
  if (!permissions) return false;
  return (
    permissions[key] === true
    || permissions[`${key}.view`] === true
    || permissions[`${key}.read`] === true
  );
};

/**
 * Blocks access based on permission key(s) AND user_type exclusion.
 * Pass an array to allow any one of several keys.
 * Admins always pass (wildcard). Trainers pass if they have the permission.
 * `allowedTypes` lets a user type in regardless of keys — use it where the API
 * already scopes the response to the caller (e.g. a trainer's own feedback).
 */
export const PermissionRoute = ({
  permissionKey,
  deniedTypes = [],
  allowedTypes = [],
}: {
  permissionKey: string | string[];
  deniedTypes?: string[];
  allowedTypes?: string[];
}) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/" replace />;

  // Hard block for explicitly denied user types (e.g. student)
  if (deniedTypes.includes(user.user_type)) {
    return <Navigate to="/" replace />;
  }

  if (allowedTypes.includes(user.user_type)) {
    return <Outlet />;
  }

  const keys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  const allowed = keys.some((key) => hasPermission(user, key));

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
