"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import PolyHeader from "../PolyHeader";
import { eventMatchesCategory, toEventText, type CategoryKey, CATEGORY_CONFIG } from "../shared/categoryConfig";
import {
  DEFAULT_ASSESSMENT_WEIGHTS,
  SETTINGS_PARAM_KEYS,
  WEIGHT_PARAM_KEYS,
  type AssessmentWeights,
  type TimeWindow,
  computeAlignedMarketAssessmentScoreForEvent,
  computeWorstStrategyExpectedReturnPct,
  hasCompleteYesNoTokens,
} from "../shared/marketAssessmentEngine";

interface PolyMarket {
  clobTokenIds?: string;
  active?: boolean;
  closed?: boolean;
}

interface PolyEvent {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  volume?: number;
  liquidity?: number;
  commentCount?: number;
  tags?: { label?: string; slug?: string }[];
  markets: PolyMarket[];
}

interface OiyenScoreRow {
  eventId: string;
  title: string;
  windowLabel: string;
  volume: number;
  liquidity: number;
  commentCount: number;
  marketCount: number;
  recencyDays: number;
  score: number;
  baseScore: number;
  liquidityPenaltyScore: number;
  worstStrategyExpectedReturnPct: number;
  inverseCandidate: boolean;
  scoreBand: "Strong" | "Balanced" | "Watch";
}

type ScoringConfig = {
  timeWindow: TimeWindow;
  assessmentWeights: AssessmentWeights;
  penaltySensitivity: number;
};

type OiyenScoreCachePayload = {
  timestamp: number;
  configKey: string;
  rows: OiyenScoreRow[];
  partialFailureCount: number;
  lastUpdated: string;
};

const OIYEN_SCORE_CACHE_TTL_MS = 10 * 60 * 1000;
const OIYEN_SCORE_CACHE_KEY = "oiyen-score-cache-v2";

function truncateToOneDecimal(value: number): number {
  return Math.floor(value * 10) / 10;
}

function buildScoringConfigKey(config: ScoringConfig, category: CategoryKey): string {
  const weightKey = (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>)
    .map((k) => `${k}:${config.assessmentWeights[k].toFixed(2)}`)
    .join("|");
  return `cat=${category};w=${config.timeWindow};lp=${config.penaltySensitivity.toFixed(2)};${weightKey}`;
}

function sortRows(rows: OiyenScoreRow[]): OiyenScoreRow[] {
  return [...rows].sort((a, b) => {
    if (Number(b.inverseCandidate) !== Number(a.inverseCandidate)) return Number(b.inverseCandidate) - Number(a.inverseCandidate);
    if (b.score !== a.score) return b.score - a.score;
    if (b.volume !== a.volume) return b.volume - a.volume;
    return a.title.localeCompare(b.title);
  });
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString();
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function parseScoringConfigFromUrl(): ScoringConfig {
  const searchParams = new URLSearchParams(window.location.search);
  const rawWindow = (searchParams.get("window") || "7D").toUpperCase();
  const timeWindow: TimeWindow = rawWindow === "24H" ? "24H" : rawWindow === "30D" ? "30D" : "7D";

  const assessmentWeights: AssessmentWeights = { ...DEFAULT_ASSESSMENT_WEIGHTS };
  (Object.keys(WEIGHT_PARAM_KEYS) as Array<keyof AssessmentWeights>).forEach((key) => {
    const raw = searchParams.get(WEIGHT_PARAM_KEYS[key]);
    if (raw == null || raw.trim() === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    assessmentWeights[key] = Math.min(3, Math.max(0, value));
  });

  const rawPenaltyText = searchParams.get(SETTINGS_PARAM_KEYS.penaltySensitivity);
  const rawPenalty = rawPenaltyText == null || rawPenaltyText.trim() === "" ? NaN : Number(rawPenaltyText);
  const penaltySensitivity = Number.isFinite(rawPenalty) ? Math.min(3, Math.max(0, rawPenalty)) : 1;

  return {
    timeWindow,
    assessmentWeights,
    penaltySensitivity,
  };
}

async function fetchAllEventsByStatus(active: boolean, closed: boolean): Promise<PolyEvent[]> {
  const pageSize = 200;
  const maxPages = 100;
  const out: PolyEvent[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const res = await fetch(`/api/polymarket?limit=${pageSize}&offset=${offset}&active=${String(active)}&closed=${String(closed)}`);
    if (!res.ok) break;

    const data = await res.json();
    const pageEvents: PolyEvent[] = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
    if (pageEvents.length === 0) break;

    out.push(...pageEvents);
    if (pageEvents.length < pageSize) break;
  }

  return out;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const settled: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        const value = await mapper(items[current], current);
        settled[current] = { status: "fulfilled", value };
      } catch (reason) {
        settled[current] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return settled;
}

function pickActiveMarket(markets: PolyMarket[] | undefined): PolyMarket | undefined {
  if (!Array.isArray(markets) || markets.length === 0) return undefined;
  return markets.find((m) => m.active !== false && m.closed !== true) || markets.find((m) => m.closed !== true) || markets[0];
}

function parseTokenIds(market: PolyMarket | undefined): { yes: string; no: string } {
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

function isMovieBoxOfficeFromCrossCategory(event: PolyEvent): boolean {
  const matchedCategory = eventMatchesCategory(event, "movieBoxOffice");
  if (!matchedCategory) return false;
  return hasCompleteYesNoTokens(event);
}

function isStrictMovieBoxOfficeEvent(event: PolyEvent): boolean {
  const text = toEventText(event);

  // Require strong, explicit box-office language so non-movie topics are excluded.
  const hasStrongBoxOfficeSignal = [
    "box office",
    "opening weekend",
    "domestic gross",
    "worldwide gross",
    "theatrical release",
    "weekend gross",
  ].some((signal) => text.includes(signal));

  if (!hasStrongBoxOfficeSignal) return false;

  // Hard exclusions for common non-movie domains.
  const hasNonMovieSignal = [
    "trump",
    "election",
    "fed",
    "federal reserve",
    "interest rate",
    "nba",
    "bitcoin",
    "crypto",
    "tariff",
    "senate",
    "congress",
  ].some((signal) => text.includes(signal));

  return !hasNonMovieSignal;
}

// Category-specific filter functions
function getEventFilterForCategory(category: CategoryKey): (event: PolyEvent) => boolean {
  return (event: PolyEvent) => {
    // All categories must match the category keywords
    if (!eventMatchesCategory(event, category)) return false;
    
    // Ensure complete yes/no tokens
    if (!hasCompleteYesNoTokens(event)) return false;

    const text = toEventText(event);

    switch (category) {
      case "movieBoxOffice":
        // Strict movie filtering
        const hasStrongBoxOfficeSignal = [
          "box office",
          "opening weekend",
          "domestic gross",
          "worldwide gross",
          "theatrical release",
          "weekend gross",
        ].some((signal) => text.includes(signal));

        if (!hasStrongBoxOfficeSignal) return false;

        const hasNonMovieSignal = [
          "trump",
          "election",
          "fed",
          "federal reserve",
          "interest rate",
          "nba",
          "bitcoin",
          "crypto",
          "tariff",
          "senate",
          "congress",
        ].some((signal) => text.includes(signal));

        return !hasNonMovieSignal;

      case "fedRates":
        // Filter out false positives (e.g., "fedex", "federal agency" not about rates)
        const hasRateSignal = [
          "rate hike",
          "rate cut",
          "interest rate",
          "fomc",
          "federal reserve",
          "fed funds",
          "discount rate",
        ].some((signal) => text.includes(signal));

        const hasNonFedSignal = [
          "fedex",
          "federal agency",
          "federal crime",
          "federal court",
        ].some((signal) => text.includes(signal));

        return hasRateSignal && !hasNonFedSignal;

      case "elonTweets":
        // Filter to actual Elon/Twitter events
        const hasElonSignal = [
          "elon",
          "musk",
          "tweet",
          "twitter",
          "x.com",
          "spacex",
          "tesla",
        ].some((signal) => text.includes(signal));

        return hasElonSignal;

      case "nbaGames":
        // Filter to actual NBA events
        const hasNbaSignal = [
          "nba",
          "basketball",
          "playoffs",
          "lakers",
          "celtics",
          "warriors",
          "nba championship",
          "nba finals",
        ].some((signal) => text.includes(signal));

        const hasNonNbaSignal = [
          "nfl",
          "nhl",
          "mlb",
          "soccer",
          "football",
        ].some((signal) => text.includes(signal));

        return hasNbaSignal && !hasNonNbaSignal;

      default:
        return false;
    }
  };
}

export default function OiyenScorePage() {
  const router = useRouter();
  const [rows, setRows] = useState<OiyenScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("movieBoxOffice");
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({
    timeWindow: "7D",
    assessmentWeights: { ...DEFAULT_ASSESSMENT_WEIGHTS },
    penaltySensitivity: 1,
  });
  const [partialFailureCount, setPartialFailureCount] = useState(0);
  const [loadProgress, setLoadProgress] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: OiyenScoreRow } | null>(null);

  function navigateToEvent(eventId: string) {
    setContextMenu(null);
    router.push(`/polyoiyen/${encodeURIComponent(eventId)}`);
  }

  useEffect(() => {
    // Parse category from URL
    const searchParams = new URLSearchParams(window.location.search);
    const categoryParam = searchParams.get("category");
    if (categoryParam && CATEGORY_CONFIG.some(c => c.key === categoryParam)) {
      setSelectedCategory(categoryParam as CategoryKey);
    }
  }, []);

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }
    document.addEventListener("click", closeMenu);
    document.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const parsedConfig = parseScoringConfigFromUrl();
        setScoringConfig(parsedConfig);
        const configKey = buildScoringConfigKey(parsedConfig, selectedCategory);

        try {
          const raw = localStorage.getItem(OIYEN_SCORE_CACHE_KEY);
          if (raw) {
            const cache = JSON.parse(raw) as OiyenScoreCachePayload;
            const isFresh = Date.now() - Number(cache.timestamp || 0) <= OIYEN_SCORE_CACHE_TTL_MS;
            if (isFresh && cache.configKey === configKey && Array.isArray(cache.rows) && cache.rows.length > 0) {
              if (alive) {
                setRows(sortRows(cache.rows));
                setPartialFailureCount(Number(cache.partialFailureCount || 0));
                setLastUpdated(cache.lastUpdated || new Date(cache.timestamp).toLocaleString());
                setLoading(false);
              }
            }
          }
        } catch {
          // ignore malformed cache
        }

        const [closedEvents, activeEvents] = await Promise.all([
          fetchAllEventsByStatus(false, true),
          fetchAllEventsByStatus(true, false),
        ]);
        if (closedEvents.length === 0 && activeEvents.length === 0) {
          throw new Error("Failed to load historical markets");
        }

        const dedupMap = new Map<string, PolyEvent>();
        [...closedEvents, ...activeEvents].forEach((event) => {
          if (!event?.id) return;
          if (!dedupMap.has(event.id)) dedupMap.set(event.id, event);
        });
        const events = Array.from(dedupMap.values());
        const since = Date.now() - 365 * 86_400_000;

        const eventFilter = getEventFilterForCategory(selectedCategory);
        const filtered = events
          .filter(eventFilter)
          .filter((event) => {
            const endDate = parseDate(event.endDate) || parseDate(event.startDate);
            return endDate ? endDate.getTime() >= since : false;
          });

        const batchSize = 40;
        const nextRows: OiyenScoreRow[] = [];
        let failedCount = 0;

        for (let i = 0; i < filtered.length; i += batchSize) {
          const chunk = filtered.slice(i, i + batchSize);
          const scoredSettled = await mapWithConcurrency(chunk, 10, async (event) => {
            const endDate = parseDate(event.endDate) || parseDate(event.startDate) || new Date();
            const recencyDays = daysBetween(endDate, new Date());
            const marketCount = Array.isArray(event.markets) ? event.markets.length : 0;
            const volume = Number(event.volume || 0);
            const liquidity = Number(event.liquidity || 0);
            const commentCount = Number(event.commentCount || 0);

            const aligned = await computeAlignedMarketAssessmentScoreForEvent(event, {
              timeWindow: parsedConfig.timeWindow,
              assessmentWeights: parsedConfig.assessmentWeights,
              penaltySensitivity: parsedConfig.penaltySensitivity,
            });

            const worstStrategyExpectedReturnPct = computeWorstStrategyExpectedReturnPct(aligned.raw);
            const inverseCandidate = worstStrategyExpectedReturnPct <= -22;

            const scoreBand: OiyenScoreRow["scoreBand"] = aligned.score >= 72 ? "Strong" : aligned.score >= 50 ? "Balanced" : "Watch";

            return {
              eventId: event.id,
              title: event.title,
              windowLabel: `${endDate.toLocaleDateString()} · ${recencyDays}d old`,
              volume,
              liquidity,
              commentCount,
              marketCount,
              recencyDays,
              score: truncateToOneDecimal(aligned.score),
              baseScore: truncateToOneDecimal(aligned.baseScore),
              liquidityPenaltyScore: truncateToOneDecimal(aligned.liquidityPenaltyScore),
              worstStrategyExpectedReturnPct,
              inverseCandidate,
              scoreBand,
            } as OiyenScoreRow;
          });

          nextRows.push(
            ...scoredSettled
              .filter((result): result is PromiseFulfilledResult<OiyenScoreRow> => result.status === "fulfilled")
              .map((result) => result.value)
          );
          failedCount += scoredSettled.filter((result) => result.status === "rejected").length;

          if (!alive) return;
          const processed = Math.min(i + chunk.length, filtered.length);
          setRows(sortRows(nextRows));
          setPartialFailureCount(failedCount);
          setLoadProgress(`Computing ${processed}/${filtered.length} markets...`);
          setLoading(false);
        }

        const successfulRows = sortRows(nextRows);
        failedCount = filtered.length - successfulRows.length;

        if (!alive) return;
        setRows(successfulRows);
        setPartialFailureCount(failedCount);
        setLoadProgress("");
        setLastUpdated(new Date().toLocaleString());

        try {
          const payload: OiyenScoreCachePayload = {
            timestamp: Date.now(),
            configKey,
            rows: successfulRows,
            partialFailureCount: failedCount,
            lastUpdated: new Date().toLocaleString(),
          };
          localStorage.setItem(OIYEN_SCORE_CACHE_KEY, JSON.stringify(payload));
        } catch {
          // ignore cache write errors
        }
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setError(e instanceof Error ? e.message : "Failed to build Oiyen Score board");
      } finally {
        if (alive) {
          setLoading(false);
          setLoadProgress("");
        }
      }
    }

    loadRows();
    return () => {
      alive = false;
    };
  }, [selectedCategory]);

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return { total: 0, strong: 0, balanced: 0, watch: 0, inverse: 0, avg: 0 };
    }

    const strong = rows.filter((row) => row.scoreBand === "Strong").length;
    const balanced = rows.filter((row) => row.scoreBand === "Balanced").length;
    const watch = rows.filter((row) => row.scoreBand === "Watch").length;
    const inverse = rows.filter((row) => row.inverseCandidate).length;
    const avg = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;

    return {
      total: rows.length,
      strong,
      balanced,
      watch,
      inverse,
      avg: Number(avg.toFixed(1)),
    };
  }, [rows]);

  return (
    <>
      <PolyHeader active="OiyenScore" />
      <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #150c04 0%, #0f0702 100%)", color: "#fff", padding: "24px 20px 56px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          {/* Category Selection */}
          <section style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {CATEGORY_CONFIG.map((cat) => (
              <button
                key={cat.key}
                onClick={() => {
                  setSelectedCategory(cat.key);
                  const params = new URLSearchParams(window.location.search);
                  params.set("category", cat.key);
                  window.history.replaceState({}, "", `?${params.toString()}`);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: selectedCategory === cat.key ? "2px solid #f97316" : "1px solid rgba(255,255,255,0.2)",
                  background: selectedCategory === cat.key ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)",
                  color: selectedCategory === cat.key ? "#f97316" : "rgba(255,255,255,0.6)",
                  fontSize: 13,
                  fontWeight: selectedCategory === cat.key ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {cat.label}
              </button>
            ))}
          </section>

          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(0,0,0,0.22))",
              padding: 22,
              marginBottom: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ maxWidth: 760 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                  Unified score engine for {CATEGORY_CONFIG.find(c => c.key === selectedCategory)?.label.toLowerCase() || "markets"}
                </div>
                <h1 style={{ fontSize: 40, lineHeight: 1.02, margin: 0, fontWeight: 800, letterSpacing: "-0.04em" }}>
                  Oiyen Score
                </h1>
                <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.74)" }}>
                  This page collects major {CATEGORY_CONFIG.find(c => c.key === selectedCategory)?.label.toLowerCase()} markets from the last 12 months and scores them with the same engine used in Cross-Category Event Analysis.
                  Final Oiyen Score is computed as Base Score minus Liquidity Penalty.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(110px, 1fr))", gap: 10, minWidth: 260 }}>
                <MetricPill label="Markets" value={stats.total.toString()} accent="#fde68a" />
                <MetricPill label="Average" value={stats.avg.toFixed(1)} accent="#86efac" />
                <MetricPill label="Strong" value={stats.strong.toString()} accent="#34d399" />
                <MetricPill label="Inverse" value={stats.inverse.toString()} accent="#fca5a5" />
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
            <InfoCard
              title="What the score means"
              body="Higher scores indicate stronger market-quality characteristics under the shared Cross-Category assessment model. Lower scores indicate weaker long-side quality or heavier liquidity-risk deductions."
            />
            <InfoCard
              title="How it is calculated"
              body="The page uses the exact Cross-Category engine: derive market metrics (volatility, reaction speed, confidence, backtest trend consistency, data density, trade count, unique traders, depth, and volume), compute Base Score with default weights, then subtract Liquidity Penalty from depth-trend deterioration in the selected window."
            />
            <InfoCard
              title="How to read it"
              body="Read Base and Penalty together: high base with low penalty is cleaner, while high penalty means deteriorating depth can drag the final score down. This board is aligned with Cross-Category, so values are directly comparable."
            />
          </section>

          <section style={{ marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.66)", lineHeight: 1.6 }}>
            <div>Synced params from URL -&gt; Window: {scoringConfig.timeWindow} | Penalty Sensitivity: {scoringConfig.penaltySensitivity.toFixed(2)}</div>
            <div>Weights -&gt; V:{scoringConfig.assessmentWeights.volatility.toFixed(2)} R:{scoringConfig.assessmentWeights.reactionSpeed.toFixed(2)} D:{scoringConfig.assessmentWeights.dataDensity.toFixed(2)} B:{scoringConfig.assessmentWeights.backtestWinRate.toFixed(2)} C:{scoringConfig.assessmentWeights.confidence.toFixed(2)} T:{scoringConfig.assessmentWeights.tradeCount.toFixed(2)} U:{scoringConfig.assessmentWeights.uniqueTraders.toFixed(2)} O:{scoringConfig.assessmentWeights.orderBookDepth.toFixed(2)} M:{scoringConfig.assessmentWeights.totalVolume.toFixed(2)}</div>
            {loadProgress && <div style={{ color: "#fde68a" }}>{loadProgress}</div>}
            {partialFailureCount > 0 && <div style={{ color: "#fca5a5" }}>Partial data: {partialFailureCount} market(s) failed metric fetch and were skipped.</div>}
          </section>

          <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Box office market board</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", marginTop: 4 }}>
                  Ranked by the same assessment engine used in Cross-Category Event Analysis (current URL-synced params).
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  Left click row to open event · Right click row for actions
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/polyoiyen/Cross-CategoryEventAnalysis" style={linkButtonStyle}>
                  Open strategy lab
                </Link>
                <Link href="/polyoiyen" style={linkButtonStyle}>
                  Back to market hub
                </Link>
                {lastUpdated && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Updated {lastUpdated}</span>}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 28, color: "rgba(255,255,255,0.62)", fontSize: 14 }}>Loading {CATEGORY_CONFIG.find(c => c.key === selectedCategory)?.label.toLowerCase()} markets...</div>
            ) : error ? (
              <div style={{ padding: 28, color: "#fca5a5", fontSize: 14 }}>{error}</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 28, color: "rgba(255,255,255,0.62)", fontSize: 14 }}>
                No {CATEGORY_CONFIG.find(c => c.key === selectedCategory)?.label.toLowerCase()} markets were found in the last 12 months with the current filter set.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
                      <th style={thStyle}>Market</th>
                      <th style={thStyle}>Window</th>
                      <th style={thStyle}>Volume</th>
                      <th style={thStyle}>Liquidity</th>
                      <th style={thStyle}>Comments</th>
                      <th style={thStyle}>Markets</th>
                      <th style={thStyle}>Base</th>
                      <th style={thStyle}>Penalty</th>
                      <th style={thStyle}>Worst Strategy</th>
                      <th style={thStyle}>Inverse</th>
                      <th style={thStyle}>Oiyen Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={row.eventId}
                        onClick={() => navigateToEvent(row.eventId)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({ x: event.clientX, y: event.clientY, row });
                        }}
                        style={{
                          borderTop: index === 0 ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.05)",
                          cursor: "pointer",
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: "#fff" }}>{row.title}</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{row.scoreBand}</div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              navigateToEvent(row.eventId);
                            }}
                            style={{
                              marginTop: 8,
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "1px solid rgba(249,115,22,0.35)",
                              background: "rgba(249,115,22,0.12)",
                              color: "#f97316",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Open
                          </button>
                        </td>
                        <td style={tdStyle}>{row.windowLabel}</td>
                        <td style={tdStyle}>{formatMoney(row.volume)}</td>
                        <td style={tdStyle}>{formatMoney(row.liquidity)}</td>
                        <td style={tdStyle}>{formatCount(row.commentCount)}</td>
                        <td style={tdStyle}>{row.marketCount}</td>
                        <td style={tdStyle}>{row.baseScore.toFixed(1)}</td>
                        <td style={tdStyle}>-{row.liquidityPenaltyScore.toFixed(1)}</td>
                        <td style={tdStyle}>{row.worstStrategyExpectedReturnPct.toFixed(1)}%</td>
                        <td style={tdStyle}>
                          {row.inverseCandidate ? (
                            <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(248,113,113,0.45)", background: "rgba(153,27,27,0.3)", color: "#fecaca", fontSize: 10, fontWeight: 800 }}>
                              Candidate
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>-</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <ScoreBadge score={row.score} band={row.scoreBand} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {contextMenu && (
            <div
              style={{
                position: "fixed",
                top: contextMenu.y,
                left: contextMenu.x,
                minWidth: 180,
                borderRadius: 10,
                padding: 6,
                background: "#1e1108",
                border: "1px solid rgba(249,115,22,0.2)",
                boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
                zIndex: 320,
              }}
            >
              <button
                onClick={() => navigateToEvent(contextMenu.row.eventId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                View the event
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function MetricPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, background: "rgba(0,0,0,0.2)", padding: "12px 14px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: accent }}>{value}</div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.11)", borderRadius: 16, background: "rgba(255,255,255,0.03)", padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.68)" }}>{body}</div>
    </div>
  );
}

function ScoreBadge({ score, band }: { score: number; band: OiyenScoreRow["scoreBand"] }) {
  const color = band === "Strong" ? "#86efac" : band === "Balanced" ? "#fde68a" : "#fca5a5";
  const background = band === "Strong" ? "rgba(20,83,45,0.38)" : band === "Balanced" ? "rgba(113,63,18,0.32)" : "rgba(127,29,29,0.34)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background,
        color,
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {score.toFixed(1)}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tdStyle: CSSProperties = {
  padding: "14px 16px",
  fontSize: 13,
  color: "rgba(255,255,255,0.74)",
  verticalAlign: "top",
};

const linkButtonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
};