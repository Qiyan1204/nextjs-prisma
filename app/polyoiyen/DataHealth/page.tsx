"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";
import { CATEGORY_CONFIG, type CategoryKey } from "../shared/categoryConfig";

type DataHealthPayload = {
  checkedAt: string;
  status: "healthy" | "degraded";
  services: {
    database: { ok: boolean; latencyMs: number };
    polymarketUpstream: { ok: boolean; latencyMs: number };
  };
  telemetry24h: {
    counts: {
      poly_probe: number;
      invest_pull: number;
      invest_action: number;
      health_ok: number;
      health_fail: number;
    };
    healthChecks: number;
    uptimePercent: number | null;
    sampleSize: number;
  };
  probes: {
    latest: Array<{ endpoint: string; ok: boolean; statusCode: number | null; latencyMs: number }>;
    endpointBreakdown: Array<{
      endpoint: string;
      errorRate1h: number | null;
      errorRate24h: number | null;
      samples1h: number;
      samples24h: number;
      latency: { p50: number | null; p95: number | null; p99: number | null };
    }>;
  };
  freshness: {
    lastPullMetricAt: string | null;
    pullMetricAgeMinutes: number | null;
    lastDepthSnapshotAt: string | null;
    depthSnapshotAgeMinutes: number | null;
    lastAlertNotificationAt: string | null;
    alertNotificationAgeMinutes: number | null;
  };
  alerts24h: {
    notificationsSent: number;
    cooldownSkipped: number;
    cooldownHitRatePercent: number;
  };
  categoryHealth: Record<CategoryKey, { eventCount: number; tokenCoveragePct: number; avgLiquidity: number }>;
  trend24h: Array<{
    ts: number;
    label: string;
    healthOk: number;
    healthFail: number;
    endpointErrors: number;
    avgLatencyMs: number | null;
  }>;
};

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.06em",
        border: ok ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(248,113,113,0.35)",
        background: ok ? "rgba(20,83,45,0.35)" : "rgba(127,29,29,0.35)",
        color: ok ? "#86efac" : "#fca5a5",
      }}
    >
      {ok ? "HEALTHY" : "DEGRADED"}
    </span>
  );
}

function fmt(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}${suffix}`;
}

export default function DataHealthPage() {
  const [data, setData] = useState<DataHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/polyoiyen/data-health", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch data health");
      const payload = (await res.json()) as DataHealthPayload;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2a1707 0%, #130902 38%, #0c0602 100%)",
        color: "#f5f5f4",
      }}
    >
      <PolyHeader active="DataHealth" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 54px" }}>
        <section style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(24px, 3vw, 38px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#fff7ed",
              }}
            >
              Data Health Dashboard
            </h1>
            <p style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.65 }}>
              Real-time system telemetry for database, upstream endpoints, category coverage, and alert pipeline behavior.
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
            <div style={{ padding: 20, color: "rgba(255,255,255,0.65)" }}>Loading health data...</div>
          ) : error ? (
            <div style={{ padding: 20, color: "#fca5a5" }}>{error}</div>
          ) : data ? (
            <>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Overall</div>
                  <div style={{ marginTop: 8 }}><StatusPill ok={data.status === "healthy"} /></div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                    Checked {new Date(data.checkedAt).toLocaleString()}
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Database</div>
                  <div style={{ marginTop: 8 }}><StatusPill ok={data.services.database.ok} /></div>
                  <div style={{ marginTop: 8, fontSize: 14 }}>{data.services.database.latencyMs} ms</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Polymarket Upstream</div>
                  <div style={{ marginTop: 8 }}><StatusPill ok={data.services.polymarketUpstream.ok} /></div>
                  <div style={{ marginTop: 8, fontSize: 14 }}>{data.services.polymarketUpstream.latencyMs} ms</div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>24h Uptime</div>
                  <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800 }}>
                    {data.telemetry24h.uptimePercent == null ? "N/A" : `${data.telemetry24h.uptimePercent.toFixed(2)}%`}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                    Health checks: {data.telemetry24h.healthChecks}
                  </div>
                </div>
              </section>

              <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Telemetry Counts (24h)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, fontSize: 13 }}>
                  <div>poly_probe: {data.telemetry24h.counts.poly_probe}</div>
                  <div>invest_pull: {data.telemetry24h.counts.invest_pull}</div>
                  <div>invest_action: {data.telemetry24h.counts.invest_action}</div>
                  <div>health_ok: {data.telemetry24h.counts.health_ok}</div>
                  <div>health_fail: {data.telemetry24h.counts.health_fail}</div>
                  <div>samples: {data.telemetry24h.sampleSize}</div>
                </div>
              </section>

              <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Endpoint Error & Latency (1h / 24h)</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ padding: "8px 10px" }}>Endpoint</th>
                        <th style={{ padding: "8px 10px" }}>Err 1h</th>
                        <th style={{ padding: "8px 10px" }}>Err 24h</th>
                        <th style={{ padding: "8px 10px" }}>Samples 1h</th>
                        <th style={{ padding: "8px 10px" }}>Samples 24h</th>
                        <th style={{ padding: "8px 10px" }}>P50</th>
                        <th style={{ padding: "8px 10px" }}>P95</th>
                        <th style={{ padding: "8px 10px" }}>P99</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.probes.endpointBreakdown.map((row) => (
                        <tr key={row.endpoint} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "8px 10px", fontWeight: 700 }}>{row.endpoint}</td>
                          <td style={{ padding: "8px 10px", color: (row.errorRate1h || 0) > 20 ? "#fca5a5" : "#86efac" }}>{fmt(row.errorRate1h, "%")}</td>
                          <td style={{ padding: "8px 10px", color: (row.errorRate24h || 0) > 20 ? "#fca5a5" : "#86efac" }}>{fmt(row.errorRate24h, "%")}</td>
                          <td style={{ padding: "8px 10px" }}>{row.samples1h}</td>
                          <td style={{ padding: "8px 10px" }}>{row.samples24h}</td>
                          <td style={{ padding: "8px 10px" }}>{fmt(row.latency.p50, "ms")}</td>
                          <td style={{ padding: "8px 10px" }}>{fmt(row.latency.p95, "ms")}</td>
                          <td style={{ padding: "8px 10px" }}>{fmt(row.latency.p99, "ms")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Freshness</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                    <div>Pull metrics: {data.freshness.pullMetricAgeMinutes ?? "N/A"} min ago</div>
                    <div>Depth snapshot: {data.freshness.depthSnapshotAgeMinutes ?? "N/A"} min ago</div>
                    <div>Alert notify: {data.freshness.alertNotificationAgeMinutes ?? "N/A"} min ago</div>
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Alert Throughput (24h)</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                    <div>Sent: {data.alerts24h.notificationsSent}</div>
                    <div>Cooldown skipped: {data.alerts24h.cooldownSkipped}</div>
                    <div>Cooldown hit rate: {fmt(data.alerts24h.cooldownHitRatePercent, "%")}</div>
                  </div>
                </div>
              </section>

              <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Category Health</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                  {CATEGORY_CONFIG.map((cat) => {
                    const h = data.categoryHealth[cat.key];
                    return (
                      <div key={cat.key} style={{ border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.12)" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{cat.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                          <div>Events: {h?.eventCount ?? 0}</div>
                          <div>Token coverage: {fmt(h?.tokenCoveragePct ?? 0, "%")}</div>
                          <div>Avg liquidity: {fmt(h?.avgLiquidity ?? 0)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "rgba(255,255,255,0.04)", padding: 16, marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>24h Trend</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {data.trend24h.slice(-12).map((p) => (
                    <div key={p.ts} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", alignItems: "center", gap: 10, fontSize: 11 }}>
                      <div style={{ color: "rgba(255,255,255,0.6)" }}>{p.label}</div>
                      <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${Math.min(100, p.healthOk * 6)}%`, background: "#34d399" }} />
                        <div style={{ width: `${Math.min(100, p.healthFail * 12)}%`, background: "#ef4444" }} />
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.65)" }}>
                        err:{p.endpointErrors} · {p.avgLatencyMs == null ? "no sample" : `${p.avgLatencyMs}ms`}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
      </main>
    </div>
  );
}
