"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import PolyHeader from "../../PolyHeader";

type ModelRow = {
  eventId: string;
  marketQuestion: string;
  marketTitle: string;
  category: string;
  userCount: number;
  sideBias: "YES_BIAS" | "NO_BIAS";
  tradeCount: number;
  invested: number;
  totalReturn: number;
  winRate: number;
  entryPrice: number | null;
  exitPrice: number | null;
  firstTradeAt: string;
  lastTradeAt: string;
  hasExited: boolean;
  trendDirection: "up" | "down" | "flat" | "new";
  trendDeltaPct: number | null;
  trendLabel: string;
  recentTradeCount7d: number;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
};

type Payload = {
  models: ModelRow[];
  topModels?: ModelRow[];
  bottomModels?: ModelRow[];
};

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function fmtPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmtPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(4);
}

export default function EventBacktestDetailsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [row, setRow] = useState<ModelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const directRes = await fetch(`/api/polyoiyen/backtest-event/${encodeURIComponent(eventId)}`, {
          cache: "no-store",
        });

        if (directRes.ok) {
          const directData = (await directRes.json()) as ModelRow;
          setRow(directData);
          return;
        }

        // Fallback path for compatibility during rollout
        const query = new URLSearchParams({
          q: eventId,
          minTrades: "0",
          pageSize: "100",
          sortBy: "return",
          sortDir: "desc",
          includeAll: "1",
        });
        const fallbackRes = await fetch(`/api/polyoiyen/top-backtest-models?${query.toString()}`, {
          cache: "no-store",
        });
        if (!fallbackRes.ok) throw new Error("Failed to load event backtest data");

        const data = (await fallbackRes.json()) as Payload;
        const pool = [...(data.models || []), ...(data.topModels || []), ...(data.bottomModels || [])];
        const matched = pool.find((item) => String(item.eventId) === String(eventId)) || null;
        if (!matched) {
          setError("No backtest details found for this event.");
          setRow(null);
          return;
        }
        setRow(matched);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load event backtest details.");
        setRow(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [eventId]);

  return (
    <>
      <PolyHeader active="TopBacktestModels" />
      <main
        style={{
          minHeight: "100vh",
          background: "radial-gradient(circle at top, #2b1707 0%, #120802 42%, #0a0502 100%)",
          color: "#fff",
          padding: "24px 20px 56px",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Link
            href="/polyoiyen/TopBacktestModels"
            style={{ color: "#fdba74", fontSize: 13, textDecoration: "none", fontWeight: 700 }}
          >
            Back to Top Backtest Models
          </Link>

          {loading ? (
            <div style={{ marginTop: 20, color: "rgba(255,255,255,0.7)" }}>Loading event backtest details...</div>
          ) : error ? (
            <div
              style={{
                marginTop: 20,
                border: "1px solid rgba(248,113,113,0.4)",
                borderRadius: 12,
                padding: 16,
                color: "#fca5a5",
                background: "rgba(127,29,29,0.2)",
              }}
            >
              {error}
            </div>
          ) : row ? (
            <>
              <section
                style={{
                  marginTop: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 18,
                  background: "linear-gradient(135deg, rgba(249,115,22,0.14), rgba(0,0,0,0.24))",
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Event Backtest Details
                </div>
                <h1 style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1.2 }}>{row.marketTitle}</h1>
                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{row.marketQuestion}</div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ borderRadius: 999, padding: "5px 10px", background: "rgba(59,130,246,0.2)", fontSize: 12 }}>
                    Event ID: {row.eventId}
                  </span>
                  <span style={{ borderRadius: 999, padding: "5px 10px", background: "rgba(255,255,255,0.12)", fontSize: 12 }}>
                    Category: {row.category}
                  </span>
                  <span style={{ borderRadius: 999, padding: "5px 10px", background: "rgba(255,255,255,0.12)", fontSize: 12 }}>
                    Bias: {row.sideBias === "YES_BIAS" ? "YES" : "NO"}
                  </span>
                </div>
              </section>

              <section
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                {[
                  { label: "Total Return", value: fmtPct(row.totalReturn), tone: row.totalReturn >= 0 ? "#86efac" : "#fca5a5" },
                  { label: "Win Rate", value: `${row.winRate.toFixed(0)}%`, tone: "#fff" },
                  { label: "Invested", value: fmtMoney(row.invested), tone: "#fde68a" },
                  { label: "Trades", value: String(row.tradeCount), tone: "#bfdbfe" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.04)",
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {item.label}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: item.tone }}>{item.value}</div>
                  </div>
                ))}
              </section>

              <section
                style={{
                  marginTop: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  padding: 16,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 16 }}>Execution Summary</h2>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, fontSize: 13 }}>
                  <div>
                    Entry Price: <span style={{ color: "#fde68a", fontWeight: 700 }}>{fmtPrice(row.entryPrice)}</span>
                  </div>
                  <div>
                    Exit Price: <span style={{ color: "#fde68a", fontWeight: 700 }}>{fmtPrice(row.exitPrice)}</span>
                  </div>
                  <div>
                    Users Involved: <span style={{ color: "#bfdbfe", fontWeight: 700 }}>{row.userCount}</span>
                  </div>
                  <div>
                    Position Status: <span style={{ color: row.hasExited ? "#86efac" : "#fde68a", fontWeight: 700 }}>{row.hasExited ? "Exited" : "Open"}</span>
                  </div>
                  <div>
                    First Trade: <span style={{ color: "#fff", fontWeight: 700 }}>{new Date(row.firstTradeAt).toLocaleString()}</span>
                  </div>
                  <div>
                    Last Trade: <span style={{ color: "#fff", fontWeight: 700 }}>{new Date(row.lastTradeAt).toLocaleString()}</span>
                  </div>
                  <div>
                    Trend: <span style={{ color: "#93c5fd", fontWeight: 700 }}>{row.trendLabel}</span>
                  </div>
                  <div>
                    Risk Level: <span style={{ color: row.riskLevel === "high" ? "#fca5a5" : row.riskLevel === "medium" ? "#fde68a" : "#86efac", fontWeight: 700 }}>{row.riskLevel.toUpperCase()}</span>
                  </div>
                </div>

                {row.riskReasons.length > 0 && (
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fde68a", marginBottom: 8 }}>Risk Notes</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
                      {row.riskReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href={`/polyoiyen/${encodeURIComponent(row.eventId)}`}
                  style={{
                    textDecoration: "none",
                    border: "1px solid rgba(59,130,246,0.4)",
                    background: "rgba(59,130,246,0.18)",
                    color: "#bfdbfe",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Open Event Market Page
                </Link>
                <Link
                  href="/polyoiyen/TopBacktestModels"
                  style={{
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Back to Top Backtest Models
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
