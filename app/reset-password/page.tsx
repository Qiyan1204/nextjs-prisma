"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function getPasswordStrength(password: string) {
  let score = 0;

  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { label: "Weak", color: "#dc2626", progressWidth: "33%" };
  if (score === 3 || score === 4) return { label: "Medium", color: "#f59e0b", progressWidth: "66%" };
  return { label: "Strong", color: "#16a34a", progressWidth: "100%" };
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const strength = getPasswordStrength(newPassword);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    // Validation
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (strength.label === "Weak") {
      setError("Password is too weak. Please use a stronger password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to reset password");
        setLoading(false);
        return;
      }

      setMessage("Password reset successful!");
      setPasswordResetSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Check if token exists
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }
        `}</style>
        <div style={{ background: 'white', border: '1px solid #fecaca', borderRadius: '12px', padding: '2.5rem', maxWidth: '440px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 64, height: 64, background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Invalid Reset Link</h2>
          <p style={{ color: '#dc2626', marginBottom: '1.5rem', fontSize: '0.875rem' }}>This password reset link is invalid or has expired.</p>
          <Link href="/forgot-password" style={{ display: 'inline-block', padding: '10px 24px', background: '#f97316', color: 'white', borderRadius: '8px', fontWeight: 500, textDecoration: 'none', fontSize: '14px', transition: 'all 0.2s' }}>
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'white', padding: '2rem 1rem' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }

        .input-field {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 14px;
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }
        .input-field:disabled {
          background: #f9fafb;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #f97316;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 11px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
        }
        .btn-primary:hover:not(:disabled) {
          background: #ea580c;
          transform: translateY(-1px);
        }
        .btn-primary:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #e5e7eb;
          color: #374151;
          border: none;
          border-radius: 8px;
          padding: 11px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }
        .btn-secondary:hover {
          background: #d1d5db;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Logo */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '2rem' }}>
          <img 
            src="/oiyen-logo.png" 
            alt="Oiyen" 
            style={{ width: 36, height: 36, borderRadius: 8 }}
          />
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Oiyen</span>
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 64, height: 64, background: '#fed7aa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Reset Password</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Create a new secure password for your account</p>
        </div>

        {/* Success Message */}
        {message && (
          <div style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 24, height: 24, background: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>{message}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{ marginBottom: '1.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 24, height: 24, background: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* Main Card */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          
          {/* Card Header */}
          <div style={{ borderBottom: '1px solid #e5e7eb', padding: '1.5rem', background: '#f9fafb' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Set New Password</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '0.25rem' }}>Please enter your new password below</p>
          </div>

          {/* Card Body */}
          <div style={{ padding: '1.5rem' }}>
            <form onSubmit={handleReset}>
              
              {/* New Password */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '6px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    disabled={passwordResetSuccess}
                    className="input-field"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={passwordResetSuccess}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Password Strength:</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                    <div style={{ width: '100%', background: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: strength.progressWidth, background: strength.color, height: '100%', transition: 'all 0.3s' }}></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={passwordResetSuccess}
                  className="input-field"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Passwords match
                  </p>
                )}
              </div>

              {/* Password Requirements */}
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#111827', marginBottom: '8px' }}>
                  Password Requirements:
                </h3>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {[
                    { check: newPassword.length >= 8, text: 'At least 8 characters long' },
                    { check: /[A-Z]/.test(newPassword), text: 'Contains uppercase letter (A-Z)' },
                    { check: /[a-z]/.test(newPassword), text: 'Contains lowercase letter (a-z)' },
                    { check: /[0-9]/.test(newPassword), text: 'Contains number (0-9)' },
                    { check: /[^A-Za-z0-9]/.test(newPassword), text: 'Contains special character (!@#$%^&*)' },
                  ].map((req, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6b7280' }}>
                      <span style={{ color: req.check ? '#16a34a' : '#9ca3af' }}>
                        {req.check ? '✓' : '○'}
                      </span>
                      {req.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: '#e5e7eb', margin: '1.5rem 0' }}></div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={loading || passwordResetSuccess}
                  className="btn-primary"
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      <span>Resetting...</span>
                    </>
                  ) : passwordResetSuccess ? (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Password Reset</span>
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>

                <Link href="/login" className="btn-secondary">
                  Back to Login
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Help Section */}
        <div style={{ marginTop: '1.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>Need Help?</h2>
          <div style={{ display: 'grid', gap: '8px', fontSize: '13px', color: '#6b7280' }}>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#f97316', marginTop: '2px' }}>•</span>
              <span>If you didn't request this password reset, you can safely ignore this page.</span>
            </p>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#f97316', marginTop: '2px' }}>•</span>
              <span>Reset links expire after 24 hours for security purposes.</span>
            </p>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#f97316', marginTop: '2px' }}>•</span>
              <span>Contact support if you continue to experience issues.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}