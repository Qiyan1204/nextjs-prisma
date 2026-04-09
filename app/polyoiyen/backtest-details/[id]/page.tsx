"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../../PolyHeader";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceDot } from "recharts";

interface BacktestDetails {
  id: number;
  name: string;
  version: string;
  notes?: string;
  description?: string;
  status: string;
  isInversePair: boolean;
  createdAt: string;
  runs: Array<{
    id: number;
    totalRuns: number;
    aggregateWinRate: number | null;
    avgReturn: number | null;
    avgMaxDrawdown: number | null;
    backtestStatus: string;
    equityCurve: any;
    lossAttribution: any;
    worstEvents: any;
    diagnostics: any;
    createdAt: string;
  }>;
  strategies: Array<{
    id: number;
    strategyName: string;
    isInverse: boolean;
    runsCount: number;
    winRate: number | null;
    avgReturn: number | null;
    maxDrawdown: number | null;
  }>;
  inverseModels: Array<{
    id: number;
    name: string;
    version: string;
    runs: Array<{
      aggregateWinRate: number | null;
      avgReturn: number | null;
    }>;
  }>;
  parentModel?: {
    id: number;
    name: string;
    version: string;
  };
}

function fmt(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}${suffix}`;
}

export default function BacktestDetailsPage({ params }: { params: { id: string } }) {
  const [backtest, setBacktest] = useState<BacktestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEquity, setShowEquity] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("aggregate");

  useEffect(() => {
    fetchBacktestDetails();
  }, [params.id]);

  async function fetchBacktestDetails() {
    try {
      const res = await fetch(`/api/polyoiyen/backtest-versions/${params.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setBacktest(data);

      // If has inverse model, fetch its data for comparison
      if (data.inverseModels && data.inverseModels.length > 0) {
        // Could fetch inverse details for side-by-side comparison
      }
    } catch (error) {
      console.error("Failed to fetch backtest details:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ color: "#e4e4e7" }}>Loading...</div>;
  if (!backtest) return <div style={{ color: "#e4e4e7" }}>Backtest not found</div>;

  const latestRun = backtest.runs[0];
  if (!latestRun) return <div style={{ color: "#e4e4e7" }}>No runs available</div>;

  const equityCurveData = latestRun.equityCurve;
  const chartData =
    selectedStrategy === "aggregate"
      ? equityCurveData.aggregate
      : equityCurveData.byStrategy.find((s: any) => s.strategyName === selectedStrategy)?.points;

  return (
    <div style={{ background: "#1a1a1a", color: "#e4e4e7", minHeight: "100vh" }}>
      <PolyHeader active="BacktestManager" />

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "20px" }}>
        {/* Header */}
        <div style={{ marginBottom: "30px" }}>
          <a
            href="/polyoiyen/BacktestManager"
            style={{ color: "#60a5fa", textDecoration: "none", fontSize: "13px", marginBottom: "10px", display: "block" }}
          >
            ← Back to Backtest Manager
          </a>
          <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>{backtest.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "15px" }}>
            <span style={{ fontSize: "13px", color: "#a1a1a1" }}>v{backtest.version}</span>
            <span
              style={{
                fontSize: "12px",
                padding: "4px 8px",
                background: "rgba(59,130,246,0.2)",
                border: "1px solid rgba(59,130,246,0.4)",
                color: "#60a5fa",
                borderRadius: "3px",
              }}
            >
              {backtest.status.toUpperCase()}
            </span>
            {backtest.isInversePair && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "4px 8px",
                  background: "rgba(251,191,36,0.15)",
                  border: "1px solid rgba(251,191,36,0.4)",
                  color: "#fbbf24",
                  borderRadius: "3px",
                }}
              >
                🔄 INVERSE PAIR
              </span>
            )}
          </div>
          {backtest.notes && (
            <p style={{ fontSize: "13px", color: "#d4d4d8", margin: "15px 0", lineHeight: "1.5" }}>
              {backtest.notes}
            </p>
          )}
        </div>

        {/* Main Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "15px", marginBottom: "30px" }}>
          {[
            { label: "Resolved Samples", value: latestRun.totalRuns },
            { label: "Win Rate", value: fmt(latestRun.aggregateWinRate, "%") },
            { label: "Avg Return", value: fmt(latestRun.avgReturn, "%") },
            { label: "Max Drawdown", value: fmt(latestRun.avgMaxDrawdown, "%") },
          ].map((metric) => (
            <div
              key={metric.label}
              style={{
                padding: "15px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#a1a1a1", marginBottom: "8px" }}>{metric.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 600 }}>{metric.value}</div>
            </div>
          ))}
        </div>

        {/* Equity Curve Chart */}
        <div
          style={{
            padding: "20px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px",
            marginBottom: "30px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", margin: 0 }}>📈 Equity Curve</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                style={{
                  padding: "6px 12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e4e4e7",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <option value="aggregate">Aggregate</option>
                {equityCurveData.byStrategy.map((s: any) => (
                  <option key={s.strategyName} value={s.strategyName}>
                    {s.strategyName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="label" stroke="#a1a1a1" style={{ fontSize: "12px" }} />
                <YAxis yAxisId="left" stroke="#a1a1a1" style={{ fontSize: "12px" }} />
                <YAxis yAxisId="right" orientation="right" stroke="#a1a1a1" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    background: "#120a05",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    padding: "10px",
                  }}
                  labelStyle={{ color: "#e4e4e7" }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="equity"
                  stroke="#fb923c"
                  dot={false}
                  strokeWidth={2}
                  name="Equity"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  dot={false}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Drawdown %"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", color: "#a1a1a1", padding: "40px" }}>No chart data available</div>
          )}
        </div>

        {/* Strategy Breakdown */}
        <div
          style={{
            padding: "20px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px",
            marginBottom: "30px",
          }}
        >
          <h3 style={{ fontSize: "16px", marginBottom: "15px" }}>📊 Strategy Performance</h3>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                fontSize: "13px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th style={{ textAlign: "left", padding: "10px", color: "#a1a1a1" }}>Strategy</th>
                  <th style={{ textAlign: "center", padding: "10px", color: "#a1a1a1" }}>Runs</th>
                  <th style={{ textAlign: "center", padding: "10px", color: "#a1a1a1" }}>Win Rate</th>
                  <th style={{ textAlign: "center", padding: "10px", color: "#a1a1a1" }}>Avg Return</th>
                  <th style={{ textAlign: "center", padding: "10px", color: "#a1a1a1" }}>Max DD</th>
                </tr>
              </thead>
              <tbody>
                {backtest.strategies.map((strat) => (
                  <tr key={strat.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px", color: "#d4d4d8" }}>
                      {strat.strategyName}
                      {strat.isInverse && " (inv)"}
                    </td>
                    <td style={{ textAlign: "center", padding: "10px", color: "#d4d4d8" }}>{strat.runsCount}</td>
                    <td style={{ textAlign: "center", padding: "10px", color: "#d4d4d8" }}>{fmt(strat.winRate, "%")}</td>
                    <td style={{ textAlign: "center", padding: "10px", color: "#d4d4d8" }}>{fmt(strat.avgReturn, "%")}</td>
                    <td style={{ textAlign: "center", padding: "10px", color: "#d4d4d8" }}>{fmt(strat.maxDrawdown, "%")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inverse Model Comparison */}
        {backtest.inverseModels && backtest.inverseModels.length > 0 && (
          <div
            style={{
              padding: "20px",
              background: "rgba(251,191,36,0.05)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: "8px",
              marginBottom: "30px",
            }}
          >
            <h3 style={{ fontSize: "16px", marginBottom: "15px", color: "#fbbf24" }}>🔄 Inverse Version Comparison</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ padding: "15px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                <div style={{ fontSize: "12px", color: "#a1a1a1", marginBottom: "10px" }}>Original Model</div>
                <div style={{ fontSize: "14px", marginBottom: "5px" }}>
                  WR: {fmt(latestRun.aggregateWinRate, "%")}
                </div>
                <div style={{ fontSize: "14px" }}>Return: {fmt(latestRun.avgReturn, "%")}</div>
              </div>
              {backtest.inverseModels[0]?.runs[0] && (
                <div style={{ padding: "15px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "12px", color: "#a1a1a1", marginBottom: "10px" }}>
                    {backtest.inverseModels[0].name}
                  </div>
                  <div style={{ fontSize: "14px", marginBottom: "5px" }}>
                    WR: {fmt(backtest.inverseModels[0].runs[0].aggregateWinRate, "%")}
                  </div>
                  <div style={{ fontSize: "14px" }}>
                    Return: {fmt(backtest.inverseModels[0].runs[0].avgReturn, "%")}
                  </div>
                </div>
              )}
            </div>
            <a
              href={`/polyoiyen/backtest-details/${backtest.inverseModels[0]?.id}`}
              style={{
                display: "inline-block",
                marginTop: "15px",
                fontSize: "12px",
                padding: "8px 16px",
                background: "rgba(251,191,36,0.2)",
                border: "1px solid rgba(251,191,36,0.4)",
                color: "#fbbf24",
                borderRadius: "4px",
                textDecoration: "none",
              }}
            >
              VIEW INVERSE DETAILS →
            </a>
          </div>
        )}

        {/* Diagnostics */}
        <div
          style={{
            padding: "20px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px",
          }}
        >
          <h3 style={{ fontSize: "16px", marginBottom: "15px" }}>🔧 Diagnostics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "15px" }}>
            {[
              { label: "Resolved", value: latestRun.diagnostics?.resolvedSamples },
              { label: "Unresolved", value: latestRun.diagnostics?.unresolvedEvents },
              { label: "Scanned", value: latestRun.diagnostics?.scannedEvents },
              { label: "Excluded", value: latestRun.diagnostics?.excludedNoBuyEvents },
            ].map((d) => (
              <div key={d.label} style={{ fontSize: "12px", color: "#a1a1a1" }}>
                <div>{d.label}</div>
                <div style={{ fontSize: "16px", color: "#d4d4d8", fontWeight: 600 }}>{d.value ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
