"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const router = useRouter();
  const { isLoggedIn, loading, user, refetch } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleProtectedNav() {
    if (loading) return;
    router.push(isLoggedIn ? "/markets" : "/login");
  }

  function handleLearnMore() {
    if (loading) return;
    router.push(isLoggedIn ? "/learn_more" : "/login");
  }

  function handlePolyOiyen() {
    if (loading) return;
    router.push(isLoggedIn ? "/polyoiyen" : "/login");
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refetch();
      setShowProfileMenu(false);
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }

        .container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .nav-bar {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-link {
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-link:hover { color: #111827; }
        .nav-link.active {
          color: #f97316;
          font-weight: 600;
        }

        .btn {
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
          border: none;
        }

        .btn-primary {
          background: #f97316;
          color: white;
        }
        .btn-primary:hover { background: #ea580c; }

        .btn-outline {
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        .btn-outline:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .hero-section {
          padding: 80px 20px 60px;
          text-align: center;
        }

        .hero-title {
          font-size: 48px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 20px;
          line-height: 1.2;
        }

        .hero-subtitle {
          font-size: 18px;
          color: #6b7280;
          max-width: 600px;
          margin: 0 auto 30px;
          line-height: 1.6;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 30px;
          margin: 60px 0;
        }

        .feature-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 30px;
          transition: all 0.3s;
        }
        .feature-card:hover {
          border-color: #f97316;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.1);
        }

        .feature-icon {
          width: 48px;
          height: 48px;
          background: #fed7aa;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin-bottom: 16px;
        }

        .feature-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 10px;
        }

        .feature-desc {
          font-size: 14px;
          color: #6b7280;
          line-height: 1.6;
        }

        .stats-section {
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          padding: 50px 20px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 40px;
          text-align: center;
        }

        .stat-number {
          font-size: 36px;
          font-weight: 700;
          color: #f97316;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 14px;
          color: #6b7280;
          font-weight: 500;
        }

        .cta-section {
          padding: 80px 20px;
          text-align: center;
        }

        .footer {
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          padding: 40px 20px;
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
        }

        .footer-link {
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }
        .footer-link:hover { color: #111827; }

        .profile-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f97316;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: white;
          cursor: pointer;
          border: 2px solid #fed7aa;
          transition: all 0.2s;
        }
        .profile-btn:hover {
          background: #ea580c;
          transform: scale(1.05);
        }

        .profile-menu {
          position: absolute;
          top: 50px;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .profile-menu-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 8px;
        }

        .profile-menu-name {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 4px;
        }

        .profile-menu-email {
          font-size: 12px;
          color: #6b7280;
        }

        .profile-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 6px;
          color: #374151;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }
        .profile-menu-item:hover { background: #f3f4f6; }
        .profile-menu-item.logout { color: #ef4444; }
        .profile-menu-item.logout:hover { background: #fef2f2; }

        .badge {
          display: inline-block;
          background: #fed7aa;
          color: #9a3412;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 20px;
        }

        /* ── PolyOiyen Section ── */
        .poly-section {
          padding: 80px 20px;
          background: #0f172a;
          position: relative;
          overflow: hidden;
        }
        .poly-section::before {
          content: '';
          position: absolute;
          top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 400px;
          background: radial-gradient(ellipse, rgba(249,115,22,0.13) 0%, transparent 70%);
          pointer-events: none;
        }
        .poly-inner {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }
        .poly-new-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(249,115,22,0.15);
          color: #fb923c;
          border: 1px solid rgba(249,115,22,0.25);
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 18px;
        }
        .poly-heading {
          font-size: 36px;
          font-weight: 700;
          color: white;
          line-height: 1.2;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
        }
        .poly-heading span { color: #f97316; }
        .poly-desc {
          font-size: 15px;
          color: rgba(255,255,255,0.55);
          line-height: 1.7;
          margin-bottom: 28px;
        }
        .poly-features {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 32px;
        }
        .poly-feature-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .poly-feature-dot {
          width: 20px; height: 20px;
          background: rgba(249,115,22,0.15);
          border: 1px solid rgba(249,115,22,0.3);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
        }
        .poly-feature-text {
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          line-height: 1.5;
        }
        .poly-feature-text strong {
          color: rgba(255,255,255,0.88);
          font-weight: 600;
        }
        .poly-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f97316;
          color: white;
          padding: 11px 24px;
          border-radius: 7px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .poly-btn:hover {
          background: #ea580c;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(249,115,22,0.35);
        }

        /* Preview cards */
        .poly-preview { display: flex; flex-direction: column; gap: 12px; }
        .preview-label {
          font-size: 11px; font-weight: 600;
          color: rgba(255,255,255,0.28);
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 2px;
        }
        .preview-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 16px 18px;
          transition: border-color 0.2s;
        }
        .preview-card:hover { border-color: rgba(249,115,22,0.3); }
        .preview-top {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 10px;
        }
        .preview-tag {
          font-size: 11px; font-weight: 600;
          padding: 2px 8px; border-radius: 4px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .preview-question {
          font-size: 13.5px;
          color: rgba(255,255,255,0.8);
          margin-bottom: 10px; line-height: 1.4;
        }
        .preview-bar-row { display: flex; align-items: center; gap: 10px; }
        .preview-bar {
          flex: 1; height: 5px;
          background: rgba(255,255,255,0.08);
          border-radius: 10px; overflow: hidden;
        }
        .preview-bar-fill {
          height: 100%; border-radius: 10px;
          background: linear-gradient(90deg, #34d399, #10b981);
        }
        .preview-pct {
          font-size: 12px; font-weight: 600;
          color: #34d399; width: 36px; text-align: right;
        }
        .preview-vol { font-size: 11px; color: rgba(255,255,255,0.3); }
        .preview-footer {
          font-size: 12px;
          color: rgba(255,255,255,0.22);
          text-align: center; margin-top: 6px;
        }

        @media (max-width: 900px) {
          .poly-inner { grid-template-columns: 1fr; gap: 40px; }
          .poly-heading { font-size: 28px; }
        }
        @media (max-width: 768px) {
          .hero-title { font-size: 36px; }
          .hero-subtitle { font-size: 16px; }
          .stats-grid { gap: 30px; }
          .nav-links { display: none; }
        }
      `}</style>

      {/* Navigation */}
      <nav className="nav-bar">
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <img src="/oiyen-logo.png" alt="Oiyen" style={{ width: 46, height: 46, borderRadius: 100 }} />
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f97316', letterSpacing: '-0.01em' }}>Oiyen</span>
          </Link>

          <div className="nav-links" style={{ display: 'flex', gap: '32px' }}>
            {['Markets', 'Portfolio', 'Research', 'Pricing'].map(item => (
              <Link key={item} href={`/${item.toLowerCase()}`} className="nav-link">{item}</Link>
            ))}
            {/* PolyOiyen nav link */}
            <Link href="/polyoiyen" className="nav-link" style={{ color: '#f97316', fontWeight: 600 }}>
              PolyOiyen ✦
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {loading ? (
              <div style={{ width: 120, height: 36 }} />
            ) : isLoggedIn ? (
              <div style={{ position: 'relative' }} ref={menuRef}>
                <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="profile-btn" title={user?.name || "Profile"} style={{ padding: 0, overflow: 'hidden' }}>
                  {user?.image ? (
                    <img src={user.image} alt={user.name || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user?.name?.charAt(0).toUpperCase() || "U"
                  )}
                </button>
                {showProfileMenu && (
                  <div className="profile-menu">
                    <div className="profile-menu-header">
                      <div className="profile-menu-name">{user?.name}</div>
                      <div className="profile-menu-email">{user?.email}</div>
                    </div>
                    <Link href="/profile" className="profile-menu-item" onClick={() => setShowProfileMenu(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      My Profile
                    </Link>
                    <Link href="/set-password" className="profile-menu-item" onClick={() => setShowProfileMenu(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Password Settings
                    </Link>
                    <button onClick={handleLogout} className="profile-menu-item logout">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline">Log in</Link>
                <Link href="/register" className="btn btn-primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section — unchanged */}
      <section className="hero-section">
        <div className="container">
          <span className="badge">Investment Platform</span>
          <h1 className="hero-title">Smart Investing Made Simple</h1>
          <p className="hero-subtitle">
            Build your portfolio with powerful tools, real-time analytics, and expert insights. Start investing in minutes.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleProtectedNav} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
              Get Started
            </button>
            <button onClick={handleLearnMore} className="btn btn-outline" style={{ padding: '12px 28px', fontSize: '15px' }}>
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Stats Section — unchanged */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            <div><div className="stat-number">$2.4B+</div><div className="stat-label">Assets Under Management</div></div>
            <div><div className="stat-number">180K+</div><div className="stat-label">Active Investors</div></div>
            <div><div className="stat-number">99.97%</div><div className="stat-label">Uptime</div></div>
            <div><div className="stat-number">12.4%</div><div className="stat-label">Avg. Annual Return</div></div>
          </div>
        </div>
      </section>

      {/* Features Section — unchanged */}
      <section style={{ padding: '80px 20px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>Why Choose Oiyen</h2>
            <p style={{ fontSize: '16px', color: '#6b7280' }}>Everything you need to invest with confidence</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: '📊', title: 'Portfolio Builder', desc: 'Create diversified portfolios tailored to your goals and risk tolerance.' },
              { icon: '📈', title: 'Market Analytics', desc: 'Real-time data and insights to make informed investment decisions.' },
              { icon: '🔄', title: 'Auto-Rebalancing', desc: 'Keep your portfolio on track with automated rebalancing.' },
              { icon: '🔒', title: 'Secure Platform', desc: 'Bank-level security and regulatory compliance.' },
              { icon: '🌍', title: 'Global Markets', desc: 'Access stocks, ETFs, and assets from around the world.' },
              { icon: '📱', title: 'Mobile Trading', desc: 'Trade on the go with our mobile-friendly platform.' },
            ].map((feature, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <div className="feature-title">{feature.title}</div>
                <div className="feature-desc">{feature.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PolyOiyen Introduction Section ── */}
      <section className="poly-section">
        <div className="container">
          <div className="poly-inner">

            {/* Left: Description & features */}
            <div>
              <div className="poly-new-badge">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
                New on Oiyen
              </div>
              <h2 className="poly-heading">
                Meet <span>PolyOiyen</span> —<br />
                Prediction Markets
              </h2>
              <p className="poly-desc">
                PolyOiyen brings the power of prediction markets to Oiyen. Trade on real-world financial outcomes — from Fed rate decisions to stock price milestones — and earn when your predictions are right. It's not just investing; it's forecasting with real stakes.
              </p>

              <div className="poly-features">
                {[
                  { title: 'Trade on real outcomes', desc: 'Every market is tied to a verifiable real-world event — macro, equities, crypto, and more.' },
                  { title: 'Earn from being right', desc: 'Receive payouts proportional to your position when the market resolves in your favour.' },
                  { title: 'Live probability tracking', desc: 'Watch market consensus shift in real-time as new information enters.' },
                  { title: 'Fully integrated with Oiyen', desc: 'One account, one wallet — switch between investing and prediction markets seamlessly.' },
                ].map((f, i) => (
                  <div key={i} className="poly-feature-item">
                    <div className="poly-feature-dot">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <p className="poly-feature-text">
                      <strong>{f.title}</strong> — {f.desc}
                    </p>
                  </div>
                ))}
              </div>

              <button onClick={handlePolyOiyen} className="poly-btn">
                Explore PolyOiyen
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            {/* Right: Live market preview cards */}
            <div className="poly-preview">
              <p className="preview-label">Live Markets Preview</p>
              {[
                { tag: 'Macro', tagColor: '#818cf8', tagBg: 'rgba(129,140,248,0.12)', question: 'Will the Fed cut rates before June 2025?', pct: 72, vol: '$1.2M vol' },
                { tag: 'Equities', tagColor: '#34d399', tagBg: 'rgba(52,211,153,0.12)', question: "Will Apple's market cap exceed $4T in 2025?", pct: 58, vol: '$840K vol' },
                { tag: 'Crypto', tagColor: '#fbbf24', tagBg: 'rgba(251,191,36,0.12)', question: 'Will Bitcoin hit $120K before July 2025?', pct: 41, vol: '$3.1M vol' },
              ].map((m, i) => (
                <div key={i} className="preview-card">
                  <div className="preview-top">
                    <span className="preview-tag" style={{ color: m.tagColor, background: m.tagBg }}>{m.tag}</span>
                    <span className="preview-vol">{m.vol}</span>
                  </div>
                  <p className="preview-question">{m.question}</p>
                  <div className="preview-bar-row">
                    <div className="preview-bar">
                      <div className="preview-bar-fill" style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="preview-pct">{m.pct}%</span>
                  </div>
                </div>
              ))}
              <p className="preview-footer">300+ live markets · Updated in real-time</p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer — unchanged */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/oiyen-logo.png" alt="Oiyen" style={{ width: 24, height: 24, borderRadius: 6 }} />
              <span style={{ fontSize: '14px', color: '#6b7280' }}>© 2025 Oiyen</span>
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              {['Privacy', 'Terms', 'Support', 'Contact'].map(item => (
                <Link key={item} href={`/${item.toLowerCase()}`} className="footer-link">{item}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}