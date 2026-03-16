"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PolyHeader from "../PolyHeader";

interface LeaderboardRow {
  rank: number;
  userId: number;
  name: string;
  totalVolume: number;
  realizedPL: number;
  winRate: number;
  exitTrades: number;
}

type PeriodKey = "today" | "week" | "month" | "all";

const PERIOD_OPTIONS: Array<{ label: string; value: PeriodKey }> = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All Time", value: "all" },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "All", label: "All", emoji: "🌐" },
  { value: "Politics", label: "Politics", emoji: "🏛️" },
  { value: "Sports", label: "Sports", emoji: "⚽" },
  { value: "Crypto", label: "Crypto", emoji: "🪙" },
  { value: "Pop Culture", label: "Pop Culture", emoji: "🎬" },
  { value: "Business", label: "Business", emoji: "💼" },
  { value: "Science", label: "Science", emoji: "🔬" },
  { value: "Technology", label: "Technology", emoji: "💻" },
];

function fmtMoney(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function PolyLeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [category, setCategory] = useState("All");
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ period, category });
        const res = await fetch(`/api/polyleaderboard?${q.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load leaderboard");
        }
        if (mounted) setRows(data.leaderboard || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadLeaderboard();
    return () => {
      mounted = false;
    };
  }, [period, category]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setShowCategoryMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const activeCategory = useMemo(() => {
    return CATEGORY_OPTIONS.find((c) => c.value === category) || CATEGORY_OPTIONS[0];
  }, [category]);

  const topStats = useMemo(() => {
    const count = rows.length;
    const totalVolume = rows.reduce((sum, r) => sum + r.totalVolume, 0);
    const avgWinRate = count > 0 ? rows.reduce((sum, r) => sum + r.winRate, 0) / count : 0;
    return { count, totalVolume, avgWinRate };
  }, [rows]);

  return (
    <div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <PolyHeader active="Leaderboard" />

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
          🏆 Leaderboard
        </h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
          Real ranking from your project database (PolyBet records).
        </p>

        <div style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setPeriod(item.value)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: period === item.value ? "1px solid rgba(249,115,22,0.45)" : "1px solid rgba(255,255,255,0.12)",
                  background: period === item.value ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
                  color: period === item.value ? "#f97316" : "rgba(255,255,255,0.68)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div ref={categoryMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowCategoryMenu((v) => !v)}
              style={{
                minWidth: 210,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(249,115,22,0.24)",
                background: "rgba(249,115,22,0.08)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span>{activeCategory.emoji}</span>
                <span>{activeCategory.label}</span>
              </span>
              <span style={{ color: "#f97316", fontSize: 12 }}>{showCategoryMenu ? "▲" : "▼"}</span>
            </button>

            {showCategoryMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: 230,
                  borderRadius: 10,
                  padding: 6,
                  background: "#1e1108",
                  border: "1px solid rgba(249,115,22,0.2)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
                  zIndex: 30,
                }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setCategory(opt.value);
                      setShowCategoryMenu(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      background: category === opt.value ? "rgba(249,115,22,0.12)" : "transparent",
                      color: category === opt.value ? "#f97316" : "rgba(255,255,255,0.75)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      borderRadius: 7,
                      padding: "9px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 18 }}>
          <div style={{ border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, padding: "12px 14px", background: "rgba(249,115,22,0.08)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ranked Traders</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: "#f97316" }}>{topStats.count}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Volume</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{fmtMoney(topStats.totalVolume)}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg Win Rate</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{topStats.avgWinRate.toFixed(1)}%</div>
          </div>
        </div>

        <div style={{ marginTop: 22, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1.6fr 1fr 1fr 1fr", padding: "12px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span>Rank</span>
            <span>Trader</span>
            <span>P&L</span>
            <span>Win Rate</span>
            <span>Volume</span>
          </div>

          {loading && (
            <div style={{ padding: "18px 16px", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Loading leaderboard...</div>
          )}

          {error && !loading && (
            <div style={{ padding: "18px 16px", color: "#fca5a5", fontSize: 14 }}>{error}</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: "18px 16px", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>No trading data yet.</div>
          )}

          {!loading && !error && rows.map((row) => (
            <div key={row.rank} style={{ display: "grid", gridTemplateColumns: "90px 1.6fr 1fr 1fr 1fr", padding: "14px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", color: "#f97316", fontWeight: 700 }}>#{row.rank}</div>
              <div style={{ fontWeight: 700 }}>{row.name}</div>
              <div style={{ color: row.realizedPL >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>{row.realizedPL >= 0 ? "+" : ""}{fmtMoney(row.realizedPL)}</div>
              <div style={{ color: "rgba(255,255,255,0.75)" }}>{row.winRate.toFixed(1)}% ({row.exitTrades})</div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontFamily: "'DM Mono', monospace" }}>{fmtMoney(row.totalVolume)}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
