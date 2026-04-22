import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendBacktestCompletedDiscord } from "@/lib/backtestDiscord";
import { CATEGORY_CONFIG, TAG_SLUGS_BY_CATEGORY, type CategoryKey } from "@/app/polyoiyen/shared/categoryConfig";
import { hasCompleteYesNoTokens } from "@/app/polyoiyen/shared/marketAssessmentEngine";

type PullKind = "poly_probe" | "invest_pull" | "invest_action" | "health_ok" | "health_fail";
const FIXED_BACKTEST_BUDGET_USD = 1000;

function pct(part: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100;
}

function percentile(values: number[], p: number): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

function parseTokenIds(raw?: string): { yes: string; no: string } {
  if (!raw) return { yes: "", no: "" };
  try {
    const arr = JSON.parse(raw);
    return {
      yes: typeof arr?.[0] === "string" ? arr[0] : "",
      no: typeof arr?.[1] === "string" ? arr[1] : "",
    };
  } catch {
    return { yes: "", no: "" };
  }
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function inferWinnerSideFromOutcomes(outcomesRaw: unknown, pricesRaw: unknown): "YES" | "NO" | null {
  const outcomes = parseJsonArray<string>(outcomesRaw).map((x) => String(x).toUpperCase());
  const prices = parseJsonArray<number | string>(pricesRaw).map((x) => Number(x));
  if (outcomes.length < 2 || prices.length < 2) return null;

  let bestIdx = -1;
  let bestPrice = -1;
  for (let i = 0; i < prices.length; i += 1) {
    const p = prices[i];
    if (!Number.isFinite(p)) continue;
    if (p > bestPrice) {
      bestPrice = p;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestPrice < 0.97) return null;
  const label = outcomes[bestIdx] || "";
  if (label.includes("YES")) return "YES";
  if (label.includes("NO")) return "NO";
  return null;
}

function computeMaxDrawdownFromReturns(returnsPct: number[]): number {
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  for (const ret of returnsPct) {
    equity *= 1 + ret / 100;
    if (!Number.isFinite(equity) || equity <= 0) {
      return 100;
    }

    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return Number(maxDrawdown.toFixed(2));
}

function buildEquityCurvePoints(rows: Array<{ eventId: string; createdAt: string; totalReturn: number }>) {
  let equity = 100;
  let peak = 100;

  return rows.map((row, index) => {
    equity *= 1 + row.totalReturn / 100;
    if (!Number.isFinite(equity) || equity <= 0) equity = 0;
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

    return {
      index: index + 1,
      eventId: row.eventId,
      createdAt: row.createdAt,
      label: new Date(row.createdAt).toLocaleDateString([], { month: "numeric", day: "numeric" }),
      equity: Number(equity.toFixed(2)),
      drawdown: Number(drawdown.toFixed(2)),
      returnPct: Number(row.totalReturn.toFixed(2)),
    };
  });
}

function classifyEventType(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("election") || q.includes("president") || q.includes("vote")) return "Politics";
  if (q.includes("fed") || q.includes("rate") || q.includes("inflation") || q.includes("cpi")) return "Macro";
  if (q.includes("nba") || q.includes("nfl") || q.includes("mlb") || q.includes("game")) return "Sports";
  if (q.includes("box office") || q.includes("movie") || q.includes("film")) return "Entertainment";
  if (q.includes("crypto") || q.includes("bitcoin") || q.includes("eth")) return "Crypto";
  return "General";
}

function bucketLiquidity(invested: number): "Low" | "Medium" | "High" {
  if (invested < 100) return "Low";
  if (invested < 500) return "Medium";
  return "High";
}

function buildBucketContribution(
  rows: Array<{ totalReturn: number; eventType: string; category: string; depthBucket: string }>,
  mode: "original" | "inverse",
) {
  const group = (keyGetter: (row: (typeof rows)[number]) => string) => {
    const map = new Map<string, { count: number; returnSum: number; absMove: number }>();
    for (const row of rows) {
      const key = keyGetter(row);
      const current = map.get(key) || { count: 0, returnSum: 0, absMove: 0 };
      current.count += 1;
      current.returnSum += row.totalReturn;
      current.absMove += Math.abs(row.totalReturn);
      map.set(key, current);
    }
    return Array.from(map.entries())
      .map(([bucket, v]) => ({
        bucket,
        events: v.count,
        avgReturn: v.count > 0 ? Number((v.returnSum / v.count).toFixed(2)) : null,
        returnSum: Number(v.returnSum.toFixed(2)),
        absMove: Number(v.absMove.toFixed(2)),
        contributionPct: 0,
      }))
      .map((bucket) => {
        if (mode === "original") {
          const totalAbsMove = rows.reduce((sum, r) => sum + Math.abs(r.totalReturn), 0);
          return {
            ...bucket,
            contributionPct: totalAbsMove > 0 ? Number(pct(bucket.absMove, totalAbsMove).toFixed(2)) : 0,
          };
        }

        const totalDirectionalMove = Array.from(map.values()).reduce((sum, v) => sum + Math.abs(v.returnSum), 0);
        return {
          ...bucket,
          contributionPct: totalDirectionalMove > 0 ? Number(pct(bucket.returnSum, totalDirectionalMove).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.contributionPct - a.contributionPct);
  };

  const byEventType = group((row) => row.eventType);
  const byCategory = group((row) => row.category);
  const byLiquidityBucket = group((row) => row.depthBucket);

  const topFactors = [
    ...byEventType.map((x) => ({ factorType: "eventType", factorLabel: x.bucket, events: x.events, avgReturn: x.avgReturn, score: x.contributionPct })),
    ...byCategory.map((x) => ({ factorType: "category", factorLabel: x.bucket, events: x.events, avgReturn: x.avgReturn, score: x.contributionPct })),
    ...byLiquidityBucket.map((x) => ({ factorType: "liquidity", factorLabel: x.bucket, events: x.events, avgReturn: x.avgReturn, score: x.contributionPct })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => ({
      factorType: x.factorType,
      factorLabel: x.factorLabel,
      events: x.events,
      avgReturn: x.avgReturn,
      contributionPct: Number(x.score.toFixed(2)),
    }));

  return {
    byEventType,
    byCategory,
    byLiquidityBucket,
    topFactors,
  };
}

function buildRiskMetrics(rows: Array<{ totalReturn: number; createdAt: string }>, avgMaxDrawdown: number | null) {
  if (rows.length === 0) {
    return {
      calmarRatio: null,
      sortinoRatio: null,
      profitFactor: null,
      maxLosingStreak: 0,
      totalReturn: null,
      annualizedReturn: null,
    };
  }

  const returns = rows.map((r) => r.totalReturn / 100);
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  const downsideDev = downside.length > 0
    ? Math.sqrt(downside.reduce((sum, r) => sum + r * r, 0) / downside.length)
    : 0;

  const grossProfit = returns.filter((r) => r > 0).reduce((sum, r) => sum + r, 0);
  const grossLossAbs = Math.abs(returns.filter((r) => r < 0).reduce((sum, r) => sum + r, 0));
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : null;

  let maxLosingStreak = 0;
  let currentLosingStreak = 0;
  for (const r of returns) {
    if (r < 0) {
      currentLosingStreak += 1;
      if (currentLosingStreak > maxLosingStreak) maxLosingStreak = currentLosingStreak;
    } else {
      currentLosingStreak = 0;
    }
  }

  let equity = 1;
  for (const r of returns) equity *= 1 + r;
  const totalReturn = (equity - 1) * 100;

  const start = new Date(rows[0].createdAt).getTime();
  const end = new Date(rows[rows.length - 1].createdAt).getTime();
  const days = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
  const annualizedReturn = Math.pow(Math.max(0.0001, equity), 365 / days) - 1;

  const calmarRatio = avgMaxDrawdown && avgMaxDrawdown > 0
    ? ((annualizedReturn * 100) / avgMaxDrawdown)
    : null;
  const sortinoRatio = downsideDev > 0
    ? (mean / downsideDev) * Math.sqrt(returns.length)
    : null;

  return {
    calmarRatio: calmarRatio == null ? null : Number(calmarRatio.toFixed(3)),
    sortinoRatio: sortinoRatio == null ? null : Number(sortinoRatio.toFixed(3)),
    profitFactor: profitFactor == null ? null : Number(profitFactor.toFixed(3)),
    maxLosingStreak,
    totalReturn: Number(totalReturn.toFixed(2)),
    annualizedReturn: Number((annualizedReturn * 100).toFixed(2)),
  };
}

function computeEdgeFromOriginalVsInverse(
  original: { aggregateWinRate: number | null; avgReturn: number | null },
  inverse: { aggregateWinRate: number | null; avgReturn: number | null },
) {
  const wrDiff = (original.aggregateWinRate ?? 0) - (inverse.aggregateWinRate ?? 0);
  const retDiff = (original.avgReturn ?? 0) - (inverse.avgReturn ?? 0);
  if (wrDiff > 15 && retDiff > 8) return { hasEdge: true, strength: "strong" as const };
  if (wrDiff > 8 && retDiff > 4) return { hasEdge: true, strength: "moderate" as const };
  if (wrDiff > 3 || retDiff > 2) return { hasEdge: true, strength: "weak" as const };
  return { hasEdge: false, strength: "none" as const };
}

async function persistAutoBacktestRun(args: {
  checkedAtIso: string;
  dataStartDate: Date | null;
  dataEndDate: Date | null;
  quality: any;
}) {
  try {
    const autoModel = await prisma.modelBacktest.upsert({
      where: { id: 1 },
      update: {
        name: "Auto Latest PolyOiyen",
        version: "auto",
        modelType: "PolyOiyen",
        status: "active",
        notes: "System-managed auto snapshots from /api/polyoiyen/data-health",
        dataStartDate: args.dataStartDate,
        dataEndDate: args.dataEndDate,
        parameters: JSON.stringify({ source: "data-health", mode: "auto" }),
      },
      create: {
        id: 1,
        name: "Auto Latest PolyOiyen",
        version: "auto",
        modelType: "PolyOiyen",
        status: "active",
        notes: "System-managed auto snapshots from /api/polyoiyen/data-health",
        dataStartDate: args.dataStartDate,
        dataEndDate: args.dataEndDate,
        parameters: JSON.stringify({ source: "data-health", mode: "auto" }),
      },
    });

    const latestRun = await prisma.backtestVersionRun.findFirst({
      where: { modelBacktestId: autoModel.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, totalRuns: true, avgReturn: true, aggregateWinRate: true },
    });

    const nowMs = Date.now();
    const shouldSkipByInterval = latestRun ? (nowMs - latestRun.createdAt.getTime()) < 10 * 60 * 1000 : false;
    const isSameAsLatest = latestRun
      ? latestRun.totalRuns === args.quality.totalRuns
        && Number((latestRun.avgReturn ?? 0).toFixed(2)) === Number((args.quality.avgReturn ?? 0).toFixed(2))
        && Number((latestRun.aggregateWinRate ?? 0).toFixed(2)) === Number((args.quality.aggregateWinRate ?? 0).toFixed(2))
      : false;

    if (shouldSkipByInterval && isSameAsLatest) return;

    const run = await prisma.backtestVersionRun.create({
      data: {
        modelBacktestId: autoModel.id,
        totalRuns: args.quality.totalRuns,
        aggregateWinRate: args.quality.aggregateWinRate,
        avgReturn: args.quality.avgReturn,
        avgMaxDrawdown: args.quality.avgMaxDrawdown,
        equityCurveJson: JSON.stringify(args.quality.equityCurve),
        lossAttributionJson: JSON.stringify(args.quality.lossAttribution),
        worstEventsJson: JSON.stringify(args.quality.lossAttribution.worstEvents),
        diagnosticsJson: JSON.stringify(args.quality.diagnostics),
        backtestStatus: args.quality.status,
      },
    });

    const notifyAutoBacktest = process.env.BACKTEST_NOTIFY_AUTO === "true";
    if (notifyAutoBacktest) {
      void sendBacktestCompletedDiscord({
        modelBacktestId: autoModel.id,
        modelName: autoModel.name,
        modelVersion: autoModel.version,
        runId: run.id,
        totalRuns: run.totalRuns,
        aggregateWinRate: run.aggregateWinRate,
        avgReturn: run.avgReturn,
        avgMaxDrawdown: run.avgMaxDrawdown,
        backtestStatus: run.backtestStatus,
        createdAt: run.createdAt,
        source: "data-health-auto",
      }).catch((err) => {
        console.error("Auto backtest Discord notification failed:", err);
      });
    }

    for (const strategy of args.quality.lossAttribution.byStrategy) {
      const existing = await prisma.strategyVariant.findFirst({
        where: {
          modelBacktestId: autoModel.id,
          strategyName: strategy.strategyName,
          isInverse: false,
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.strategyVariant.create({
          data: {
            modelBacktestId: autoModel.id,
            strategyName: strategy.strategyName,
            isInverse: false,
            runsCount: strategy.runs,
            winRate: strategy.winRate,
            avgReturn: strategy.avgReturn,
            maxDrawdown: strategy.maxDrawdown,
            lossContributionPct: strategy.lossContributionPct,
          },
        });
      } else {
        await prisma.strategyVariant.update({
          where: { id: existing.id },
          data: {
            runsCount: strategy.runs,
            winRate: strategy.winRate,
            avgReturn: strategy.avgReturn,
            maxDrawdown: strategy.maxDrawdown,
            lossContributionPct: strategy.lossContributionPct,
          },
        });
      }
    }
  } catch (err) {
    console.error("auto persist backtest failed", err);
  }
}

async function fetchResolvedWinnerSide(eventId: string): Promise<"YES" | "NO" | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const payload = await res.json();
    const markets = Array.isArray(payload?.markets) ? payload.markets : [];

    const topLevelWinner = inferWinnerSideFromOutcomes(payload?.outcomes, payload?.outcomePrices);
    if (topLevelWinner) return topLevelWinner;

    for (const market of markets) {
      const winner = inferWinnerSideFromOutcomes(market?.outcomes, market?.outcomePrices);
      if (winner) return winner;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchSyntheticBacktestSeed(eventId: string): Promise<{
  marketQuestion: string;
  chosenSide: "YES" | "NO";
  entryPrice: number;
  at: Date;
} | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const payload = await res.json();
    const markets = Array.isArray(payload?.markets) ? payload.markets : [];
    const activeMarket = markets.find((m: { active?: boolean; closed?: boolean }) => m?.active !== false && m?.closed !== true) || markets[0];

    const prices = parseJsonArray<number | string>(activeMarket?.outcomePrices).map((x) => Number(x));
    const yesPriceRaw = Number(prices?.[0]);
    const noPriceRaw = Number(prices?.[1]);
    const yesPrice = Number.isFinite(yesPriceRaw) && yesPriceRaw > 0 && yesPriceRaw < 1 ? yesPriceRaw : null;
    const noPrice = Number.isFinite(noPriceRaw) && noPriceRaw > 0 && noPriceRaw < 1 ? noPriceRaw : null;

    let chosenSide: "YES" | "NO" = "YES";
    let entryPrice = 0.5;
    if (yesPrice != null && noPrice != null) {
      if (noPrice > yesPrice) {
        chosenSide = "NO";
        entryPrice = noPrice;
      } else {
        chosenSide = "YES";
        entryPrice = yesPrice;
      }
    } else if (yesPrice != null) {
      chosenSide = "YES";
      entryPrice = yesPrice;
    } else if (noPrice != null) {
      chosenSide = "NO";
      entryPrice = noPrice;
    }

    const atIso = payload?.endDate || payload?.updatedAt || payload?.startDate || payload?.createdAt;
    const at = atIso ? new Date(atIso) : new Date();

    return {
      marketQuestion: String(payload?.title || payload?.question || `Event ${eventId}`),
      chosenSide,
      entryPrice,
      at: Number.isFinite(at.getTime()) ? at : new Date(),
    };
  } catch {
    return null;
  }
}

async function fetchEventTitleMap(eventIds: string[]): Promise<Record<string, string>> {
  const uniqueEventIds = [...new Set(eventIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueEventIds.map(async (eventId) => {
      try {
        const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return [eventId, ""] as const;
        const payload = await res.json();
        const title = typeof payload?.title === "string" ? payload.title : "";
        return [eventId, title] as const;
      } catch {
        return [eventId, ""] as const;
      }
    })
  );

  return Object.fromEntries(entries.filter(([, title]) => Boolean(title))) as Record<string, string>;
}

async function probe(baseUrl: string, endpointKey: string, path: string) {
  const started = Date.now();
  let ok = false;
  let statusCode: number | null = null;

  try {
    const res = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    ok = res.ok;
    statusCode = res.status;
  } catch {
    ok = false;
    statusCode = null;
  }

  const latencyMs = Math.max(1, Date.now() - started);
  await prisma.endpointProbe.create({
    data: {
      endpoint: endpointKey,
      ok,
      statusCode,
      latencyMs,
    },
  });

  return { endpoint: endpointKey, ok, statusCode, latencyMs };
}

function isPrismaConnectionBusy(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const msg = error instanceof Error ? error.message : String(error || "");
  return code === "P2037" || /too many database connections|remaining connection slots/i.test(msg);
}

function buildDegradedDataHealthResponse(selectedEventIds: Set<string>, reason: string) {
  const categoryHealth: Record<CategoryKey, { eventCount: number; tokenCoveragePct: number; avgLiquidity: number }> = {
    elonTweets: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    movieBoxOffice: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    fedRates: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    nbaGames: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
  };

  return {
    checkedAt: new Date().toISOString(),
    status: "degraded",
    services: {
      database: { ok: false, latencyMs: null },
      polymarketUpstream: { ok: true, latencyMs: null },
    },
    telemetry24h: {
      counts: { poly_probe: 0, invest_pull: 0, invest_action: 0, health_ok: 0, health_fail: 1 },
      healthChecks: 1,
      uptimePercent: 0,
      sampleSize: 0,
    },
    probes: { latest: [], endpointBreakdown: [] },
    freshness: {
      lastPullMetricAt: null,
      pullMetricAgeMinutes: null,
      lastDepthSnapshotAt: null,
      depthSnapshotAgeMinutes: null,
      lastAlertNotificationAt: null,
      alertNotificationAgeMinutes: null,
    },
    alerts24h: {
      notificationsSent: 0,
      cooldownSkipped: 0,
      cooldownHitRatePercent: 0,
    },
    backtestQuality: {
      totalRuns: 0,
      aggregateWinRate: null,
      avgReturn: null,
      avgMaxDrawdown: null,
      status: "degraded",
      diagnostics: {
        resolvedSamples: 0,
        unresolvedEvents: selectedEventIds.size,
        excludedNoBuyEvents: 0,
        scannedEvents: 0,
        selectionFilterApplied: selectedEventIds.size > 0,
        requestedEventIds: selectedEventIds.size,
        matchedEventIds: 0,
      },
      lossAttribution: {
        byStrategy: [],
        inverseByStrategy: [],
        worstEvents: [],
        bestEvents: [],
        inverseWorstEvents: [],
        inverseBestEvents: [],
        bucketContributions: {
          original: { byEventType: [], byCategory: [], byLiquidityBucket: [], topFactors: [] },
          inverse: { byEventType: [], byCategory: [], byLiquidityBucket: [], topFactors: [] },
        },
      },
      equityCurve: {
        aggregate: [],
        byStrategy: [],
        inverseAggregate: [],
        inverseByStrategy: [],
      },
      inverseSummary: {
        aggregateWinRate: null,
        avgReturn: null,
        avgMaxDrawdown: null,
        edge: { hasEdge: false, strength: "none" },
      },
      riskMetrics: {
        original: { calmarRatio: null, sortinoRatio: null, profitFactor: null, maxLosingStreak: 0, totalReturn: null, annualizedReturn: null },
        inverse: { calmarRatio: null, sortinoRatio: null, profitFactor: null, maxLosingStreak: 0, totalReturn: null, annualizedReturn: null },
      },
      bestStrategy: null,
      recentRuns: [],
      inverseRecentRuns: [],
    },
    selection: {
      eventIdsFilterApplied: selectedEventIds.size > 0,
      requestedEventIds: selectedEventIds.size,
      matchedEventIds: 0,
    },
    categoryHealth,
    trend24h: [],
    degradedReason: reason,
  };
}

export async function GET(req: Request) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const reqUrl = new URL(req.url);
  const selectedEventIds = new Set(
    (reqUrl.searchParams.get("eventIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
  const baseUrl = new URL(req.url).origin;
  const authUser = await getAuthUser();
  const authUserId = authUser?.userId ?? null;

  try {

  const dbStarted = Date.now();
  let dbLatencyMs = 0;
  let dbOk = false;

  try {
    await prisma.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
    dbLatencyMs = Date.now() - dbStarted;
    dbOk = true;
  } catch {
    dbLatencyMs = Date.now() - dbStarted;
    dbOk = false;
  }

  const upstreamStarted = Date.now();
  let upstreamLatencyMs = 0;
  let upstreamOk = false;

  try {
    const upstream = await fetch("https://gamma-api.polymarket.com/events?limit=1&offset=0&active=true&closed=false", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    upstreamLatencyMs = Date.now() - upstreamStarted;
    upstreamOk = upstream.ok;
  } catch {
    upstreamLatencyMs = Date.now() - upstreamStarted;
    upstreamOk = false;
  }

  const lightweightEventRes = await fetch(`${baseUrl}/api/polymarket?limit=1&offset=0&active=true&closed=false`, { cache: "no-store" }).catch(() => null);
  let eventId = "";
  let yesToken = "";
  let noToken = "";

  if (lightweightEventRes?.ok) {
    const payload = await lightweightEventRes.json();
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
    const first = list[0];
    if (first?.id) {
      eventId = String(first.id);
      const activeMarket = Array.isArray(first.markets)
        ? first.markets.find((m: { active?: boolean; closed?: boolean }) => m?.active !== false && m?.closed !== true) || first.markets[0]
        : null;
      const parsed = parseTokenIds(activeMarket?.clobTokenIds);
      yesToken = parsed.yes;
      noToken = parsed.no;
    }
  }

  const probePaths: Array<{ key: string; path: string }> = [
    { key: "health", path: "/api/health" },
    { key: "polymarket_events", path: "/api/polymarket?limit=2&offset=0&active=true&closed=false" },
    { key: "top_candidates", path: "/api/polyoiyen/top-candidates?limit=3" },
  ];

  if (eventId) {
    probePaths.push({ key: "depth_stats", path: `/api/polyoiyen/depth-stats?eventIds=${encodeURIComponent(eventId)}&hoursBack=24&includeSeries=false&bucketMinutes=60` });
  }
  if (yesToken) {
    probePaths.push({ key: "orderbook", path: `/api/polymarket/orderbook?token_id=${encodeURIComponent(yesToken)}` });
  }
  if (yesToken && noToken) {
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    probePaths.push({
      key: "predictors",
      path: `/api/polymarket/predictors?assetIds=${encodeURIComponent(`${yesToken},${noToken}`)}&volume=1000&limit=20&maxPages=3`,
    });
    probePaths.push({
      key: "volatility_rating",
      path: `/api/polymarket/volatility-rating?yesAssetId=${encodeURIComponent(yesToken)}&noAssetId=${encodeURIComponent(noToken)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&bucketSeconds=3600&limit=20&maxPages=3`,
    });
  }

  const latestProbe = await Promise.all(probePaths.map((x) => probe(baseUrl, x.key, x.path)));

  // Keep DB access mostly sequential to reduce connection bursts in serverless environments.
  const pullRows = await prisma.pullMetric.findMany({
    where: {
      createdAt: {
        gte: since,
        lte: new Date(now),
      },
    },
    select: {
      kind: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5000,
  });

  const endpointRows24h = await prisma.endpointProbe.findMany({
    where: {
      createdAt: {
        gte: since,
        lte: new Date(now),
      },
    },
    select: {
      endpoint: true,
      ok: true,
      latencyMs: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20000,
  });

  const latestPullMetric = await prisma.pullMetric.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const latestDepthSnapshot = await prisma.marketDepthSnapshot.findFirst({ orderBy: { sampledAt: "desc" }, select: { sampledAt: true } });
  const latestAlertNotify = await prisma.alertNotificationEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const alertEvents24h = await prisma.alertNotificationEvent.groupBy({
    by: ["eventType"],
    where: {
      createdAt: {
        gte: since,
        lte: new Date(now),
      },
    },
    _count: { _all: true },
  });

  const polyBetRows = await prisma.polyBet.findMany({
    where: {
      ...(authUserId ? { userId: authUserId } : { userId: -1 }),
      side: { in: ["YES", "NO"] },
      type: { in: ["BUY", "SELL", "CLAIM"] },
    },
    orderBy: { createdAt: "desc" },
    take: 4000,
    select: {
      eventId: true,
      marketQuestion: true,
      side: true,
      type: true,
      amount: true,
      shares: true,
      category: true,
      createdAt: true,
    },
  });

  const counts: Record<PullKind, number> = {
    poly_probe: 0,
    invest_pull: 0,
    invest_action: 0,
    health_ok: 0,
    health_fail: 0,
  };

  for (const row of pullRows) {
    const kind = row.kind as PullKind;
    if (kind in counts) counts[kind] += 1;
  }

  const healthChecks = counts.health_ok + counts.health_fail;
  const uptimePercent24h = healthChecks > 0 ? pct(counts.health_ok, healthChecks) : null;

  const endpointNames = Array.from(new Set(endpointRows24h.map((r) => r.endpoint)));
  const endpointBreakdown = endpointNames
    .map((endpoint) => {
      const rows24 = endpointRows24h.filter((r) => r.endpoint === endpoint);
      const rows1 = rows24.filter((r) => r.createdAt >= oneHourAgo);

      const total24 = rows24.length;
      const fail24 = rows24.filter((r) => !r.ok).length;
      const total1 = rows1.length;
      const fail1 = rows1.filter((r) => !r.ok).length;

      const latencies24 = rows24.map((r) => r.latencyMs);

      return {
        endpoint,
        errorRate1h: total1 > 0 ? pct(fail1, total1) : null,
        errorRate24h: total24 > 0 ? pct(fail24, total24) : null,
        samples1h: total1,
        samples24h: total24,
        latency: {
          p50: percentile(latencies24, 50),
          p95: percentile(latencies24, 95),
          p99: percentile(latencies24, 99),
        },
      };
    })
    .sort((a, b) => (b.errorRate24h ?? -1) - (a.errorRate24h ?? -1));

  const alertEventMap: Record<string, number> = {};
  for (const row of alertEvents24h) {
    alertEventMap[row.eventType] = row._count._all;
  }

  const groupedPoly = new Map<string, {
    eventId: string;
    marketQuestion: string;
    eventTitle: string;
    yesBuyAmount: number;
    yesBuyShares: number;
    yesSellAmount: number;
    yesSellShares: number;
    noBuyAmount: number;
    noBuyShares: number;
    noSellAmount: number;
    noSellShares: number;
    claimAmount: number;
    categoryScores: Record<string, number>;
    firstEntryAt: Date | null;
    lastExitAt: Date | null;
    lastAt: Date;
  }>();

  const eventTitleMap = await fetchEventTitleMap(polyBetRows.map((row) => row.eventId));

  for (const b of polyBetRows) {
    const side = b.side === "YES" || b.side === "NO" ? b.side : null;
    if (!side) continue;
    const key = b.eventId;
    const current = groupedPoly.get(key) || {
      eventId: b.eventId,
      marketQuestion: b.marketQuestion,
      eventTitle: eventTitleMap[b.eventId] || b.marketQuestion,
      yesBuyAmount: 0,
      yesBuyShares: 0,
      yesSellAmount: 0,
      yesSellShares: 0,
      noBuyAmount: 0,
      noBuyShares: 0,
      noSellAmount: 0,
      noSellShares: 0,
      claimAmount: 0,
      categoryScores: {},
      firstEntryAt: null,
      lastExitAt: null,
      lastAt: b.createdAt,
    };

    const amt = Number(b.amount || 0);
    const sh = Number(b.shares || 0);
    const t = b.type || "BUY";

    if (t === "BUY") {
      if (side === "YES") {
        current.yesBuyAmount += amt;
        current.yesBuyShares += sh;
      } else {
        current.noBuyAmount += amt;
        current.noBuyShares += sh;
      }
      const cat = (b.category || "PolyOiyen").trim() || "PolyOiyen";
      current.categoryScores[cat] = (current.categoryScores[cat] || 0) + Math.max(0, amt);
      if (!current.firstEntryAt || b.createdAt < current.firstEntryAt) {
        current.firstEntryAt = b.createdAt;
      }
    } else if (t === "SELL") {
      if (side === "YES") {
        current.yesSellAmount += amt;
        current.yesSellShares += sh;
      } else {
        current.noSellAmount += amt;
        current.noSellShares += sh;
      }
      if (!current.lastExitAt || b.createdAt > current.lastExitAt) {
        current.lastExitAt = b.createdAt;
      }
    } else if (t === "CLAIM") {
      current.claimAmount += amt;
      if (!current.lastExitAt || b.createdAt > current.lastExitAt) {
        current.lastExitAt = b.createdAt;
      }
    }

    if (b.createdAt > current.lastAt) current.lastAt = b.createdAt;
    if (b.marketQuestion) current.marketQuestion = b.marketQuestion;
    current.eventTitle = eventTitleMap[b.eventId] || current.eventTitle || b.marketQuestion;
    groupedPoly.set(key, current);
  }

  const groupedListBeforeFilter = Array.from(groupedPoly.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  const groupedList = selectedEventIds.size > 0
    ? groupedListBeforeFilter.filter((row) => selectedEventIds.has(row.eventId))
    : groupedListBeforeFilter;

  let syntheticNoBuyInjected = 0;
  if (selectedEventIds.size > 0) {
    const have = new Set(groupedList.map((row) => row.eventId));
    const missingIds = Array.from(selectedEventIds).filter((id) => !have.has(id));
    if (missingIds.length > 0) {
      const seeds = await Promise.all(missingIds.map((id) => fetchSyntheticBacktestSeed(id)));
      seeds.forEach((seed, idx) => {
        const eventId = missingIds[idx];
        if (!seed) return;
        const entryPrice = Math.max(0.01, Math.min(0.99, seed.entryPrice));
        const shares = Number((FIXED_BACKTEST_BUDGET_USD / entryPrice).toFixed(6));

        groupedList.push({
          eventId,
          marketQuestion: seed.marketQuestion,
          eventTitle: seed.marketQuestion,
          yesBuyAmount: seed.chosenSide === "YES" ? FIXED_BACKTEST_BUDGET_USD : 0,
          yesBuyShares: seed.chosenSide === "YES" ? shares : 0,
          yesSellAmount: 0,
          yesSellShares: 0,
          noBuyAmount: seed.chosenSide === "NO" ? FIXED_BACKTEST_BUDGET_USD : 0,
          noBuyShares: seed.chosenSide === "NO" ? shares : 0,
          noSellAmount: 0,
          noSellShares: 0,
          claimAmount: 0,
          categoryScores: { "Backtest Basket": FIXED_BACKTEST_BUDGET_USD },
          firstEntryAt: seed.at,
          lastExitAt: null,
          lastAt: seed.at,
        });
        syntheticNoBuyInjected += 1;
      });
    }
  }
  const evaluableEvents = groupedList.filter((x) => (x.yesBuyAmount + x.noBuyAmount) > 0);
  const excludedNoBuyEvents = groupedList.length - evaluableEvents.length;
  const targetEventIds = Array.from(new Set(evaluableEvents.map((x) => x.eventId))).slice(0, 120);
  const eventWinnerEntries = await Promise.all(targetEventIds.map(async (eventId) => [eventId, await fetchResolvedWinnerSide(eventId)] as const));
  const eventWinners = new Map<string, "YES" | "NO" | null>(eventWinnerEntries);

  const resolvedRuns = evaluableEvents
    .map((r) => {
      const winner = eventWinners.get(r.eventId);
      if (!winner) return null;
      const netYesShares = Math.max(0, r.yesBuyShares - r.yesSellShares);
      const netNoShares = Math.max(0, r.noBuyShares - r.noSellShares);
      const payoutRemaining = winner === "YES" ? netYesShares : netNoShares;
      const realizedValue = r.yesSellAmount + r.noSellAmount + r.claimAmount + payoutRemaining;
      const invested = r.yesBuyAmount + r.noBuyAmount;
      const isYesBias = r.yesBuyAmount >= r.noBuyAmount;
      const sideBias = isYesBias ? "YES_BIAS" : "NO_BIAS";
      const entryAmount = isYesBias ? r.yesBuyAmount : r.noBuyAmount;
      const entryShares = isYesBias ? r.yesBuyShares : r.noBuyShares;
      const exitAmount = isYesBias ? r.yesSellAmount : r.noSellAmount;
      const exitShares = isYesBias ? r.yesSellShares : r.noSellShares;
      const entryPrice = entryShares > 0 ? entryAmount / entryShares : null;
      const exitPrice = exitShares > 0 ? exitAmount / exitShares : null;
      const exitedByAction = (r.yesSellAmount + r.noSellAmount + r.claimAmount) > 0;
      const exitedByFlatShares = netYesShares <= 0.000001 && netNoShares <= 0.000001;
      const hasExited = exitedByAction || exitedByFlatShares;
      const ret = invested > 0 ? ((realizedValue - invested) / invested) * 100 : 0;
      const isWin = ret >= 0;

      const bestCategory = Object.entries(r.categoryScores)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      const strategyName = bestCategory ? `${bestCategory} Strategy` : "PolyOiyen Strategy";
      const category = bestCategory || "PolyOiyen";
      const eventType = classifyEventType(r.marketQuestion || "");
      const investedBucket = bucketLiquidity(invested);

      return {
        eventId: r.eventId,
        marketQuestion: r.marketQuestion,
        eventTitle: r.eventTitle,
        strategyName,
        category,
        eventType,
        sideBias,
        depthBucket: investedBucket,
        invested: Number(invested.toFixed(2)),
        entryPrice: entryPrice == null ? null : Number(entryPrice.toFixed(6)),
        exitPrice: exitPrice == null ? null : Number(exitPrice.toFixed(6)),
        entryAt: (r.firstEntryAt || r.lastAt).toISOString(),
        exitAt: r.lastExitAt ? r.lastExitAt.toISOString() : null,
        hasExited,
        totalReturn: Number(ret.toFixed(2)),
        totalTrades: 1,
        winningTrades: isWin ? 1 : 0,
        losingTrades: isWin ? 0 : 1,
        winRate: isWin ? 100 : 0,
        createdAt: r.lastAt.toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const unresolvedEvents = Math.max(0, evaluableEvents.length - resolvedRuns.length);

  const wins = resolvedRuns.reduce((sum, r) => sum + r.winningTrades, 0);
  const losses = resolvedRuns.reduce((sum, r) => sum + r.losingTrades, 0);
  const tradeCount = wins + losses;
  const backtestWinRate = tradeCount > 0 ? pct(wins, tradeCount) : null;
  const resolvedRunsSorted = [...resolvedRuns].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const avgReturn = resolvedRuns.length > 0
    ? resolvedRuns.reduce((sum, r) => sum + r.totalReturn, 0) / resolvedRuns.length
    : null;

  const strategyPerformance = new Map<string, { returns: number[] }>();
  for (const row of resolvedRunsSorted) {
    const current = strategyPerformance.get(row.strategyName) || { returns: [] };
    current.returns.push(row.totalReturn);
    strategyPerformance.set(row.strategyName, current);
  }

  const strategyDrawdowns = Array.from(strategyPerformance.entries()).map(([strategyName, performance]) => ({
    strategyName,
    maxDrawdown: computeMaxDrawdownFromReturns(performance.returns),
  }));

  const avgMaxDrawdown = strategyDrawdowns.length > 0
    ? strategyDrawdowns.reduce((sum, row) => sum + row.maxDrawdown, 0) / strategyDrawdowns.length
    : null;

  const inverseResolvedRunsSorted = resolvedRunsSorted.map((row) => ({
    ...row,
    strategyName: `${row.strategyName} (inverse version)`,
    sideBias: row.sideBias === "YES_BIAS" ? "NO_BIAS" : "YES_BIAS",
    totalReturn: Number((-row.totalReturn).toFixed(2)),
    winningTrades: row.losingTrades,
    losingTrades: row.winningTrades,
    winRate: row.winRate == null ? null : Number((100 - row.winRate).toFixed(2)),
  }));

  const inverseWins = inverseResolvedRunsSorted.reduce((sum, r) => sum + r.winningTrades, 0);
  const inverseLosses = inverseResolvedRunsSorted.reduce((sum, r) => sum + r.losingTrades, 0);
  const inverseTradeCount = inverseWins + inverseLosses;
  const inverseAggregateWinRate = inverseTradeCount > 0 ? pct(inverseWins, inverseTradeCount) : null;
  const inverseAvgReturn = inverseResolvedRunsSorted.length > 0
    ? inverseResolvedRunsSorted.reduce((sum, r) => sum + r.totalReturn, 0) / inverseResolvedRunsSorted.length
    : null;

  const inverseStrategyPerformance = new Map<string, { returns: number[] }>();
  for (const row of inverseResolvedRunsSorted) {
    const current = inverseStrategyPerformance.get(row.strategyName) || { returns: [] };
    current.returns.push(row.totalReturn);
    inverseStrategyPerformance.set(row.strategyName, current);
  }

  const inverseStrategyDrawdowns = Array.from(inverseStrategyPerformance.entries()).map(([strategyName, performance]) => ({
    strategyName,
    maxDrawdown: computeMaxDrawdownFromReturns(performance.returns),
  }));

  const inverseAvgMaxDrawdown = inverseStrategyDrawdowns.length > 0
    ? inverseStrategyDrawdowns.reduce((sum, row) => sum + row.maxDrawdown, 0) / inverseStrategyDrawdowns.length
    : null;

  const equityCurve = {
    aggregate: buildEquityCurvePoints(resolvedRunsSorted),
    byStrategy: Array.from(strategyPerformance.keys()).map((strategyName) => {
      const rows = resolvedRunsSorted.filter((row) => row.strategyName === strategyName);
      const points = buildEquityCurvePoints(rows);
      const maxDrawdown = computeMaxDrawdownFromReturns(rows.map((row) => row.totalReturn));
      return {
        strategyName,
        maxDrawdown,
        points,
      };
    }),
    inverseAggregate: buildEquityCurvePoints(inverseResolvedRunsSorted),
    inverseByStrategy: Array.from(inverseStrategyPerformance.keys()).map((strategyName) => {
      const rows = inverseResolvedRunsSorted.filter((row) => row.strategyName === strategyName);
      const points = buildEquityCurvePoints(rows);
      const maxDrawdown = computeMaxDrawdownFromReturns(rows.map((row) => row.totalReturn));
      return {
        strategyName,
        maxDrawdown,
        points,
      };
    }),
  };

  const modelQualityStatus: "healthy" | "degraded" | "unhealthy" | "sufficient" =
    resolvedRuns.length < 20
      ? "sufficient"
      : (backtestWinRate ?? 0) < 45 && (avgReturn ?? -999) < 0
        ? "unhealthy"
        : (backtestWinRate ?? 0) >= 55 && (avgReturn ?? -999) >= 0 && resolvedRuns.length >= 50
          ? "healthy"
          : "degraded";

  const strategyMap = new Map<string, { runs: number; wins: number; losses: number; returnSum: number }>();
  for (const row of resolvedRuns) {
    const current = strategyMap.get(row.strategyName) || { runs: 0, wins: 0, losses: 0, returnSum: 0 };
    current.runs += 1;
    current.wins += row.winningTrades;
    current.losses += row.losingTrades;
    current.returnSum += row.totalReturn;
    strategyMap.set(row.strategyName, current);
  }

  const strategyLeaderboard = Array.from(strategyMap.entries())
    .map(([strategyName, s]) => {
      const closedTrades = Math.max(0, s.wins + s.losses);
      const maxDrawdown = strategyDrawdowns.find((row) => row.strategyName === strategyName)?.maxDrawdown ?? null;
      return {
        strategyName,
        runs: s.runs,
        winRate: closedTrades > 0 ? pct(s.wins, closedTrades) : null,
        avgReturn: s.runs > 0 ? s.returnSum / s.runs : null,
        maxDrawdown,
      };
    })
    .sort((a, b) => {
      const wA = a.winRate ?? -1;
      const wB = b.winRate ?? -1;
      if (wA !== wB) return wB - wA;
      return (b.avgReturn ?? -9999) - (a.avgReturn ?? -9999);
    });

  const bestStrategy = strategyLeaderboard[0] || null;

  const totalLossAbs = resolvedRuns.reduce((sum, row) => sum + Math.abs(Math.min(0, row.totalReturn)), 0);
  const lossAttributionByStrategy = strategyLeaderboard
    .map((s) => {
      const rows = resolvedRuns.filter((r) => r.strategyName === s.strategyName);
      const lossAbs = rows.reduce((sum, r) => sum + Math.abs(Math.min(0, r.totalReturn)), 0);
      return {
        strategyName: s.strategyName,
        runs: s.runs,
        winRate: s.winRate == null ? null : Number(s.winRate.toFixed(2)),
        avgReturn: s.avgReturn == null ? null : Number(s.avgReturn.toFixed(2)),
        maxDrawdown: s.maxDrawdown == null ? null : Number(s.maxDrawdown.toFixed(2)),
        lossContributionPct: totalLossAbs > 0 ? Number(pct(lossAbs, totalLossAbs).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.lossContributionPct - a.lossContributionPct);

  const inverseStrategyMap = new Map<string, { runs: number; wins: number; losses: number; returnSum: number }>();
  for (const row of inverseResolvedRunsSorted) {
    const current = inverseStrategyMap.get(row.strategyName) || { runs: 0, wins: 0, losses: 0, returnSum: 0 };
    current.runs += 1;
    current.wins += row.winningTrades;
    current.losses += row.losingTrades;
    current.returnSum += row.totalReturn;
    inverseStrategyMap.set(row.strategyName, current);
  }

  const inverseStrategyLeaderboard = Array.from(inverseStrategyMap.entries())
    .map(([strategyName, s]) => {
      const closedTrades = Math.max(0, s.wins + s.losses);
      const maxDrawdown = inverseStrategyDrawdowns.find((row) => row.strategyName === strategyName)?.maxDrawdown ?? null;
      return {
        strategyName,
        runs: s.runs,
        winRate: closedTrades > 0 ? pct(s.wins, closedTrades) : null,
        avgReturn: s.runs > 0 ? s.returnSum / s.runs : null,
        maxDrawdown,
      };
    })
    .sort((a, b) => (b.avgReturn ?? -9999) - (a.avgReturn ?? -9999));

  const totalInverseLossAbs = inverseResolvedRunsSorted.reduce((sum, row) => sum + Math.abs(Math.min(0, row.totalReturn)), 0);
  const inverseLossAttributionByStrategy = inverseStrategyLeaderboard
    .map((s) => {
      const rows = inverseResolvedRunsSorted.filter((r) => r.strategyName === s.strategyName);
      const lossAbs = rows.reduce((sum, r) => sum + Math.abs(Math.min(0, r.totalReturn)), 0);
      return {
        strategyName: s.strategyName,
        runs: s.runs,
        winRate: s.winRate == null ? null : Number(s.winRate.toFixed(2)),
        avgReturn: s.avgReturn == null ? null : Number(s.avgReturn.toFixed(2)),
        maxDrawdown: s.maxDrawdown == null ? null : Number(s.maxDrawdown.toFixed(2)),
        lossContributionPct: totalInverseLossAbs > 0 ? Number(pct(lossAbs, totalInverseLossAbs).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.lossContributionPct - a.lossContributionPct);

  const inverseSummary = {
    aggregateWinRate: inverseAggregateWinRate == null ? null : Number(inverseAggregateWinRate.toFixed(2)),
    avgReturn: inverseAvgReturn == null ? null : Number(inverseAvgReturn.toFixed(2)),
    avgMaxDrawdown: inverseAvgMaxDrawdown == null ? null : Number(inverseAvgMaxDrawdown.toFixed(2)),
    edge: computeEdgeFromOriginalVsInverse(
      {
        aggregateWinRate: backtestWinRate == null ? null : Number(backtestWinRate.toFixed(2)),
        avgReturn: avgReturn == null ? null : Number(avgReturn.toFixed(2)),
      },
      {
        aggregateWinRate: inverseAggregateWinRate == null ? null : Number(inverseAggregateWinRate.toFixed(2)),
        avgReturn: inverseAvgReturn == null ? null : Number(inverseAvgReturn.toFixed(2)),
      },
    ),
  };

  const riskMetrics = {
    original: buildRiskMetrics(resolvedRunsSorted, avgMaxDrawdown),
    inverse: buildRiskMetrics(inverseResolvedRunsSorted, inverseAvgMaxDrawdown),
  };

  const worstEvents = resolvedRuns
    .map((r) => ({
      eventId: r.eventId,
      marketQuestion: r.marketQuestion,
      eventTitle: r.eventTitle,
      strategyName: r.strategyName,
      totalReturn: r.totalReturn,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.totalReturn - b.totalReturn)
    .slice(0, 8);

  const bestEvents = resolvedRuns
    .map((r) => ({
      eventId: r.eventId,
      marketQuestion: r.marketQuestion,
      eventTitle: r.eventTitle,
      strategyName: r.strategyName,
      totalReturn: r.totalReturn,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => b.totalReturn - a.totalReturn)
    .slice(0, 8);

  const inverseWorstEvents = inverseResolvedRunsSorted
    .map((r) => ({
      eventId: r.eventId,
      marketQuestion: r.marketQuestion,
      eventTitle: r.eventTitle,
      strategyName: r.strategyName,
      totalReturn: r.totalReturn,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.totalReturn - b.totalReturn)
    .slice(0, 8);

  const inverseBestEvents = inverseResolvedRunsSorted
    .map((r) => ({
      eventId: r.eventId,
      marketQuestion: r.marketQuestion,
      eventTitle: r.eventTitle,
      strategyName: r.strategyName,
      totalReturn: r.totalReturn,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => b.totalReturn - a.totalReturn)
    .slice(0, 8);

  const bucketContributions = {
    original: buildBucketContribution(resolvedRunsSorted, "original"),
    inverse: buildBucketContribution(inverseResolvedRunsSorted, "inverse"),
  };

  const recentRuns = resolvedRuns.slice(0, 8).map((r) => ({
    symbol: r.eventId,
    eventId: r.eventId,
    marketQuestion: r.marketQuestion,
    eventTitle: r.eventTitle,
    strategyName: r.strategyName,
    position: r.sideBias,
    invested: r.invested,
    entryPrice: r.entryPrice,
    exitPrice: r.exitPrice,
    entryAt: r.entryAt,
    exitAt: r.exitAt,
    hasExited: r.hasExited,
    totalReturn: r.totalReturn,
    totalTrades: r.totalTrades,
    winRate: r.winRate,
    createdAt: r.createdAt,
  }));

  const inverseRecentRuns = inverseResolvedRunsSorted.slice(0, 8).map((r) => ({
    symbol: r.eventId,
    eventId: r.eventId,
    marketQuestion: r.marketQuestion,
    eventTitle: r.eventTitle,
    strategyName: r.strategyName,
    position: r.sideBias,
    invested: r.invested,
    entryPrice: r.entryPrice,
    exitPrice: r.exitPrice,
    entryAt: r.entryAt,
    exitAt: r.exitAt,
    hasExited: r.hasExited,
    totalReturn: r.totalReturn,
    totalTrades: r.totalTrades,
    winRate: r.winRate,
    createdAt: r.createdAt,
  }));

  const freshness = {
    lastPullMetricAt: latestPullMetric?.createdAt?.toISOString() || null,
    pullMetricAgeMinutes: ageMinutes(latestPullMetric?.createdAt?.toISOString() || null),
    lastDepthSnapshotAt: latestDepthSnapshot?.sampledAt?.toISOString() || null,
    depthSnapshotAgeMinutes: ageMinutes(latestDepthSnapshot?.sampledAt?.toISOString() || null),
    lastAlertNotificationAt: latestAlertNotify?.createdAt?.toISOString() || null,
    alertNotificationAgeMinutes: ageMinutes(latestAlertNotify?.createdAt?.toISOString() || null),
  };

  const categoryHealth: Record<CategoryKey, { eventCount: number; tokenCoveragePct: number; avgLiquidity: number }> = {
    elonTweets: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    movieBoxOffice: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    fedRates: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
    nbaGames: { eventCount: 0, tokenCoveragePct: 0, avgLiquidity: 0 },
  };

  for (const cat of CATEGORY_CONFIG) {
    const tagSlugs = TAG_SLUGS_BY_CATEGORY[cat.key] || [];
    const dedup = new Map<string, { liquidity?: number; markets?: Array<{ clobTokenIds?: string; active?: boolean; closed?: boolean }> }>();

    for (const slug of tagSlugs) {
      try {
        const u = new URL("https://gamma-api.polymarket.com/events");
        u.searchParams.set("limit", "80");
        u.searchParams.set("offset", "0");
        u.searchParams.set("active", "true");
        u.searchParams.set("closed", "false");
        u.searchParams.set("tag_slug", slug);
        const res = await fetch(u.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!res.ok) continue;
        const payload = await res.json();
        const events = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
        for (const e of events) {
          if (!e?.id || dedup.has(e.id)) continue;
          dedup.set(e.id, e);
        }
      } catch {
        // ignore category fetch errors
      }
    }

    const allEvents = Array.from(dedup.values());
    const complete = allEvents.filter((e) => hasCompleteYesNoTokens(e));
    const avgLiquidity = allEvents.length > 0
      ? allEvents.reduce((sum, e) => sum + Number((e.liquidity as number) || 0), 0) / allEvents.length
      : 0;

    categoryHealth[cat.key] = {
      eventCount: allEvents.length,
      tokenCoveragePct: allEvents.length > 0 ? pct(complete.length, allEvents.length) : 0,
      avgLiquidity: Number(avgLiquidity.toFixed(2)),
    };
  }

  // 24h trend buckets for lightweight chart rendering
  const bucketMs = 60 * 60 * 1000;
  const startBucket = Math.floor((now - 24 * bucketMs) / bucketMs) * bucketMs;
  const trend = [] as Array<{
    ts: number;
    label: string;
    healthOk: number;
    healthFail: number;
    endpointErrors: number;
    avgLatencyMs: number | null;
  }>;

  for (let ts = startBucket; ts <= now; ts += bucketMs) {
    const next = ts + bucketMs;
    const pulls = pullRows.filter((r) => {
      const t = r.createdAt.getTime();
      return t >= ts && t < next;
    });
    const probes = endpointRows24h.filter((r) => {
      const t = r.createdAt.getTime();
      return t >= ts && t < next;
    });

    const healthOk = pulls.filter((x) => x.kind === "health_ok").length;
    const healthFail = pulls.filter((x) => x.kind === "health_fail").length;
    const endpointErrors = probes.filter((x) => !x.ok).length;
    const avgLatencyMs = probes.length > 0
      ? Math.round(probes.reduce((sum, p) => sum + p.latencyMs, 0) / probes.length)
      : null;

    trend.push({
      ts,
      label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      healthOk,
      healthFail,
      endpointErrors,
      avgLatencyMs,
    });
  }

  const responsePayload = {
    checkedAt: new Date().toISOString(),
    status: dbOk && upstreamOk ? "healthy" : "degraded",
    services: {
      database: {
        ok: dbOk,
        latencyMs: dbLatencyMs,
      },
      polymarketUpstream: {
        ok: upstreamOk,
        latencyMs: upstreamLatencyMs,
      },
    },
    telemetry24h: {
      counts,
      healthChecks,
      uptimePercent: uptimePercent24h,
      sampleSize: pullRows.length,
    },
    probes: {
      latest: latestProbe,
      endpointBreakdown,
    },
    freshness,
    alerts24h: {
      notificationsSent: alertEventMap.SENT || 0,
      cooldownSkipped: alertEventMap.SKIPPED_COOLDOWN || 0,
      cooldownHitRatePercent: pct(alertEventMap.SKIPPED_COOLDOWN || 0, (alertEventMap.SENT || 0) + (alertEventMap.SKIPPED_COOLDOWN || 0)),
    },
    backtestQuality: {
      totalRuns: resolvedRuns.length,
      aggregateWinRate: backtestWinRate,
      avgReturn: avgReturn == null ? null : Number(avgReturn.toFixed(2)),
      avgMaxDrawdown,
      status: modelQualityStatus,
      diagnostics: {
        resolvedSamples: resolvedRuns.length,
        unresolvedEvents,
        excludedNoBuyEvents,
        syntheticNoBuyInjected,
        fixedBacktestBudgetUsd: FIXED_BACKTEST_BUDGET_USD,
        scannedEvents: groupedList.length,
        selectionFilterApplied: selectedEventIds.size > 0,
        requestedEventIds: selectedEventIds.size,
        matchedEventIds: groupedList.length,
      },
      lossAttribution: {
        byStrategy: lossAttributionByStrategy,
        inverseByStrategy: inverseLossAttributionByStrategy,
        worstEvents,
        bestEvents,
        inverseWorstEvents,
        inverseBestEvents,
        bucketContributions,
      },
      equityCurve,
      inverseSummary,
      riskMetrics,
      bestStrategy: bestStrategy
        ? {
            strategyName: bestStrategy.strategyName,
            runs: bestStrategy.runs,
            winRate: bestStrategy.winRate == null ? null : Number(bestStrategy.winRate.toFixed(2)),
            avgReturn: bestStrategy.avgReturn == null ? null : Number(bestStrategy.avgReturn.toFixed(2)),
          }
        : null,
      recentRuns,
      inverseRecentRuns,
    },
    selection: {
      eventIdsFilterApplied: selectedEventIds.size > 0,
      requestedEventIds: selectedEventIds.size,
      matchedEventIds: groupedList.length,
    },
    categoryHealth,
    trend24h: trend,
  };

  await persistAutoBacktestRun({
    checkedAtIso: responsePayload.checkedAt,
    dataStartDate: resolvedRunsSorted[0]?.createdAt ? new Date(resolvedRunsSorted[0].createdAt) : null,
    dataEndDate: resolvedRunsSorted[resolvedRunsSorted.length - 1]?.createdAt ? new Date(resolvedRunsSorted[resolvedRunsSorted.length - 1].createdAt) : null,
    quality: responsePayload.backtestQuality,
  });

  return NextResponse.json(responsePayload);
  } catch (error) {
    if (isPrismaConnectionBusy(error)) {
      console.warn("data-health degraded fallback: database connection busy", error);
      return NextResponse.json(buildDegradedDataHealthResponse(selectedEventIds, "database_connection_busy"), { status: 200 });
    }
    console.error("data-health fatal error", error);
    return NextResponse.json({ error: "Failed to load data health" }, { status: 500 });
  }
}
