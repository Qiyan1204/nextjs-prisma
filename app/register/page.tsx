"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";

interface PasswordStrength {
  score: number; // 0-4
  label: string; // "Weak", "Fair", "Good", "Strong"
  color: string; // CSS color
  checks: {
    length: boolean;
    uppercase: boolean;
    number: boolean;
    symbol: boolean;
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 计算密码强度
  const passwordStrength = useMemo((): PasswordStrength => {
    const pwd = formData.password;
    
    const checks = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      symbol: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/;'`~]/.test(pwd),
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;

    let score = 0;
    let label = "Weak";
    let color = "#dc2626"; // red

    if (passedChecks === 4) {
      score = 4;
      label = "Strong";
      color = "#16a34a"; // green
    } else if (passedChecks === 3) {
      score = 3;
      label = "Good";
      color = "#ca8a04"; // yellow
    } else if (passedChecks === 2) {
      score = 2;
      label = "Fair";
      color = "#ea580c"; // orange
    } else {
      score = passedChecks;
      label = "Weak";
      color = "#dc2626"; // red
    }

    return { score, label, color, checks };
  }, [formData.password]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 验证密码强度
    if (!passwordStrength.checks.length) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }
    if (!passwordStrength.checks.uppercase) {
      setError("Password must contain at least one uppercase letter");
      setLoading(false);
      return;
    }
    if (!passwordStrength.checks.number) {
      setError("Password must contain at least one number");
      setLoading(false);
      return;
    }
    if (!passwordStrength.checks.symbol) {
      setError("Password must contain at least one symbol");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: "INVESTOR",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push("/investment");
        router.refresh();
      } else {
        setError(data.error || "Registration failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error("Register error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }

        .register-container {
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

        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 24px 0;
        }

        .info-text {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.5;
          margin-top: 12px;
        }

        /* Password strength indicator */
        .strength-container {
          margin-top: 8px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }

        .strength-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .strength-label {
          font-size: 12px;
          color: #6b7280;
        }

        .strength-badge {
          font-size: 12px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .strength-bars {
          display: flex;
          gap: 4px;
          margin-bottom: 10px;
        }

        .strength-bar {
          flex: 1;
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          transition: all 0.3s;
        }

        .strength-bar.filled {
          background: currentColor;
        }

        .requirement {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .requirement:last-child {
          margin-bottom: 0;
        }

        .requirement-icon {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
        }

        .requirement-icon.met {
          background: #16a34a;
          color: white;
        }

        .requirement-icon.unmet {
          background: #e5e7eb;
          color: #9ca3af;
        }
      `}</style>

      <div className="register-container">
        
        {/* Logo */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '32px' }}>
          <img 
            src="/oiyen-logo.png" 
            alt="Oiyen" 
            style={{ width: 46, height: 46, borderRadius: 100 }}
          />
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Oiyen</span>
        </Link>

        {/* Title */}
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
          Create Account
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>
          Start investing in just a few minutes
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
            <label className="label">Full Name</label>
            <input
              type="text"
              name="name"
              className="input-field"
              placeholder="John Doe"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label className="label">Email Address</label>
            <input
              type="email"
              name="email"
              className="input-field"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label className="label">Password</label>
            <input
              type="password"
              name="password"
              className="input-field"
              placeholder="Create a password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
            />

            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="strength-container">
                <div className="strength-header">
                  <span className="strength-label">Password Strength</span>
                  <span 
                    className="strength-badge"
                    style={{ 
                      color: passwordStrength.color,
                      background: passwordStrength.color + '15'
                    }}
                  >
                    {passwordStrength.label}
                  </span>
                </div>

                {/* Strength bars */}
                <div className="strength-bars" style={{ color: passwordStrength.color }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`strength-bar ${i <= passwordStrength.score ? 'filled' : ''}`}
                    />
                  ))}
                </div>

                {/* Requirements checklist */}
                <div>
                  <div className="requirement">
                    <div className={`requirement-icon ${passwordStrength.checks.length ? 'met' : 'unmet'}`}>
                      {passwordStrength.checks.length ? '✓' : '○'}
                    </div>
                    At least 8 characters
                  </div>
                  <div className="requirement">
                    <div className={`requirement-icon ${passwordStrength.checks.uppercase ? 'met' : 'unmet'}`}>
                      {passwordStrength.checks.uppercase ? '✓' : '○'}
                    </div>
                    One uppercase letter
                  </div>
                  <div className="requirement">
                    <div className={`requirement-icon ${passwordStrength.checks.number ? 'met' : 'unmet'}`}>
                      {passwordStrength.checks.number ? '✓' : '○'}
                    </div>
                    One number
                  </div>
                  <div className="requirement">
                    <div className={`requirement-icon ${passwordStrength.checks.symbol ? 'met' : 'unmet'}`}>
                      {passwordStrength.checks.symbol ? '✓' : '○'}
                    </div>
                    One symbol (!@#$%^&*...)
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label className="label">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              className="input-field"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
            />

            {/* Password Match Indicator */}
            {formData.confirmPassword && (
              <div style={{ 
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: formData.password === formData.confirmPassword ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${formData.password === formData.confirmPassword ? '#bbf7d0' : '#fecaca'}`,
                color: formData.password === formData.confirmPassword ? '#16a34a' : '#dc2626'
              }}>
                <span style={{ fontSize: '14px' }}>
                  {formData.password === formData.confirmPassword ? '✓' : '✕'}
                </span>
                {formData.password === formData.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner" />
                Creating account...
              </>
            ) : (
              <>Create Account</>
            )}
          </button>

          <p className="info-text">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>

        <div className="divider" />

        {/* Sign in link */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#6b7280' }}>
          Already have an account?{' '}
          <Link href="/login" className="link-text">
            Sign in
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