// ─────────────────────────────────────────────────────────────
//  App.tsx
//  Root component: QueryClient, AuthProvider, Router
// ─────────────────────────────────────────────────────────────

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./layouts/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComposePage } from "./pages/ComposePage";
import { EmailDetailPage } from "./pages/EmailDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/compose"
              element={
                <ProtectedRoute>
                  <ComposePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email/:id"
              element={
                <ProtectedRoute>
                  <EmailDetailPage />
                </ProtectedRoute>
              }
            />
            {/* Default redirect to "/" */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: "10px",
            fontSize: "14px",
            border: "1px solid #E5E7EB",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
