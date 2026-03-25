"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PolyHeader from "../PolyHeader";

interface PolyMarket {
  clobTokenIds?: string;
  conditionId?: string;
  active?: boolean;
  closed?: boolean;
}

interface PolyEvent {
  id: string;
  title: string;
  volume?: number;
  markets: PolyMarket[];
}

interface PredictorsStats {
  uniquePredictors: number;
  diagnostics?: {
    nonZeroDailyPoints?: number;
    nonZeroWeeklyPoints?: number;
    tradesInDailyWindow?: number;
    tradesInWeeklyWindow?: number;
  };
}

interface VolatilityPoint {
  ts: number;
  timeLabel: string;
  yesStepScore: number;
  noStepScore: number;
}

interface ConfidenceRow {
  eventId: string;
  title: string;
  participants: number;
  archiveHealth: number;
  recurrenceFactor: number;
  recurrenceCategory: string;
  confidenceScore: number;
  volume: number;
  points: VolatilityPoint[];
}

function parseTokenIds(raw?: string): { yes: string; no: string } {
  if (!raw) return { yes: "", no: "" };
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return {
        yes: String(arr[0] || ""),
        no: String(arr[1] || ""),
      };
    }
  } catch {
    // ignore invalid payload
  }
  return { yes: "", no: "" };
}

function pickActiveMarket(markets: PolyMarket[]): PolyMarket | null {
  if (!Array.isArray(markets) || markets.length === 0) return null;
  const active = markets.find((m) => m.active !== false && m.closed !== true);
  return active || markets[0] || null;
}

function formatVolume(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function participantsToScore(participants: number): number {
  // Saturating transform keeps score in 0..100 while rewarding larger crowds.
  return (1 - Math.exp(-participants / 40)) * 100;
}

function computeArchiveHealth(yes: PredictorsStats, no: PredictorsStats): number {
  const yesDaily = Number(yes.diagnostics?.nonZeroDailyPoints || 0);
  const noDaily = Number(no.diagnostics?.nonZeroDailyPoints || 0);
  const yesWeekly = Number(yes.diagnostics?.nonZeroWeeklyPoints || 0);
  const noWeekly = Number(no.diagnostics?.nonZeroWeeklyPoints || 0);
  const dailyCompleteness = Math.min(1, (yesDaily + noDaily) / 20);
  const weeklyCompleteness = Math.min(1, (yesWeekly + noWeekly) / 20);
  return (dailyCompleteness * 0.7 + weeklyCompleteness * 0.3) * 100;
}

interface RecurrenceProfile {
  factor: number;
  category: string;
}

const RECURRENCE_RULES: Array<{ category: string; factor: number; keywords: string[] }> = [
  {
    category: "Elon Tweets",
    factor: 20,
    keywords: ["elon", "musk", "tesla", "spacex", "x.com", "twitter"],
  },
  {
    category: "Sports",
    factor: 20,
    keywords: ["sports", "nba", "nfl", "mlb", "soccer", "football", "championship", "playoff"],
  },
  {
    category: "Politics/Drama",
    factor: -30,
    keywords: ["politics", "drama", "election", "debate", "scandal", "impeachment", "senate", "congress"],
  },
];

function getRecurrenceProfile(title: string): RecurrenceProfile {
  const normalized = String(title || "").toLowerCase();

  for (const rule of RECURRENCE_RULES) {
    if (rule.keywords.some((k) => normalized.includes(k))) {
      return { factor: rule.factor, category: rule.category };
    }
  }

  return { factor: 0, category: "Neutral" };
}

export default function SignalConfidenceRankingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ConfidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: ConfidenceRow } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    eventId: string;
    timeLabel: string;
    yesStepScore: number;
    noStepScore: number;
  } | null>(null);

  const loadRanking = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const eventsRes = await fetch("/api/polymarket?limit=120&offset=0");
      if (!eventsRes.ok) throw new Error("Failed to fetch active markets");

      const events: PolyEvent[] = await eventsRes.json();
      const pool = (Array.isArray(events) ? events : [])
        .filter((e) => Array.isArray(e.markets) && e.markets.length > 0);

      // Prioritize events that match recurrence rules so recurring categories are visible.
      const recurrenceCandidates = pool.filter((e) => getRecurrenceProfile(e.title).factor !== 0);
      const neutralCandidates = pool.filter((e) => getRecurrenceProfile(e.title).factor === 0);
      const candidates = [...recurrenceCandidates, ...neutralCandidates].slice(0, 18);

      const nowIso = new Date().toISOString();
      const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const mapped = await Promise.all(
        candidates.map(async (event) => {
          const market = pickActiveMarket(event.markets || []);
          const tokenIds = parseTokenIds(market?.clobTokenIds);
          if (!tokenIds.yes || !tokenIds.no) return null;

          const buildParams = (assetId: string) => {
            const params = new URLSearchParams();
            if (market?.conditionId) params.set("conditionId", market.conditionId);
            params.set("assetIds", assetId);
            params.set("volume", String(event.volume || 0));
            params.set("limit", "250");
            params.set("maxPages", "60");
            return params;
          };

          const [yesRes, noRes, volRes] = await Promise.all([
            fetch(`/api/polymarket/predictors?${buildParams(tokenIds.yes).toString()}`),
            fetch(`/api/polymarket/predictors?${buildParams(tokenIds.no).toString()}`),
            fetch(`/api/polymarket/volatility-rating?yesAssetId=${tokenIds.yes}&noAssetId=${tokenIds.no}&startTime=${oneHourAgoIso}&endTime=${nowIso}&bucketSeconds=300&limit=250&maxPages=120`),
          ]);

          if (!yesRes.ok || !noRes.ok) return null;

          const [yesData, noData]: [PredictorsStats, PredictorsStats] = await Promise.all([
            yesRes.json(),
            noRes.json(),
          ]);

          const participants = Number(yesData.uniquePredictors || 0) + Number(noData.uniquePredictors || 0);
          const archiveHealth = computeArchiveHealth(yesData, noData);
          const participantsScore = participantsToScore(participants);
          const recurrence = getRecurrenceProfile(event.title);
          const confidenceScore = participantsScore * 0.65 + archiveHealth * 0.35 + recurrence.factor;

          let points: VolatilityPoint[] = [];
          if (volRes.ok) {
            const volData = await volRes.json();
            points = Array.isArray(volData?.points) ? volData.points : [];
          }

          return {
            eventId: event.id,
            title: event.title,
            participants,
            archiveHealth,
            recurrenceFactor: recurrence.factor,
            recurrenceCategory: recurrence.category,
            confidenceScore,
            volume: Number(event.volume || 0),
            points,
          } as ConfidenceRow;
        })
      );

      const ranked = mapped
        .filter((x): x is ConfidenceRow => Boolean(x))
        .sort((a, b) => {
          if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
          if (b.recurrenceFactor !== a.recurrenceFactor) return b.recurrenceFactor - a.recurrenceFactor;
          if (b.participants !== a.participants) return b.participants - a.participants;
          return b.archiveHealth - a.archiveHealth;
        });

      setRows(ranked);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to compute signal confidence ranking");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  function navigateToEvent(eventId: string) {
    setContextMenu(null);
    router.push(`/polyoiyen/${encodeURIComponent(eventId)}`);
  }

  function renderInlineChart(row: ConfidenceRow) {
    const chartW = 920;
    const chartH = 250;
    const padL = 46;
    const padR = 16;
    const padT = 16;
    const padB = 42;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const points = row.points || [];
    const maxStep = Math.max(
      1,
      ...points.map((p) => Math.max(Number(p.yesStepScore || 0), Number(p.noStepScore || 0)))
    );

    const coords = points.map((p, i) => {
      const x = padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
      const yYes = padT + (1 - (Number(p.yesStepScore || 0) / maxStep)) * plotH;
      const yNo = padT + (1 - (Number(p.noStepScore || 0) / maxStep)) * plotH;
      return { x, yYes, yNo, point: p };
    });

    const yesLine = coords.map((pt) => `${pt.x},${pt.yYes}`).join(" ");
    const noLine = coords.map((pt) => `${pt.x},${pt.yNo}`).join(" ");

    return (
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "12px 12px 14px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginBottom: 8 }}>
          Wisdom of the Crowd Density + Archive Health Score · Left click row to switch · Right click row for actions
        </div>
        <div style={{ fontSize: 14, color: "#f97316", fontWeight: 700, marginBottom: 8 }}>
           · {row.title}
        </div>

        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, background: "rgba(255,255,255,0.01)" }}>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", minWidth: 700, height: 250, display: "block" }}>
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = padT + (1 - tick / 100) * plotH;
              return (
                <g key={tick}>
                  <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.36)" fontSize="10" fontFamily="'DM Mono', monospace">
                    {((tick / 100) * maxStep).toFixed(2)}
                  </text>
                </g>
              );
            })}

            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

            <polyline fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={yesLine} />
            <polyline fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={noLine} />

            {coords.map((pt) => (
              <g key={pt.point.ts}>
                <circle
                  cx={pt.x}
                  cy={pt.yYes}
                  r={3.2}
                  fill="#34d399"
                  opacity={0.95}
                  onMouseEnter={() => {
                    setHoveredPoint({
                      eventId: row.eventId,
                      timeLabel: pt.point.timeLabel,
                      yesStepScore: Number(pt.point.yesStepScore || 0),
                      noStepScore: Number(pt.point.noStepScore || 0),
                    });
                  }}
                >
                  <title>{`${pt.point.timeLabel}\nYES: ${Number(pt.point.yesStepScore || 0).toFixed(2)}\nNO: ${Number(pt.point.noStepScore || 0).toFixed(2)}`}</title>
                </circle>
                <circle
                  cx={pt.x}
                  cy={pt.yNo}
                  r={3.2}
                  fill="#f87171"
                  opacity={0.95}
                  onMouseEnter={() => {
                    setHoveredPoint({
                      eventId: row.eventId,
                      timeLabel: pt.point.timeLabel,
                      yesStepScore: Number(pt.point.yesStepScore || 0),
                      noStepScore: Number(pt.point.noStepScore || 0),
                    });
                  }}
                >
                  <title>{`${pt.point.timeLabel}\nYES: ${Number(pt.point.yesStepScore || 0).toFixed(2)}\nNO: ${Number(pt.point.noStepScore || 0).toFixed(2)}`}</title>
                </circle>
              </g>
            ))}

            {points.map((p, i) => {
              const x = padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
              if (i % Math.ceil(points.length / 8) !== 0 && i !== points.length - 1) return null;
              return (
                <text
                  key={`${p.ts}-label`}
                  x={x}
                  y={padT + plotH + 16}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.36)"
                  fontSize="10"
                  fontFamily="'DM Mono', monospace"
                >
                  {p.timeLabel}
                </text>
              );
            })}
          </svg>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: "#34d399" }}>■ YES price</span>
          <span style={{ color: "#f87171" }}>■ NO price</span>
          <span style={{ color: "#60a5fa" }}>■ Participants: {row.participants.toLocaleString()}</span>
          <span style={{ color: "#60a5fa" }}>■ Archive Health: {row.archiveHealth.toFixed(1)}%</span>
        </div>

        <div style={{
          marginTop: 8,
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          background: "rgba(255,255,255,0.02)",
          padding: "8px 10px",
          fontSize: 11,
          color: "rgba(255,255,255,0.72)",
          fontFamily: "'DM Mono', monospace",
        }}>
          {hoveredPoint && hoveredPoint.eventId === row.eventId
            ? `Tooltip: ${hoveredPoint.timeLabel} | YES ${hoveredPoint.yesStepScore.toFixed(2)} | NO ${hoveredPoint.noStepScore.toFixed(2)}`
            : "Tooltip: hover any chart point to inspect YES/NO values over 1H. 群体规模越大、归档数据越完整 = 信号可信度越高。"}
        </div>
      </div>
    );
  }

  useEffect(() => {
    let alive = true;
    async function initialLoad() {
      if (!alive) return;
      await loadRanking(false);
    }
    initialLoad();

    const interval = setInterval(() => {
      loadRanking(true);
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [loadRanking]);

  const top = useMemo(() => (rows.length > 0 ? rows[0] : null), [rows]);

  return (
    <div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <PolyHeader active="EliteSignalConfidence" />

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
          🛡️ Signal Confidence Ranking
        </h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
          Rank by Predictors per Market, Archive Health, and Recurrence Factor. Recurring themes (Elon Tweets, Sports) get +20, while one-off Politics/Drama events get -30.
        </p>
        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          Data source: /api/polymarket + /api/polymarket/predictors (live query).
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Updated: {updatedAt || "--:--:--"}
          </div>
          <button
            onClick={() => loadRanking(true)}
            disabled={refreshing}
            style={{
              border: "1px solid rgba(249,115,22,0.3)",
              background: refreshing ? "rgba(249,115,22,0.06)" : "rgba(249,115,22,0.12)",
              color: refreshing ? "rgba(255,255,255,0.5)" : "#f97316",
              borderRadius: 9,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: refreshing ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {top && (
          <div style={{
            marginTop: 14,
            border: "1px solid rgba(249,115,22,0.35)",
            borderRadius: 14,
            background: "linear-gradient(135deg, rgba(249,115,22,0.14), rgba(255,255,255,0.02))",
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#fb923c", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Most Hard-To-Manipulate Signal
            </div>
            <div style={{ marginTop: 6, fontSize: 17, fontWeight: 700, color: "white" }}>{top.title}</div>
            <div style={{ marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              Confidence: <span style={{ color: "#f97316", fontWeight: 800 }}>{top.confidenceScore.toFixed(2)}</span>
              {" · "}
              RF: <span style={{ color: top.recurrenceFactor >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>{top.recurrenceFactor >= 0 ? `+${top.recurrenceFactor}` : top.recurrenceFactor}</span>
              {" · "}
              Category: <span style={{ color: "rgba(255,255,255,0.86)", fontWeight: 600 }}>{top.recurrenceCategory}</span>
              {" · "}
              Participants: <span style={{ color: "#34d399", fontWeight: 700 }}>{top.participants.toLocaleString()}</span>
              {" · "}
              Archive Health: <span style={{ color: "#60a5fa", fontWeight: 700 }}>{top.archiveHealth.toFixed(1)}%</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "70px minmax(220px, 1fr) 120px 120px 140px 140px 140px 120px",
            gap: 8,
            padding: "10px 12px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 10,
            color: "rgba(255,255,255,0.52)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}>
            <span>Rank</span>
            <span>Market</span>
            <span style={{ textAlign: "right" }}>Confidence</span>
            <span style={{ textAlign: "right" }}>RF</span>
            <span style={{ textAlign: "right" }}>Category</span>
            <span style={{ textAlign: "right" }}>Participants</span>
            <span style={{ textAlign: "right" }}>Archive Health</span>
            <span style={{ textAlign: "right" }}>Volume</span>
          </div>

          {loading && (
            <div style={{ padding: "16px 12px", color: "rgba(255,255,255,0.62)", fontSize: 13 }}>Loading signal confidence ranking...</div>
          )}

          {!loading && error && (
            <div style={{ padding: "16px 12px", color: "#fca5a5", fontSize: 13 }}>{error}</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: "16px 12px", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>No markets have enough predictor/archive data yet.</div>
          )}

          {!loading && !error && rows.map((row, index) => (
            <div key={row.eventId}>
              {selectedEventId === row.eventId && row.points.length > 0 && renderInlineChart(row)}
              <div
                onClick={() => {
                  setSelectedEventId(row.eventId);
                  setContextMenu(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedEventId(row.eventId);
                  setContextMenu({ x: e.clientX, y: e.clientY, row });
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px minmax(220px, 1fr) 120px 120px 140px 140px 140px 120px",
                  gap: 8,
                  padding: "11px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  alignItems: "center",
                  background:
                    selectedEventId === row.eventId
                      ? "rgba(249,115,22,0.16)"
                      : index === 0
                        ? "rgba(249,115,22,0.07)"
                        : "transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: index === 0 ? "#f97316" : "rgba(255,255,255,0.75)", fontWeight: 800 }}>
                  #{index + 1}
                </span>
                <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.title}
                </span>
                <span style={{ textAlign: "right", color: "#f97316", fontWeight: 800 }}>{row.confidenceScore.toFixed(2)}</span>
                <span style={{ textAlign: "right", color: row.recurrenceFactor >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
                  {row.recurrenceFactor >= 0 ? `+${row.recurrenceFactor}` : row.recurrenceFactor}
                </span>
                <span style={{ textAlign: "right", color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>
                  {row.recurrenceCategory}
                </span>
                <span style={{ textAlign: "right", color: "#34d399", fontWeight: 700 }}>{row.participants.toLocaleString()}</span>
                <span style={{ textAlign: "right", color: "#60a5fa", fontWeight: 700 }}>{row.archiveHealth.toFixed(1)}%</span>
                <span style={{ textAlign: "right", color: "rgba(255,255,255,0.62)", fontWeight: 600 }}>{formatVolume(row.volume)}</span>
              </div>
            </div>
          ))}

          {contextMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: contextMenu.y,
                left: contextMenu.x,
                zIndex: 999,
                border: "1px solid rgba(249,115,22,0.24)",
                borderRadius: 10,
                background: "#1e1108",
                boxShadow: "0 10px 28px rgba(0,0,0,0.6)",
                padding: 6,
                minWidth: 170,
              }}
            >
              <button
                onClick={() => navigateToEvent(contextMenu.row.eventId)}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  color: "rgba(255,255,255,0.85)",
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                View the Event
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
