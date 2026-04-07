"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";
import { CATEGORY_CONFIG, type CategoryKey } from "../shared/categoryConfig";

type CandidateRow = {
  eventId: string;
  title: string;
  slug: string;
  score: number;
  scoreBand: "Strong" | "Balanced" | "Watch";
  volume: number;
  liquidity: number;
  commentCount: number;
  recencyDays: number;
};

type Payload = {
  generatedAt: string;
  limitPerCategory: number;
  categories: Record<CategoryKey, CandidateRow[]>;
};

function fmtMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

export default function TopCandidatesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/polyoiyen/top-candidates?limit=8", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load candidates");
      setData((await res.json()) as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PolyHeader active="TopCandidates" />
      <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #150c04 0%, #0f0702 100%)", color: "#fff", padding: "24px 20px 56px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(0,0,0,0.22))", padding: 22, marginBottom: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                PolyOiyen Intelligence
              </div>
              <h1 style={{ margin: "8px 0 0", fontSize: 38, letterSpacing: "-0.03em" }}>Top Candidates</h1>
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                Refreshed from volume, liquidity, attention and recency.
              </div>
            </div>
            <button onClick={load} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.12)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Refresh</button>
          </section>

          {loading ? (
            <div style={{ padding: 18, color: "rgba(255,255,255,0.65)" }}>Loading candidates...</div>
          ) : error ? (
            <div style={{ padding: 18, color: "#fca5a5" }}>{error}</div>
          ) : data ? (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
                Generated at {new Date(data.generatedAt).toLocaleString()} · {data.limitPerCategory} items per category
              </div>
              {CATEGORY_CONFIG.map((cat) => {
                const rows = data.categories[cat.key] || [];
                return (
                  <section key={cat.key} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{cat.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{rows.length} candidates</div>
                    </div>
                    {rows.length === 0 ? (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>No candidates found.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 10 }}>
                        {rows.map((row) => (
                          <a key={row.eventId} href={`/polyoiyen/${encodeURIComponent(row.eventId)}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid rgba(249,115,22,0.18)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.03)", boxShadow: "0 4px 18px rgba(0,0,0,0.28)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{row.title}</div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: row.scoreBand === "Strong" ? "#86efac" : row.scoreBand === "Balanced" ? "#fde68a" : "#fca5a5" }}>{row.score.toFixed(1)}</div>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.6)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                              <div>Band: {row.scoreBand}</div>
                              <div>Recency: {row.recencyDays}d</div>
                              <div>Volume: {fmtMoney(row.volume)}</div>
                              <div>Liquidity: {fmtMoney(row.liquidity)}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
