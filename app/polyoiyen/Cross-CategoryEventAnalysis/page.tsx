"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import PolyHeader from "../PolyHeader";
import { CATEGORY_CONFIG, toEventText, type CategoryKey, TAG_SLUGS_BY_CATEGORY } from "../shared/categoryConfig";
import {
  computeAdjustedPenalty,
  computeMarketAssessmentScore,
} from "../shared/marketAssessmentEngine";

type CompareMode = "single" | "average";
type TimeWindow = "24H" | "7D" | "30D";
type BaselineMode = "none" | "marketAverage" | "lastSelection";

type RadarMetric = {
  metric: string;
  [category: string]: string | number | null;
};

type RawMetricSet = {
  volatility: number;
  reactionSpeed: number;
  confidence: number;
  backtestWinRate: number;
  dataDensity: number;
  tradeCount: number;
  uniqueTraders: number;
  orderBookDepth: number;
  orderBookDepthPeak: number;
  orderBookDepthVolatility: number;
  orderBookDepthRangeLow: number;
  orderBookDepthRangeHigh: number;
  depthSampleCount: number;
  depthLatestSampleAt: string | null;
  totalVolume: number;
  marketAssessmentBaseScore: number;
  liquidityPenaltyScore: number;
  marketAssessmentScore: number;
};

type AssessmentWeights = {
  volatility: number;
  reactionSpeed: number;
  dataDensity: number;
  backtestWinRate: number;
  confidence: number;
  tradeCount: number;
  uniqueTraders: number;
  orderBookDepth: number;
  totalVolume: number;
};

type AssessmentSettings = {
  penaltySensitivity: number;
};

type PolyMarketLite = {
  outcomePrices?: string;
  clobTokenIds?: string;
  closed?: boolean;
  active?: boolean;
};

type PolyEventLite = {
  id: string;
  title: string;
  description?: string;
  volume?: number;
  tags?: { label?: string; slug?: string }[];
  markets?: PolyMarketLite[];
};

type VolatilityRatingResponse = {
  metrics?: {
    yes?: { totalVolatilityRating?: number; averageVolatilityRatingPerHour?: number };
    no?: { totalVolatilityRating?: number; averageVolatilityRatingPerHour?: number };
  };
  points?: Array<{ yesPrice?: number | null }>;
};

type PredictorsResponse = {
  uniquePredictors?: number;
  totalTrades?: number;
  totalTradeNotional?: number;
};

type DepthStatsResponse = {
  statsByEvent?: Array<{
    eventId: string;
    sampleCount: number;
    avgDepthUsd: number;
    peakDepthUsd: number;
    minDepthUsd: number;
    stdDepthUsd: number;
    rangeLowUsd: number;
    rangeHighUsd: number;
    latestDepthUsd: number;
    latestSampledAt: string;
  }>;
  seriesByEvent?: Array<{
    eventId: string;
    points: Array<{
      ts: number;
      label: string;
      depthUsd: number;
    }>;
  }>;
};

type OrderBookLevel = {
  price?: string | number;
  size?: string | number;
};

type OrderBookResponse = {
  bids?: OrderBookLevel[];
  asks?: OrderBookLevel[];
};

type DepthTrendState = {
  eventId: string;
  eventTitle: string;
  points: Array<{ ts: number; label: string; depthUsd: number }>;
};

type DepthTrendSummary = {
  startDepthUsd: number;
  endDepthUsd: number;
  slopePct: number;
  maxDrawdownPct: number;
  isDowntrend: boolean;
};

type StrategyOutcome = {
  name: string;
  thesis: string;
  expectedReturnPct: number;
  finalCapital: number;
};

type CategoryEventOption = {
  eventId: string;
  title: string;
  volume: number;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number | null;
};

type CategoryState = {
  key: CategoryKey;
  label: string;
  matchCount: number;
  options: CategoryEventOption[];
  selectedEventIds: string[];
  raw: RawMetricSet | null;
  loading: boolean;
  error?: string;
};

type NormalizedMetrics = {
  volatility: Record<CategoryKey, number | null>;
  reactionSpeed: Record<CategoryKey, number | null>;
  confidence: Record<CategoryKey, number | null>;
  backtestWinRate: Record<CategoryKey, number | null>;
  dataDensity: Record<CategoryKey, number | null>;
  tradeCount: Record<CategoryKey, number | null>;
  uniqueTraders: Record<CategoryKey, number | null>;
  orderBookDepth: Record<CategoryKey, number | null>;
  totalVolume: Record<CategoryKey, number | null>;
  marketAssessmentScore: Record<CategoryKey, number | null>;
};

const MAX_EVENT_SCAN = 350;
const MAX_OPTIONS_PER_CATEGORY = 12;
const MAX_AVERAGE_SELECTION = 5;
const RECENT_SELECTIONS_KEY = "cross-category-recent-v1";
const chartColors = {
  elonTweets: "#f97316",
  movieBoxOffice: "#22c55e",
  fedRates: "#38bdf8",
  nbaGames: "#eab308",
};

const DEFAULT_ASSESSMENT_WEIGHTS: AssessmentWeights = {
  volatility: 1,
  reactionSpeed: 1,
  dataDensity: 1,
  backtestWinRate: 1,
  confidence: 1,
  tradeCount: 1,
  uniqueTraders: 1,
  orderBookDepth: 1,
  totalVolume: 1,
};

const WEIGHT_PARAM_KEYS: Record<keyof AssessmentWeights, string> = {
  volatility: "wv",
  reactionSpeed: "wr",
  dataDensity: "wd",
  backtestWinRate: "wb",
  confidence: "wc",
  tradeCount: "wt",
  uniqueTraders: "wu",
  orderBookDepth: "wo",
  totalVolume: "wm",
};

const SETTINGS_PARAM_KEYS = {
  penaltySensitivity: "lp",
} as const;

const WEIGHT_PRESETS: Array<{ key: string; label: string; weights: AssessmentWeights }> = [
  { key: "balanced", label: "Balanced", weights: { ...DEFAULT_ASSESSMENT_WEIGHTS } },
  {
    key: "momentum",
    label: "Momentum",
    weights: {
      volatility: 0.7,
      reactionSpeed: 2.2,
      dataDensity: 1.1,
      backtestWinRate: 1.8,
      confidence: 2.1,
      tradeCount: 0.9,
      uniqueTraders: 1,
      orderBookDepth: 0.7,
      totalVolume: 1.3,
    },
  },
  {
    key: "liquidity",
    label: "Liquidity",
    weights: {
      volatility: 0.8,
      reactionSpeed: 1,
      dataDensity: 1.4,
      backtestWinRate: 1,
      confidence: 0.9,
      tradeCount: 2,
      uniqueTraders: 1.8,
      orderBookDepth: 2.4,
      totalVolume: 2,
    },
  },
  {
    key: "reversion",
    label: "Mean Reversion",
    weights: {
      volatility: 2,
      reactionSpeed: 1,
      dataDensity: 1,
      backtestWinRate: 1.5,
      confidence: 0.8,
      tradeCount: 1,
      uniqueTraders: 1,
      orderBookDepth: 1.4,
      totalVolume: 0.9,
    },
  },
];

function getDepthHealth(raw: RawMetricSet | null, timeWindow: TimeWindow) {
  const hasDepth = !!raw && ((raw.depthSampleCount > 0) || (raw.orderBookDepth > 0) || (raw.orderBookDepthPeak > 0));
  if (!hasDepth) {
    return { label: "Pending", color: "#cbd5e1", bg: "rgba(71,85,105,0.34)" };
  }

  if ((raw?.depthSampleCount ?? 0) <= 0) {
    return { label: "Live", color: "#93c5fd", bg: "rgba(30,64,175,0.28)" };
  }

  const expectedSamples = getWindowMs(timeWindow) / DEPTH_SNAPSHOT_INTERVAL_MS;
  const latestMs = raw.depthLatestSampleAt ? new Date(raw.depthLatestSampleAt).getTime() : 0;
  const ageMinutes = latestMs > 0 ? (Date.now() - latestMs) / (60 * 1000) : Number.POSITIVE_INFINITY;

  if (ageMinutes > (DEPTH_SNAPSHOT_INTERVAL_MS / (60 * 1000)) * 1.5) {
    return { label: "Stale", color: "#fcd34d", bg: "rgba(120,53,15,0.35)" };
  }
  if (raw.depthSampleCount < expectedSamples * 0.2) {
    return { label: "Sparse", color: "#fcd34d", bg: "rgba(120,53,15,0.35)" };
  }
  return { label: "Healthy", color: "#86efac", bg: "rgba(20,83,45,0.35)" };
}

function equalWeights(a: AssessmentWeights, b: AssessmentWeights): boolean {
  return (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>)
    .every((k) => Math.abs(a[k] - b[k]) < 0.0001);
}

function addSmaToTrendPoints(points: Array<{ ts: number; label: string; depthUsd: number }>, windowSize: number) {
  return points.map((p, idx) => {
    const from = Math.max(0, idx - windowSize + 1);
    const slice = points.slice(from, idx + 1);
    const avg = slice.reduce((sum, x) => sum + x.depthUsd, 0) / Math.max(1, slice.length);
    return {
      ...p,
      smaDepthUsd: Number(avg.toFixed(4)),
    };
  });
}

function summarizeDepthTrend(points: Array<{ ts: number; label: string; depthUsd: number }>): DepthTrendSummary | null {
  if (!Array.isArray(points) || points.length < 2) return null;

  const values = points.map((p) => Number(p.depthUsd)).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;

  const start = values[0];
  const end = values[values.length - 1];
  const slopePct = start > 0 ? ((end - start) / start) * 100 : 0;

  let peak = values[0];
  let maxDrawdownPct = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak <= 0) continue;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  return {
    startDepthUsd: Number(start.toFixed(4)),
    endDepthUsd: Number(end.toFixed(4)),
    slopePct: Number(slopePct.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    isDowntrend: slopePct <= -12,
  };
}

function computeLiquidityPenalty(summary: DepthTrendSummary | null): number {
  if (!summary || !summary.isDowntrend) return 0;
  const penalty = Math.abs(summary.slopePct) * 0.35 + summary.maxDrawdownPct * 0.15;
  return clamp(Number(penalty.toFixed(2)), 0, 18);
}

function getLiquidityWarningGrade(summary: DepthTrendSummary | null): {
  label: "Pending" | "Live" | "Stable" | "Watch" | "Risk" | "Critical";
  color: string;
  bg: string;
} {
  if (!summary) {
    return { label: "Pending", color: "#cbd5e1", bg: "rgba(71,85,105,0.34)" };
  }

  if (!summary.isDowntrend) {
    return { label: "Stable", color: "#86efac", bg: "rgba(20,83,45,0.35)" };
  }

  if (summary.slopePct <= -35 || summary.maxDrawdownPct >= 45) {
    return { label: "Critical", color: "#fda4af", bg: "rgba(127,29,29,0.38)" };
  }

  if (summary.slopePct <= -20 || summary.maxDrawdownPct >= 30) {
    return { label: "Risk", color: "#fca5a5", bg: "rgba(127,29,29,0.32)" };
  }

  return { label: "Watch", color: "#fcd34d", bg: "rgba(120,53,15,0.35)" };
}

function getStrategyVerdict(
  score: number | null,
  best: StrategyOutcome | null,
  worst: StrategyOutcome | null,
  depthStatus: "Pending" | "Live" | "Stable" | "Watch" | "Risk" | "Critical"
): { label: "Strong" | "Weak" | "Inverse Candidate"; color: string } {
  if (depthStatus === "Critical" || (worst?.expectedReturnPct ?? 0) <= -22 || (score ?? 0) < 42) {
    return { label: "Inverse Candidate", color: "#fca5a5" };
  }

  if ((score ?? 0) >= 70 && (best?.expectedReturnPct ?? 0) >= 10 && depthStatus !== "Risk") {
    return { label: "Strong", color: "#86efac" };
  }

  return { label: "Weak", color: "#fcd34d" };
}

function getStrategyVerdictReason(
  score: number | null,
  best: StrategyOutcome | null,
  worst: StrategyOutcome | null,
  depthStatus: "Pending" | "Live" | "Stable" | "Watch" | "Risk" | "Critical"
): string {
  if (depthStatus === "Critical") {
    return "Critical liquidity trend: treat this as a risk and possible inverse candidate until depth recovers.";
  }

  if ((worst?.expectedReturnPct ?? 0) <= -22) {
    return `Worst simulated strategy is ${formatMetric(worst?.expectedReturnPct ?? null, 2)}% expected return or worse.`;
  }

  if ((score ?? 0) < 42) {
    return `Oiyen Score ${formatMetric(score ?? null, 1)} is below the inverse-candidate threshold of 42.`;
  }

  if ((score ?? 0) >= 70 && (best?.expectedReturnPct ?? 0) >= 10 && depthStatus !== "Risk") {
    return "Strong score, best strategy clears +10% expected return, and liquidity is not flagged as risk.";
  }

  return "Mixed profile: the setup is usable for research, but the edge is not strong enough to call it strong.";
}

function parsePenaltySensitivityFromUrl(searchParams: URLSearchParams): number {
  const raw = searchParams.get(SETTINGS_PARAM_KEYS.penaltySensitivity);
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return clamp(value, 0, 3);
}

function pickActiveMarket(markets: PolyMarketLite[] | undefined): PolyMarketLite | undefined {
  if (!Array.isArray(markets) || markets.length === 0) return undefined;
  return markets.find((m) => m.active !== false && m.closed !== true) || markets.find((m) => m.closed !== true) || markets[0];
}

function parseTokenIds(market: PolyMarketLite | undefined): { yes: string; no: string } {
  if (!market?.clobTokenIds) return { yes: "", no: "" };
  try {
    const ids = JSON.parse(market.clobTokenIds);
    return {
      yes: typeof ids?.[0] === "string" ? ids[0] : "",
      no: typeof ids?.[1] === "string" ? ids[1] : "",
    };
  } catch {
    return { yes: "", no: "" };
  }
}

function parseYesPrice(market: PolyMarketLite | undefined): number | null {
  if (!market?.outcomePrices) return null;
  try {
    const prices = JSON.parse(market.outcomePrices);
    const yes = Number(prices?.[0]);
    return Number.isFinite(yes) ? yes : null;
  } catch {
    return null;
  }
}

function computeTrendConsistency(points: Array<{ yesPrice?: number | null }> | undefined): number {
  if (!Array.isArray(points) || points.length < 4) return 50;

  const series = points
    .map((p) => (typeof p.yesPrice === "number" ? p.yesPrice : null))
    .filter((v): v is number => v != null);

  if (series.length < 4) return 50;

  const directions: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const diff = series[i] - series[i - 1];
    if (Math.abs(diff) < 0.003) continue;
    directions.push(diff > 0 ? 1 : -1);
  }

  if (directions.length < 3) return 50;

  let sameDirectionCount = 0;
  for (let i = 1; i < directions.length; i += 1) {
    if (directions[i] === directions[i - 1]) sameDirectionCount += 1;
  }

  return (sameDirectionCount / (directions.length - 1)) * 100;
}

function normalizeMetricRows(
  rows: CategoryState[],
  key: Exclude<keyof RawMetricSet, "depthLatestSampleAt">
): Record<CategoryKey, number | null> {
  const usable = rows.filter((r) => r.raw != null).map((r) => ({ key: r.key, value: r.raw![key] }));
  const result: Record<CategoryKey, number | null> = {
    elonTweets: null,
    movieBoxOffice: null,
    fedRates: null,
    nbaGames: null,
  };

  if (usable.length === 0) return result;

  const values = usable.map((u) => u.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  for (const u of usable) {
    if (max === min) {
      result[u.key] = 70;
      continue;
    }
    const normalized = 35 + ((u.value - min) / (max - min)) * 60;
    result[u.key] = Math.round(Math.max(0, Math.min(100, normalized)));
  }

  return result;
}

function averageMetrics(list: RawMetricSet[]): RawMetricSet {
  const n = list.length;
  if (n === 0) {
    return {
      volatility: 0,
      reactionSpeed: 0,
      confidence: 0,
      backtestWinRate: 0,
      dataDensity: 0,
      tradeCount: 0,
      uniqueTraders: 0,
      orderBookDepth: 0,
      orderBookDepthPeak: 0,
      orderBookDepthVolatility: 0,
      orderBookDepthRangeLow: 0,
      orderBookDepthRangeHigh: 0,
      depthSampleCount: 0,
      depthLatestSampleAt: null,
      totalVolume: 0,
      marketAssessmentBaseScore: 0,
      liquidityPenaltyScore: 0,
      marketAssessmentScore: 0,
    };
  }

  return {
    volatility: list.reduce((a, b) => a + b.volatility, 0) / n,
    reactionSpeed: list.reduce((a, b) => a + b.reactionSpeed, 0) / n,
    confidence: list.reduce((a, b) => a + b.confidence, 0) / n,
    backtestWinRate: list.reduce((a, b) => a + b.backtestWinRate, 0) / n,
    dataDensity: list.reduce((a, b) => a + b.dataDensity, 0) / n,
    tradeCount: list.reduce((a, b) => a + b.tradeCount, 0) / n,
    uniqueTraders: list.reduce((a, b) => a + b.uniqueTraders, 0) / n,
    orderBookDepth: list.reduce((a, b) => a + b.orderBookDepth, 0) / n,
    orderBookDepthPeak: list.reduce((a, b) => a + b.orderBookDepthPeak, 0) / n,
    orderBookDepthVolatility: list.reduce((a, b) => a + b.orderBookDepthVolatility, 0) / n,
    orderBookDepthRangeLow: list.reduce((a, b) => a + b.orderBookDepthRangeLow, 0) / n,
    orderBookDepthRangeHigh: list.reduce((a, b) => a + b.orderBookDepthRangeHigh, 0) / n,
    depthSampleCount: list.reduce((a, b) => a + b.depthSampleCount, 0) / n,
    depthLatestSampleAt: list.reduce<string | null>((latest, curr) => {
      if (!curr.depthLatestSampleAt) return latest;
      if (!latest) return curr.depthLatestSampleAt;
      return new Date(curr.depthLatestSampleAt).getTime() > new Date(latest).getTime()
        ? curr.depthLatestSampleAt
        : latest;
    }, null),
    totalVolume: list.reduce((a, b) => a + b.totalVolume, 0) / n,
    marketAssessmentBaseScore: list.reduce((a, b) => a + b.marketAssessmentBaseScore, 0) / n,
    liquidityPenaltyScore: list.reduce((a, b) => a + b.liquidityPenaltyScore, 0) / n,
    marketAssessmentScore: list.reduce((a, b) => a + b.marketAssessmentScore, 0) / n,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toVolatilityScore(volatilityRaw: number): number {
  return clamp(Math.log1p(Math.max(0, volatilityRaw)) * 18, 0, 100);
}

function toReactionScore(reactionRaw: number): number {
  return clamp(reactionRaw * 22, 0, 100);
}

function toDensityScore(densityRaw: number): number {
  return clamp(densityRaw, 0, 100);
}

function toTradeCountScore(tradeCount: number): number {
  return clamp(Math.log1p(Math.max(0, tradeCount)) * 14, 0, 100);
}

function toUniqueTradersScore(uniqueTraders: number): number {
  return clamp(Math.log1p(Math.max(0, uniqueTraders)) * 18, 0, 100);
}

function toDepthScore(orderBookDepth: number): number {
  return clamp(Math.log1p(Math.max(0, orderBookDepth)) * 8, 0, 100);
}

function toVolumeScore(totalVolume: number): number {
  return clamp(Math.log1p(Math.max(0, totalVolume)) * 9, 0, 100);
}

function getDepthBucketMinutes(window: TimeWindow): number {
  switch (window) {
    case "24H":
      return 10;
    case "30D":
      return 180;
    case "7D":
    default:
      return 60;
  }
}

const DEPTH_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function fetchDepthStatsForEvent(
  eventId: string,
  timeWindow: TimeWindow,
  includeSeries = false,
  yesTokenId = "",
  noTokenId = ""
) {
  async function fetchLiveDepthFallback() {
    if (!yesTokenId || !noTokenId) return null;

    const computeDepth = (book: OrderBookResponse | null): number => {
      if (!book) return 0;
      const topBids = Array.isArray(book.bids) ? book.bids.slice(0, 10) : [];
      const topAsks = Array.isArray(book.asks) ? book.asks.slice(0, 10) : [];
      const sumSide = (levels: OrderBookLevel[]) =>
        levels.reduce((sum, lvl) => {
          const price = Number(lvl?.price);
          const size = Number(lvl?.size);
          if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return sum;
          return sum + price * size;
        }, 0);
      return sumSide(topBids) + sumSide(topAsks);
    };

    const fetchBook = async (tokenId: string) => {
      const res = await fetch(`/api/polymarket/orderbook?token_id=${encodeURIComponent(tokenId)}`);
      if (!res.ok) return 0;
      const data = (await res.json()) as OrderBookResponse;
      return computeDepth(data);
    };

    const [yesDepth, noDepth] = await Promise.all([fetchBook(yesTokenId), fetchBook(noTokenId)]);
    const total = Number((yesDepth + noDepth).toFixed(4));
    if (!Number.isFinite(total) || total <= 0) return null;

    const nowIso = new Date().toISOString();
    return {
      avgDepthUsd: total,
      peakDepthUsd: total,
      stdDepthUsd: 0,
      rangeLowUsd: total,
      rangeHighUsd: total,
      sampleCount: 1,
      latestSampledAt: nowIso,
      seriesPoints: [] as Array<{ ts: number; label: string; depthUsd: number }>,
    };
  }

  const hoursBack = Math.floor(getWindowMs(timeWindow) / (60 * 60 * 1000));
  const params = new URLSearchParams({
    eventIds: eventId,
    hoursBack: String(hoursBack),
    includeSeries: includeSeries ? "true" : "false",
    bucketMinutes: String(getDepthBucketMinutes(timeWindow)),
  });

  const res = await fetch(`/api/polyoiyen/depth-stats?${params.toString()}`);
  if (!res.ok) {
    const fallback = await fetchLiveDepthFallback();
    if (fallback) return fallback;
    return {
      avgDepthUsd: 0,
      peakDepthUsd: 0,
      stdDepthUsd: 0,
      rangeLowUsd: 0,
      rangeHighUsd: 0,
      sampleCount: 0,
      latestSampledAt: null,
      seriesPoints: [] as Array<{ ts: number; label: string; depthUsd: number }>,
    };
  }

  const payload = (await res.json()) as DepthStatsResponse;
  const stats = (payload.statsByEvent || [])[0];
  if (!stats || stats.avgDepthUsd <= 0) {
    const fallback = await fetchLiveDepthFallback();
    if (fallback) return fallback;
    return {
      avgDepthUsd: 0,
      peakDepthUsd: 0,
      stdDepthUsd: 0,
      rangeLowUsd: 0,
      rangeHighUsd: 0,
      sampleCount: 0,
      latestSampledAt: null,
      seriesPoints: [] as Array<{ ts: number; label: string; depthUsd: number }>,
    };
  }

  const matchedSeries = (payload.seriesByEvent || []).find((s) => s.eventId === eventId);

  return {
    avgDepthUsd: Number(stats.avgDepthUsd || 0),
    peakDepthUsd: Number(stats.peakDepthUsd || 0),
    stdDepthUsd: Number(stats.stdDepthUsd || 0),
    rangeLowUsd: Number(stats.rangeLowUsd || 0),
    rangeHighUsd: Number(stats.rangeHighUsd || 0),
    sampleCount: Number(stats.sampleCount || 0),
    latestSampledAt: typeof stats.latestSampledAt === "string" ? stats.latestSampledAt : null,
    seriesPoints: Array.isArray(matchedSeries?.points) ? matchedSeries!.points : [],
  };
}

function computeStrategyOutcomes(raw: RawMetricSet): StrategyOutcome[] {
  const initialCapital = 1000;
  const volatility = toVolatilityScore(raw.volatility);
  const reaction = toReactionScore(raw.reactionSpeed);
  const density = toDensityScore(raw.dataDensity);
  const confidence = clamp(raw.confidence, 0, 100);
  const backtest = clamp(raw.backtestWinRate, 0, 100);
  const tradeCount = toTradeCountScore(raw.tradeCount);
  const uniqueTraders = toUniqueTradersScore(raw.uniqueTraders);
  const depth = toDepthScore(raw.orderBookDepth);
  const volume = toVolumeScore(raw.totalVolume);

  const momentumEdge = 0.34 * reaction + 0.24 * confidence + 0.24 * backtest + 0.18 * density;
  const meanReversionEdge = 0.36 * volatility + 0.24 * (100 - confidence) + 0.2 * density + 0.2 * depth;
  const liquidityScalpEdge = 0.34 * depth + 0.22 * tradeCount + 0.18 * uniqueTraders + 0.14 * density + 0.12 * reaction;
  const trendSwingEdge = 0.38 * backtest + 0.22 * confidence + 0.2 * reaction + 0.2 * volume;
  const randomMartingaleEdge = 18 - 0.2 * volatility - 0.15 * confidence - 0.2 * reaction;

  const toReturnPct = (edge: number, scale: number) => clamp((edge - 50) * scale, -60, 65);

  const strategies: StrategyOutcome[] = [
    {
      name: "Momentum Breakout",
      thesis: "Performs better in fast reaction, clearer directional confidence markets.",
      expectedReturnPct: toReturnPct(momentumEdge, 0.85),
      finalCapital: 0,
    },
    {
      name: "Mean Reversion",
      thesis: "Performs better when volatility is high and conviction is not one-sided.",
      expectedReturnPct: toReturnPct(meanReversionEdge, 0.78),
      finalCapital: 0,
    },
    {
      name: "Liquidity Scalping",
      thesis: "Needs deep order book and high trading activity.",
      expectedReturnPct: toReturnPct(liquidityScalpEdge, 0.75),
      finalCapital: 0,
    },
    {
      name: "Trend Swing",
      thesis: "Benefits from consistency and higher overall market participation.",
      expectedReturnPct: toReturnPct(trendSwingEdge, 0.8),
      finalCapital: 0,
    },
    {
      name: "Blind Martingale",
      thesis: "Typically fragile in volatile, event-driven markets.",
      expectedReturnPct: toReturnPct(randomMartingaleEdge, 0.9),
      finalCapital: 0,
    },
  ];

  return strategies.map((s) => ({
    ...s,
    finalCapital: Number((initialCapital * (1 + s.expectedReturnPct / 100)).toFixed(2)),
  }));
}

function normalizeSelection(ids: string[], mode: CompareMode): string[] {
  const dedup = Array.from(new Set(ids.filter(Boolean)));
  if (mode === "single") return dedup.slice(0, 1);
  return dedup.slice(0, MAX_AVERAGE_SELECTION);
}

function buildCategoryOptions(category: { key: CategoryKey; label: string }, events: PolyEventLite[]) {
  const matched = events
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));

  const options: CategoryEventOption[] = matched
    .map((event) => {
      const market = pickActiveMarket(event.markets);
      const tokens = parseTokenIds(market);
      if (!tokens.yes || !tokens.no) return null;

      return {
        eventId: event.id,
        title: event.title,
        volume: Number(event.volume || 0),
        yesTokenId: tokens.yes,
        noTokenId: tokens.no,
        yesPrice: parseYesPrice(market),
      };
    })
    .filter((item): item is CategoryEventOption => Boolean(item))
    .slice(0, MAX_OPTIONS_PER_CATEGORY);

  return { matchCount: matched.length, options };
}

async function fetchMetricsForOption(option: CategoryEventOption, timeWindow: TimeWindow): Promise<RawMetricSet> {
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - getWindowMs(timeWindow)).toISOString();

  const attempt = async (limit: string, maxPages: string) => {
    const volParams = new URLSearchParams({
      yesAssetId: option.yesTokenId,
      noAssetId: option.noTokenId,
      startTime,
      endTime,
      bucketSeconds: "3600",
      limit,
      maxPages,
    });

    const predictorsParams = new URLSearchParams({
      assetIds: `${option.yesTokenId},${option.noTokenId}`,
      volume: String(option.volume),
      limit,
      maxPages,
    });

    const [volRes, predictorsRes, depthStats] = await Promise.all([
      fetch(`/api/polymarket/volatility-rating?${volParams.toString()}`),
      fetch(`/api/polymarket/predictors?${predictorsParams.toString()}`),
      fetchDepthStatsForEvent(option.eventId, timeWindow, false, option.yesTokenId, option.noTokenId),
    ]);

    if (!volRes.ok || !predictorsRes.ok) {
      const volText = volRes.ok ? "" : await volRes.text();
      const predText = predictorsRes.ok ? "" : await predictorsRes.text();
      throw new Error(`vol=${volRes.status} pred=${predictorsRes.status} ${volText || predText}`.trim());
    }

    const volData = (await volRes.json()) as VolatilityRatingResponse;
    const predictorsData = (await predictorsRes.json()) as PredictorsResponse;

    const orderBookDepth = depthStats.avgDepthUsd;
    const orderBookDepthPeak = depthStats.peakDepthUsd;
    const orderBookDepthVolatility = depthStats.stdDepthUsd;
    const orderBookDepthRangeLow = depthStats.rangeLowUsd;
    const orderBookDepthRangeHigh = depthStats.rangeHighUsd;

    const totalVolatility = (volData.metrics?.yes?.totalVolatilityRating || 0) + (volData.metrics?.no?.totalVolatilityRating || 0);
    const avgReaction = ((volData.metrics?.yes?.averageVolatilityRatingPerHour || 0) + (volData.metrics?.no?.averageVolatilityRatingPerHour || 0)) / 2;
    const confidence = option.yesPrice != null ? Math.abs(option.yesPrice - 0.5) * 200 : 50;
    const backtest = computeTrendConsistency(volData.points);
    const tradeCount = Number(predictorsData.totalTrades || 0);
    const uniquePredictors = Number(predictorsData.uniquePredictors || 0);
    const totalVolume = Number(predictorsData.totalTradeNotional || 0) > 0
      ? Number(predictorsData.totalTradeNotional || 0)
      : Number(option.volume || 0);
    const density = Math.log1p(tradeCount) * 10 + Math.log1p(uniquePredictors) * 18;

    const scoreParts = [
      toVolatilityScore(totalVolatility),
      toReactionScore(avgReaction),
      toDensityScore(density),
      clamp(backtest, 0, 100),
      clamp(confidence, 0, 100),
      toTradeCountScore(tradeCount),
      toUniqueTradersScore(uniquePredictors),
      toDepthScore(orderBookDepth),
      toVolumeScore(totalVolume),
    ];
    const marketAssessmentBaseScore = scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length;
    const liquidityPenaltyScore = 0;
    const marketAssessmentScore = marketAssessmentBaseScore;

    return {
      volatility: totalVolatility,
      reactionSpeed: avgReaction,
      confidence,
      backtestWinRate: backtest,
      dataDensity: density,
      tradeCount,
      uniqueTraders: uniquePredictors,
      orderBookDepth,
      orderBookDepthPeak,
      orderBookDepthVolatility,
      orderBookDepthRangeLow,
      orderBookDepthRangeHigh,
      depthSampleCount: depthStats.sampleCount,
      depthLatestSampleAt: depthStats.latestSampledAt,
      totalVolume,
      marketAssessmentBaseScore,
      liquidityPenaltyScore,
      marketAssessmentScore,
    };
  };

  try {
    return await attempt("200", "80");
  } catch {
    return attempt("120", "40");
  }
}

async function computeMetricsForSelection(
  selectedEventIds: string[],
  options: CategoryEventOption[],
  timeWindow: TimeWindow
): Promise<{ raw: RawMetricSet | null; error?: string }> {
  if (selectedEventIds.length === 0) {
    return { raw: null, error: "Please select at least one event." };
  }

  const selectedOptions = selectedEventIds
    .map((id) => options.find((o) => o.eventId === id))
    .filter((o): o is CategoryEventOption => Boolean(o));

  if (selectedOptions.length === 0) {
    return { raw: null, error: "Selected event data is unavailable." };
  }

  const settled = await Promise.allSettled(selectedOptions.map((opt) => fetchMetricsForOption(opt, timeWindow)));
  const success = settled.filter((x): x is PromiseFulfilledResult<RawMetricSet> => x.status === "fulfilled").map((x) => x.value);
  const failedCount = settled.length - success.length;

  if (success.length === 0) {
    return { raw: null, error: "Failed to load metrics for selected events." };
  }

  const raw = averageMetrics(success);
  if (failedCount > 0) {
    return { raw, error: `Partial data: ${success.length}/${settled.length} selected events succeeded.` };
  }

  return { raw };
}

function parseIdsFromUrl(searchParams: URLSearchParams, key: CategoryKey): string[] {
  const raw = searchParams.get(key) || "";
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function parseWindowFromUrl(searchParams: URLSearchParams): TimeWindow {
  const raw = (searchParams.get("window") || "7D").toUpperCase();
  if (raw === "24H") return "24H";
  if (raw === "30D") return "30D";
  return "7D";
}

function parseWeightFromUrl(searchParams: URLSearchParams): AssessmentWeights {
  const out = { ...DEFAULT_ASSESSMENT_WEIGHTS };
  (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>).forEach((key) => {
    const raw = searchParams.get(WEIGHT_PARAM_KEYS[key]);
    if (!raw) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    out[key] = clamp(v, 0, 3);
  });
  return out;
}

function getWindowMs(window: TimeWindow): number {
  switch (window) {
    case "24H":
      return 24 * 3600 * 1000;
    case "30D":
      return 30 * 24 * 3600 * 1000;
    case "7D":
    default:
      return 7 * 24 * 3600 * 1000;
  }
}

function formatMetric(value: number | null, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return value.toFixed(decimals);
}

function formatDepthVolatility(raw: RawMetricSet | null, decimals = 2): string {
  if (!raw || raw.depthSampleCount < 2) return "N/A";
  return formatMetric(raw.orderBookDepthVolatility, decimals);
}

function renderCategoryTitle(label: string) {
  if (label !== "US Federal Reserve Interest Rates") return label;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.05 }}>
      <span>US Federal Reserve</span>
      <span>Interest Rates</span>
    </span>
  );
}

function emptyCategoryRecord<T>(value: T): Record<CategoryKey, T> {
  return {
    elonTweets: value,
    movieBoxOffice: value,
    fedRates: value,
    nbaGames: value,
  };
}

function buildBaselineFromNormalized(normalized: NormalizedMetrics): Record<string, number | null> {
  const metrics = [
    { key: "Volatility", row: normalized.volatility },
    { key: "Reaction Speed", row: normalized.reactionSpeed },
    { key: "Confidence", row: normalized.confidence },
    { key: "Backtest Win Rate", row: normalized.backtestWinRate },
    { key: "Data Density", row: normalized.dataDensity },
    { key: "Market Assessment", row: normalized.marketAssessmentScore },
  ];

  const out: Record<string, number | null> = {};
  for (const m of metrics) {
    const vals = Object.values(m.row).filter((v): v is number => typeof v === "number");
    out[m.key] = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  }
  return out;
}

function toCsvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes("\"")) {
    return `"${s.replace(/\"/g, '""')}"`;
  }
  return s;
}

function downloadTextFile(fileName: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CrossCategoryEventAnalysisPage() {
  const [compareMode, setCompareMode] = useState<CompareMode>("single");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("7D");
  const [baselineMode, setBaselineMode] = useState<BaselineMode>("marketAverage");
  const [assessmentWeights, setAssessmentWeights] = useState<AssessmentWeights>(DEFAULT_ASSESSMENT_WEIGHTS);
  const [penaltySensitivity, setPenaltySensitivity] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryState[]>([]);
  const [searchByCategory, setSearchByCategory] = useState<Record<CategoryKey, string>>(emptyCategoryRecord(""));
  const [recentByCategory, setRecentByCategory] = useState<Record<CategoryKey, string[]>>(emptyCategoryRecord<string[]>([]));
  const [depthTrendByCategory, setDepthTrendByCategory] = useState<Record<CategoryKey, DepthTrendState | null>>(emptyCategoryRecord<DepthTrendState | null>(null));
  const [lastSelectionBaseline, setLastSelectionBaseline] = useState<Record<string, number | null> | null>(null);
  const [shareStatus, setShareStatus] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const modeFromUrl = searchParams.get("mode") === "avg" ? "average" : "single";
        const windowFromUrl = parseWindowFromUrl(searchParams);
        const weightsFromUrl = parseWeightFromUrl(searchParams);
        const penaltySensitivityFromUrl = parsePenaltySensitivityFromUrl(searchParams);
        setCompareMode(modeFromUrl);
        setTimeWindow(windowFromUrl);
        setAssessmentWeights(weightsFromUrl);
        setPenaltySensitivity(penaltySensitivityFromUrl);

        const categoryFetches = await Promise.all(
          CATEGORY_CONFIG.map(async (cat) => {
            const tagSlugList = TAG_SLUGS_BY_CATEGORY[cat.key] || [];
            const collected: PolyEventLite[] = [];

            // Fetch from each tag slug and collect results
            for (const tagSlug of tagSlugList) {
              const params = new URLSearchParams({
                limit: String(MAX_EVENT_SCAN / tagSlugList.length),
                offset: "0",
                tagSlug,
              });
              try {
                const res = await fetch(`/api/polymarket?${params.toString()}`, { cache: "no-store" });
                if (res.ok) {
                  const payload = await res.json();
                  const events: PolyEventLite[] = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
                  collected.push(...events);
                }
              } catch (e) {
                // ignore individual tag slug fetch errors
              }
            }

            // Deduplicate by id and sort by volume
            const dedup = new Map<string, PolyEventLite>();
            for (const e of collected) {
              if (e.id && !dedup.has(e.id)) dedup.set(e.id, e);
            }
            const sorted = Array.from(dedup.values()).sort((a, b) => (b.volume || 0) - (a.volume || 0));

            return { category: cat, events: sorted };
          })
        );

        let recentStored: Record<CategoryKey, string[]> = emptyCategoryRecord<string[]>([]);
        try {
          const raw = localStorage.getItem(RECENT_SELECTIONS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<Record<CategoryKey, string[]>>;
            recentStored = {
              elonTweets: Array.isArray(parsed.elonTweets) ? parsed.elonTweets : [],
              movieBoxOffice: Array.isArray(parsed.movieBoxOffice) ? parsed.movieBoxOffice : [],
              fedRates: Array.isArray(parsed.fedRates) ? parsed.fedRates : [],
              nbaGames: Array.isArray(parsed.nbaGames) ? parsed.nbaGames : [],
            };
          }
        } catch {
          // ignore malformed local storage
        }
        setRecentByCategory(recentStored);

        const initial = categoryFetches.map((catFetch): CategoryState => {
          const built = buildCategoryOptions(catFetch.category, catFetch.events);
          const fromUrl = parseIdsFromUrl(searchParams, catFetch.category.key);
          const validFromUrl = fromUrl.filter((id) => built.options.some((o) => o.eventId === id));
          const validRecent = (recentStored[catFetch.category.key] || []).filter((id) => built.options.some((o) => o.eventId === id));
          const selectedEventIds = validFromUrl.length > 0
            ? normalizeSelection(validFromUrl, modeFromUrl)
            : validRecent.length > 0
              ? normalizeSelection(validRecent, modeFromUrl)
              : (built.options[0] ? [built.options[0].eventId] : []);

          return {
            key: catFetch.category.key,
            label: catFetch.category.label,
            matchCount: built.matchCount,
            options: built.options,
            selectedEventIds,
            raw: null,
            loading: false,
            error: built.options.length === 0 ? "No active market with complete YES/NO token IDs in this category." : undefined,
          };
        });

        if (cancelled) return;
        setCategories(initial);

        await Promise.all(
          initial.map(async (cat) => {
            if (cat.selectedEventIds.length === 0) return;
            if (cancelled) return;

            setCategories((prev) => prev.map((p) => (p.key === cat.key ? { ...p, loading: true, error: undefined } : p)));
            const result = await computeMetricsForSelection(cat.selectedEventIds, cat.options, windowFromUrl);
            if (cancelled) return;

            setCategories((prev) => prev.map((p) => (p.key === cat.key
              ? { ...p, raw: result.raw, loading: false, error: result.error }
              : p)));
          })
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to initialize category comparison.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialized(true);
        }
      }
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const params = new URLSearchParams();
    params.set("mode", compareMode === "average" ? "avg" : "single");
    params.set("window", timeWindow);

    for (const cat of categories) {
      if (cat.selectedEventIds.length > 0) {
        params.set(cat.key, cat.selectedEventIds.join(","));
      }
    }

    (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>).forEach((key) => {
      const v = assessmentWeights[key];
      if (Math.abs(v - DEFAULT_ASSESSMENT_WEIGHTS[key]) < 0.0001) return;
      params.set(WEIGHT_PARAM_KEYS[key], String(Number(v.toFixed(2))));
    });

    if (Math.abs(penaltySensitivity - 1) >= 0.0001) {
      params.set(SETTINGS_PARAM_KEYS.penaltySensitivity, String(Number(penaltySensitivity.toFixed(2))));
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [categories, compareMode, timeWindow, assessmentWeights, penaltySensitivity, initialized]);

  useEffect(() => {
    if (!initialized || categories.length === 0) return;
    let cancelled = false;

    async function loadDepthTrends() {
      const entries = await Promise.all(
        categories.map(async (cat) => {
          const eventId = cat.selectedEventIds[0];
          if (!eventId) return [cat.key, null] as const;
          const selected = cat.options.find((o) => o.eventId === eventId);
          try {
            const depth = await fetchDepthStatsForEvent(eventId, timeWindow, true, selected?.yesTokenId || "", selected?.noTokenId || "");
            return [
              cat.key,
              {
                eventId,
                eventTitle: selected?.title || "Selected Event",
                points: depth.seriesPoints || [],
              },
            ] as const;
          } catch {
            return [cat.key, null] as const;
          }
        })
      );

      if (cancelled) return;
      const next = emptyCategoryRecord<DepthTrendState | null>(null);
      for (const [key, value] of entries) {
        next[key] = value;
      }
      setDepthTrendByCategory(next);
    }

    void loadDepthTrends();
    return () => {
      cancelled = true;
    };
  }, [categories, timeWindow, initialized]);

  async function handleSelectEvents(categoryKey: CategoryKey, eventIds: string[], options: CategoryEventOption[]) {
    setLastSelectionBaseline(buildBaselineFromNormalized(normalizedMetrics));
    const normalizedIds = normalizeSelection(eventIds, compareMode);

    setCategories((prev) =>
      prev.map((cat) =>
        cat.key === categoryKey
          ? { ...cat, selectedEventIds: normalizedIds, loading: true, error: undefined }
          : cat
      )
    );

    const result = await computeMetricsForSelection(normalizedIds, options, timeWindow);

    setRecentByCategory((prev) => {
      const merged = [...normalizedIds, ...prev[categoryKey]].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 8);
      const next = { ...prev, [categoryKey]: merged };
      localStorage.setItem(RECENT_SELECTIONS_KEY, JSON.stringify(next));
      return next;
    });

    setCategories((prev) =>
      prev.map((cat) =>
        cat.key === categoryKey
          ? { ...cat, raw: result.raw, loading: false, error: result.error }
          : cat
      )
    );
  }

  async function handleCompareModeChange(nextMode: CompareMode) {
    setLastSelectionBaseline(buildBaselineFromNormalized(normalizedMetrics));
    setCompareMode(nextMode);

    const prepared = categories.map((cat) => ({
      ...cat,
      selectedEventIds: normalizeSelection(cat.selectedEventIds, nextMode),
      loading: true,
      error: undefined,
    }));

    setCategories(prepared);

    await Promise.all(
      prepared.map(async (cat) => {
        const result = await computeMetricsForSelection(cat.selectedEventIds, cat.options, timeWindow);
        setCategories((prev) =>
          prev.map((p) =>
            p.key === cat.key
              ? { ...p, selectedEventIds: cat.selectedEventIds, raw: result.raw, loading: false, error: result.error }
              : p
          )
        );
      })
    );
  }

  async function handleTimeWindowChange(nextWindow: TimeWindow) {
    setLastSelectionBaseline(buildBaselineFromNormalized(normalizedMetrics));
    setTimeWindow(nextWindow);

    const prepared = categories.map((cat) => ({
      ...cat,
      loading: true,
      error: undefined,
    }));

    setCategories(prepared);

    await Promise.all(
      prepared.map(async (cat) => {
        const result = await computeMetricsForSelection(cat.selectedEventIds, cat.options, nextWindow);
        setCategories((prev) =>
          prev.map((p) =>
            p.key === cat.key
              ? { ...p, raw: result.raw, loading: false, error: result.error }
              : p
          )
        );
      })
    );
  }

  const categoriesWithScores = useMemo(() => {
    return categories.map((cat) => {
      if (!cat.raw) return cat;

      const trendSummary = summarizeDepthTrend(depthTrendByCategory[cat.key]?.points || []);
      const marketAssessmentBaseScore = computeMarketAssessmentScore(cat.raw, assessmentWeights);
      const liquidityPenaltyScore = computeAdjustedPenalty(trendSummary, penaltySensitivity);
      const marketAssessmentScore = clamp(marketAssessmentBaseScore - liquidityPenaltyScore, 0, 100);

      return {
        ...cat,
        raw: {
          ...cat.raw,
          marketAssessmentBaseScore,
          liquidityPenaltyScore,
          marketAssessmentScore,
        },
      };
    });
  }, [categories, assessmentWeights, depthTrendByCategory, penaltySensitivity]);

  const normalizedMetrics = useMemo<NormalizedMetrics>(() => {
    return {
      volatility: normalizeMetricRows(categoriesWithScores, "volatility"),
      reactionSpeed: normalizeMetricRows(categoriesWithScores, "reactionSpeed"),
      confidence: normalizeMetricRows(categoriesWithScores, "confidence"),
      backtestWinRate: normalizeMetricRows(categoriesWithScores, "backtestWinRate"),
      dataDensity: normalizeMetricRows(categoriesWithScores, "dataDensity"),
      tradeCount: normalizeMetricRows(categoriesWithScores, "tradeCount"),
      uniqueTraders: normalizeMetricRows(categoriesWithScores, "uniqueTraders"),
      orderBookDepth: normalizeMetricRows(categoriesWithScores, "orderBookDepth"),
      totalVolume: normalizeMetricRows(categoriesWithScores, "totalVolume"),
      marketAssessmentScore: normalizeMetricRows(categoriesWithScores, "marketAssessmentScore"),
    };
  }, [categoriesWithScores]);

  const strategyByCategory = useMemo(() => {
    const out: Record<CategoryKey, StrategyOutcome[]> = {
      elonTweets: [],
      movieBoxOffice: [],
      fedRates: [],
      nbaGames: [],
    };

    for (const cat of categoriesWithScores) {
      out[cat.key] = cat.raw ? computeStrategyOutcomes(cat.raw) : [];
    }

    return out;
  }, [categoriesWithScores]);

  const depthTrendSummaryByCategory = useMemo(() => {
    const out: Record<CategoryKey, DepthTrendSummary | null> = {
      elonTweets: null,
      movieBoxOffice: null,
      fedRates: null,
      nbaGames: null,
    };

    (Object.keys(out) as CategoryKey[]).forEach((key) => {
      const trend = depthTrendByCategory[key];
      out[key] = trend ? summarizeDepthTrend(trend.points) : null;
    });

    return out;
  }, [depthTrendByCategory]);

  const strategyOverview = useMemo(() => {
    return categoriesWithScores.map((cat) => {
      const strategies = strategyByCategory[cat.key] || [];
      const sorted = [...strategies].sort((a, b) => b.expectedReturnPct - a.expectedReturnPct);
      const trendSummary = depthTrendSummaryByCategory[cat.key];
      const hasDepth = !!cat.raw && ((cat.raw.depthSampleCount > 0) || (cat.raw.orderBookDepth > 0) || (cat.raw.orderBookDepthPeak > 0));
      const depthStatus: "Pending" | "Live" | "Stable" | "Watch" | "Risk" | "Critical" = !hasDepth
        ? "Pending"
        : (cat.raw?.depthSampleCount ?? 0) <= 0
          ? "Live"
          : getLiquidityWarningGrade(trendSummary).label;
      const best = sorted[0] || null;
      const worst = sorted.length > 0 ? sorted[sorted.length - 1] : null;
      const verdict = getStrategyVerdict(cat.raw?.marketAssessmentScore ?? null, best, worst, depthStatus);
      const verdictReason = getStrategyVerdictReason(cat.raw?.marketAssessmentScore ?? null, best, worst, depthStatus);

      return {
        key: cat.key,
        label: cat.label,
        score: cat.raw?.marketAssessmentScore ?? null,
        depthStatus,
        best,
        worst,
        verdict,
        verdictReason,
      };
    });
  }, [categoriesWithScores, strategyByCategory, depthTrendSummaryByCategory]);

  const radarData = useMemo<RadarMetric[]>(() => {
    if (categoriesWithScores.length === 0) {
      return [
        { metric: "Volatility", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Reaction Speed", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Confidence", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Backtest Win Rate", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Data Density", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Market Assessment", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
      ];
    }

    const marketAvgBaseline = buildBaselineFromNormalized(normalizedMetrics);

    return [
      { metric: "Volatility", ...normalizedMetrics.volatility },
      { metric: "Reaction Speed", ...normalizedMetrics.reactionSpeed },
      { metric: "Confidence", ...normalizedMetrics.confidence },
      { metric: "Backtest Win Rate", ...normalizedMetrics.backtestWinRate },
      { metric: "Data Density", ...normalizedMetrics.dataDensity },
      { metric: "Market Assessment", ...normalizedMetrics.marketAssessmentScore },
    ].map((row) => {
      const baselineValue = baselineMode === "none"
        ? null
        : baselineMode === "marketAverage"
          ? marketAvgBaseline[row.metric]
          : (lastSelectionBaseline?.[row.metric] ?? null);
      return { ...row, baseline: baselineValue };
    });
  }, [categoriesWithScores, normalizedMetrics, baselineMode, lastSelectionBaseline]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [categoriesWithScores, compareMode, timeWindow, baselineMode, assessmentWeights, penaltySensitivity, depthTrendSummaryByCategory]);

  function buildDiscordMessage() {
    const lines: string[] = [];
    lines.push("Cross-Category Spider Chart");
    lines.push(`Mode: ${compareMode}`);
    lines.push(`Window: ${timeWindow}`);
    lines.push(`Baseline: ${baselineMode}`);
    lines.push("");

    for (const cat of categoriesWithScores) {
      const selectedTitles = cat.options
        .filter((o) => cat.selectedEventIds.includes(o.eventId))
        .map((o) => o.title);
      lines.push(`${cat.label}: ${selectedTitles.length > 0 ? selectedTitles.join(" | ") : "none"}`);
    }

    lines.push("");
    if (shareUrl) lines.push(`Link: ${shareUrl}`);
    return lines.join("\n");
  }

  function handleExportCsv() {
    const headers = [
      "Category",
      "Selected Events",
      "Raw Volatility",
      "Norm Volatility",
      "Raw Reaction Speed",
      "Norm Reaction Speed",
      "Raw Confidence",
      "Norm Confidence",
      "Raw Backtest Win Rate",
      "Norm Backtest Win Rate",
      "Raw Data Density",
      "Norm Data Density",
      "Raw Trade Count",
      "Norm Trade Count",
      "Raw Unique Traders",
      "Norm Unique Traders",
      "Raw Order Book Depth (USD)",
      "Norm Order Book Depth",
      "Raw Order Book Depth Peak (USD)",
      "Raw Order Book Depth Volatility (STD)",
      "Raw Order Book Depth Range Low (USD)",
      "Raw Order Book Depth Range High (USD)",
      "Depth Sample Count",
      "Depth Latest Sample ISO",
      "Depth Trend Start (USD)",
      "Depth Trend End (USD)",
      "Depth Trend Slope %",
      "Depth Trend Max Drawdown %",
      "Depth Trend Warning",
      "Raw Total Volume",
      "Norm Total Volume",
      "Raw Market Assessment Base",
      "Raw Liquidity Penalty",
      "Raw Market Assessment",
      "Norm Market Assessment",
    ];

    const rows = categoriesWithScores.map((cat) => {
      const selectedTitles = cat.options
        .filter((o) => cat.selectedEventIds.includes(o.eventId))
        .map((o) => o.title)
        .join(" | ");

      return [
        cat.label,
        selectedTitles,
        cat.raw?.volatility ?? null,
        normalizedMetrics.volatility[cat.key],
        cat.raw?.reactionSpeed ?? null,
        normalizedMetrics.reactionSpeed[cat.key],
        cat.raw?.confidence ?? null,
        normalizedMetrics.confidence[cat.key],
        cat.raw?.backtestWinRate ?? null,
        normalizedMetrics.backtestWinRate[cat.key],
        cat.raw?.dataDensity ?? null,
        normalizedMetrics.dataDensity[cat.key],
        cat.raw?.tradeCount ?? null,
        normalizedMetrics.tradeCount[cat.key],
        cat.raw?.uniqueTraders ?? null,
        normalizedMetrics.uniqueTraders[cat.key],
        cat.raw?.orderBookDepth ?? null,
        normalizedMetrics.orderBookDepth[cat.key],
        cat.raw?.orderBookDepthPeak ?? null,
        cat.raw?.orderBookDepthVolatility ?? null,
        cat.raw?.orderBookDepthRangeLow ?? null,
        cat.raw?.orderBookDepthRangeHigh ?? null,
        cat.raw?.depthSampleCount ?? null,
        cat.raw?.depthLatestSampleAt ?? null,
        depthTrendSummaryByCategory[cat.key]?.startDepthUsd ?? null,
        depthTrendSummaryByCategory[cat.key]?.endDepthUsd ?? null,
        depthTrendSummaryByCategory[cat.key]?.slopePct ?? null,
        depthTrendSummaryByCategory[cat.key]?.maxDrawdownPct ?? null,
        getLiquidityWarningGrade(depthTrendSummaryByCategory[cat.key]).label,
        cat.raw?.totalVolume ?? null,
        normalizedMetrics.totalVolume[cat.key],
        cat.raw?.marketAssessmentBaseScore ?? null,
        cat.raw?.liquidityPenaltyScore ?? null,
        cat.raw?.marketAssessmentScore ?? null,
        normalizedMetrics.marketAssessmentScore[cat.key],
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell as string | number | null)).join(","))
      .join("\n");

    downloadTextFile("cross-category-metrics.csv", csv, "text/csv;charset=utf-8");
    setShareStatus("CSV exported.");
  }

  function handleExportJson() {
    const payload = {
      mode: compareMode,
      window: timeWindow,
      baseline: baselineMode,
      generatedAt: new Date().toISOString(),
      url: shareUrl,
      categories: categoriesWithScores.map((cat) => ({
        key: cat.key,
        label: cat.label,
        selectedEventIds: cat.selectedEventIds,
        selectedTitles: cat.options.filter((o) => cat.selectedEventIds.includes(o.eventId)).map((o) => o.title),
        raw: cat.raw,
        marketAssessmentScoreBreakdown: {
          baseScore: cat.raw?.marketAssessmentBaseScore ?? null,
          liquidityPenalty: cat.raw?.liquidityPenaltyScore ?? null,
          finalScore: cat.raw?.marketAssessmentScore ?? null,
        },
        depthWindowStats: {
          average: cat.raw?.orderBookDepth ?? null,
          peak: cat.raw?.orderBookDepthPeak ?? null,
          volatilityStd: cat.raw?.orderBookDepthVolatility ?? null,
          rangeLow: cat.raw?.orderBookDepthRangeLow ?? null,
          rangeHigh: cat.raw?.orderBookDepthRangeHigh ?? null,
          sampleCount: cat.raw?.depthSampleCount ?? null,
          latestSampleAt: cat.raw?.depthLatestSampleAt ?? null,
        },
        depthTrendSummary: depthTrendSummaryByCategory[cat.key],
        normalized: {
          volatility: normalizedMetrics.volatility[cat.key],
          reactionSpeed: normalizedMetrics.reactionSpeed[cat.key],
          confidence: normalizedMetrics.confidence[cat.key],
          backtestWinRate: normalizedMetrics.backtestWinRate[cat.key],
          dataDensity: normalizedMetrics.dataDensity[cat.key],
            tradeCount: normalizedMetrics.tradeCount[cat.key],
            uniqueTraders: normalizedMetrics.uniqueTraders[cat.key],
            orderBookDepth: normalizedMetrics.orderBookDepth[cat.key],
            totalVolume: normalizedMetrics.totalVolume[cat.key],
            marketAssessmentScore: normalizedMetrics.marketAssessmentScore[cat.key],
        },
          strategies: strategyByCategory[cat.key],
      })),
    };

    downloadTextFile("cross-category-metrics.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setShareStatus("JSON exported.");
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Share link copied.");
    } catch {
      setShareStatus("Unable to copy link automatically.");
    }
  }

  function buildShareConfigMessage() {
    const lines: string[] = [];
    lines.push("Cross-Category Analysis Config");
    lines.push(`Mode: ${compareMode}`);
    lines.push(`Window: ${timeWindow}`);
    lines.push(`Baseline: ${baselineMode}`);
    lines.push(`Penalty Sensitivity: ${penaltySensitivity.toFixed(2)}x`);
    lines.push("Weights:");
    (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>).forEach((key) => {
      lines.push(`- ${key}: ${assessmentWeights[key].toFixed(2)}`);
    });
    lines.push("");
    lines.push("Selections:");
    for (const cat of categoriesWithScores) {
      const selectedTitles = cat.options
        .filter((o) => cat.selectedEventIds.includes(o.eventId))
        .map((o) => o.title);
      lines.push(`- ${cat.label}: ${selectedTitles.length > 0 ? selectedTitles.join(" | ") : "none"}`);
    }
    lines.push("");
    if (shareUrl) lines.push(`Link: ${shareUrl}`);
    return lines.join("\n");
  }

  function buildShareSummaryMessage() {
    const ranked = [...categoriesWithScores].sort((a, b) => (b.raw?.marketAssessmentScore ?? 0) - (a.raw?.marketAssessmentScore ?? 0));
    const lines: string[] = [];
    lines.push("Cross-Category Analysis Summary");
    lines.push(`Mode: ${compareMode} | Window: ${timeWindow} | Baseline: ${baselineMode}`);
    lines.push(`Penalty Sensitivity: ${penaltySensitivity.toFixed(2)}x`);
    lines.push("Top Markets:");
    ranked.slice(0, 5).forEach((cat, idx) => {
      const grade = getLiquidityWarningGrade(depthTrendSummaryByCategory[cat.key]);
      const hasDepth = !!cat.raw && ((cat.raw.depthSampleCount > 0) || (cat.raw.orderBookDepth > 0) || (cat.raw.orderBookDepthPeak > 0));
      const depthStatus = !hasDepth ? "Pending" : (cat.raw?.depthSampleCount ?? 0) <= 0 ? "Live" : grade.label;
      lines.push(`${idx + 1}. ${cat.label} - Score ${formatMetric(cat.raw?.marketAssessmentScore ?? null, 1)} - ${depthStatus}`);
    });
    if (shareUrl) lines.push(`Link: ${shareUrl}`);
    return lines.join("\n");
  }

  function buildStrategyReportMessage() {
    const lines: string[] = [];
    lines.push("Cross-Category Strategy Report");
    lines.push(`Mode: ${compareMode} | Window: ${timeWindow} | Baseline: ${baselineMode}`);
    lines.push(`Penalty Sensitivity: ${penaltySensitivity.toFixed(2)}x`);
    lines.push("");

    const ranked = [...strategyOverview].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    ranked.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.label}`);
      lines.push(`   Score: ${formatMetric(item.score, 1)} | Depth: ${item.depthStatus} | Verdict: ${item.verdict.label}`);
      lines.push(`   Best: ${item.best ? `${item.best.name} (${item.best.expectedReturnPct >= 0 ? "+" : ""}${item.best.expectedReturnPct.toFixed(2)}%, $${item.best.finalCapital.toFixed(2)})` : "N/A"}`);
      lines.push(`   Worst: ${item.worst ? `${item.worst.name} (${item.worst.expectedReturnPct >= 0 ? "+" : ""}${item.worst.expectedReturnPct.toFixed(2)}%, $${item.worst.finalCapital.toFixed(2)})` : "N/A"}`);
      lines.push("");
    });

    if (shareUrl) lines.push(`Link: ${shareUrl}`);
    return lines.join("\n");
  }

  async function handleCopyShareConfig() {
    try {
      await navigator.clipboard.writeText(buildShareConfigMessage());
      setShareStatus("Share config copied.");
    } catch {
      setShareStatus("Unable to copy share config.");
    }
  }

  async function handleCopyShareSummary() {
    try {
      await navigator.clipboard.writeText(buildShareSummaryMessage());
      setShareStatus("Share summary copied.");
    } catch {
      setShareStatus("Unable to copy share summary.");
    }
  }

  async function handleCopyStrategyReport() {
    try {
      await navigator.clipboard.writeText(buildStrategyReportMessage());
      setShareStatus("Strategy report copied.");
    } catch {
      setShareStatus("Unable to copy strategy report.");
    }
  }

  async function handleShareToDiscord() {
    const message = buildShareSummaryMessage();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Cross-Category Analysis Summary",
          text: message,
          url: shareUrl,
        });
        setShareStatus("Share sent.");
        return;
      }
    } catch {
      // fall through to clipboard + open discord
    }

    try {
      await navigator.clipboard.writeText(message);
      window.open("https://discord.com/channels/@me", "_blank", "noopener,noreferrer");
      setShareStatus("Discord message copied. Paste it in Discord.");
    } catch {
      setShareStatus("Unable to auto-share. Copy link manually and paste in Discord.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2a1707 0%, #130902 38%, #0c0602 100%)",
        color: "#f5f5f4",
      }}
    >
      <PolyHeader active="Market" />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 54px" }}>
        <section style={{ marginBottom: 20 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(24px, 3vw, 38px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#fff7ed",
            }}
          >
            Cross-Category Spider Chart
          </h1>
          <p style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.65 }}>
            URL now stores your selections. You can choose one event per category, or enable Compare N events average mode.
          </p>
        </section>

        <section
          style={{
            marginBottom: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            padding: "10px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Market Assessment Weights</span>
            <button
              onClick={() => setAssessmentWeights(DEFAULT_ASSESSMENT_WEIGHTS)}
              style={{
                padding: "5px 9px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Reset Weights
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {WEIGHT_PRESETS.map((preset) => {
              const active = equalWeights(assessmentWeights, preset.weights);
              return (
                <button
                  key={`preset-${preset.key}`}
                  onClick={() => setAssessmentWeights({ ...preset.weights })}
                  style={{
                    padding: "5px 9px",
                    borderRadius: 999,
                    border: active ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.2)",
                    background: active ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.05)",
                    color: active ? "#fde68a" : "#fff",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {(Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>).map((key) => (
              <label key={`weight-${key}`} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{key}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={assessmentWeights[key]}
                    onChange={(e) => {
                      const v = clamp(Number(e.target.value), 0, 3);
                      setAssessmentWeights((prev) => ({ ...prev, [key]: v }));
                    }}
                    style={{ width: "100%" }}
                  />
                  <span style={{ width: 36, textAlign: "right", fontSize: 11, color: "#fde68a" }}>{assessmentWeights[key].toFixed(1)}</span>
                </div>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Liquidity Penalty Sensitivity</span>
              <span style={{ fontSize: 11, color: "#fde68a" }}>{penaltySensitivity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={penaltySensitivity}
              onChange={(e) => setPenaltySensitivity(clamp(Number(e.target.value), 0, 3))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
              Higher values make downtrending depth reduce the final score more aggressively.
            </div>
          </div>
        </section>

        <section
          style={{
            marginBottom: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Comparison Mode</span>
          <button
            onClick={() => handleCompareModeChange("single")}
            disabled={compareMode === "single"}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: compareMode === "single" ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(255,255,255,0.2)",
              background: compareMode === "single" ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: compareMode === "single" ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            Single Event
          </button>
          <button
            onClick={() => handleCompareModeChange("average")}
            disabled={compareMode === "average"}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: compareMode === "average" ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.2)",
              background: compareMode === "average" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: compareMode === "average" ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            Compare N Events Average
          </button>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            In average mode, each category can select up to {MAX_AVERAGE_SELECTION} events.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Time Window</span>
            {(["24H", "7D", "30D"] as TimeWindow[]).map((w) => (
              <button
                key={w}
                onClick={() => handleTimeWindowChange(w)}
                disabled={timeWindow === w}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: timeWindow === w ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.2)",
                  background: timeWindow === w ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  cursor: timeWindow === w ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {w}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Baseline</span>
            {([
              { k: "none", label: "None" },
              { k: "marketAverage", label: "Market Average" },
              { k: "lastSelection", label: "Last Selection" },
            ] as Array<{ k: BaselineMode; label: string }>).map((b) => (
              <button
                key={b.k}
                onClick={() => setBaselineMode(b.k)}
                disabled={baselineMode === b.k}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: baselineMode === b.k ? "1px solid rgba(196,181,253,0.6)" : "1px solid rgba(255,255,255,0.2)",
                  background: baselineMode === b.k ? "rgba(196,181,253,0.16)" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  cursor: baselineMode === b.k ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>

        <section
          style={{
            marginBottom: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Export & Share</span>
          <button
            onClick={handleExportCsv}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Export CSV
          </button>
          <button
            onClick={handleExportJson}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Export JSON
          </button>
          <button
            onClick={handleCopyShareLink}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Copy Share Link
          </button>
          <button
            onClick={handleCopyShareSummary}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(59,130,246,0.45)",
              background: "rgba(59,130,246,0.12)",
              color: "#dbeafe",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Copy Share Summary
          </button>
          <button
            onClick={handleCopyStrategyReport}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(34,197,94,0.45)",
              background: "rgba(34,197,94,0.12)",
              color: "#bbf7d0",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Copy Strategy Report
          </button>
          <button
            onClick={handleCopyShareConfig}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(251,191,36,0.45)",
              background: "rgba(251,191,36,0.12)",
              color: "#fde68a",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Copy Share Config
          </button>
          <button
            onClick={handleShareToDiscord}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(88,101,242,0.6)",
              background: "rgba(88,101,242,0.18)",
              color: "#e0e7ff",
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <img
              src="/images/discord-logo.svg"
              alt="Discord"
              style={{ height: 14, width: "auto", display: "block" }}
            />
          </button>
          {shareStatus && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>{shareStatus}</span>}
        </section>

        {loading && (
          <div
            style={{
              marginBottom: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              padding: "10px 12px",
              fontSize: 13,
              color: "rgba(255,255,255,0.8)",
            }}
          >
            Loading category events and computing metrics...
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 14,
              border: "1px solid rgba(248,113,113,0.42)",
              borderRadius: 12,
              background: "rgba(127,29,29,0.34)",
              padding: "10px 12px",
              fontSize: 13,
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            background: "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
            padding: "16px 10px 10px",
          }}
        >
          <div style={{ width: "100%", height: 560 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,0.18)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: "rgba(255,255,255,0.86)", fontSize: 13, fontWeight: 700 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                  axisLine={false}
                  tickCount={6}
                />
                <Tooltip
                  formatter={(value) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (value == null || Number.isNaN(n)) return ["N/A", "Score"];
                    return [`${n} / 100`, "Score"];
                  }}
                  contentStyle={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    background: "rgba(20,10,3,0.92)",
                    color: "#fff",
                  }}
                />
                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }} />

                <Radar
                  name="Elon Tweets"
                  dataKey="elonTweets"
                  stroke={chartColors.elonTweets}
                  fill={chartColors.elonTweets}
                  fillOpacity={0.14}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Radar
                  name="Movie Box Office"
                  dataKey="movieBoxOffice"
                  stroke={chartColors.movieBoxOffice}
                  fill={chartColors.movieBoxOffice}
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Radar
                  name="US Federal Reserve Interest Rates"
                  dataKey="fedRates"
                  stroke={chartColors.fedRates}
                  fill={chartColors.fedRates}
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Radar
                  name="NBA Basketball games"
                  dataKey="nbaGames"
                  stroke={chartColors.nbaGames}
                  fill={chartColors.nbaGames}
                  fillOpacity={0.12}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                {baselineMode !== "none" && (
                  <Radar
                    name={baselineMode === "marketAverage" ? "Market Average Baseline" : "Last Selection Baseline"}
                    dataKey="baseline"
                    stroke="#c4b5fd"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 2 }}
                  />
                )}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {categories.length > 0 && (
          <section
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 10,
            }}
          >
            {categoriesWithScores.map((cat) => {
              const search = searchByCategory[cat.key] || "";
              const filteredOptions = cat.options.filter((o) => o.title.toLowerCase().includes(search.toLowerCase()));
              const selectedTitles = cat.options
                .filter((o) => cat.selectedEventIds.includes(o.eventId))
                .map((o) => o.title);
              const recentIds = recentByCategory[cat.key] || [];
              const recentOptions = recentIds
                .map((id) => cat.options.find((o) => o.eventId === id))
                .filter((o): o is CategoryEventOption => Boolean(o));

              return (
                <div
                  key={cat.key}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{renderCategoryTitle(cat.label)}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Matched events: {cat.matchCount}</div>

                  {cat.options.length > 0 ? (
                    <>
                      <input
                        value={search}
                        onChange={(e) => setSearchByCategory((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                        placeholder="Search event name..."
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "rgba(17,24,39,0.5)",
                          color: "#f8fafc",
                          fontSize: 12,
                        }}
                      />

                      {recentOptions.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {recentOptions.slice(0, 4).map((opt) => (
                            <button
                              key={`${cat.key}-recent-${opt.eventId}`}
                              onClick={() => {
                                const nextIds = compareMode === "single"
                                  ? [opt.eventId]
                                  : normalizeSelection([...cat.selectedEventIds, opt.eventId], compareMode);
                                handleSelectEvents(cat.key, nextIds, cat.options);
                              }}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(52,211,153,0.35)",
                                background: "rgba(16,185,129,0.12)",
                                color: "#d1fae5",
                                fontSize: 10,
                                cursor: "pointer",
                              }}
                              title={opt.title}
                            >
                              Recent: {opt.title.slice(0, 26)}{opt.title.length > 26 ? "..." : ""}
                            </button>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                        {compareMode === "single" ? "Select event to compare:" : `Select up to ${MAX_AVERAGE_SELECTION} events:`}
                      </div>

                      {compareMode === "single" ? (
                        <select
                          value={cat.selectedEventIds[0] || ""}
                          onChange={(e) => handleSelectEvents(cat.key, [e.target.value], cat.options)}
                          style={{
                            width: "100%",
                            marginTop: 6,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(17,24,39,0.85)",
                            color: "#f8fafc",
                            fontSize: 12,
                          }}
                        >
                          {filteredOptions.map((opt) => (
                            <option key={opt.eventId} value={opt.eventId}>
                              {opt.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                            <button
                              onClick={() => handleSelectEvents(cat.key, filteredOptions.map((o) => o.eventId), cat.options)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                border: "1px solid rgba(59,130,246,0.4)",
                                background: "rgba(59,130,246,0.15)",
                                color: "#dbeafe",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Select All (Filtered)
                            </button>
                            <button
                              onClick={() => handleSelectEvents(cat.key, [], cat.options)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                border: "1px solid rgba(248,113,113,0.35)",
                                background: "rgba(248,113,113,0.12)",
                                color: "#fecaca",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Clear
                            </button>
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.2)",
                              background: "rgba(17,24,39,0.55)",
                              maxHeight: 180,
                              overflow: "auto",
                              padding: "6px 8px",
                              display: "grid",
                              gap: 6,
                            }}
                          >
                          {filteredOptions.map((opt) => {
                            const checked = cat.selectedEventIds.includes(opt.eventId);
                            return (
                              <label
                                key={opt.eventId}
                                style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? cat.selectedEventIds.filter((id) => id !== opt.eventId)
                                      : [...cat.selectedEventIds, opt.eventId];
                                    handleSelectEvents(cat.key, next, cat.options);
                                  }}
                                  style={{ marginTop: 1 }}
                                />
                                <span style={{ fontSize: 12, color: "#f8fafc", lineHeight: 1.3 }}>{opt.title}</span>
                              </label>
                            );
                          })}
                          </div>
                        </>
                      )}

                      <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                        Selected: {selectedTitles.length > 0 ? selectedTitles.join(" | ") : "none"}
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>No selectable events found in this category.</div>
                  )}

                  {cat.loading && <div style={{ marginTop: 6, fontSize: 11, color: "#fde68a" }}>Refreshing metrics...</div>}
                  {cat.error && <div style={{ marginTop: 6, fontSize: 11, color: "#fecaca" }}>{cat.error}</div>}
                </div>
              );
            })}
          </section>
        )}

        {categories.length > 0 && (
          <section
            style={{
              marginTop: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Metric Explainability (Raw vs Normalized)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
              {categoriesWithScores.map((cat) => {
                const health = getDepthHealth(cat.raw, timeWindow);
                return (
                <div
                  key={`${cat.key}-explain`}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "10px",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{renderCategoryTitle(cat.label)}</div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: health.color,
                        background: health.bg,
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 999,
                        padding: "2px 8px",
                      }}
                    >
                      Depth {health.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                    <div>Volatility: raw {formatMetric(cat.raw?.volatility ?? null)} | norm {formatMetric(normalizedMetrics.volatility[cat.key], 0)}</div>
                    <div>Reaction Speed: raw {formatMetric(cat.raw?.reactionSpeed ?? null)} | norm {formatMetric(normalizedMetrics.reactionSpeed[cat.key], 0)}</div>
                    <div>Confidence: raw {formatMetric(cat.raw?.confidence ?? null)} | norm {formatMetric(normalizedMetrics.confidence[cat.key], 0)}</div>
                    <div>Backtest Win Rate: raw {formatMetric(cat.raw?.backtestWinRate ?? null)} | norm {formatMetric(normalizedMetrics.backtestWinRate[cat.key], 0)}</div>
                    <div>Data Density: raw {formatMetric(cat.raw?.dataDensity ?? null)} | norm {formatMetric(normalizedMetrics.dataDensity[cat.key], 0)}</div>
                    <div>Trades: raw {formatMetric(cat.raw?.tradeCount ?? null)} | norm {formatMetric(normalizedMetrics.tradeCount[cat.key], 0)}</div>
                    <div>Unique Traders: raw {formatMetric(cat.raw?.uniqueTraders ?? null)} | norm {formatMetric(normalizedMetrics.uniqueTraders[cat.key], 0)}</div>
                    <div>Order Book Depth Avg (USD): raw {formatMetric(cat.raw?.orderBookDepth ?? null)} | norm {formatMetric(normalizedMetrics.orderBookDepth[cat.key], 0)}</div>
                    <div>Order Book Depth Peak (USD): {formatMetric(cat.raw?.orderBookDepthPeak ?? null)}</div>
                    <div>Order Book Depth Volatility (STD): {formatDepthVolatility(cat.raw)}</div>
                    <div>Order Book Depth Range (USD): {formatMetric(cat.raw?.orderBookDepthRangeLow ?? null)} - {formatMetric(cat.raw?.orderBookDepthRangeHigh ?? null)}</div>
                    <div>Depth Samples in Window: {formatMetric(cat.raw?.depthSampleCount ?? null, 0)}</div>
                    <div>Depth Latest Sample: {cat.raw?.depthLatestSampleAt ? new Date(cat.raw.depthLatestSampleAt).toLocaleString() : "N/A"}</div>
                    <div>Total Volume (USD): raw {formatMetric(cat.raw?.totalVolume ?? null)} | norm {formatMetric(normalizedMetrics.totalVolume[cat.key], 0)}</div>
                    <div>Market Assessment Base: {formatMetric(cat.raw?.marketAssessmentBaseScore ?? null, 2)}</div>
                    <div>Liquidity Penalty: -{formatMetric(cat.raw?.liquidityPenaltyScore ?? null, 2)}</div>
                    <div>Market Assessment Score: raw {formatMetric(cat.raw?.marketAssessmentScore ?? null)} | norm {formatMetric(normalizedMetrics.marketAssessmentScore[cat.key], 0)}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {categories.length > 0 && (
          <section
            style={{
              marginTop: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              Market Assessment & Strategy Simulation ($1,000 start)
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.66)", marginBottom: 10 }}>
              Order book depth now uses persisted daily snapshots so it works on Hobby. Score uses depth average in the selected window, while panel shows peak and volatility range.
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.64)", marginBottom: 12, lineHeight: 1.5 }}>
              Inverse Candidate means the long-side profile is weak because the Oiyen Score is below threshold, the downside strategy is deeply negative, or liquidity is fragile. If the same setup keeps producing large losses, it can be a valid opposite-direction research candidate after separate validation.
            </div>

            {strategyOverview.length > 0 && (
              <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                {strategyOverview.map((item) => (
                  <div
                    key={`${item.key}-summary`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.16)",
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{renderCategoryTitle(item.label)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap", flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: item.depthStatus === "Pending" ? "#cbd5e1" : "#86efac", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {item.depthStatus}
                        </span>
                        <span style={{ fontSize: 10, color: item.verdict.color, fontWeight: 800, whiteSpace: "nowrap" }}>
                          {item.verdict.label}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                      <div>Score: {formatMetric(item.score, 1)}</div>
                      <div>
                        Best: {item.best ? `${item.best.name} (${item.best.expectedReturnPct >= 0 ? "+" : ""}${item.best.expectedReturnPct.toFixed(2)}%, $${item.best.finalCapital.toFixed(2)})` : "N/A"}
                      </div>
                      <div>
                        Worst: {item.worst ? `${item.worst.name} (${item.worst.expectedReturnPct >= 0 ? "+" : ""}${item.worst.expectedReturnPct.toFixed(2)}%, $${item.worst.finalCapital.toFixed(2)})` : "N/A"}
                      </div>
                      <div style={{ color: item.verdict.label === "Inverse Candidate" ? "#fecaca" : "rgba(255,255,255,0.64)" }}>
                        Why: {item.verdictReason}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
              {categoriesWithScores.map((cat) => {
                const health = getDepthHealth(cat.raw, timeWindow);
                const strategies = strategyByCategory[cat.key] || [];
                const sorted = [...strategies].sort((a, b) => b.expectedReturnPct - a.expectedReturnPct);
                const best = sorted.slice(0, 2);
                const worst = sorted.slice(-2).reverse();
                const trend = depthTrendByCategory[cat.key];
                const trendSummary = depthTrendSummaryByCategory[cat.key];
                const liquidityGrade = getLiquidityWarningGrade(trendSummary);
                const hasDepth = !!cat.raw && ((cat.raw.depthSampleCount > 0) || (cat.raw.orderBookDepth > 0) || (cat.raw.orderBookDepthPeak > 0));
                const depthStatusLabel = !hasDepth ? "Pending" : (cat.raw?.depthSampleCount ?? 0) <= 0 ? "Live" : liquidityGrade.label;
                const chartData = trend?.points ? addSmaToTrendPoints(trend.points, 4) : [];

                return (
                  <div
                    key={`${cat.key}-assessment`}
                    style={{
                      border: liquidityGrade.label === "Critical" ? "1px solid rgba(248,113,113,0.65)" : "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
                      padding: "10px",
                      background:
                        liquidityGrade.label === "Critical"
                          ? "linear-gradient(180deg, rgba(127,29,29,0.48) 0%, rgba(0,0,0,0.26) 100%)"
                          : "rgba(0,0,0,0.18)",
                      boxShadow: liquidityGrade.label === "Critical" ? "0 0 0 1px rgba(248,113,113,0.18), 0 18px 40px rgba(127,29,29,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{renderCategoryTitle(cat.label)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: depthStatusLabel === "Pending" ? "#cbd5e1" : liquidityGrade.color,
                            background: depthStatusLabel === "Pending" ? "rgba(71,85,105,0.34)" : liquidityGrade.bg,
                            border: "1px solid rgba(255,255,255,0.16)",
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          {depthStatusLabel}
                        </span>
                        {depthStatusLabel === "Critical" && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: "#fecaca",
                              background: "rgba(153,27,27,0.45)",
                              border: "1px solid rgba(248,113,113,0.4)",
                              borderRadius: 999,
                              padding: "2px 8px",
                              letterSpacing: "0.02em",
                            }}
                          >
                            ALERT
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "#fde68a", fontWeight: 700 }}>
                          Score: {formatMetric(cat.raw?.marketAssessmentScore ?? null, 1)}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
                      <div>Trades: {formatMetric(cat.raw?.tradeCount ?? null, 0)}</div>
                      <div>Unique Traders: {formatMetric(cat.raw?.uniqueTraders ?? null, 0)}</div>
                      <div>Order Book Depth Avg: ${formatMetric(cat.raw?.orderBookDepth ?? null, 2)}</div>
                      <div>Order Book Depth Peak: ${formatMetric(cat.raw?.orderBookDepthPeak ?? null, 2)}</div>
                      <div>Order Book Depth Volatility (STD): ${formatDepthVolatility(cat.raw, 2)}</div>
                      <div>Order Book Depth Range: ${formatMetric(cat.raw?.orderBookDepthRangeLow ?? null, 2)} - ${formatMetric(cat.raw?.orderBookDepthRangeHigh ?? null, 2)}</div>
                      <div>Depth Samples: {formatMetric(cat.raw?.depthSampleCount ?? null, 0)}</div>
                      <div>Depth Latest: {cat.raw?.depthLatestSampleAt ? new Date(cat.raw.depthLatestSampleAt).toLocaleString() : "N/A"}</div>
                      <div>Base Score: {formatMetric(cat.raw?.marketAssessmentBaseScore ?? null, 2)}</div>
                      <div>Liquidity Penalty: -{formatMetric(cat.raw?.liquidityPenaltyScore ?? null, 2)}</div>
                      <div>Total Volume: ${formatMetric(cat.raw?.totalVolume ?? null, 2)}</div>
                      {trendSummary && (
                        <>
                          <div>Depth Trend Slope: {trendSummary.slopePct >= 0 ? "+" : ""}{trendSummary.slopePct.toFixed(2)}%</div>
                          <div>Depth Max Drawdown: {trendSummary.maxDrawdownPct.toFixed(2)}%</div>
                        </>
                      )}
                    </div>

                        {!hasDepth && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid rgba(148,163,184,0.4)",
                          background: "rgba(71,85,105,0.25)",
                          color: "#cbd5e1",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        No depth snapshots were recorded for this market in the selected window.
                      </div>
                    )}

                        {trendSummary && depthStatusLabel !== "Stable" && depthStatusLabel !== "Pending" && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: `1px solid ${liquidityGrade.color}66`,
                          background: liquidityGrade.bg,
                          color: liquidityGrade.color,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Liquidity {depthStatusLabel}: depth trend is falling in this window.
                      </div>
                    )}

                    {depthStatusLabel === "Critical" && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid rgba(248,113,113,0.45)",
                          background: "rgba(153,27,27,0.32)",
                          color: "#fecaca",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Critical liquidity risk: keep this on an inverse-watch list and avoid aggressive sizing until depth recovers.
                      </div>
                    )}

                    {chartData.length > 1 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.68)", marginBottom: 4 }}>
                          Depth Trend ({timeWindow}) - {trend?.eventTitle}
                        </div>
                        <div style={{ width: "100%", height: 120 }}>
                          <ResponsiveContainer>
                            <LineChart data={chartData}>
                              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
                              <YAxis hide domain={[0, "auto"]} />
                              <Tooltip
                                formatter={(value) => {
                                  const n = typeof value === "number" ? value : Number(value);
                                  if (!Number.isFinite(n)) return ["N/A", "Depth"];
                                  return [`$${n.toFixed(2)}`, "Depth"];
                                }}
                                labelFormatter={(label) => `Bucket: ${label}`}
                                contentStyle={{
                                  border: "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: 8,
                                  background: "rgba(20,10,3,0.92)",
                                  color: "#fff",
                                }}
                              />
                              <Line type="monotone" dataKey="depthUsd" stroke="#fbbf24" strokeWidth={2} dot={false} name="Depth" />
                              <Line type="monotone" dataKey="smaDepthUsd" stroke="#93c5fd" strokeWidth={1.6} dot={false} strokeDasharray="5 4" name="SMA" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {strategies.length > 0 ? (
                      <>
                        <div style={{ marginTop: 8, fontSize: 11, color: "#86efac", fontWeight: 700 }}>Likely to perform better</div>
                        {best.map((s) => (
                          <div key={`${cat.key}-${s.name}-best`} style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.82)" }}>
                            {s.name}: {s.expectedReturnPct >= 0 ? "+" : ""}{s.expectedReturnPct.toFixed(2)}% (Final ${s.finalCapital.toFixed(2)})
                          </div>
                        ))}

                        <div style={{ marginTop: 8, fontSize: 11, color: "#fca5a5", fontWeight: 700 }}>Likely to perform poorly</div>
                        {worst.map((s) => (
                          <div key={`${cat.key}-${s.name}-worst`} style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.82)" }}>
                            {s.name}: {s.expectedReturnPct >= 0 ? "+" : ""}{s.expectedReturnPct.toFixed(2)}% (Final ${s.finalCapital.toFixed(2)})
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.62)" }}>No strategy simulation yet.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
