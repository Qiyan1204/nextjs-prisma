"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push("/markets");
        router.refresh();
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }

        .login-container {
          width: 100%;
          max-width: 420px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 40px;
        }

        .input-field {
          width: 100%;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 10px 14px;
          color: #111827;
          font-size: 14px;
          transition: all 0.2s;
          outline: none;
        }
        .input-field:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .input-field::placeholder {
          color: #9ca3af;
        }

        .btn-primary {
          width: 100%;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 11px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .link-text {
          color: #3b82f6;
          text-decoration: none;
          transition: color 0.2s;
        }
        .link-text:hover {
          color: #2563eb;
          text-decoration: underline;
        }

        .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
          color: #dc2626;
          font-size: 14px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .label {
          display: block;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 6px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #6b7280;
        }

        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #3b82f6;
        }

        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 24px 0;
        }

        .btn-google {
          width: 100%;
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 11px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .btn-google:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }
        .btn-google:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .divider-text {
          display: flex;
          align-items: center;
          margin: 24px 0;
        }
        .divider-text::before,
        .divider-text::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }
        .divider-text span {
          padding: 0 16px;
          color: #9ca3af;
          font-size: 13px;
        }
      `}</style>

      <div className="login-container">
        
        {/* Logo */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', marginBottom: '2rem' }}>
          <img 
            src="/oiyen-logo.png" 
            alt="Oiyen" 
            style={{ width: 46, height: 46, borderRadius: 100 }}
          />
          <span style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>Oiyen</span>
        </Link>

        {/* Title */}
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
          Welcome Back
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>
          Sign in to your account to continue
        </p>

        {/* Error message */}
        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label className="label">Email Address</label>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="label">Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <label className="checkbox-label">
              <input type="checkbox" />
              Remember me
            </label>
            <Link href="/forgot-password" className="link-text" style={{ fontSize: '13px' }}>
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner" />
                Signing in...
              </>
            ) : (
              <>Sign In</>
            )}
          </button>
        </form>

        <div className="divider-text">
          <span>or</span>
        </div>

        {/* Google Login Button */}
        <button
          type="button"
          className="btn-google"
          onClick={() => {
            setGoogleLoading(true);
            signIn("google", { callbackUrl: "/markets" });
          }}
          disabled={googleLoading || loading}
        >
          {googleLoading ? (
            <>
              <div className="spinner" style={{ borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#374151' }} />
              Connecting...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="divider" />

        {/* Sign up link */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#6b7280' }}>
          Don't have an account?{' '}
          <Link href="/register" className="link-text">
            Create one now
          </Link>
        </p>
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '20px', display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '13px', color: '#9ca3af' }}>
        <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</Link>
        <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</Link>
        <Link href="/support" style={{ color: 'inherit', textDecoration: 'none' }}>Support</Link>
      </div>
    </div>
  );
}