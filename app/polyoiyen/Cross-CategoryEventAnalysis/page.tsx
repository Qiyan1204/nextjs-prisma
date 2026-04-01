"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import PolyHeader from "../PolyHeader";

type CategoryKey = "elonTweets" | "movieBoxOffice" | "fedRates" | "nbaGames";
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
};

const CATEGORY_CONFIG: Array<{ key: CategoryKey; label: string; keywords: string[] }> = [
  { key: "elonTweets", label: "Elon Tweets", keywords: ["elon", "musk", "tweet", "twitter", "x.com"] },
  { key: "movieBoxOffice", label: "Movie Box Office", keywords: ["box office", "movie", "film", "opening weekend"] },
  { key: "fedRates", label: "US Federal Reserve Interest Rates", keywords: ["federal reserve", "fed", "fomc", "rate hike", "rate cut", "interest rate"] },
  { key: "nbaGames", label: "NBA Basketball games", keywords: ["nba", "basketball", "playoffs", "lakers", "celtics", "warriors"] },
];

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

function toEventText(event: PolyEventLite): string {
  const title = event.title || "";
  const desc = event.description || "";
  const tags = (event.tags || []).map((t) => t.label || "").join(" ");
  return `${title} ${desc} ${tags}`.toLowerCase();
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

function normalizeMetricRows(rows: CategoryState[], key: keyof RawMetricSet): Record<CategoryKey, number | null> {
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
    };
  }

  return {
    volatility: list.reduce((a, b) => a + b.volatility, 0) / n,
    reactionSpeed: list.reduce((a, b) => a + b.reactionSpeed, 0) / n,
    confidence: list.reduce((a, b) => a + b.confidence, 0) / n,
    backtestWinRate: list.reduce((a, b) => a + b.backtestWinRate, 0) / n,
    dataDensity: list.reduce((a, b) => a + b.dataDensity, 0) / n,
  };
}

function normalizeSelection(ids: string[], mode: CompareMode): string[] {
  const dedup = Array.from(new Set(ids.filter(Boolean)));
  if (mode === "single") return dedup.slice(0, 1);
  return dedup.slice(0, MAX_AVERAGE_SELECTION);
}

function buildCategoryOptions(category: { key: CategoryKey; keywords: string[] }, events: PolyEventLite[]) {
  const matched = events
    .filter((e) => category.keywords.some((kw) => toEventText(e).includes(kw)))
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

    const [volRes, predictorsRes] = await Promise.all([
      fetch(`/api/polymarket/volatility-rating?${volParams.toString()}`),
      fetch(`/api/polymarket/predictors?${predictorsParams.toString()}`),
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
    const density = Math.log1p(tradeCount) * 10 + Math.log1p(uniquePredictors) * 18;

    return {
      volatility: totalVolatility,
      reactionSpeed: avgReaction,
      confidence,
      backtestWinRate: backtest,
      dataDensity: density,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryState[]>([]);
  const [searchByCategory, setSearchByCategory] = useState<Record<CategoryKey, string>>(emptyCategoryRecord(""));
  const [recentByCategory, setRecentByCategory] = useState<Record<CategoryKey, string[]>>(emptyCategoryRecord<string[]>([]));
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
        setCompareMode(modeFromUrl);
        setTimeWindow(windowFromUrl);

        const params = new URLSearchParams({
          limit: String(MAX_EVENT_SCAN),
          offset: "0",
        });

        const eventsRes = await fetch(`/api/polymarket?${params.toString()}`, { cache: "no-store" });
        if (!eventsRes.ok) throw new Error("Failed to fetch active markets.");
        const payload = await eventsRes.json();
        const events: PolyEventLite[] = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];

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

        const initial = CATEGORY_CONFIG.map((cat): CategoryState => {
          const built = buildCategoryOptions(cat, events);
          const fromUrl = parseIdsFromUrl(searchParams, cat.key);
          const validFromUrl = fromUrl.filter((id) => built.options.some((o) => o.eventId === id));
          const validRecent = (recentStored[cat.key] || []).filter((id) => built.options.some((o) => o.eventId === id));
          const selectedEventIds = validFromUrl.length > 0
            ? normalizeSelection(validFromUrl, modeFromUrl)
            : validRecent.length > 0
              ? normalizeSelection(validRecent, modeFromUrl)
              : (built.options[0] ? [built.options[0].eventId] : []);

          return {
            key: cat.key,
            label: cat.label,
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

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [categories, compareMode, timeWindow, initialized]);

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

  const normalizedMetrics = useMemo<NormalizedMetrics>(() => {
    return {
      volatility: normalizeMetricRows(categories, "volatility"),
      reactionSpeed: normalizeMetricRows(categories, "reactionSpeed"),
      confidence: normalizeMetricRows(categories, "confidence"),
      backtestWinRate: normalizeMetricRows(categories, "backtestWinRate"),
      dataDensity: normalizeMetricRows(categories, "dataDensity"),
    };
  }, [categories]);

  const radarData = useMemo<RadarMetric[]>(() => {
    if (categories.length === 0) {
      return [
        { metric: "Volatility", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Reaction Speed", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Confidence", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Backtest Win Rate", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
        { metric: "Data Density", elonTweets: null, movieBoxOffice: null, fedRates: null, nbaGames: null },
      ];
    }

    const marketAvgBaseline = buildBaselineFromNormalized(normalizedMetrics);

    return [
      { metric: "Volatility", ...normalizedMetrics.volatility },
      { metric: "Reaction Speed", ...normalizedMetrics.reactionSpeed },
      { metric: "Confidence", ...normalizedMetrics.confidence },
      { metric: "Backtest Win Rate", ...normalizedMetrics.backtestWinRate },
      { metric: "Data Density", ...normalizedMetrics.dataDensity },
    ].map((row) => {
      const baselineValue = baselineMode === "none"
        ? null
        : baselineMode === "marketAverage"
          ? marketAvgBaseline[row.metric]
          : (lastSelectionBaseline?.[row.metric] ?? null);
      return { ...row, baseline: baselineValue };
    });
  }, [categories, normalizedMetrics, baselineMode, lastSelectionBaseline]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [categories, compareMode, timeWindow, baselineMode]);

  function buildDiscordMessage() {
    const lines: string[] = [];
    lines.push("Cross-Category Spider Chart");
    lines.push(`Mode: ${compareMode}`);
    lines.push(`Window: ${timeWindow}`);
    lines.push(`Baseline: ${baselineMode}`);
    lines.push("");

    for (const cat of categories) {
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
    ];

    const rows = categories.map((cat) => {
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
      categories: categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        selectedEventIds: cat.selectedEventIds,
        selectedTitles: cat.options.filter((o) => cat.selectedEventIds.includes(o.eventId)).map((o) => o.title),
        raw: cat.raw,
        normalized: {
          volatility: normalizedMetrics.volatility[cat.key],
          reactionSpeed: normalizedMetrics.reactionSpeed[cat.key],
          confidence: normalizedMetrics.confidence[cat.key],
          backtestWinRate: normalizedMetrics.backtestWinRate[cat.key],
          dataDensity: normalizedMetrics.dataDensity[cat.key],
        },
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

  async function handleShareToDiscord() {
    const message = buildDiscordMessage();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Cross-Category Spider Chart",
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
            {categories.map((cat) => {
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{cat.label}</div>
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
              {categories.map((cat) => (
                <div
                  key={`${cat.key}-explain`}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "10px",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                    <div>Volatility: raw {formatMetric(cat.raw?.volatility ?? null)} | norm {formatMetric(normalizedMetrics.volatility[cat.key], 0)}</div>
                    <div>Reaction Speed: raw {formatMetric(cat.raw?.reactionSpeed ?? null)} | norm {formatMetric(normalizedMetrics.reactionSpeed[cat.key], 0)}</div>
                    <div>Confidence: raw {formatMetric(cat.raw?.confidence ?? null)} | norm {formatMetric(normalizedMetrics.confidence[cat.key], 0)}</div>
                    <div>Backtest Win Rate: raw {formatMetric(cat.raw?.backtestWinRate ?? null)} | norm {formatMetric(normalizedMetrics.backtestWinRate[cat.key], 0)}</div>
                    <div>Data Density: raw {formatMetric(cat.raw?.dataDensity ?? null)} | norm {formatMetric(normalizedMetrics.dataDensity[cat.key], 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
