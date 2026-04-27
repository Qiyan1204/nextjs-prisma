"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

type PolyMarket = {
  clobTokenIds?: string;
  active?: boolean;
  closed?: boolean;
};

type PolyEvent = {
  id: string;
  endDate?: string;
  markets?: PolyMarket[];
};

type PriceHistoryPoint = {
  ts: number;
  timeLabel: string;
  yesPrice: number | null;
  noPrice: number | null;
};

type PriceHistoryResponse = {
  points?: PriceHistoryPoint[];
};

type UserBet = {
  id: number;
  eventId: string;
  side: "YES" | "NO";
  type: "BUY" | "SELL" | string;
  amount: string;
  shares: string;
  price: string;
  createdAt: string;
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

function fmtSignedMoney(value: number): string {
  const abs = fmtMoney(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function fmtPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(4);
}

function parseTokenIds(market: PolyMarket | null): { yes: string; no: string } {
  if (!market?.clobTokenIds) return { yes: "", no: "" };
  try {
    const ids = JSON.parse(market.clobTokenIds) as string[];
    return { yes: ids?.[0] || "", no: ids?.[1] || "" };
  } catch {
    return { yes: "", no: "" };
  }
}

function getPrimaryMarket(event: PolyEvent | null): PolyMarket | null {
  if (!event?.markets?.length) return null;
  return event.markets.find((market) => market.active && !market.closed) || event.markets[0] || null;
}

function findNearestHistoryPoint(points: PriceHistoryPoint[], tsMs: number): PriceHistoryPoint | null {
  if (!points.length || !Number.isFinite(tsMs)) return null;
  let nearest = points[0];
  let nearestDelta = Math.abs(points[0].ts * 1000 - tsMs);

  for (let index = 1; index < points.length; index += 1) {
    const delta = Math.abs(points[index].ts * 1000 - tsMs);
    if (delta < nearestDelta) {
      nearest = points[index];
      nearestDelta = delta;
    }
  }

  return nearest;
}

function getPriceHistoryWindow(bets: UserBet[], eventEndDate: string): { startTime: string; endTime: string } | null {
  const buyTimes = bets
    .filter((bet) => bet.type === "BUY")
    .map((bet) => Date.parse(bet.createdAt))
    .filter((ts) => Number.isFinite(ts));

  if (buyTimes.length === 0) return null;

  const sellTimes = bets
    .filter((bet) => bet.type === "SELL")
    .map((bet) => Date.parse(bet.createdAt))
    .filter((ts) => Number.isFinite(ts));

  const eventEndMs = Date.parse(eventEndDate);
  const nowMs = Date.now();
  const fallbackEndMs = Number.isFinite(eventEndMs) ? Math.min(eventEndMs, nowMs) : nowMs;
  const startMs = Math.min(...buyTimes) - 24 * 60 * 60 * 1000;
  const endMs = sellTimes.length > 0 ? Math.max(...sellTimes) : fallbackEndMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;

  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

export default function EventBacktestDetailsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [row, setRow] = useState<ModelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState<string | null>(null);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!row) return;
    const currentRow = row;

    let alive = true;

    async function loadPriceHistory() {
      setPriceHistoryLoading(true);
      setPriceHistoryError(null);
      setPriceHistory([]);
      setUserBets([]);
      setSelectedTradeId(null);

      try {
        const eventRes = await fetch(`/api/polymarket?id=${encodeURIComponent(currentRow.eventId)}`, { cache: "no-store" });
        if (!eventRes.ok) throw new Error("Failed to load event market data");

        const eventPayload = await eventRes.json();
        const event = Array.isArray(eventPayload?.events)
          ? (eventPayload.events[0] as PolyEvent | undefined)
          : (eventPayload as PolyEvent | undefined);

        const primaryMarket = getPrimaryMarket(event || null);
        const tokenIds = parseTokenIds(primaryMarket);

        if (!tokenIds.yes || !tokenIds.no) {
          throw new Error("No token ids available for charting");
        }

        let eventBets: UserBet[] = [];
        try {
          const betsRes = await fetch("/api/polybets", { cache: "no-store" });
          if (betsRes.ok) {
            const betsPayload = await betsRes.json();
            const allBets = Array.isArray(betsPayload?.bets) ? (betsPayload.bets as UserBet[]) : [];
            eventBets = allBets.filter((bet) => String(bet.eventId) === String(currentRow.eventId));
          }
        } catch {
          eventBets = [];
        }

        const historyWindow = getPriceHistoryWindow(eventBets, event?.endDate || "");

        const params = new URLSearchParams({
          yesAssetId: tokenIds.yes,
          noAssetId: tokenIds.no,
          limit: "300",
          maxPages: "120",
        });

        if (historyWindow) {
          params.set("startTime", historyWindow.startTime);
          params.set("endTime", historyWindow.endTime);
        } else {
          params.set("range", "1W");
        }

        const historyRes = await fetch(`/api/polymarket/volatility-rating?${params.toString()}`, { cache: "no-store" });
        const historyData = (await historyRes.json()) as PriceHistoryResponse & { error?: string };
        if (!historyRes.ok) {
          throw new Error(historyData?.error || "Failed to load price history");
        }

        if (!alive) return;
        setUserBets(eventBets);
        setPriceHistory(Array.isArray(historyData?.points) ? historyData.points : []);
      } catch (e) {
        if (!alive) return;
        setUserBets([]);
        setPriceHistory([]);
        setPriceHistoryError(e instanceof Error ? e.message : "Failed to load price chart");
      } finally {
        if (alive) setPriceHistoryLoading(false);
      }
    }

    loadPriceHistory();

    return () => {
      alive = false;
    };
  }, [row]);

  const priceChartData = priceHistory.map((point) => ({
    ...point,
    yesCents: point.yesPrice == null ? null : Number((point.yesPrice * 100).toFixed(2)),
    noCents: point.noPrice == null ? null : Number((point.noPrice * 100).toFixed(2)),
  }));

  const priceChartTicks = priceChartData.reduce<string[]>((ticks, point, index) => {
    const currentDay = new Date(point.ts * 1000).toISOString().slice(0, 10);
    const previousDay = index > 0 ? new Date(priceChartData[index - 1].ts * 1000).toISOString().slice(0, 10) : null;
    if (index === 0 || currentDay !== previousDay) {
      ticks.push(point.timeLabel);
    }
    return ticks;
  }, []);

  const tradeMarkers = userBets
    .filter((bet) => bet.type === "BUY" || bet.type === "SELL")
    .map((bet) => {
      const historyPoint = findNearestHistoryPoint(priceHistory, Date.parse(bet.createdAt));
      const yValue = bet.side === "YES" ? historyPoint?.yesPrice ?? Number(bet.price) : historyPoint?.noPrice ?? Number(bet.price);
      const kind = `${bet.side} ${bet.type}` as const;

      const styleMap: Record<string, { color: string; label: string; border: string }> = {
        "YES BUY": { color: "#34d399", label: "YB", border: "rgba(52,211,153,0.55)" },
        "YES SELL": { color: "#059669", label: "YS", border: "rgba(16,185,129,0.65)" },
        "NO BUY": { color: "#fbbf24", label: "NB", border: "rgba(251,191,36,0.55)" },
        "NO SELL": { color: "#f87171", label: "NS", border: "rgba(248,113,113,0.65)" },
      };

      const style = styleMap[kind];

      return {
        id: bet.id,
        x: historyPoint?.timeLabel ?? new Date(bet.createdAt).toLocaleString(),
        y: yValue,
        type: bet.type,
        side: bet.side,
        kind,
        color: style?.color || "#9ca3af",
        markerLabel: style?.label || "",
        markerBorder: style?.border || "rgba(156,163,175,0.55)",
      };
    })
    .filter((marker) => Number.isFinite(marker.y));

  const yesBuyMarkerCount = tradeMarkers.filter((marker) => marker.kind === "YES BUY").length;
  const yesSellMarkerCount = tradeMarkers.filter((marker) => marker.kind === "YES SELL").length;
  const noBuyMarkerCount = tradeMarkers.filter((marker) => marker.kind === "NO BUY").length;
  const noSellMarkerCount = tradeMarkers.filter((marker) => marker.kind === "NO SELL").length;

  const timelineRows = [...userBets].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  let investedAmount = 0;
  let realizedCash = 0;
  let realizedPnl = 0;
  let yesOpenShares = 0;
  let noOpenShares = 0;
  let yesAvgCost = 0;
  let noAvgCost = 0;
  let tradedNotional = 0;

  for (const bet of timelineRows) {
    const amount = Number(bet.amount) || 0;
    const shares = Number(bet.shares) || 0;
    const impliedPrice = shares > 0 ? amount / shares : Number(bet.price) || 0;

    if (bet.type === "BUY") {
      tradedNotional += amount;
      investedAmount += amount;

      if (bet.side === "YES" && shares > 0) {
        const nextCost = yesAvgCost * yesOpenShares + amount;
        yesOpenShares += shares;
        yesAvgCost = yesOpenShares > 0 ? nextCost / yesOpenShares : 0;
      }

      if (bet.side === "NO" && shares > 0) {
        const nextCost = noAvgCost * noOpenShares + amount;
        noOpenShares += shares;
        noAvgCost = noOpenShares > 0 ? nextCost / noOpenShares : 0;
      }
    } else if (bet.type === "SELL") {
      tradedNotional += amount;
      realizedCash += amount;

      if (bet.side === "YES" && shares > 0) {
        const closeShares = Math.min(shares, yesOpenShares);
        realizedPnl += closeShares * (impliedPrice - yesAvgCost);
        yesOpenShares = Math.max(0, yesOpenShares - closeShares);
        if (yesOpenShares === 0) yesAvgCost = 0;
      }

      if (bet.side === "NO" && shares > 0) {
        const closeShares = Math.min(shares, noOpenShares);
        realizedPnl += closeShares * (impliedPrice - noAvgCost);
        noOpenShares = Math.max(0, noOpenShares - closeShares);
        if (noOpenShares === 0) noAvgCost = 0;
      }
    } else if (bet.type === "CLAIM") {
      realizedCash += amount;
    }
  }

  const latestPoint = [...priceHistory].reverse().find((point) => point.yesPrice != null || point.noPrice != null);
  let latestYesPrice = latestPoint?.yesPrice ?? null;
  let latestNoPrice = latestPoint?.noPrice ?? null;
  if (latestYesPrice == null && latestNoPrice != null) latestYesPrice = Math.max(0, Math.min(1, 1 - latestNoPrice));
  if (latestNoPrice == null && latestYesPrice != null) latestNoPrice = Math.max(0, Math.min(1, 1 - latestYesPrice));

  const openCostBasis = yesOpenShares * yesAvgCost + noOpenShares * noAvgCost;
  const unrealizedValue =
    (latestYesPrice != null ? yesOpenShares * latestYesPrice : 0) +
    (latestNoPrice != null ? noOpenShares * latestNoPrice : 0);
  const unrealizedPnl = unrealizedValue - openCostBasis;
  const grossPnl = realizedCash + unrealizedValue - investedAmount;
  const feeEstimate = tradedNotional * 0.002;
  const netPnlAfterFees = grossPnl - feeEstimate;

  const startPoint = priceHistory[0] || null;
  const endPoint = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null;
  const startYesPrice = startPoint?.yesPrice;
  const startNoPrice = startPoint?.noPrice;
  const endYesPrice = endPoint?.yesPrice;
  const endNoPrice = endPoint?.noPrice;

  const yesBuyHoldReturn =
    startYesPrice != null && endYesPrice != null && startYesPrice > 0
      ? ((endYesPrice - startYesPrice) / startYesPrice) * 100
      : null;
  const noBuyHoldReturn =
    startNoPrice != null && endNoPrice != null && startNoPrice > 0
      ? ((endNoPrice - startNoPrice) / startNoPrice) * 100
      : null;
  const strategyReturn = row?.totalReturn ?? 0;
  const alphaVsYes = yesBuyHoldReturn == null ? null : strategyReturn - yesBuyHoldReturn;
  const alphaVsNo = noBuyHoldReturn == null ? null : strategyReturn - noBuyHoldReturn;

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

              <section
                style={{
                  marginTop: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  padding: 16,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 16 }}>PnL Decomposition</h2>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, fontSize: 13 }}>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Realized PnL</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: realizedPnl >= 0 ? "#86efac" : "#fca5a5" }}>{fmtSignedMoney(realizedPnl)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Unrealized PnL</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: unrealizedPnl >= 0 ? "#86efac" : "#fca5a5" }}>{fmtSignedMoney(unrealizedPnl)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Gross PnL</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: grossPnl >= 0 ? "#86efac" : "#fca5a5" }}>{fmtSignedMoney(grossPnl)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fee Estimate (0.2%)</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: "#fde68a" }}>{fmtMoney(feeEstimate)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Net After Fees</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: netPnlAfterFees >= 0 ? "#86efac" : "#fca5a5" }}>{fmtSignedMoney(netPnlAfterFees)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Open Position Value</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: "#bfdbfe" }}>{fmtMoney(unrealizedValue)}</div>
                  </div>
                </div>
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
                <h2 style={{ margin: 0, fontSize: 16 }}>Benchmark Comparison</h2>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  Compare strategy return against buy-and-hold YES/NO over the same chart window.
                </div>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, fontSize: 13 }}>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Strategy Return</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: strategyReturn >= 0 ? "#86efac" : "#fca5a5" }}>{fmtPct(strategyReturn)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>YES Buy & Hold</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: (yesBuyHoldReturn || 0) >= 0 ? "#86efac" : "#fca5a5" }}>{yesBuyHoldReturn == null ? "N/A" : fmtPct(yesBuyHoldReturn)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>NO Buy & Hold</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: (noBuyHoldReturn || 0) >= 0 ? "#86efac" : "#fca5a5" }}>{noBuyHoldReturn == null ? "N/A" : fmtPct(noBuyHoldReturn)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Alpha vs YES</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: (alphaVsYes || 0) >= 0 ? "#86efac" : "#fca5a5" }}>{alphaVsYes == null ? "N/A" : fmtPct(alphaVsYes)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Alpha vs NO</div>
                    <div style={{ marginTop: 6, fontWeight: 800, color: (alphaVsNo || 0) >= 0 ? "#86efac" : "#fca5a5" }}>{alphaVsNo == null ? "N/A" : fmtPct(alphaVsNo)}</div>
                  </div>
                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Window</div>
                    <div style={{ marginTop: 6, fontWeight: 700, color: "#bfdbfe" }}>
                      {startPoint?.timeLabel || "N/A"} to {endPoint?.timeLabel || "N/A"}
                    </div>
                  </div>
                </div>
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
                <h2 style={{ margin: 0, fontSize: 16 }}>Price Chart</h2>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  YES / NO price history from 24 hours before your first BUY through your latest SELL, or the event end if you never sold.
                </div>

                <div style={{ width: "100%", height: 290, marginTop: 12 }}>
                  {priceHistoryLoading ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      Loading price chart...
                    </div>
                  ) : priceHistoryError ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fca5a5", fontSize: 13, textAlign: "center", padding: 16 }}>
                      {priceHistoryError}
                    </div>
                  ) : priceChartData.length === 0 ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      No historical price points available yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={priceChartData} margin={{ top: 10, right: 14, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="timeLabel"
                          ticks={priceChartTicks}
                          interval={0}
                          tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                          tickLine={{ stroke: "rgba(255,255,255,0.12)" }}
                          tickFormatter={(value) => String(value).slice(0, 5)}
                        />
                        <YAxis
                          tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                          tickLine={{ stroke: "rgba(255,255,255,0.12)" }}
                          domain={[0, 100]}
                          tickFormatter={(value) => `${Number(value).toFixed(0)}¢`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(18, 10, 4, 0.96)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            borderRadius: 10,
                            color: "#fff",
                          }}
                          formatter={(value: number | string | undefined, name) => {
                            const cents = Number(value ?? 0);
                            const label = name === "yesCents" ? "YES price" : name === "noCents" ? "NO price" : String(name);
                            return [`${cents.toFixed(2)}¢`, label];
                          }}
                          labelFormatter={(label) => label}
                        />
                        <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={{ color: "rgba(255,255,255,0.68)", fontSize: 11 }} />
                        <Line type="monotone" dataKey="yesCents" name="YES" stroke="#34d399" strokeWidth={2.1} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="noCents" name="NO" stroke="#f87171" strokeWidth={2.1} dot={false} activeDot={{ r: 3 }} />
                        {tradeMarkers.map((marker) => (
                          <ReferenceDot
                            key={`${marker.id}-${marker.kind}`}
                            x={marker.x}
                            y={Number((Number(marker.y) * 100).toFixed(2))}
                            r={0}
                            fill="transparent"
                            stroke="transparent"
                            ifOverflow="visible"
                            shape={(props: any) => {
                              const cx = props?.cx ?? props?.x;
                              const cy = props?.cy ?? props?.y;
                              const isSelected = selectedTradeId === marker.id;
                              return (
                                <text
                                  x={cx}
                                  y={cy}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill={marker.color}
                                  stroke={isSelected ? "#ffffff" : marker.markerBorder}
                                  strokeWidth={isSelected ? 0.9 : 0.4}
                                  fontSize={isSelected ? 17 : 14}
                                  fontWeight={isSelected ? 900 : 800}
                                  style={{ filter: isSelected ? "drop-shadow(0 0 4px rgba(255,255,255,0.6))" : "none" }}
                                >
                                  ★
                                </text>
                              );
                            }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#34d399" }} /> YES line</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#f87171" }} /> NO line</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#34d399" }} /> YES BUY: {yesBuyMarkerCount}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#059669" }} /> YES SELL: {yesSellMarkerCount}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#fbbf24" }} /> NO BUY: {noBuyMarkerCount}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#f87171" }} /> NO SELL: {noSellMarkerCount}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.78)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, border: "1px solid rgba(255,255,255,0.75)", background: "rgba(255,255,255,0.25)" }} />
                    Selected trade highlight
                  </span>
                </div>
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
                <h2 style={{ margin: 0, fontSize: 16 }}>Transaction Timeline</h2>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  Chronological BUY / SELL / CLAIM flow for this event.
                </div>

                {timelineRows.length === 0 ? (
                  <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>No transaction records found for your account in this event.</div>
                ) : (
                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <th style={{ padding: "8px 10px" }}>Type</th>
                          <th style={{ padding: "8px 10px" }}>Side</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Amount</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Shares</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Price</th>
                          <th style={{ padding: "8px 10px" }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timelineRows.map((bet) => (
                          <tr
                            key={bet.id}
                            onClick={() => setSelectedTradeId((prev) => (prev === bet.id ? null : bet.id))}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              cursor: "pointer",
                              background: selectedTradeId === bet.id ? "rgba(59,130,246,0.16)" : "transparent",
                            }}
                            title={selectedTradeId === bet.id ? "Click to unselect" : "Click to highlight this trade on chart"}
                          >
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 999,
                                border: `1px solid ${bet.type === "SELL" ? "rgba(248,113,113,0.4)" : bet.type === "BUY" ? "rgba(52,211,153,0.4)" : "rgba(191,219,254,0.4)"}`,
                                color: bet.type === "SELL" ? "#fca5a5" : bet.type === "BUY" ? "#86efac" : "#bfdbfe",
                              }}>
                                {bet.type}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: bet.side === "YES" ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{bet.side}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtMoney(Number(bet.amount) || 0)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.75)" }}>{(Number(bet.shares) || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.75)" }}>{((Number(bet.price) || 0) * 100).toFixed(2)}¢</td>
                            <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.72)" }}>{new Date(bet.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
