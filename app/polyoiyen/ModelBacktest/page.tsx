"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ModelBacktestPayload = {
  checkedAt: string;
  backtestQuality: {
    totalRuns: number;
    aggregateWinRate: number | null;
    avgReturn: number | null;
    avgMaxDrawdown: number | null;
    status: "healthy" | "degraded" | "unhealthy" | "sufficient";
    diagnostics: {
      resolvedSamples: number;
      unresolvedEvents: number;
      excludedNoBuyEvents: number;
      scannedEvents: number;
    };
    lossAttribution: {
      byStrategy: Array<{
        strategyName: string;
        runs: number;
        winRate: number | null;
        avgReturn: number | null;
        maxDrawdown: number | null;
        lossContributionPct: number;
      }>;
      worstEvents: Array<{
        eventId: string;
        marketQuestion: string;
        strategyName: string;
        totalReturn: number;
        createdAt: string;
      }>;
    };
    equityCurve: {
      aggregate: Array<{
        index: number;
        eventId: string;
        createdAt: string;
        label: string;
        equity: number;
        drawdown: number;
        returnPct: number;
      }>;
      byStrategy: Array<{
        strategyName: string;
        maxDrawdown: number;
        points: Array<{
          index: number;
          eventId: string;
          createdAt: string;
          label: string;
          equity: number;
          drawdown: number;
          returnPct: number;
        }>;
      }>;
    };
    bestStrategy: {
      strategyName: string;
      runs: number;
      winRate: number | null;
      avgReturn: number | null;
    } | null;
    recentRuns: Array<{
      symbol: string;
      strategyName: string;
      totalReturn: number;
      totalTrades: number;
      winRate: number | null;
      createdAt: string;
    }>;
  };
};

function fmt(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}${suffix}`;
}

function statusMeta(status: ModelBacktestPayload["backtestQuality"]["status"]) {
  if (status === "healthy") return { label: "HEALTHY", color: "#86efac", border: "rgba(52,211,153,0.35)", bg: "rgba(20,83,45,0.35)" };
  if (status === "unhealthy") return { label: "UNHEALTHY", color: "#fca5a5", border: "rgba(248,113,113,0.35)", bg: "rgba(127,29,29,0.35)" };
  if (status === "sufficient") return { label: "SUFFICIENT", color: "#93c5fd", border: "rgba(147,197,253,0.35)", bg: "rgba(30,58,138,0.35)" };
  return { label: "DEGRADED", color: "#fdba74", border: "rgba(251,146,60,0.35)", bg: "rgba(124,45,18,0.35)" };
}

function EquityTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { eventId: string; createdAt: string; returnPct: number; equity: number; drawdown: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      style={{
        background: "#120a05",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "#fff",
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, color: "#fed7aa", marginBottom: 6 }}>Event {point.eventId}</div>
      <div style={{ color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{new Date(point.createdAt).toLocaleString()}</div>
      <div>Return: <span style={{ color: point.returnPct >= 0 ? "#86efac" : "#fca5a5" }}>{point.returnPct.toFixed(2)}%</span></div>
      <div>Equity: <span style={{ color: "#fdba74" }}>{point.equity.toFixed(2)}</span></div>
      <div>Drawdown: <span style={{ color: point.drawdown >= 20 ? "#fca5a5" : "#fdba74" }}>{point.drawdown.toFixed(2)}%</span></div>
    </div>
  );
}

export default function ModelBacktestPage() {
  const [data, setData] = useState<ModelBacktestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurve, setSelectedCurve] = useState<string>("__aggregate__");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/polyoiyen/data-health", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch model backtest data");
      const payload = (await res.json()) as ModelBacktestPayload;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model backtest data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!data) return;
    if (selectedCurve === "__aggregate__") return;
    const hasCurve = data.backtestQuality.equityCurve.byStrategy.some((curve) => curve.strategyName === selectedCurve);
    if (!hasCurve) setSelectedCurve("__aggregate__");
  }, [data, selectedCurve]);

  const selectedCurveData = data
    ? selectedCurve === "__aggregate__"
      ? data.backtestQuality.equityCurve.aggregate
      : data.backtestQuality.equityCurve.byStrategy.find((curve) => curve.strategyName === selectedCurve)?.points ?? data.backtestQuality.equityCurve.aggregate
    : [];

  const selectedCurveMeta = data
    ? selectedCurve === "__aggregate__"
      ? { strategyName: "Aggregate", maxDrawdown: data.backtestQuality.avgMaxDrawdown }
      : data.backtestQuality.equityCurve.byStrategy.find((curve) => curve.strategyName === selectedCurve) ?? { strategyName: selectedCurve, maxDrawdown: null, points: [] }
    : { strategyName: "Aggregate", maxDrawdown: null };

  const maxDrawdownPoint = selectedCurveData.reduce<
    { index: number; label: string; drawdown: number; equity: number } | null
  >((best, point) => {
    if (!best || point.drawdown > best.drawdown) {
      return { index: point.index, label: point.label, drawdown: point.drawdown, equity: point.equity };
    }
    return best;
  }, null);

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #2a1707 0%, #130902 38%, #0c0602 100%)", color: "#f5f5f4" }}>
      <PolyHeader active="ModelBacktest" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 54px" }}>
        <section style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#fff7ed" }}>
              Model Backtest
            </h1>
            <p style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.65 }}>
              Strategy quality, win rate, return, and loss attribution for PolyOiyen models.
            </p>
          </div>
          <button
            onClick={load}
            style={{
              padding: "6px 11px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Refresh
          </button>
        </section>

        {loading ? (
          <div style={{ padding: 20, color: "rgba(255,255,255,0.65)" }}>Loading model backtest data...</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#fca5a5" }}>{error}</div>
        ) : data ? (
          <>
            {(() => {
              const meta = statusMeta(data.backtestQuality.status);
              return (
                <section style={{ marginBottom: 10 }}>
                  <span
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      border: `1px solid ${meta.border}`,
                      background: meta.bg,
                      color: meta.color,
                    }}
                  >
                    MODEL QUALITY: {meta.label}
                  </span>
                </section>
              );
            })()}

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Backtest Overview</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                  resolved {data.backtestQuality.diagnostics.resolvedSamples} / scanned {data.backtestQuality.diagnostics.scannedEvents}
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.66)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>Unresolved events: {data.backtestQuality.diagnostics.unresolvedEvents}</span>
                <span>Excluded (no buy): {data.backtestQuality.diagnostics.excludedNoBuyEvents}</span>
                <span>Recent runs: {data.backtestQuality.totalRuns}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Aggregate Win Rate</div>
                  <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: (data.backtestQuality.aggregateWinRate ?? 0) >= 55 ? "#86efac" : "#fdba74" }}>
                    {data.backtestQuality.aggregateWinRate == null ? "N/A" : `${data.backtestQuality.aggregateWinRate.toFixed(2)}%`}
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Avg Return</div>
                  <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: "#fde68a" }}>{fmt(data.backtestQuality.avgReturn, "%")}</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Avg Max Drawdown</div>
                  <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>{fmt(data.backtestQuality.avgMaxDrawdown, "%")}</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Best Strategy</div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {data.backtestQuality.bestStrategy?.strategyName ?? "N/A"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.68)" }}>
                    win rate {fmt(data.backtestQuality.bestStrategy?.winRate, "%")} · runs {data.backtestQuality.bestStrategy?.runs ?? 0}
                  </div>
                </div>
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Equity Curve</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                    {selectedCurveMeta.strategyName} · Max DD {fmt(selectedCurveMeta.maxDrawdown, "%")}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                  Strategy
                  <select
                    value={selectedCurve}
                    onChange={(e) => setSelectedCurve(e.target.value)}
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 12,
                    }}
                  >
                    <option value="__aggregate__">Aggregate</option>
                    {data.backtestQuality.equityCurve.byStrategy.map((curve) => (
                      <option key={curve.strategyName} value={curve.strategyName}>
                        {curve.strategyName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedCurveData} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={{ stroke: "rgba(255,255,255,0.12)" }} />
                    <YAxis yAxisId="equity" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={{ stroke: "rgba(255,255,255,0.12)" }} domain={["auto", "auto"]} />
                    <YAxis yAxisId="dd" orientation="right" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={{ stroke: "rgba(255,255,255,0.12)" }} domain={[0, "auto"]} />
                    <Tooltip
                      content={(props) => <EquityTooltip active={props.active} payload={props.payload as Array<{ payload: { eventId: string; createdAt: string; returnPct: number; equity: number; drawdown: number } }>} />}
                    />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      yAxisId="equity"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="drawdown"
                      yAxisId="dd"
                      stroke="#f87171"
                      strokeWidth={1.8}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                    {maxDrawdownPoint ? (
                      <ReferenceDot
                        yAxisId="equity"
                        x={maxDrawdownPoint.label}
                        y={maxDrawdownPoint.equity}
                        r={5}
                        fill="#fca5a5"
                        stroke="#7f1d1d"
                        ifOverflow="visible"
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                Starts at 100 and compounds by each resolved event return. Dashed red line is drawdown %. Max drawdown point is highlighted.
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Loss Attribution</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "rgba(255,255,255,0.9)" }}>Loss Contribution by Strategy</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px" }}>Strategy</th>
                          <th style={{ padding: "8px 10px" }}>Loss %</th>
                          <th style={{ padding: "8px 10px" }}>Avg Return</th>
                          <th style={{ padding: "8px 10px" }}>Max DD</th>
                          <th style={{ padding: "8px 10px" }}>Win Rate</th>
                          <th style={{ padding: "8px 10px" }}>Runs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.backtestQuality.lossAttribution.byStrategy.map((row) => (
                          <tr key={row.strategyName} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.strategyName}</td>
                            <td style={{ padding: "8px 10px", color: row.lossContributionPct >= 40 ? "#fca5a5" : "#fdba74" }}>{fmt(row.lossContributionPct, "%")}</td>
                            <td style={{ padding: "8px 10px", color: (row.avgReturn ?? 0) >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.avgReturn, "%")}</td>
                              <td style={{ padding: "8px 10px", color: (row.maxDrawdown ?? 0) >= 20 ? "#fca5a5" : "#fdba74" }}>{fmt(row.maxDrawdown, "%")}</td>
                            <td style={{ padding: "8px 10px" }}>{fmt(row.winRate, "%")}</td>
                            <td style={{ padding: "8px 10px" }}>{row.runs}</td>
                          </tr>
                        ))}
                        {data.backtestQuality.lossAttribution.byStrategy.length === 0 ? (
                          <tr>
                              <td colSpan={6} style={{ padding: "10px", color: "rgba(255,255,255,0.6)" }}>No resolved strategy attribution yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "rgba(255,255,255,0.9)" }}>Worst Events</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px" }}>Event ID</th>
                          <th style={{ padding: "8px 10px" }}>Strategy</th>
                          <th style={{ padding: "8px 10px" }}>Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.backtestQuality.lossAttribution.worstEvents.map((row) => (
                          <tr key={`${row.eventId}-${row.createdAt}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.eventId}</td>
                            <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                            <td style={{ padding: "8px 10px", color: row.totalReturn >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.totalReturn, "%")}</td>
                          </tr>
                        ))}
                        {data.backtestQuality.lossAttribution.worstEvents.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "10px", color: "rgba(255,255,255,0.6)" }}>No resolved events yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Recent PolyOiyen Backtests</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ padding: "8px 10px" }}>Time</th>
                      <th style={{ padding: "8px 10px" }}>Event ID</th>
                      <th style={{ padding: "8px 10px" }}>Strategy</th>
                      <th style={{ padding: "8px 10px" }}>Win Rate</th>
                      <th style={{ padding: "8px 10px" }}>Return</th>
                      <th style={{ padding: "8px 10px" }}>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.backtestQuality.recentRuns.map((row) => (
                      <tr key={`${row.strategyName}-${row.symbol}-${row.createdAt}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.66)" }}>{new Date(row.createdAt).toLocaleString()}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.symbol}</td>
                        <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                        <td style={{ padding: "8px 10px", color: (row.winRate ?? 0) >= 55 ? "#86efac" : "#fdba74" }}>{fmt(row.winRate, "%")}</td>
                        <td style={{ padding: "8px 10px", color: row.totalReturn >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.totalReturn, "%")}</td>
                        <td style={{ padding: "8px 10px" }}>{row.totalTrades}</td>
                      </tr>
                    ))}
                    {data.backtestQuality.recentRuns.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "10px", color: "rgba(255,255,255,0.6)" }}>No backtest runs yet. Run strategies to populate this panel.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
