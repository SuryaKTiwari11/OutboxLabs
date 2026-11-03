// ─────────────────────────────────────────────────────────────
//  layouts/ProtectedRoute.tsx
//  Redirects unauthenticated users to /login.
// ─────────────────────────────────────────────────────────────

import { useAuth } from "../contexts/AuthContext";
import { LoginPage } from "../pages/LoginPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 rounded-full border-4 border-[#00A63E] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
