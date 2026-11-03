// ─────────────────────────────────────────────────────────────
//  pages/LoginPage.tsx
//  SCREEN 1 - LOGIN (/login)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/api";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("demo@reachinbox.io");
  const [password, setPassword] = useState("demo1234");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error("Google login failed. Please try again.");
    }
  }, [searchParams]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please enter your email ID and password");
      return;
    }

    try {
      setIsSubmitting(true);
      await authApi.devLogin();
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Welcome!");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error((err as Error).message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = () => {
    localStorage.removeItem("auth_token");
    window.location.href = authApi.googleLoginUrl();
  };

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4">
      {/* Centered card: ~496px wide x ~493px tall, 1px #F1F2F4 border, radius 12px, white */}
      <div
        className="w-[496px] bg-white rounded-[12px] border border-[#F1F2F4] flex flex-col items-center"
        style={{
          padding: "52px 58px",
        }}
      >
        <div className="w-[380px] flex flex-col">
          {/* Title "Login": centered, 36px, weight 700, #1C1C1C, line-height ~44px */}
          <h1 className="text-center text-[36px] font-[700] leading-[44px] text-[#1C1C1C] mb-[32px]">
            Login
          </h1>

          {/* Google button: 380x48, bg #E5F6EC, radius 10px, no border */}
          <button
            type="button"
            onClick={handleGoogleClick}
            className="w-[380px] h-[48px] bg-[#E5F6EC] rounded-[10px] flex items-center justify-center gap-[8px] hover:bg-[#d8f0e2] transition-colors"
          >
            {/* Centered colored Google "G" (18px) */}
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-[14px] font-[500] text-[#1C1C1C]">
              Login with Google
            </span>
          </button>

          <div className="mt-[28px] mb-[40px] flex items-center justify-between w-[380px]">
            <div className="w-[90px] h-[1px]" style={{ backgroundColor: "#E5E7EB" }} />
            <span className="text-[12px] text-[#A4A4A4] tracking-[0.4px]">
              or use test credentials below
            </span>
            <div className="w-[90px] h-[1px]" style={{ backgroundColor: "#E5E7EB" }} />
          </div>

          <form onSubmit={handleLoginSubmit} className="flex flex-col">
            <div className="mb-[16px] px-[14px] py-[10px] bg-[#F0FDF4] border border-[#BBF7D0] rounded-[8px] text-[12px] text-[#166534]">
              <span className="font-[600]">Test credentials pre-filled</span> — just click Login
              <br />
              <span className="font-mono text-[11px] text-[#15803D]">demo@reachinbox.io</span>
              <span className="text-[#A4A4A4]"> / </span>
              <span className="font-mono text-[11px] text-[#15803D]">demo1234</span>
            </div>
            <div className="flex flex-col gap-[12px]">
              <input
                type="email"
                placeholder="Email ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-[380px] h-[56px] bg-[#F4F7F5] rounded-[10px] pl-[20px] pr-[16px] text-[14px] text-[#101828] placeholder-[#636970] outline-none focus:ring-1 focus:ring-[#00A63E] transition-all"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-[380px] h-[56px] bg-[#F4F7F5] rounded-[10px] pl-[20px] pr-[16px] text-[14px] text-[#101828] placeholder-[#636970] outline-none focus:ring-1 focus:ring-[#00A63E] transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-[28px] w-[380px] h-[48px] bg-[#00A63E] hover:bg-[#008f35] text-white text-[14px] font-[500] rounded-[10px] transition-colors flex items-center justify-center disabled:opacity-70"
            >
              {isSubmitting ? "Logging in..." : "Login"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
