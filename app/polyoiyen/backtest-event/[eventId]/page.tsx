"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
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
  question?: string;
  title?: string;
  slug?: string;
  outcomePrices?: string | number[];
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

type MarketCandidate = {
  market: PolyMarket;
  tokenIds: { yes: string; no: string };
};

type MarketSeries = {
  key: string;
  label: string;
  color: string;
  points: PriceHistoryPoint[];
  latestPriceCents: number | null;
};

type MarketChartPoint = {
  ts: number;
  timeLabel: string;
  [seriesKey: string]: number | string | null;
};

type UserBet = {
  id: number;
  eventId: string;
  marketQuestion?: string;
  side: "YES" | "NO";
  type: "BUY" | "SELL" | string;
  amount: string | number;
  shares: string | number;
  price: string | number;
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

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLooseText(value?: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMarketQuestionMatch(market: PolyMarket, bets: UserBet[]): number {
  const marketText = normalizeLooseText(`${market.title || ""} ${market.question || ""} ${market.slug || ""}`);
  const betQuestions = [...new Set(bets.map((bet) => normalizeLooseText(bet.marketQuestion)).filter(Boolean))];
  if (!marketText || betQuestions.length === 0) return 0.25;

  let bestScore = 1;
  for (const question of betQuestions) {
    if (marketText === question) {
      bestScore = Math.min(bestScore, 0);
      continue;
    }
    if (marketText.includes(question) || question.includes(marketText)) {
      bestScore = Math.min(bestScore, 0.1);
      continue;
    }

    const marketWords = marketText.split(" ").filter(Boolean);
    const questionWords = question.split(" ").filter(Boolean);
    const overlap = marketWords.filter((word) => questionWords.includes(word)).length;
    const ratio = marketWords.length > 0 ? overlap / marketWords.length : 0;
    bestScore = Math.min(bestScore, 1 - ratio);
  }

  return bestScore;
}

function scoreHistoryAgainstBets(points: PriceHistoryPoint[], bets: UserBet[]): number {
  let score = 0;
  let matched = 0;

  for (const bet of bets) {
    if (bet.type !== "BUY" && bet.type !== "SELL") continue;
    const betPrice = Number(bet.price);
    if (!Number.isFinite(betPrice)) continue;

    const nearest = findNearestHistoryPoint(points, Date.parse(bet.createdAt));
    const observed = bet.side === "YES" ? nearest?.yesPrice : nearest?.noPrice;
    if (!Number.isFinite(observed)) continue;

    score += Math.abs(Number(observed) - betPrice);
    matched += 1;
  }

  if (matched === 0) return Number.POSITIVE_INFINITY;
  return score / matched;
}

function getMarketDisplayName(market: PolyMarket, fallbackLabel: string): string {
  return (market.title || market.question || market.slug || fallbackLabel).trim();
}

function getFallbackYesPriceFromMarket(market: PolyMarket): number | null {
  const raw = market.outcomePrices;
  if (raw == null) return null;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const yes = Number(parsed[0]);
  if (!Number.isFinite(yes)) return null;
  if (yes < 0 || yes > 1) return null;
  return yes;
}

function buildForwardFilledChartData(seriesList: MarketSeries[]): MarketChartPoint[] {
  const allTimestamps = [...new Set(seriesList.flatMap((series) => series.points.map((point) => point.ts)))].sort((a, b) => a - b);
  const cursorBySeries = new Map<string, { index: number; lastValue: number | null }>();

  for (const series of seriesList) {
    cursorBySeries.set(series.key, { index: 0, lastValue: null });
  }

  return allTimestamps.map((ts) => {
    const row: MarketChartPoint = {
      ts,
      timeLabel: new Date(ts * 1000).toLocaleString(),
    };

    for (const series of seriesList) {
      const cursor = cursorBySeries.get(series.key);
      if (!cursor) continue;

      while (cursor.index < series.points.length && series.points[cursor.index].ts <= ts) {
        const point = series.points[cursor.index];
        cursor.lastValue = point.yesPrice;
        cursor.index += 1;
      }

      row[series.key] = cursor.lastValue == null ? null : Number((cursor.lastValue * 100).toFixed(2));
    }

    return row;
  });
}

function getChartWindowLabel(windowKey: string): string {
  if (windowKey === "1h") return "1小时";
  if (windowKey === "6h") return "6小时";
  if (windowKey === "1d") return "1天";
  return "全部";
}

async function fetchHistoryByTokens(
  tokenIds: { yes: string; no: string },
  historyWindow: { startTime: string; endTime: string } | null
): Promise<PriceHistoryResponse> {
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

  return historyData;
}

function getMarketForQuestion(event: PolyEvent | null, marketQuestion: string): PolyMarket | null {
  if (!event?.markets?.length) return null;
  const target = normalizeText(marketQuestion || "");
  if (target) {
    const match = event.markets.find((market) => {
      const candidates = [market.question, market.title, market.slug].filter((v): v is string => typeof v === "string");
      return candidates.some((candidate) => normalizeText(candidate) === target);
    });
    if (match) return match;
  }
  return getPrimaryMarket(event);
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

function findNearestChartDataPoint(points: MarketChartPoint[], tsMs: number): MarketChartPoint | null {
  if (!points.length || !Number.isFinite(tsMs)) return null;
  let nearest = points[0];
  let nearestDelta = Math.abs(points[0].ts * 1000 - tsMs);

  for (let i = 1; i < points.length; i += 1) {
    const delta = Math.abs(points[i].ts * 1000 - tsMs);
    if (delta < nearestDelta) {
      nearest = points[i];
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
  const [marketSeries, setMarketSeries] = useState<MarketSeries[]>([]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState<string | null>(null);
  const [selectedMarketInfo, setSelectedMarketInfo] = useState<{ title: string; question: string; candidates: number } | null>(null);
  const [chartWindow, setChartWindow] = useState<"1h" | "6h" | "1d" | "all">("all");
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
      setSelectedMarketInfo(null);
      setUserBets([]);
      setSelectedTradeId(null);

      try {
        const eventRes = await fetch(`/api/polymarket?id=${encodeURIComponent(currentRow.eventId)}`, { cache: "no-store" });
        if (!eventRes.ok) throw new Error("Failed to load event market data");

        const eventPayload = await eventRes.json();
        const event = Array.isArray(eventPayload?.events)
          ? (eventPayload.events[0] as PolyEvent | undefined)
          : (eventPayload as PolyEvent | undefined);

        const allMarkets = Array.isArray(event?.markets) ? event.markets : [];
        const marketCandidates: MarketCandidate[] = allMarkets
          .map((market) => ({ market, tokenIds: parseTokenIds(market) }))
          .filter((candidate) => Boolean(candidate.tokenIds.yes) && Boolean(candidate.tokenIds.no));

        if (marketCandidates.length === 0) {
          throw new Error("This event does not contain a binary YES/NO market that can be charted.");
        }

        let eventBets: UserBet[] = [];
        try {
          const betsRes = await fetch("/api/polybets?positions=true", { cache: "no-store" });
          if (betsRes.ok) {
            const betsPayload = await betsRes.json();
            const allBets = Array.isArray(betsPayload?.bets) ? (betsPayload.bets as UserBet[]) : [];
            const wantedQuestion = normalizeLooseText(currentRow.marketQuestion || "");
            eventBets = allBets.filter((bet) => {
              if (String(bet.eventId) !== String(currentRow.eventId)) return false;
              if (!wantedQuestion) return true;
              return normalizeLooseText(String(bet.marketQuestion || "")) === wantedQuestion;
            });
          }
        } catch {
          eventBets = [];
        }

        const historyWindow = getPriceHistoryWindow(eventBets, event?.endDate || "");

        const candidateHistories = await Promise.all(
          marketCandidates.map(async (candidate) => {
            try {
              const historyData = await fetchHistoryByTokens(candidate.tokenIds, historyWindow);
              const points = Array.isArray(historyData?.points) ? historyData.points : [];
              const questionScore = scoreMarketQuestionMatch(candidate.market, eventBets);
              const priceScore = scoreHistoryAgainstBets(points, eventBets);
              return {
                candidate,
                historyData,
                points,
                score: questionScore * 0.35 + priceScore,
              };
            } catch {
              return null;
            }
          })
        );

        const viable = candidateHistories.filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (viable.length === 0) {
          throw new Error("Failed to load price history for any binary market in this event.");
        }

        const best = viable.sort((a, b) => a.score - b.score)[0];
        const palette = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee", "#fb7185", "#84cc16"];
        const sorted = viable.slice().sort((a, b) => a.score - b.score);
        const referenceTs = sorted[0]?.points?.length ? sorted[0].points[sorted[0].points.length - 1].ts : Math.floor(Date.now() / 1000);
        const nextSeries = sorted.map((item, index) => {
          const latestObservedYes = [...item.points].reverse().find((point) => point.yesPrice != null)?.yesPrice ?? null;
          const fallbackYes = getFallbackYesPriceFromMarket(item.candidate.market);
          const finalYes = latestObservedYes ?? fallbackYes ?? 0;

          const points = Array.isArray(item.points) && item.points.length > 0
            ? item.points
            : [{ ts: referenceTs, timeLabel: new Date(referenceTs * 1000).toLocaleString(), yesPrice: finalYes, noPrice: finalYes == null ? null : Number((1 - finalYes).toFixed(4)) }];

          return {
            key: `series-${index}`,
            label: getMarketDisplayName(item.candidate.market, `Market ${index + 1}`),
            color: palette[index % palette.length],
            points,
            latestPriceCents: Number((finalYes * 100).toFixed(2)),
          };
        });

        if (!alive) return;
        setUserBets(eventBets);
        setPriceHistory(best.points);
        setMarketSeries(nextSeries);
        setSelectedSeriesKey(nextSeries[0]?.key ?? null);
        setSelectedMarketInfo({
          title: best.candidate.market.title || best.candidate.market.question || "Unnamed market",
          question: best.candidate.market.question || "",
          candidates: marketCandidates.length,
        });
      } catch (e) {
        if (!alive) return;
        setUserBets([]);
        setPriceHistory([]);
        setMarketSeries([]);
        setSelectedMarketInfo(null);
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

  const timelineRows = [...userBets].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const positionChartData = timelineRows.reduce<
    Array<{
      ts: number;
      timeLabel: string;
      yesShares: number;
      noShares: number;
      netShares: number;
    }>
  >((points, bet) => {
    const previous = points.length > 0 ? points[points.length - 1] : { yesShares: 0, noShares: 0, netShares: 0 };
    const shares = Number(bet.shares) || 0;
    const nextPoint = {
      ts: Date.parse(bet.createdAt) / 1000,
      timeLabel: new Date(bet.createdAt).toLocaleString(),
      yesShares: previous.yesShares,
      noShares: previous.noShares,
      netShares: previous.netShares,
    };

    if (bet.type === "BUY") {
      if (bet.side === "YES") nextPoint.yesShares += shares;
      if (bet.side === "NO") nextPoint.noShares += shares;
    } else if (bet.type === "SELL") {
      if (bet.side === "YES") nextPoint.yesShares = Math.max(0, nextPoint.yesShares - shares);
      if (bet.side === "NO") nextPoint.noShares = Math.max(0, nextPoint.noShares - shares);
    }

    nextPoint.netShares = nextPoint.yesShares - nextPoint.noShares;
    points.push(nextPoint);
    return points;
  }, []);

  const positionChartTicks = positionChartData.reduce<string[]>((ticks, point, index) => {
    const currentDay = new Date(point.ts * 1000).toISOString().slice(0, 10);
    const previousDay = index > 0 ? new Date(positionChartData[index - 1].ts * 1000).toISOString().slice(0, 10) : null;
    if (index === 0 || currentDay !== previousDay) {
      ticks.push(point.timeLabel);
    }
    return ticks;
  }, []);

  const basePriceChartData = priceHistory.map((point) => ({
    ...point,
    yesCents: point.yesPrice == null ? null : Number((point.yesPrice * 100).toFixed(2)),
    noCents: point.noPrice == null ? null : Number((point.noPrice * 100).toFixed(2)),
  }));

  const priceChartTicks = basePriceChartData.reduce<string[]>((ticks, point, index) => {
    const currentDay = new Date(point.ts * 1000).toISOString().slice(0, 10);
    const previousDay = index > 0 ? new Date(basePriceChartData[index - 1].ts * 1000).toISOString().slice(0, 10) : null;
    if (index === 0 || currentDay !== previousDay) {
      ticks.push(point.timeLabel);
    }
    return ticks;
  }, []);

  const priceChartData = (() => {
    let yesOpen = 0;
    let noOpen = 0;
    let yesAvg = 0;
    let noAvg = 0;

    const sortedBets = timelineRows;
    let betIndex = 0;

    return basePriceChartData.map((point) => {
      const pointMs = point.ts * 1000;

      while (betIndex < sortedBets.length) {
        const bet = sortedBets[betIndex];
        const betMs = Date.parse(bet.createdAt);
        if (!Number.isFinite(betMs) || betMs > pointMs) break;

        const amount = Number(bet.amount) || 0;
        const shares = Number(bet.shares) || 0;
        const impliedPrice = shares > 0 ? amount / shares : Number(bet.price) || 0;

        if (bet.type === "BUY") {
          if (bet.side === "YES" && shares > 0) {
            const nextCost = yesAvg * yesOpen + amount;
            yesOpen += shares;
            yesAvg = yesOpen > 0 ? nextCost / yesOpen : 0;
          }
          if (bet.side === "NO" && shares > 0) {
            const nextCost = noAvg * noOpen + amount;
            noOpen += shares;
            noAvg = noOpen > 0 ? nextCost / noOpen : 0;
          }
        } else if (bet.type === "SELL") {
          if (bet.side === "YES" && shares > 0) {
            yesOpen = Math.max(0, yesOpen - shares);
            if (yesOpen === 0) yesAvg = 0;
          }
          if (bet.side === "NO" && shares > 0) {
            noOpen = Math.max(0, noOpen - shares);
            if (noOpen === 0) noAvg = 0;
          }
          void impliedPrice;
        }

        betIndex += 1;
      }

      return {
        ...point,
        yesCostCents: yesOpen > 0 ? Number((yesAvg * 100).toFixed(2)) : null,
        noCostCents: noOpen > 0 ? Number((noAvg * 100).toFixed(2)) : null,
      };
    });
  })();

  const chartSeries = useMemo(() => marketSeries.slice(0, 8), [marketSeries]);
  const chartSeriesData = useMemo(() => buildForwardFilledChartData(chartSeries), [chartSeries]);
  const chartCutoffMs = useMemo(() => {
    if (chartSeriesData.length === 0) return null;
    const latestTs = chartSeriesData[chartSeriesData.length - 1].ts * 1000;
    if (chartWindow === "1h") return latestTs - 60 * 60 * 1000;
    if (chartWindow === "6h") return latestTs - 6 * 60 * 60 * 1000;
    if (chartWindow === "1d") return latestTs - 24 * 60 * 60 * 1000;
    return null;
  }, [chartSeriesData, chartWindow]);
  const officialChartData = useMemo(() => {
    if (chartCutoffMs == null) return chartSeriesData;
    return chartSeriesData.filter((point) => point.ts * 1000 >= chartCutoffMs);
  }, [chartSeriesData, chartCutoffMs]);
  const officialChartTicks = useMemo(() => {
    return officialChartData.reduce<string[]>((ticks, point, index) => {
      const currentDay = new Date(point.ts * 1000).toISOString().slice(0, 10);
      const previousDay = index > 0 ? new Date(officialChartData[index - 1].ts * 1000).toISOString().slice(0, 10) : null;
      if (index === 0 || currentDay !== previousDay) {
        ticks.push(point.timeLabel);
      }
      return ticks;
    }, []);
  }, [officialChartData]);

  const activeSeriesKey = selectedSeriesKey && chartSeries.some((series) => series.key === selectedSeriesKey)
    ? selectedSeriesKey
    : chartSeries[0]?.key ?? null;

  const tradeMarkers = timelineRows
    .filter((bet) => bet.type === "BUY" || bet.type === "SELL")
    .map((bet) => {
      const ts = Date.parse(bet.createdAt);
      const nearest = findNearestChartDataPoint(chartSeriesData, ts);
      const seriesKey = activeSeriesKey;
      const rawY = nearest && seriesKey ? (nearest as any)[seriesKey] : null;
      const executionPrice = Number(bet.price);
      const yValue = Number.isFinite(executionPrice) && executionPrice > 0 ? executionPrice * 100 : rawY ?? null;
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
        x: nearest?.timeLabel ?? new Date(bet.createdAt).toLocaleString(),
        yCents: Number.isFinite(Number(yValue)) ? Number(Number(yValue).toFixed(2)) : NaN,
        type: bet.type,
        side: bet.side,
        kind,
        color: style?.color || "#9ca3af",
        markerLabel: style?.label || "",
        markerBorder: style?.border || "rgba(156,163,175,0.55)",
      };
    })
    .filter((marker) => Number.isFinite(marker.yCents));

  const groupedTradeMarkers = useMemo(() => {
    const groups = new Map<string, {
      x: string;
      yCents: number;
      count: number;
      color: string;
      markerBorder: string;
      markerLabel: string;
    }>();

    for (const marker of tradeMarkers) {
      const key = `${marker.x}__${marker.yCents.toFixed(2)}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          x: marker.x,
          yCents: marker.yCents,
          count: 1,
          color: marker.color,
          markerBorder: marker.markerBorder,
          markerLabel: marker.markerLabel,
        });
        continue;
      }

      existing.count += 1;
      existing.markerLabel = `x${existing.count}`;
      if (existing.color !== marker.color) {
        existing.color = "#fbbf24";
        existing.markerBorder = "rgba(251,191,36,0.75)";
      }
    }

    return [...groups.values()];
  }, [tradeMarkers]);

  const yesBuyMarkerCount = tradeMarkers.filter((marker) => marker.kind === "YES BUY").length;
  const yesSellMarkerCount = tradeMarkers.filter((marker) => marker.kind === "YES SELL").length;
  const noBuyMarkerCount = tradeMarkers.filter((marker) => marker.kind === "NO BUY").length;
  const noSellMarkerCount = tradeMarkers.filter((marker) => marker.kind === "NO SELL").length;

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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Price Chart</h2>
                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.66)" }}>
                      Multi-outcome chart for this event, styled closer to the Polymarket event page.
                    </div>
                  </div>
                  {selectedMarketInfo && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                      Backtest market: <span style={{ color: "#fde68a", fontWeight: 700 }}>{selectedMarketInfo.title}</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {chartSeries.map((series) => {
                    const isActive = activeSeriesKey === series.key;
                    return (
                      <button
                        key={series.key}
                        type="button"
                        onClick={() => setSelectedSeriesKey(series.key)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${isActive ? series.color : `${series.color}33`}`,
                          background: isActive ? `${series.color}2B` : `${series.color}12`,
                          boxShadow: isActive ? `0 0 0 1px ${series.color}33 inset` : "none",
                          fontSize: 12,
                          color: "rgba(255,255,255,0.88)",
                          cursor: "pointer",
                        }}
                        title="Click to set active series for trade markers"
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: series.color, flexShrink: 0 }} />
                        <span style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{series.label}</span>
                        <span style={{ color: "rgba(255,255,255,0.58)" }}>{series.latestPriceCents == null ? "N/A" : `${series.latestPriceCents.toFixed(0)}¢`}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", gap: 8, padding: 4, borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {(["1h", "6h", "1d", "all"] as const).map((windowKey) => (
                      <button
                        key={windowKey}
                        type="button"
                        onClick={() => setChartWindow(windowKey)}
                        style={{
                          border: 0,
                          borderRadius: 999,
                          padding: "7px 12px",
                          background: chartWindow === windowKey ? "rgba(17,24,39,0.98)" : "transparent",
                          color: chartWindow === windowKey ? "#fff" : "rgba(255,255,255,0.66)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {getChartWindowLabel(windowKey)}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {chartSeriesData.length > 0 ? new Date(chartSeriesData[chartSeriesData.length - 1].ts * 1000).toLocaleString() : "No data"}
                  </div>
                </div>

                <div style={{ width: "100%", height: 340, marginTop: 14 }}>
                  {priceHistoryLoading ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      Loading price chart...
                    </div>
                  ) : priceHistoryError ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fca5a5", fontSize: 13, textAlign: "center", padding: 16 }}>
                      {priceHistoryError}
                    </div>
                  ) : officialChartData.length === 0 ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      No historical price points available yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={officialChartData} margin={{ top: 12, right: 18, bottom: 8, left: 4 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="timeLabel"
                          ticks={officialChartTicks}
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
                          formatter={(value: number | string | undefined, name) => [`${Number(value ?? 0).toFixed(2)}¢`, String(name)]}
                          labelFormatter={(label) => label}
                        />
                        {chartSeries.map((series) => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            strokeWidth={activeSeriesKey === series.key ? 3.1 : 1.7}
                            strokeOpacity={activeSeriesKey === series.key ? 1 : 0.45}
                            dot={false}
                            activeDot={{ r: 3 }}
                          />
                        ))}
                        {groupedTradeMarkers.map((marker, index) => (
                          <ReferenceDot
                            key={`marker-group-${index}`}
                            x={marker.x}
                            y={marker.yCents}
                            r={Math.min(10, 5 + Math.max(0, marker.count - 1))}
                            fill={marker.color}
                            stroke={marker.markerBorder}
                            strokeWidth={1.5}
                            label={{ position: "top", value: marker.markerLabel, fill: "#fff", fontSize: 10 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#60a5fa" }} /> Outcome series</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#34d399" }} /> Active backtest market</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#fbbf24" }} /> Trade counts: {yesBuyMarkerCount + yesSellMarkerCount + noBuyMarkerCount + noSellMarkerCount}</span>
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
                <h2 style={{ margin: 0, fontSize: 16 }}>Position / Cumulative Shares Chart</h2>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  This starts from 0 and shows how many YES / NO shares were accumulated over time.
                </div>

                <div style={{ width: "100%", height: 260, marginTop: 12 }}>
                  {timelineRows.length === 0 ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      No transaction records available yet.
                    </div>
                  ) : positionChartData.length === 0 ? (
                    <div style={{ height: "100%", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      No cumulative position data available yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={positionChartData} margin={{ top: 10, right: 14, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="timeLabel"
                          ticks={positionChartTicks}
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
                          domain={[0, "dataMax"]}
                          tickFormatter={(value) => `${Number(value).toFixed(2)}`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(18, 10, 4, 0.96)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            borderRadius: 10,
                            color: "#fff",
                          }}
                          formatter={(value: number | string | undefined, name) => {
                            const shares = Number(value ?? 0);
                            const label = name === "yesShares" ? "YES cumulative shares" : name === "noShares" ? "NO cumulative shares" : "Net shares";
                            return [`${shares.toFixed(2)}`, label];
                          }}
                          labelFormatter={(label) => label}
                        />
                        <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={{ color: "rgba(255,255,255,0.68)", fontSize: 11 }} />
                        <Line type="monotone" dataKey="yesShares" name="YES cumulative" stroke="#34d399" strokeWidth={2.1} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="noShares" name="NO cumulative" stroke="#f87171" strokeWidth={2.1} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="netShares" name="Net position" stroke="#93c5fd" strokeWidth={1.8} dot={false} activeDot={{ r: 3 }} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#34d399" }} /> YES cumulative shares</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#f87171" }} /> NO cumulative shares</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#93c5fd" }} /> Net position</span>
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
                          <th style={{ padding: "8px 10px" }}>Consistency</th>
                          <th style={{ padding: "8px 10px" }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timelineRows.map((bet) => {
                          const betAmount = Number(bet.amount) || 0;
                          const betShares = Number(bet.shares) || 0;
                          const betPrice = Number(bet.price) || 0;
                          const expectedAmount = betShares * betPrice;
                          const amountMismatch = Math.abs(betAmount - expectedAmount);
                          const tolerance = Math.max(expectedAmount * 0.02, 0.01);
                          const isConsistent = amountMismatch <= tolerance;

                          return (
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
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    border: `1px solid ${bet.type === "SELL" ? "rgba(248,113,113,0.4)" : bet.type === "BUY" ? "rgba(52,211,153,0.4)" : "rgba(191,219,254,0.4)"}`,
                                    color: bet.type === "SELL" ? "#fca5a5" : bet.type === "BUY" ? "#86efac" : "#bfdbfe",
                                  }}
                                >
                                  {bet.type}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", color: bet.side === "YES" ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{bet.side}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtMoney(betAmount)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.75)" }}>{betShares.toFixed(2)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.75)" }}>{(betPrice * 100).toFixed(2)}¢</td>
                              <td style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700 }} title={`Amount: ${betAmount}, Expected: ${expectedAmount.toFixed(4)}`}>
                                {isConsistent ? (
                                  <span style={{ color: "#86efac" }}>✓</span>
                                ) : (
                                  <span style={{ color: "#fca5a5" }}>⚠ {fmtMoney(Math.abs(amountMismatch))}</span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.72)" }}>{new Date(bet.createdAt).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href={`/polyoiyen/${encodeURIComponent(row!.eventId)}`}
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
