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
    categoryHealth,
    trend24h: trend,
  });
}
