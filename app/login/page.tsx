"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
        router.push("/investment");
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
      `}</style>

      <div className="login-container">
        
        {/* Logo */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '32px' }}>
          <div style={{ width: 32, height: 32, background: '#3b82f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '16px' }}>V</div>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Oiyen</span>
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