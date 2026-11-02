// ─────────────────────────────────────────────────────────────
//  contexts/AuthContext.tsx
//  Global auth state. Provides user + loading + logout.
//  Pattern: Context + custom hook (useAuth) for clean consumption.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,           // Don't retry 401s
    staleTime: 5 * 60_000,  // 5 minutes
  });

  const logout = async () => {
    await authApi.logout();
    queryClient.clear();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAuthenticated: !!user,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

