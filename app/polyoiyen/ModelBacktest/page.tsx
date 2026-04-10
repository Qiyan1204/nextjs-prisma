"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
      selectionFilterApplied?: boolean;
      requestedEventIds?: number;
      matchedEventIds?: number;
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
      inverseByStrategy: Array<{
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
      bestEvents: Array<{
        eventId: string;
        marketQuestion: string;
        strategyName: string;
        totalReturn: number;
        createdAt: string;
      }>;
      inverseWorstEvents: Array<{
        eventId: string;
        marketQuestion: string;
        strategyName: string;
        totalReturn: number;
        createdAt: string;
      }>;
      inverseBestEvents: Array<{
        eventId: string;
        marketQuestion: string;
        strategyName: string;
        totalReturn: number;
        createdAt: string;
      }>;
      bucketContributions: {
        original: {
          byEventType: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          byCategory: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          byLiquidityBucket: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          topFactors: Array<{ factorType: string; factorLabel: string; events: number; avgReturn: number | null; contributionPct: number }>;
        };
        inverse: {
          byEventType: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          byCategory: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          byLiquidityBucket: Array<{ bucket: string; events: number; avgReturn: number | null; contributionPct: number }>;
          topFactors: Array<{ factorType: string; factorLabel: string; events: number; avgReturn: number | null; contributionPct: number }>;
        };
      };
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
      inverseAggregate: Array<{
        index: number;
        eventId: string;
        createdAt: string;
        label: string;
        equity: number;
        drawdown: number;
        returnPct: number;
      }>;
      inverseByStrategy: Array<{
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
    inverseSummary: {
      aggregateWinRate: number | null;
      avgReturn: number | null;
      avgMaxDrawdown: number | null;
      edge: {
        hasEdge: boolean;
        strength: "strong" | "moderate" | "weak" | "none";
      };
    };
    riskMetrics: {
      original: {
        calmarRatio: number | null;
        sortinoRatio: number | null;
        profitFactor: number | null;
        maxLosingStreak: number;
        totalReturn: number | null;
        annualizedReturn: number | null;
      };
      inverse: {
        calmarRatio: number | null;
        sortinoRatio: number | null;
        profitFactor: number | null;
        maxLosingStreak: number;
        totalReturn: number | null;
        annualizedReturn: number | null;
      };
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
    inverseRecentRuns: Array<{
      symbol: string;
      strategyName: string;
      totalReturn: number;
      totalTrades: number;
      winRate: number | null;
      createdAt: string;
    }>;
  };
  selection?: {
    eventIdsFilterApplied: boolean;
    requestedEventIds: number;
    matchedEventIds: number;
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
  const searchParams = useSearchParams();
  const [data, setData] = useState<ModelBacktestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurve, setSelectedCurve] = useState<string>("__aggregate__");
  const [viewMode, setViewMode] = useState<"original" | "inverse">("original");

  const selectedGroupKey = searchParams.get("group") || "";
  const selectedGroupLabel = searchParams.get("groupLabel") || "";
  const selectedEventIds = useMemo(() => {
    const raw = searchParams.get("eventIds") || "";
    return raw.split(",").map((x) => x.trim()).filter(Boolean);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedEventIds.length > 0) {
        params.set("eventIds", selectedEventIds.join(","));
      }
      const endpoint = params.toString() ? `/api/polyoiyen/data-health?${params.toString()}` : "/api/polyoiyen/data-health";
      const res = await fetch(endpoint, { cache: "no-store" });
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
  }, [searchParams]);

  useEffect(() => {
    if (!data) return;
    if (selectedCurve === "__aggregate__") return;
    const sourceByStrategy = viewMode === "original"
      ? data.backtestQuality.equityCurve.byStrategy
      : data.backtestQuality.equityCurve.inverseByStrategy;
    const hasCurve = sourceByStrategy.some((curve) => curve.strategyName === selectedCurve);
    if (!hasCurve) setSelectedCurve("__aggregate__");
  }, [data, selectedCurve, viewMode]);

  useEffect(() => {
    setSelectedCurve("__aggregate__");
  }, [viewMode]);

  const selectedCurveData = data
    ? selectedCurve === "__aggregate__"
      ? (viewMode === "original" ? data.backtestQuality.equityCurve.aggregate : data.backtestQuality.equityCurve.inverseAggregate)
      : (viewMode === "original"
          ? data.backtestQuality.equityCurve.byStrategy.find((curve) => curve.strategyName === selectedCurve)?.points
          : data.backtestQuality.equityCurve.inverseByStrategy.find((curve) => curve.strategyName === selectedCurve)?.points)
        ?? (viewMode === "original" ? data.backtestQuality.equityCurve.aggregate : data.backtestQuality.equityCurve.inverseAggregate)
    : [];

  const selectedCurveMeta = data
    ? selectedCurve === "__aggregate__"
      ? {
          strategyName: viewMode === "original" ? "Aggregate (Original)" : "Aggregate (Inverse)",
          maxDrawdown: viewMode === "original" ? data.backtestQuality.avgMaxDrawdown : data.backtestQuality.inverseSummary.avgMaxDrawdown,
        }
      : (viewMode === "original"
          ? data.backtestQuality.equityCurve.byStrategy.find((curve) => curve.strategyName === selectedCurve)
          : data.backtestQuality.equityCurve.inverseByStrategy.find((curve) => curve.strategyName === selectedCurve))
        ?? { strategyName: selectedCurve, maxDrawdown: null, points: [] }
    : { strategyName: "Aggregate", maxDrawdown: null };

  const isInverse = viewMode === "inverse";
  const bestInverseStrategy = data
    ? [...data.backtestQuality.lossAttribution.inverseByStrategy].sort((a, b) => (b.avgReturn ?? -9999) - (a.avgReturn ?? -9999))[0] ?? null
    : null;
  const currentWorstEvents = data
    ? (isInverse ? data.backtestQuality.lossAttribution.inverseWorstEvents : data.backtestQuality.lossAttribution.worstEvents)
    : [];
  const currentBestEvents = data
    ? (isInverse ? data.backtestQuality.lossAttribution.inverseBestEvents : data.backtestQuality.lossAttribution.bestEvents)
    : [];
  const currentRecentRuns = data
    ? (isInverse ? data.backtestQuality.inverseRecentRuns : data.backtestQuality.recentRuns)
    : [];
  const currentBucketContribution = data
    ? (isInverse ? data.backtestQuality.lossAttribution.bucketContributions.inverse : data.backtestQuality.lossAttribution.bucketContributions.original)
    : { byEventType: [], byCategory: [], byLiquidityBucket: [], topFactors: [] };
  const currentRiskMetrics = data
    ? (isInverse ? data.backtestQuality.riskMetrics.inverse : data.backtestQuality.riskMetrics.original)
    : { calmarRatio: null, sortinoRatio: null, profitFactor: null, maxLosingStreak: 0, totalReturn: null, annualizedReturn: null };

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
              Strategy quality, win rate, return, loss attribution, and automatic inverse strategy comparison.
            </p>
            {selectedEventIds.length > 0 && (
              <p style={{ marginTop: 8, color: "#fde68a", fontSize: 12, lineHeight: 1.6 }}>
                Filtered group: {selectedGroupLabel || selectedGroupKey || "custom"} ({selectedEventIds.length} selected event IDs)
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "inline-flex", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
              <button
                onClick={() => setViewMode("original")}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#fff",
                  background: viewMode === "original" ? "rgba(249,115,22,0.35)" : "rgba(255,255,255,0.04)",
                }}
              >
                Original
              </button>
              <button
                onClick={() => setViewMode("inverse")}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#fff",
                  background: viewMode === "inverse" ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.04)",
                }}
              >
                Inverse
              </button>
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
          </div>
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

            {!isInverse ? (
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
                {data.selection?.eventIdsFilterApplied && (
                  <span>
                    Group filter matched {data.selection.matchedEventIds}/{data.selection.requestedEventIds}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Aggregate Win Rate</div>
                  <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: ((isInverse ? data.backtestQuality.inverseSummary.aggregateWinRate : data.backtestQuality.aggregateWinRate) ?? 0) >= 55 ? "#86efac" : "#fdba74" }}>
                    {isInverse
                      ? (data.backtestQuality.inverseSummary.aggregateWinRate == null ? "N/A" : `${data.backtestQuality.inverseSummary.aggregateWinRate.toFixed(2)}%`)
                      : (data.backtestQuality.aggregateWinRate == null ? "N/A" : `${data.backtestQuality.aggregateWinRate.toFixed(2)}%`)}
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Avg Return</div>
                  <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: "#fde68a" }}>{fmt(isInverse ? data.backtestQuality.inverseSummary.avgReturn : data.backtestQuality.avgReturn, "%")}</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Avg Max Drawdown</div>
                  <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>{fmt(isInverse ? data.backtestQuality.inverseSummary.avgMaxDrawdown : data.backtestQuality.avgMaxDrawdown, "%")}</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>{isInverse ? "Best Inverse Strategy" : "Best Strategy"}</div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {isInverse ? (bestInverseStrategy?.strategyName ?? "N/A") : (data.backtestQuality.bestStrategy?.strategyName ?? "N/A")}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.68)" }}>
                    win rate {fmt(isInverse ? bestInverseStrategy?.winRate : data.backtestQuality.bestStrategy?.winRate, "%")} · runs {isInverse ? (bestInverseStrategy?.runs ?? 0) : (data.backtestQuality.bestStrategy?.runs ?? 0)}
                  </div>
                </div>

              </div>
            </section>
            ) : null}

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Equity Curve</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                    {selectedCurveMeta.strategyName} · Max DD {fmt(selectedCurveMeta.maxDrawdown, "%")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                      {(viewMode === "original" ? data.backtestQuality.equityCurve.byStrategy : data.backtestQuality.equityCurve.inverseByStrategy).map((curve) => (
                        <option key={curve.strategyName} value={curve.strategyName}>
                          {curve.strategyName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
                {!isInverse ? (
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
                ) : null}

                {!isInverse ? (
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
                        {currentWorstEvents.map((row) => (
                          <tr key={`${row.eventId}-${row.createdAt}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.eventId}</td>
                            <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                            <td style={{ padding: "8px 10px", color: row.totalReturn >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.totalReturn, "%")}</td>
                          </tr>
                        ))}
                        {currentWorstEvents.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "10px", color: "rgba(255,255,255,0.6)" }}>No resolved events yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
                ) : null}

                {isInverse ? (
                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "rgba(255,255,255,0.9)" }}>Inverse Loss Contribution</div>
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
                        {data.backtestQuality.lossAttribution.inverseByStrategy.map((row) => (
                          <tr key={row.strategyName} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                            <td style={{ padding: "8px 10px", color: row.lossContributionPct >= 40 ? "#fca5a5" : "#fdba74" }}>{fmt(row.lossContributionPct, "%")}</td>
                            <td style={{ padding: "8px 10px", color: (row.avgReturn ?? 0) >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.avgReturn, "%")}</td>
                            <td style={{ padding: "8px 10px", color: (row.maxDrawdown ?? 0) >= 20 ? "#fca5a5" : "#fdba74" }}>{fmt(row.maxDrawdown, "%")}</td>
                            <td style={{ padding: "8px 10px" }}>{fmt(row.winRate, "%")}</td>
                            <td style={{ padding: "8px 10px" }}>{row.runs}</td>
                          </tr>
                        ))}
                        {data.backtestQuality.lossAttribution.inverseByStrategy.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: "10px", color: "rgba(255,255,255,0.6)" }}>No inverse strategy attribution yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
                ) : null}
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Risk Metrics ({isInverse ? "Inverse" : "Original"})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Calmar Ratio</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{fmt(currentRiskMetrics.calmarRatio)}</div>
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Sortino Ratio</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{fmt(currentRiskMetrics.sortinoRatio)}</div>
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Profit Factor</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{fmt(currentRiskMetrics.profitFactor)}</div>
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Max Losing Streak</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{currentRiskMetrics.maxLosingStreak}</div>
                </div>
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Event Attribution Insights ({isInverse ? "Inverse" : "Original"})</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: "100%", maxWidth: 980, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Best Events</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460, fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px" }}>Event</th>
                          <th style={{ padding: "8px 10px" }}>Strategy</th>
                          <th style={{ padding: "8px 10px" }}>Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentBestEvents.map((row) => (
                          <tr key={`${row.eventId}-${row.createdAt}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.eventId}</td>
                            <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                            <td style={{ padding: "8px 10px", color: "#86efac" }}>{fmt(row.totalReturn, "%")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Bucket Contributions</div>
                  <div>
                    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px", width: "18%" }}>Type</th>
                          <th style={{ padding: "8px 10px", width: "30%" }}>Bucket</th>
                          <th style={{ padding: "8px 10px", width: "12%" }}>Events</th>
                          <th style={{ padding: "8px 10px", width: "15%" }}>Avg Ret</th>
                          <th style={{ padding: "8px 10px", width: "25%" }}>{isInverse ? "Signed Contribution" : "Contribution"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...currentBucketContribution.byEventType.slice(0, 3).map((x) => ({ type: "EventType", ...x })), ...currentBucketContribution.byCategory.slice(0, 3).map((x) => ({ type: "Category", ...x })), ...currentBucketContribution.byLiquidityBucket.slice(0, 3).map((x) => ({ type: "Liquidity", ...x }))].map((row) => (
                          <tr key={`${row.type}-${row.bucket}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px", wordBreak: "break-word" }}>{row.type}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, wordBreak: "break-word" }}>{row.bucket}</td>
                            <td style={{ padding: "8px 10px" }}>{row.events}</td>
                            <td style={{ padding: "8px 10px", color: (row.avgReturn ?? 0) >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.avgReturn, "%")}</td>
                            <td style={{ padding: "8px 10px", color: (row.contributionPct ?? 0) >= 0 ? "#86efac" : "#fca5a5", wordBreak: "break-word" }}>{fmt(row.contributionPct, "%")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                </div>

                <div style={{ width: "100%", maxWidth: 980, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.12)", padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Top 10 Factors</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px" }}>Factor Type</th>
                          <th style={{ padding: "8px 10px" }}>Factor</th>
                          <th style={{ padding: "8px 10px" }}>Events</th>
                          <th style={{ padding: "8px 10px" }}>Avg Ret</th>
                          <th style={{ padding: "8px 10px" }}>{isInverse ? "Signed Contribution" : "Contribution"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentBucketContribution.topFactors.map((f) => (
                          <tr key={`${f.factorType}-${f.factorLabel}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <td style={{ padding: "8px 10px" }}>{f.factorType}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{f.factorLabel}</td>
                            <td style={{ padding: "8px 10px" }}>{f.events}</td>
                            <td style={{ padding: "8px 10px", color: (f.avgReturn ?? 0) >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(f.avgReturn, "%")}</td>
                            <td style={{ padding: "8px 10px", color: (f.contributionPct ?? 0) >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(f.contributionPct, "%")}</td>
                          </tr>
                        ))}
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
                    {currentRecentRuns.map((row) => (
                      <tr key={`${row.strategyName}-${row.symbol}-${row.createdAt}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.66)" }}>{new Date(row.createdAt).toLocaleString()}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.symbol}</td>
                        <td style={{ padding: "8px 10px" }}>{row.strategyName}</td>
                        <td style={{ padding: "8px 10px", color: (row.winRate ?? 0) >= 55 ? "#86efac" : "#fdba74" }}>{fmt(row.winRate, "%")}</td>
                        <td style={{ padding: "8px 10px", color: row.totalReturn >= 0 ? "#86efac" : "#fca5a5" }}>{fmt(row.totalReturn, "%")}</td>
                        <td style={{ padding: "8px 10px" }}>{row.totalTrades}</td>
                      </tr>
                    ))}
                    {currentRecentRuns.length === 0 ? (
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
