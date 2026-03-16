"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";

interface RewardMission {
  key: string;
  title: string;
  desc: string;
  points: number;
  progress: number;
  target: number;
  achieved: boolean;
  detail?: {
    activeAlerts: number;
    triggeredAlerts: number;
  };
}

interface RewardResponse {
  summary: {
    tradesToday: number;
    weeklyVolume: number;
    currentWinStreak: number;
    activeAlerts: number;
    triggeredAlerts: number;
    totalXP: number;
  };
  missions: RewardMission[];
}

function progressPct(m: RewardMission): number {
  if (m.target <= 0) return 0;
  return Math.max(0, Math.min(100, (m.progress / m.target) * 100));
}

export default function PolyRewardPage() {
  const [data, setData] = useState<RewardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadReward() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/polyreward");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load rewards");
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load rewards");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadReward();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <PolyHeader active="Reward" />

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
          🎁 Reward Center
        </h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
          Live mission progress from your account activity in this project.
        </p>

        {data?.summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
            <div style={{ border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, background: "rgba(249,115,22,0.08)", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total XP</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: "#f97316" }}>{data.summary.totalXP}</div>
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Trades Today</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>{data.summary.tradesToday}</div>
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Weekly Volume</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>${data.summary.weeklyVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Win Streak</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>{data.summary.currentWinStreak}</div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 22 }}>
          {loading && <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Loading rewards...</div>}
          {!loading && error && <div style={{ color: "#fca5a5", fontSize: 14 }}>{error}</div>}
          {!loading && !error && data?.missions.map((m) => (
            <div key={m.key} style={{
              border: m.achieved ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(249,115,22,0.2)",
              background: m.achieved
                ? "linear-gradient(135deg, rgba(52,211,153,0.12), rgba(255,255,255,0.02))"
                : "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(255,255,255,0.02))",
              borderRadius: 14,
              padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{m.title}</h3>
                <span style={{ fontSize: 12, fontWeight: 800, color: m.achieved ? "#34d399" : "#f97316", background: m.achieved ? "rgba(52,211,153,0.12)" : "rgba(249,115,22,0.12)", border: `1px solid ${m.achieved ? "rgba(52,211,153,0.35)" : "rgba(249,115,22,0.28)"}`, borderRadius: 6, padding: "4px 8px" }}>+{m.points} XP</span>
              </div>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.55 }}>{m.desc}</p>

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  {m.key === "high_volume"
                    ? `$${Number(m.progress).toLocaleString(undefined, { maximumFractionDigits: 2 })} / $${Number(m.target).toLocaleString()}`
                    : m.key === "alert_hunter" && m.detail
                      ? `${m.detail.activeAlerts}/5 active + ${m.detail.triggeredAlerts}/2 triggered`
                      : `${Math.floor(m.progress)} / ${Math.floor(m.target)}`}
                </span>
                <span style={{ color: m.achieved ? "#34d399" : "rgba(255,255,255,0.65)", fontWeight: 700 }}>
                  {m.achieved ? "Completed" : `${progressPct(m).toFixed(0)}%`}
                </span>
              </div>

              <div style={{ marginTop: 7, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPct(m)}%`, background: m.achieved ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#f97316,#fb923c)", transition: "width 0.25s" }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
