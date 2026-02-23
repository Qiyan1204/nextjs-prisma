"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setEmail("");
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error("Forgot password error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-4">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }

        .auth-container {
          width: 100%;
          max-width: 440px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .input-field {
          width: 100%;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 11px 14px;
          color: #111827;
          font-size: 14px;
          transition: all 0.2s;
          outline: none;
        }
        .input-field:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }
        .input-field::placeholder {
          color: #9ca3af;
        }

        .btn-primary {
          width: 100%;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 8px;
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
          background: #ea580c;
          transform: translateY(-1px);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .link-text {
          color: #f97316;
          text-decoration: none;
          transition: color 0.2s;
        }
        .link-text:hover {
          color: #ea580c;
          text-decoration: underline;
        }

        .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          color: #dc2626;
          font-size: 14px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .success-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          color: #16a34a;
          font-size: 14px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
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

        .info-card {
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px;
          margin-top: 16px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .info-card-content {
          font-size: 13px;
          color: #78350f;
          line-height: 1.5;
        }

        .back-link {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          margin-top: 20px;
          transition: color 0.2s;
        }
        .back-link:hover {
          color: #374151;
        }

        .fade-in {
          animation: fadeUp 0.5s ease forwards;
          opacity: 0;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="auth-container fade-in">
        
        {/* Logo */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '32px' }}>
          <img 
            src="/oiyen-logo.png" 
            alt="Oiyen" 
            style={{ width: 36, height: 36, borderRadius: 8 }}
          />
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Oiyen</span>
        </Link>

        {/* Title */}
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
          Reset your password
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>
          Enter your email address and we'll send you a link to reset your password
        </p>

        {/* Success message */}
        {success && (
          <div className="success-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <strong>Email sent!</strong>
              <br />
              If an account exists with this email, you'll receive a password reset link shortly. Please check your inbox and spam folder.
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="error-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
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

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner" />
                Sending...
              </>
            ) : (
              <>Send reset link</>
            )}
          </button>
        </form>

        {/* Info card */}
        {!success && (
          <div className="info-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div className="info-card-content">
              <strong>Security notice:</strong> For your security, we won't reveal whether an email address is registered in our system.
            </div>
          </div>
        )}

        {/* Back to login */}
        <Link href="/login" className="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to login
        </Link>
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