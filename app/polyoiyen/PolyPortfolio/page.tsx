"use client";

export default function PolyPortfolioPage() {
  return (
    <div
      style={{
        background: "#160c03",
        minHeight: "100vh",
        fontFamily: "'DM Sans', sans-serif",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48 }}>📊</div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#f97316",
          letterSpacing: "-0.02em",
        }}
      >
        Portfolio
      </h1>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.44)" }}>
        Coming soon — your positions and performance will appear here.
      </p>
      <a
        href="/polyoiyen"
        style={{
          marginTop: 16,
          padding: "9px 20px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "#f97316",
          border: "1px solid rgba(249,115,22,0.3)",
          background: "rgba(249,115,22,0.08)",
          textDecoration: "none",
        }}
      >
        ← Back to Markets
      </a>
    </div>
  );
}
