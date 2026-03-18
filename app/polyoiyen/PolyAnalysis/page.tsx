"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";

interface PolyMarket {
  clobTokenIds?: string;
  active?: boolean;
  closed?: boolean;
}

interface PolyEvent {
  id: string;
  title: string;
  volume?: number;
  markets: PolyMarket[];
}

interface VolatilityPoint {
  ts: number;
  timeLabel: string;
  windowStart: string;
  windowEnd: string;
  tradeCount: number;
  notional: number;
  yesTrades: number;
  noTrades: number;
  imbalanceRate: number;
  volatilityRate: number;
}

interface VolatilityResponse {
  range: "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";
  bucketSeconds: number;
  startTime: string;
  endTime: string;
  points: VolatilityPoint[];
}

type RangeOption = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

function parseTokenIds(raw?: string): { yes: string; no: string } {
  if (!raw) return { yes: "", no: "" };
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return {
        yes: String(arr[0] ?? ""),
        no: String(arr[1] ?? ""),
      };
    }
  } catch {
    // ignore invalid JSON
  }
  return { yes: "", no: "" };
}

function pickActiveMarket(markets: PolyMarket[]): PolyMarket | null {
  if (!Array.isArray(markets) || markets.length === 0) return null;
  const active = markets.find((m) => m.active !== false && m.closed !== true);
  return active || markets[0] || null;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function zNormalize(arr: number[]): number[] {
  const m = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) return arr.map(() => 0);
  return arr.map((v) => (v - m) / sd);
}

function pearson(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

function computeLagTable(
  leader: number[],
  follower: number[],
  maxLag: number
): Array<{ lag: number; correlation: number; sampleSize: number }> {
  const table: Array<{ lag: number; correlation: number; sampleSize: number }> = [];
  const n = Math.min(leader.length, follower.length);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      a.push(leader[i]);
      b.push(follower[j]);
    }
    table.push({
      lag,
      correlation: pearson(a, b),
      sampleSize: a.length,
    });
  }
  return table;
}

export default function MyAnalysisPage() {
  const [events, setEvents] = useState<PolyEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [range, setRange] = useState<RangeOption>("1W");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<VolatilityPoint[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadEvents() {
      try {
        const res = await fetch("/api/polymarket?limit=40&offset=0");
        if (!res.ok) throw new Error("Failed to load markets");
        const data: PolyEvent[] = await res.json();
        if (!alive) return;
        setEvents(data);
        if (!selectedEventId && data.length > 0) {
          setSelectedEventId(data[0].id);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load markets");
      }
    }
    loadEvents();
    return () => {
      alive = false;
    };
  }, [selectedEventId]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  useEffect(() => {
    const event = selectedEvent;
    if (!event) return;

    const market = pickActiveMarket(event.markets || []);
    const tokenIds = parseTokenIds(market?.clobTokenIds);
    if (!tokenIds.yes || !tokenIds.no) {
      setPoints([]);
      setError("Selected event has incomplete token IDs.");
      return;
    }

    let alive = true;
    async function loadTrackerData() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("yesAssetId", tokenIds.yes);
        params.set("noAssetId", tokenIds.no);
        params.set("range", range);
        params.set("limit", "300");
        params.set("maxPages", "120");
        const res = await fetch(`/api/polymarket/volatility?${params.toString()}`);
        if (!res.ok) {
          let msg = "Failed to load signal data";
          try {
            const body = await res.json();
            if (body?.error) msg = String(body.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }
        const data: VolatilityResponse = await res.json();
        if (!alive) return;
        setPoints(Array.isArray(data.points) ? data.points : []);
      } catch (e) {
        if (!alive) return;
        setPoints([]);
        setError(e instanceof Error ? e.message : "Failed to load signal data");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadTrackerData();
    return () => {
      alive = false;
    };
  }, [selectedEvent, range]);

  const imbalanceSeries = zNormalize(points.map((p) => p.imbalanceRate));
  const volatilitySeries = zNormalize(points.map((p) => p.volatilityRate));
  const maxLag = Math.min(12, Math.max(2, Math.floor(points.length / 4)));
  const lagTable = computeLagTable(imbalanceSeries, volatilitySeries, maxLag);

  const best = lagTable.reduce(
    (acc, row) => (Math.abs(row.correlation) > Math.abs(acc.correlation) ? row : acc),
    { lag: 0, correlation: 0, sampleSize: 0 }
  );

  const leadText =
    best.lag > 0
      ? `Imbalance leads Volatility by ${best.lag} bucket(s)`
      : best.lag < 0
      ? `Volatility leads Imbalance by ${Math.abs(best.lag)} bucket(s)`
      : "Signals move mostly in-sync (lag 0)";

  const confidence = Math.abs(best.correlation);
  const confidenceLabel = confidence >= 0.65 ? "High" : confidence >= 0.4 ? "Medium" : "Low";

  const chartW = 860;
  const chartH = 260;
  const padL = 52;
  const padR = 20;
  const padT = 18;
  const padB = 42;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  function seriesPolyline(values: number[]): string {
    if (values.length === 0) return "";
    return values
      .map((v, i) => {
        const x = padL + (values.length === 1 ? plotW / 2 : (i / (values.length - 1)) * plotW);
        const y = padT + ((2.5 - Math.max(-2.5, Math.min(2.5, v))) / 5) * plotH;
        return `${x},${y}`;
      })
      .join(" ");
  }

  const polyImbalance = seriesPolyline(imbalanceSeries);
  const polyVolatility = seriesPolyline(volatilitySeries);

  const pointCoords = points.map((p, i) => {
    const x = padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yImbalance = padT + ((2.5 - Math.max(-2.5, Math.min(2.5, imbalanceSeries[i] || 0))) / 5) * plotH;
    const yVolatility = padT + ((2.5 - Math.max(-2.5, Math.min(2.5, volatilitySeries[i] || 0))) / 5) * plotH;
    return {
      x,
      yImbalance,
      yVolatility,
      point: p,
    };
  });

  const hovered = hoverIndex != null ? pointCoords[hoverIndex] : null;

  useEffect(() => {
    setHoverIndex(null);
  }, [selectedEventId, range, points.length]);

  return (
    <div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <PolyHeader active="PolyAnalysis" />
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
          📡 Signal Lead-Lag Tracker
        </h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
          Track who moves first: YES/NO order-flow imbalance or volatility bursts.
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          marginBottom: 16,
          alignItems: "center",
        }}>
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(30,20,9,0.95), rgba(17,12,7,0.95))",
              border: "1px solid rgba(249,115,22,0.24)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{
                width: "100%",
                borderRadius: 12,
                padding: "12px 40px 12px 14px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#f8fafc",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.01em",
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                textOverflow: "ellipsis",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {events.map((ev) => (
                <option
                  key={ev.id}
                  value={ev.id}
                  style={{
                    backgroundColor: "#1b1208",
                    color: "#f8fafc",
                  }}
                >
                  {ev.title}
                </option>
              ))}
            </select>

            <span
              aria-hidden
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#f97316",
                fontSize: 12,
                pointerEvents: "none",
              }}
            >
              ▼
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(["1H", "6H", "1D", "1W", "1M", "ALL"] as RangeOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setRange(opt)}
                style={{
                  padding: "8px 11px",
                  borderRadius: 999,
                  border: range === opt ? "1px solid rgba(249,115,22,0.45)" : "1px solid rgba(255,255,255,0.12)",
                  background: range === opt ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
                  color: range === opt ? "#f97316" : "rgba(255,255,255,0.68)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginBottom: 14 }}>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
              Lead-Lag Result
            </div>
            <div style={{ fontSize: 13.5, color: "#f8fafc", fontWeight: 600 }}>{leadText}</div>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
              Best Correlation
            </div>
            <div style={{ fontSize: 20, fontFamily: "'DM Mono', monospace", color: "#f97316", fontWeight: 800 }}>
              {best.correlation.toFixed(3)}
            </div>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
              Confidence
            </div>
            <div style={{ fontSize: 14, color: confidence >= 0.4 ? "#34d399" : "#f87171", fontWeight: 700 }}>
              {confidenceLabel}
            </div>
          </div>
        </div>

        {loading && <div style={{ color: "rgba(255,255,255,0.62)", marginBottom: 12 }}>Loading tracker data...</div>}
        {error && <div style={{ color: "#f87171", marginBottom: 12 }}>{error}</div>}

        {!loading && !error && points.length > 0 && (
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12 }}>
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              style={{ width: "100%", height: 260, display: "block" }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {[-2, -1, 0, 1, 2].map((tick) => {
                const y = padT + ((2.5 - tick) / 5) * plotH;
                return (
                  <g key={`tick-${tick}`}>
                    <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
                    <text x={padL - 8} y={y + 3} fill="rgba(255,255,255,0.55)" fontSize="10" textAnchor="end">
                      {tick}
                    </text>
                  </g>
                );
              })}

              {polyImbalance && (
                <polyline
                  points={polyImbalance}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {polyVolatility && (
                <polyline
                  points={polyVolatility}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {pointCoords.map((c, i) => (
                <g key={`hover-hit-${c.point.ts}`}>
                  <line
                    x1={c.x}
                    y1={padT}
                    x2={c.x}
                    y2={padT + plotH}
                    stroke={hoverIndex === i ? "rgba(249,115,22,0.32)" : "rgba(0,0,0,0)"}
                    strokeWidth="1"
                    pointerEvents="none"
                  />
                  <rect
                    x={c.x - Math.max(8, plotW / Math.max(10, points.length * 2))}
                    y={padT}
                    width={Math.max(16, plotW / Math.max(5, points.length))}
                    height={plotH}
                    fill="rgba(0,0,0,0)"
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseMove={() => setHoverIndex(i)}
                  />
                </g>
              ))}

              {hovered && (
                <g pointerEvents="none">
                  <circle cx={hovered.x} cy={hovered.yImbalance} r={4} fill="#f59e0b" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
                  <circle cx={hovered.x} cy={hovered.yVolatility} r={4} fill="#22d3ee" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />

                  <rect
                    x={Math.min(hovered.x + 12, padL + plotW - 230)}
                    y={Math.max(padT + 2, Math.min(hovered.yImbalance - 76, padT + plotH - 92))}
                    width={226}
                    height={90}
                    rx={8}
                    fill="rgba(20,12,6,0.94)"
                    stroke="rgba(249,115,22,0.36)"
                    strokeWidth="1"
                  />

                  <text
                    x={Math.min(hovered.x + 22, padL + plotW - 220)}
                    y={Math.max(padT + 18, Math.min(hovered.yImbalance - 60, padT + plotH - 74))}
                    fill="#fbbf24"
                    fontSize="10"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {hovered.point.timeLabel}
                  </text>
                  <text
                    x={Math.min(hovered.x + 22, padL + plotW - 220)}
                    y={Math.max(padT + 32, Math.min(hovered.yImbalance - 46, padT + plotH - 60))}
                    fill="rgba(255,255,255,0.88)"
                    fontSize="10"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {`Vol: ${hovered.point.volatilityRate.toFixed(2)}% | Imb: ${hovered.point.imbalanceRate.toFixed(2)}%`}
                  </text>
                  <text
                    x={Math.min(hovered.x + 22, padL + plotW - 220)}
                    y={Math.max(padT + 46, Math.min(hovered.yImbalance - 32, padT + plotH - 46))}
                    fill="rgba(255,255,255,0.88)"
                    fontSize="10"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {`Trades: ${hovered.point.tradeCount} | Yes: ${hovered.point.yesTrades} | No: ${hovered.point.noTrades}`}
                  </text>
                  <text
                    x={Math.min(hovered.x + 22, padL + plotW - 220)}
                    y={Math.max(padT + 60, Math.min(hovered.yImbalance - 18, padT + plotH - 32))}
                    fill="rgba(255,255,255,0.88)"
                    fontSize="10"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {`Notional: $${Math.round(hovered.point.notional).toLocaleString()}`}
                  </text>
                </g>
              )}

              {points.map((p, i) => {
                if (points.length > 8 && i % Math.ceil(points.length / 8) !== 0 && i !== points.length - 1) return null;
                const x = padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
                return (
                  <text
                    key={`x-${p.ts}`}
                    x={x}
                    y={padT + plotH + 16}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="9"
                    textAnchor="middle"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {p.timeLabel}
                  </text>
                );
              })}

              <text x={14} y={padT - 2} fill="rgba(255,255,255,0.66)" fontSize="10">Z-score</text>
              <text x={padL + plotW / 2} y={chartH - 6} fill="rgba(255,255,255,0.62)" fontSize="10" textAnchor="middle">Time</text>
            </svg>

            <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12 }}>
              <span style={{ color: "#f59e0b" }}>Imbalance Signal</span>
              <span style={{ color: "#22d3ee" }}>Volatility Signal</span>
            </div>
          </div>
        )}

        {!loading && !error && points.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.55)" }}>No tracker points found for this range.</div>
        )}

        {lagTable.length > 0 && (
          <div style={{ marginTop: 16, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Lag (bucket)</th>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Correlation</th>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Samples</th>
                </tr>
              </thead>
              <tbody>
                {lagTable.map((row) => (
                  <tr key={row.lag} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "'DM Mono', monospace" }}>{row.lag}</td>
                    <td style={{
                      padding: "8px 10px",
                      color: Math.abs(row.correlation) >= Math.abs(best.correlation) ? "#fbbf24" : "rgba(255,255,255,0.8)",
                      fontFamily: "'DM Mono', monospace",
                    }}>
                      {row.correlation.toFixed(3)}
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "'DM Mono', monospace" }}>{row.sampleSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}