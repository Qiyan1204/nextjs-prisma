"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

export default function SetPasswordPage() {
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(newPassword);

  // Check if user already has a password
  useEffect(() => {
    async function checkPassword() {
      try {
        const res = await fetch("/api/auth/has-password");
        if (res.ok) {
          const data = await res.json();
          setHasPassword(data.hasPassword);
        } else if (res.status === 401) {
          // Not logged in, redirect to login
          router.push("/login");
        }
      } catch (err) {
        console.error("Failed to check password status:", err);
      } finally {
        setCheckingPassword(false);
      }
    }
    checkPassword();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    // Validation for change password - need current password
    if (hasPassword && !currentPassword) {
      setError("Current password is required");
      return;
    }

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
      // Use different API endpoint based on whether user has password
      const endpoint = hasPassword ? "/api/auth/change-password" : "/api/auth/set-password";
      const body = hasPassword 
        ? { currentPassword, newPassword, confirmPassword }
        : { newPassword, confirmPassword };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update password");
        setLoading(false);
        return;
      }

      setMessage(data.message);
      setSuccess(true);
      
      // Redirect to profile page after 2 seconds
      setTimeout(() => {
        router.push("/profile");
      }, 2000);
    } catch (err) {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }
        `}</style>
        <div style={{ background: 'white', border: '1px solid #d1fae5', borderRadius: '12px', padding: '2.5rem', maxWidth: '440px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 64, height: 64, background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem' }}>✓</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
            {hasPassword ? 'Password Changed Successfully!' : 'Password Set Successfully!'}
          </h2>
          <p style={{ color: '#16a34a', marginBottom: '1.5rem', fontSize: '0.875rem' }}>{message}</p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Loading state while checking password status
  if (checkingPassword) {
    return (
      <div style={{ minHeight: '100vh', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #f3f4f6', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }}></div>
          <p style={{ color: '#6b7280' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }
        input:focus { outline: none; border-color: #f97316 !important; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
      
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔐</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
            {hasPassword ? 'Change Your Password' : 'Set Your Password'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {hasPassword 
              ? 'Enter your current password and choose a new one'
              : 'Create a password to login with email and password'}
          </p>
        </div>

        {/* Form Card */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          
          {/* Error Message */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#dc2626' }}>⚠️</span>
              <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Current Password - only show if user has password */}
            {hasPassword && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Current Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'all 0.2s'
                  }}
                  required
                />
              </div>
            )}

            {/* New Password */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'all 0.2s'
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: 0
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {newPassword && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Password strength:</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: strength.color }}>{strength.label}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: strength.progressWidth, height: '100%', background: strength.color, transition: 'all 0.3s' }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'all 0.2s'
                }}
                required
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px' }}>Passwords do not match</p>
              )}
              {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 8 && (
                <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '4px' }}>✓ Passwords match</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword || (!!hasPassword && !currentPassword)}
              style={{
                width: '100%',
                padding: '12px',
                background: loading ? '#fdba74' : '#f97316',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {loading 
                ? (hasPassword ? 'Changing Password...' : 'Setting Password...') 
                : (hasPassword ? 'Change Password' : 'Set Password')}
            </button>
          </form>

          {/* Password Requirements */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Password Requirements:</p>
            <ul style={{ fontSize: '0.75rem', color: '#6b7280', paddingLeft: '1rem', margin: 0 }}>
              <li style={{ marginBottom: '4px' }}>At least 8 characters long</li>
              <li style={{ marginBottom: '4px' }}>Include uppercase and lowercase letters</li>
              <li style={{ marginBottom: '4px' }}>Include at least one number</li>
              <li>Include at least one special character</li>
            </ul>
          </div>
        </div>

        {/* Back Link */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link href="/profile" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>
            ← Back to Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
