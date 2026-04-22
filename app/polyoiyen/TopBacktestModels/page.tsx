"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PolyHeader from "../PolyHeader";
import { BACKTEST_SCOPE_LABELS } from "../shared/categoryConfig";

const FILTER_STORAGE_KEY = "top-backtest-models-filters-v1";

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
};

type Payload = {
  generatedAt: string;
  page: number;
  pageSize: number;
  minTrades: number;
  sortBy: "return" | "winRate" | "tradeCount";
  sortDir: "asc" | "desc";
  q: string;
  totalModels: number;
  totalPages: number;
  models: ModelRow[];
  topModels: ModelRow[];
  bottomModels: ModelRow[];
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

function ModelCard({ row, tone }: { row: ModelRow; tone: "good" | "bad" }) {
  const accent = tone === "good" ? "#86efac" : "#fca5a5";
  const bg = tone === "good" ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)";
  const border = tone === "good" ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)";

  return (
    <Link
      href={`/polyoiyen/${encodeURIComponent(row.eventId)}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: 14,
        background: bg,
        boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
        display: "block",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)" }}>
            {row.category} · {row.tradeCount} trades · {row.userCount} users
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, lineHeight: 1.35, color: "#fff" }}>
            {row.marketTitle}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.marketQuestion}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>
          {fmtPct(row.totalReturn)}
        </div>
      </div>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
        <div>Invested: <span style={{ color: "#fde68a", fontWeight: 700 }}>{fmtMoney(row.invested)}</span></div>
        <div>Win Rate: <span style={{ color: "#fff", fontWeight: 700 }}>{row.winRate.toFixed(0)}%</span></div>
        <div>Bias: <span style={{ color: row.sideBias === "YES_BIAS" ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{row.sideBias === "YES_BIAS" ? "YES" : "NO"}</span></div>
        <div>Status: <span style={{ color: row.hasExited ? "#86efac" : "#fde68a", fontWeight: 700 }}>{row.hasExited ? "Exited" : "Open"}</span></div>
      </div>
    </Link>
  );
}

export default function TopBacktestModelsPage() {
  const scopeText = BACKTEST_SCOPE_LABELS.join(", ");

  const [data, setData] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);
  const [minTrades, setMinTrades] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return 3;
      const parsed = JSON.parse(raw) as { minTrades?: number };
      const value = Number(parsed.minTrades);
      return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 3;
    } catch {
      return 3;
    }
  });
  const [sortBy, setSortBy] = useState<"return" | "winRate" | "tradeCount">(() => {
    if (typeof window === "undefined") return "return";
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return "return";
      const parsed = JSON.parse(raw) as { sortBy?: string };
      return parsed.sortBy === "winRate" || parsed.sortBy === "tradeCount" ? parsed.sortBy : "return";
    } catch {
      return "return";
    }
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (typeof window === "undefined") return "desc";
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return "desc";
      const parsed = JSON.parse(raw) as { sortDir?: string };
      return parsed.sortDir === "asc" ? "asc" : "desc";
    } catch {
      return "desc";
    }
  });
  const [searchInput, setSearchInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { searchInput?: string };
      return typeof parsed.searchInput === "string" ? parsed.searchInput : "";
    } catch {
      return "";
    }
  });
  const [query, setQuery] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { query?: string; searchInput?: string };
      if (typeof parsed.query === "string") return parsed.query;
      return typeof parsed.searchInput === "string" ? parsed.searchInput : "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", "20");
      params.set("minTrades", String(minTrades));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/polyoiyen/top-backtest-models?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load backtest models");
      setData((await res.json()) as Payload);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backtest models");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, [sortBy, sortDir, query, minTrades]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(searchInput);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        minTrades,
        sortBy,
        sortDir,
        searchInput,
        query,
      })
    );
  }, [minTrades, sortBy, sortDir, searchInput, query]);

  return (
    <>
      <PolyHeader active="TopBacktestModels" />
      <main style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #2b1707 0%, #120802 42%, #0a0502 100%)", color: "#fff", padding: "24px 20px 56px" }}>
        <div style={{ maxWidth: 1360, margin: "0 auto" }}>
          <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, background: "linear-gradient(135deg, rgba(249,115,22,0.16), rgba(0,0,0,0.2))", padding: 22, marginBottom: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.08em" }}>PolyOiyen Intelligence</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 38, letterSpacing: "-0.03em" }}>Top Backtest Models</h1>
            <p style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.6 }}>
              Top 20 winners, bottom 20 losers, and a paginated catalog of all backtested models.
            </p>
            <p style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Aggregation scope: all users · limited to {scopeText} markets.
            </p>
            <p style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Total Return = (realized + remainingValue - invested) ÷ invested x 100% (unresolved events use current outcome prices)
            </p>
          </section>

          {loading ? (
            <div style={{ padding: 18, color: "rgba(255,255,255,0.65)" }}>Loading backtest models...</div>
          ) : error ? (
            <div style={{ padding: 18, color: "#fca5a5" }}>{error}</div>
          ) : data ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                <div>Generated at {new Date(data.generatedAt).toLocaleString()}</div>
                <div>{data.totalModels} models with at least {data.minTrades} trades</div>
              </div>

              <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, background: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 80 }}>
                  Filters
                </div>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search market title or eventId"
                  style={{
                    minWidth: 260,
                    flex: 1,
                    maxWidth: 520,
                    background: "rgba(0,0,0,0.24)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  Min Trades
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={String(minTrades)}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (!Number.isFinite(parsed)) {
                        setMinTrades(0);
                        return;
                      }
                      setMinTrades(Math.max(0, Math.floor(parsed)));
                    }}
                    style={{
                      width: 96,
                      background: "rgba(0,0,0,0.24)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  />
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "return" | "winRate" | "tradeCount")}
                  style={{
                    background: "rgba(0,0,0,0.24)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <option value="return">Sort by Return</option>
                  <option value="winRate">Sort by Win Rate</option>
                  <option value="tradeCount">Sort by Trade Count</option>
                </select>
                <button
                  onClick={() => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))}
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(249,115,22,0.12)",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {sortDir === "desc" ? "Descending" : "Ascending"}
                </button>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <section style={{ border: "1px solid rgba(52,211,153,0.18)", borderRadius: 18, background: "rgba(52,211,153,0.05)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Top 20 Models ({data.topModels.length})</h2>
                    <span style={{ color: "#86efac", fontSize: 12, fontWeight: 700 }}>Best performers</span>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {data.topModels.map((row) => <ModelCard key={`top-${row.eventId}`} row={row} tone="good" />)}
                  </div>
                </section>

                <section style={{ border: "1px solid rgba(248,113,113,0.18)", borderRadius: 18, background: "rgba(248,113,113,0.05)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Bottom 20 Models ({data.bottomModels.length})</h2>
                    <span style={{ color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>Worst performers</span>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {data.bottomModels.map((row) => <ModelCard key={`bottom-${row.eventId}`} row={row} tone="bad" />)}
                  </div>
                </section>
              </div>

              <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, background: "rgba(255,255,255,0.03)", padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>All Backtested Models</h2>
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                      Page {data.page} of {data.totalPages} · {data.pageSize} rows per page · sorted by {sortBy}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => load(Math.max(1, data.page - 1))}
                      disabled={data.page <= 1}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: data.page <= 1 ? "rgba(255,255,255,0.03)" : "rgba(249,115,22,0.12)", color: "#fff", cursor: data.page <= 1 ? "not-allowed" : "pointer", fontWeight: 700 }}
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => load(Math.min(data.totalPages, data.page + 1))}
                      disabled={data.page >= data.totalPages}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: data.page >= data.totalPages ? "rgba(255,255,255,0.03)" : "rgba(249,115,22,0.12)", color: "#fff", cursor: data.page >= data.totalPages ? "not-allowed" : "pointer", fontWeight: 700 }}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.62)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ padding: "10px 8px" }}>Market</th>
                        <th style={{ padding: "10px 8px" }}>Event ID</th>
                        <th style={{ padding: "10px 8px" }}>Users</th>
                        <th style={{ padding: "10px 8px" }}>Trades</th>
                        <th style={{ padding: "10px 8px" }}>Bias</th>
                        <th style={{ padding: "10px 8px" }}>Invested</th>
                        <th style={{ padding: "10px 8px" }}>Return</th>
                        <th style={{ padding: "10px 8px" }}>Win Rate</th>
                        <th style={{ padding: "10px 8px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((row) => (
                        <tr key={row.eventId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "10px 8px", minWidth: 320 }}>
                            <Link href={`/polyoiyen/${encodeURIComponent(row.eventId)}`} style={{ color: "#fdba74", textDecoration: "none", fontWeight: 700 }}>
                              {row.marketTitle}
                            </Link>
                            <div style={{ marginTop: 4, color: "rgba(255,255,255,0.48)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row.marketQuestion}
                            </div>
                          </td>
                          <td style={{ padding: "10px 8px", color: "rgba(255,255,255,0.55)", fontFamily: "DM Mono, monospace" }}>{row.eventId}</td>
                          <td style={{ padding: "10px 8px", color: "#bfdbfe" }}>{row.userCount}</td>
                          <td style={{ padding: "10px 8px", color: "#fff" }}>{row.tradeCount}</td>
                          <td style={{ padding: "10px 8px", color: row.sideBias === "YES_BIAS" ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{row.sideBias === "YES_BIAS" ? "YES" : "NO"}</td>
                          <td style={{ padding: "10px 8px", color: "#fde68a" }}>{fmtMoney(row.invested)}</td>
                          <td style={{ padding: "10px 8px", color: row.totalReturn >= 0 ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{fmtPct(row.totalReturn)}</td>
                          <td style={{ padding: "10px 8px", color: row.winRate >= 50 ? "#86efac" : "#fca5a5" }}>{row.winRate.toFixed(0)}%</td>
                          <td style={{ padding: "10px 8px", color: row.hasExited ? "#86efac" : "#fde68a" }}>{row.hasExited ? "Exited" : "Open"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}