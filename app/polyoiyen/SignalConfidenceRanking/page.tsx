"use client";

import PolyHeader from "../PolyHeader";

export default function SignalConfidenceRankingPage() {
  return (
    <div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <PolyHeader active="EliteSignalConfidence" />

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
          🛡️ Signal Confidence Ranking
        </h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
          Rank markets by confidence level of their predictive signals.
        </p>

        <div style={{
          marginTop: 18,
          border: "1px solid rgba(249,115,22,0.22)",
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(255,255,255,0.02))",
          padding: "16px 18px",
        }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
            This page is now independent from leaderboard and reserved for PolyPulse elite confidence ranking.
          </div>
        </div>
      </main>
    </div>
  );
}
