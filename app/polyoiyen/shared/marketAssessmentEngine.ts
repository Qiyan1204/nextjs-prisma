export type TimeWindow = "24H" | "7D" | "30D";

export type AssessmentWeights = {
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

export const DEFAULT_ASSESSMENT_WEIGHTS: AssessmentWeights = {
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

export const WEIGHT_PARAM_KEYS: Record<keyof AssessmentWeights, string> = {
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

export const SETTINGS_PARAM_KEYS = {
  penaltySensitivity: "lp",
} as const;

export type RawMetricSet = {
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
};

type PolyMarketLite = {
  outcomePrices?: string;
  clobTokenIds?: string;
  closed?: boolean;
  active?: boolean;
};

type OrderBookLevel = {
  price?: string | number;
  size?: string | number;
};

type OrderBookResponse = {
  bids?: OrderBookLevel[];
  asks?: OrderBookLevel[];
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

type CategoryEventOption = {
  eventId: string;
  title: string;
  volume: number;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number | null;
};

type DepthTrendSummary = {
  slopePct: number;
  maxDrawdownPct: number;
  isDowntrend: boolean;
};

const DEPTH_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function clamp(value: number, min: number, max: number): number {
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

export function computeMarketAssessmentScore(raw: RawMetricSet, weights: AssessmentWeights): number {
  const components: Array<{ score: number; weight: number }> = [
    { score: toVolatilityScore(raw.volatility), weight: weights.volatility },
    { score: toReactionScore(raw.reactionSpeed), weight: weights.reactionSpeed },
    { score: toDensityScore(raw.dataDensity), weight: weights.dataDensity },
    { score: clamp(raw.backtestWinRate, 0, 100), weight: weights.backtestWinRate },
    { score: clamp(raw.confidence, 0, 100), weight: weights.confidence },
    { score: toTradeCountScore(raw.tradeCount), weight: weights.tradeCount },
    { score: toUniqueTradersScore(raw.uniqueTraders), weight: weights.uniqueTraders },
    { score: toDepthScore(raw.orderBookDepth), weight: weights.orderBookDepth },
    { score: toVolumeScore(raw.totalVolume), weight: weights.totalVolume },
  ];

  const totalWeight = components.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return 0;
  const weighted = components.reduce((sum, c) => sum + c.score * Math.max(0, c.weight), 0);
  return weighted / totalWeight;
}

export function getWindowMs(window: TimeWindow): number {
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

export function computeAdjustedPenalty(summary: DepthTrendSummary | null, penaltySensitivity: number): number {
  return clamp(Number((computeLiquidityPenalty(summary) * penaltySensitivity).toFixed(2)), 0, 25);
}

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
    seriesPoints: Array.isArray(matchedSeries?.points) ? matchedSeries.points : [],
  };
}

async function fetchMetricsForOption(
  option: CategoryEventOption,
  timeWindow: TimeWindow,
  includeDepthSeries = false
): Promise<{ raw: RawMetricSet; depthSeriesPoints: Array<{ ts: number; label: string; depthUsd: number }> }> {
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
      fetchDepthStatsForEvent(option.eventId, timeWindow, includeDepthSeries, option.yesTokenId, option.noTokenId),
    ]);

    if (!volRes.ok || !predictorsRes.ok) {
      const volText = volRes.ok ? "" : await volRes.text();
      const predText = predictorsRes.ok ? "" : await predictorsRes.text();
      throw new Error(`vol=${volRes.status} pred=${predictorsRes.status} ${volText || predText}`.trim());
    }

    const volData = (await volRes.json()) as VolatilityRatingResponse;
    const predictorsData = (await predictorsRes.json()) as PredictorsResponse;

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

    return {
      raw: {
      volatility: totalVolatility,
      reactionSpeed: avgReaction,
      confidence,
      backtestWinRate: backtest,
      dataDensity: density,
      tradeCount,
      uniqueTraders: uniquePredictors,
      orderBookDepth: depthStats.avgDepthUsd,
      orderBookDepthPeak: depthStats.peakDepthUsd,
      orderBookDepthVolatility: depthStats.stdDepthUsd,
      orderBookDepthRangeLow: depthStats.rangeLowUsd,
      orderBookDepthRangeHigh: depthStats.rangeHighUsd,
      depthSampleCount: depthStats.sampleCount,
      depthLatestSampleAt: depthStats.latestSampledAt,
      totalVolume,
      },
      depthSeriesPoints: depthStats.seriesPoints || [],
    };
  };

  try {
    return await attempt("200", "80");
  } catch {
    return attempt("120", "40");
  }
}

export async function computeAlignedMarketAssessmentScoreForEvent(
  event: {
    id: string;
    title: string;
    volume?: number;
    markets?: PolyMarketLite[];
  },
  options?: {
    timeWindow?: TimeWindow;
    assessmentWeights?: AssessmentWeights;
    penaltySensitivity?: number;
  }
): Promise<{
  score: number;
  baseScore: number;
  liquidityPenaltyScore: number;
  raw: RawMetricSet;
}> {
  const timeWindow = options?.timeWindow ?? "7D";
  const assessmentWeights = options?.assessmentWeights ?? DEFAULT_ASSESSMENT_WEIGHTS;
  const penaltySensitivity = options?.penaltySensitivity ?? 1;

  const market = pickActiveMarket(event.markets);
  const tokens = parseTokenIds(market);
  if (!tokens.yes || !tokens.no) {
    throw new Error("No complete YES/NO token IDs");
  }

  const option: CategoryEventOption = {
    eventId: event.id,
    title: event.title,
    volume: Number(event.volume || 0),
    yesTokenId: tokens.yes,
    noTokenId: tokens.no,
    yesPrice: parseYesPrice(market),
  };

  const fetched = await fetchMetricsForOption(option, timeWindow, true);
  const raw = fetched.raw;
  const trendSummary = summarizeDepthTrend(fetched.depthSeriesPoints || []);

  const baseScore = computeMarketAssessmentScore(raw, assessmentWeights);
  const liquidityPenaltyScore = computeAdjustedPenalty(trendSummary, penaltySensitivity);
  const score = clamp(baseScore - liquidityPenaltyScore, 0, 100);

  return {
    score: Number(score.toFixed(2)),
    baseScore: Number(baseScore.toFixed(2)),
    liquidityPenaltyScore: Number(liquidityPenaltyScore.toFixed(2)),
    raw,
  };
}

export function hasCompleteYesNoTokens(event: { markets?: PolyMarketLite[] }): boolean {
  const market = pickActiveMarket(event.markets);
  const tokens = parseTokenIds(market);
  return Boolean(tokens.yes && tokens.no);
}

export function computeWorstStrategyExpectedReturnPct(raw: RawMetricSet): number {
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

  const outcomes = [
    toReturnPct(momentumEdge, 0.85),
    toReturnPct(meanReversionEdge, 0.78),
    toReturnPct(liquidityScalpEdge, 0.75),
    toReturnPct(trendSwingEdge, 0.8),
    toReturnPct(randomMartingaleEdge, 0.9),
  ];

  return Number(Math.min(...outcomes).toFixed(2));
}

export function getDepthSnapshotIntervalMs(): number {
  return DEPTH_SNAPSHOT_INTERVAL_MS;
}