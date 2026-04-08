import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CATEGORY_CONFIG, TAG_SLUGS_BY_CATEGORY, type CategoryKey } from "@/app/polyoiyen/shared/categoryConfig";
import { hasCompleteYesNoTokens } from "@/app/polyoiyen/shared/marketAssessmentEngine";

type PullKind = "poly_probe" | "invest_pull" | "invest_action" | "health_ok" | "health_fail";

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

export async function GET(req: Request) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const baseUrl = new URL(req.url).origin;

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
    { key: "platform_metrics", path: "/api/platform-metrics" },
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

  const [pullRows, endpointRows24h, latestPullMetric, latestDepthSnapshot, latestAlertNotify, alertEvents24h] = await Promise.all([
    prisma.pullMetric.findMany({
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
    }),
    prisma.endpointProbe.findMany({
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
    }),
    prisma.pullMetric.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.marketDepthSnapshot.findFirst({ orderBy: { sampledAt: "desc" }, select: { sampledAt: true } }),
    prisma.alertNotificationEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.alertNotificationEvent.groupBy({
      by: ["eventType"],
      where: {
        createdAt: {
          gte: since,
          lte: new Date(now),
        },
      },
      _count: { _all: true },
    }),
  ]);

  const polyBetRows = await prisma.polyBet.findMany({
    where: {
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
    lastAt: Date;
  }>();

  for (const b of polyBetRows) {
    const side = b.side === "YES" || b.side === "NO" ? b.side : null;
    if (!side) continue;
    const key = b.eventId;
    const current = groupedPoly.get(key) || {
      eventId: b.eventId,
      marketQuestion: b.marketQuestion,
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
    } else if (t === "SELL") {
      if (side === "YES") {
        current.yesSellAmount += amt;
        current.yesSellShares += sh;
      } else {
        current.noSellAmount += amt;
        current.noSellShares += sh;
      }
    } else if (t === "CLAIM") {
      current.claimAmount += amt;
    }

    if (b.createdAt > current.lastAt) current.lastAt = b.createdAt;
    if (b.marketQuestion) current.marketQuestion = b.marketQuestion;
    groupedPoly.set(key, current);
  }

  const groupedList = Array.from(groupedPoly.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
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
      const ret = invested > 0 ? ((realizedValue - invested) / invested) * 100 : 0;
      const isWin = ret >= 0;

      const bestCategory = Object.entries(r.categoryScores)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      const strategyName = bestCategory ? `${bestCategory} Strategy` : "PolyOiyen Strategy";

      return {
        eventId: r.eventId,
        marketQuestion: r.marketQuestion,
        strategyName,
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

  const worstEvents = resolvedRuns
    .map((r) => ({
      eventId: r.eventId,
      marketQuestion: r.marketQuestion,
      strategyName: r.strategyName,
      totalReturn: r.totalReturn,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.totalReturn - b.totalReturn)
    .slice(0, 8);

  const recentRuns = resolvedRuns.slice(0, 8).map((r) => ({
    symbol: r.eventId,
    strategyName: r.strategyName,
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

  return NextResponse.json({
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
        scannedEvents: groupedList.length,
      },
      lossAttribution: {
        byStrategy: lossAttributionByStrategy,
        worstEvents,
      },
      equityCurve,
      bestStrategy: bestStrategy
        ? {
            strategyName: bestStrategy.strategyName,
            runs: bestStrategy.runs,
            winRate: bestStrategy.winRate == null ? null : Number(bestStrategy.winRate.toFixed(2)),
            avgReturn: bestStrategy.avgReturn == null ? null : Number(bestStrategy.avgReturn.toFixed(2)),
          }
        : null,
      recentRuns,
    },
    categoryHealth,
    trend24h: trend,
  });
}
