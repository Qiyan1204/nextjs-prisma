"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  image?: string | null;
}

const NAV_LINKS = [
  { label: "📈 Oiyen.Invest", href: "/markets" },
  { label: "🏪 Market", href: "/polyoiyen" },
  { label: "📊 PolyPortfolio", href: "/polyoiyen/PolyPortfolio" },
  { label: "📰 PolyNews", href: "/polyoiyen/PolyNews" },
  { label: "🔔 Notification", href: "/polyoiyen/PolyNotification" },
];

const MORE_LINKS = [
  { label: "🏆 Leaderboard", href: "/polyoiyen/PolyLeaderboard", active: "Leaderboard" },
  { label: "🎁 Reward", href: "/polyoiyen/PolyReward", active: "Reward" },
  { label: "🧩 PolyAnalysis", href: "/polyoiyen/PolyAnalysis", active: "PolyAnalysis" },
  { label: "🆚 About", href: "/polyoiyen/OiyenCompare", active: "OiyenCompare" },
  { label: "🗓️ MyCalendar", href: "/polyoiyen/MyCalendar", active: "MyCalendar" }
];

const ELITE_LINKS = [
  {
    label: "🌋 Volatility Surge Ranking",
    href: "/polyoiyen/VolatilitySurgeRanking",
    active: "EliteVolatilitySurge",
  },
  {
    label: "🛡️ Signal Confidence Ranking",
    href: "/polyoiyen/SignalConfidenceRanking",
    active: "EliteSignalConfidence",
  },
  {
    label: "🚀 Lead-Lag Ranking",
    href: "/polyoiyen/LeadLagRanking",
    active: "EliteLeadLag",
  },
];

export default function PolyHeader({ active, children }: { active: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEliteMenu, setShowEliteMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const eliteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) { setUser(data.user); setIsLoggedIn(true); }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMoreMenu(false);
      if (eliteRef.current && !eliteRef.current.contains(e.target as Node)) setShowEliteMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  async function handleLogout() {
      await Promise.all([
        fetch("/api/auth/logout", { method: "POST" }),
        signOut({ redirect: false }),
      ]);
      setUser(null);
      setIsLoggedIn(false);
      setShowMenu(false);
      router.push("/");
      router.refresh();
  }

  return (
    <>
      <style>{`
        .poly-header {
          height: 58px; padding: 0 28px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(22,12,3,0.92); backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          position: sticky; top: 0; z-index: 200;
          box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
          font-family: 'DM Sans', sans-serif;
        }
        .poly-header-left { display: flex; align-items: center; gap: 8px; }
        .poly-header-logo { display: flex; align-items: center; gap: 7px; text-decoration: none; }
        .poly-header-logo img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
        .poly-header-logo span { font-size: 15px; font-weight: 700; color: #f97316; letter-spacing: -0.02em; }
        .poly-header-divider { color: rgba(255,255,255,0.22); font-size: 16px; margin: 0 2px; }
        .poly-header-links { display: flex; align-items: center; gap: 4px; }
        .poly-header-link {
          padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
          color: rgba(255,255,255,0.44); background: none; border: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: all 0.15s; text-decoration: none;
          display: flex; align-items: center; gap: 5px; white-space: nowrap;
        }
        .poly-header-link:hover { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.05); }
        .poly-header-link.active { color: #f97316; background: rgba(249,115,22,0.08); }
        .poly-header-more-wrap { position: relative; }
        .poly-header-more-btn {
          border: none;
          background: none;
        }
        .poly-header-more-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 180px;
          border-radius: 10px;
          padding: 6px;
          background: #1e1108;
          border: 1px solid rgba(249,115,22,0.2);
          box-shadow: 0 8px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
          animation: polyMenuIn 0.15s ease-out;
          z-index: 220;
        }
        .poly-header-more-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 9px 12px;
          border-radius: 7px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.72);
          transition: all 0.15s;
          white-space: nowrap;
        }
        .poly-header-more-item:hover {
          color: rgba(255,255,255,0.95);
          background: rgba(249,115,22,0.08);
        }
        .poly-header-more-item.active {
          color: #f97316;
          background: rgba(249,115,22,0.12);
        }
        .poly-header-right { display: flex; align-items: center; gap: 12px; }
        .poly-profile-btn {
          width: 36px; height: 36px; border-radius: 50%;
          background: #f97316; display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 600; color: white; cursor: pointer;
          border: 2px solid rgba(249,115,22,0.4); transition: all 0.2s;
          overflow: hidden;
        }
        .poly-profile-btn:hover { background: #ea580c; transform: scale(1.05); border-color: rgba(249,115,22,0.6); }
        .poly-profile-btn img { width: 100%; height: 100%; object-fit: cover; }
        .poly-profile-menu {
          position: absolute; top: 50px; right: 0;
          background: #1e1108; border: 1px solid rgba(249,115,22,0.2);
          border-radius: 10px; padding: 6px; min-width: 210px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
          animation: polyMenuIn 0.15s ease-out;
        }
        @keyframes polyMenuIn { from { opacity:0; transform: translateY(-6px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
        .poly-profile-menu-header {
          padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 4px;
        }
        .poly-profile-menu-name { font-size: 13px; font-weight: 700; color: #f97316; margin-bottom: 2px; }
        .poly-profile-menu-email { font-size: 11px; color: rgba(255,255,255,0.4); }
        .poly-profile-menu-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 14px; border-radius: 7px; color: rgba(255,255,255,0.7);
          font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
          text-decoration: none; border: none; background: transparent; width: 100%; text-align: left;
          font-family: 'DM Sans', sans-serif;
        }
        .poly-profile-menu-item:hover { background: rgba(249,115,22,0.08); color: rgba(255,255,255,0.9); }
        .poly-profile-menu-item.logout { color: #f87171; }
        .poly-profile-menu-item.logout:hover { background: rgba(248,113,113,0.1); color: #fca5a5; }
        .poly-header-auth-link {
          padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          text-decoration: none; transition: all 0.18s; font-family: 'DM Sans', sans-serif;
        }
        @media (max-width: 768px) {
          .poly-header { padding: 0 12px; }
          .poly-header-links { display: none; }
        }
      `}</style>

      <nav className="poly-header">
        <div className="poly-header-left">
          <Link href="/polyoiyen" className="poly-header-logo">
            <img src="/oiyen-logo.png" alt="PolyOiyen" />
            <span>PolyOiyen</span>
          </Link>
          <span className="poly-header-divider">|</span>
          <div className="poly-header-links">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`poly-header-link${l.label.includes(active) ? " active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="poly-header-more-wrap" ref={moreRef}>
              <button
                className={`poly-header-link poly-header-more-btn${active === "Leaderboard" || active === "Reward" ? " active" : ""}`}
                onClick={() => {
                  setShowMoreMenu((v) => !v);
                  setShowEliteMenu(false);
                }}
              >
                ➕ More
              </button>
              {showMoreMenu && (
                <div className="poly-header-more-menu">
                  {MORE_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`poly-header-more-item${active === item.active ? " active" : ""}`}
                      onClick={() => setShowMoreMenu(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="poly-header-more-wrap" ref={eliteRef}>
              <button
                className={`poly-header-link poly-header-more-btn${ELITE_LINKS.some((x) => x.active === active) ? " active" : ""}`}
                onClick={() => {
                  setShowEliteMenu((v) => !v);
                  setShowMoreMenu(false);
                }}
              >
                🏆 PolyPulse Elite Ranking
              </button>
              {showEliteMenu && (
                <div className="poly-header-more-menu" style={{ minWidth: 260 }}>
                  {ELITE_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`poly-header-more-item${active === item.active ? " active" : ""}`}
                      onClick={() => setShowEliteMenu(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="poly-header-right">
          {children}
          {loading ? (
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          ) : isLoggedIn && user ? (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button className="poly-profile-btn" onClick={() => setShowMenu(!showMenu)}>
                {user.image ? (
                  <img src={user.image} alt={user.name} />
                ) : (
                  user.name?.charAt(0).toUpperCase() || "U"
                )}
              </button>
              {showMenu && (
                <div className="poly-profile-menu">
                  <div className="poly-profile-menu-header">
                    <div className="poly-profile-menu-name">{user.name}</div>
                    <div className="poly-profile-menu-email">{user.email}</div>
                  </div>
                  <Link href="/profile" className="poly-profile-menu-item" onClick={() => setShowMenu(false)}>
                    👤 My Profile
                  </Link>
                  <Link href="/set-password" className="poly-profile-menu-item" onClick={() => setShowMenu(false)}>
                    ⚙️ Settings
                  </Link>
                  <button className="poly-profile-menu-item logout" onClick={handleLogout}>
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/login" className="poly-header-auth-link" style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Log in
              </Link>
              <Link href="/register" className="poly-header-auth-link" style={{ color: "white", background: "#f97316" }}>
                Get started
              </Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
