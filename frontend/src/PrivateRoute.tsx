import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from './authStore';

interface PrivateRouteProps {
  children: ReactElement;
  /** Optional fine-grained permission required to view the route. */
  permission?: string;
}

export default function PrivateRoute({ children, permission }: PrivateRouteProps) {
  const { user, isAuthenticated, hasPermission } = useAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  // Force a password change before anything else (admin-issued OTP accounts).
  if (user?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
