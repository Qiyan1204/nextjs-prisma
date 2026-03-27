import { NextRequest, NextResponse } from "next/server";
import { recordAvailability, recordPull } from "@/lib/pullMetrics";

interface TradeItem {
  id?: string;
  timestamp?: number | string;
  makerAssetId?: string;
  takerAssetId?: string;
  makerAmountFilled?: number | string;
  takerAmountFilled?: number | string;
}

interface PriceObservation {
  ts: number;
  price: number;
}

const ORDERBOOK_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn";

const VOL_CACHE_TTL_MS = 90 * 1000;
const VOL_CACHE_MAX_ITEMS = 300;

type VolatilityRatingPayload = {
  window: {
    startTime: string;
    endTime: string;
  };
  bucketSeconds: number;
  rule: string;
  metrics: {
    yes: {
      totalVolatilityRating: number;
      averageVolatilityRatingPerHour: number;
      totalHours: number;
      hoursWithPrice: number;
    };
    no: {
      totalVolatilityRating: number;
      averageVolatilityRatingPerHour: number;
      totalHours: number;
      hoursWithPrice: number;
    };
  };
  diagnostics: {
    scannedPages: number;
    pageSize: number;
    fetchedTrades: number;
    yesPriceObservations: number;
    noPriceObservations: number;
  };
  points: Array<{
    ts: number;
    timeLabel: string;
    yesPrice: number | null;
    noPrice: number | null;
    yesStepScore: number;
    noStepScore: number;
  }>;
  fetchedAt: string;
};

const volatilityCache = new Map<string, { expiresAt: number; payload: VolatilityRatingPayload }>();

function makeCacheKey(params: {
  yesAssetId: string;
  noAssetId: string;
  startSec: number;
  endSec: number;
  bucketSec: number;
  pageSize: number;
  maxPages: number;
}) {
  return [
    params.yesAssetId,
    params.noAssetId,
    params.startSec,
    params.endSec,
    params.bucketSec,
    params.pageSize,
    params.maxPages,
  ].join("|");
}

function getCachedVolatility(key: string): VolatilityRatingPayload | null {
  const now = Date.now();
  const hit = volatilityCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    volatilityCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCachedVolatility(key: string, payload: VolatilityRatingPayload) {
  const now = Date.now();
  volatilityCache.set(key, {
    expiresAt: now + VOL_CACHE_TTL_MS,
    payload,
  });

  if (volatilityCache.size <= VOL_CACHE_MAX_ITEMS) return;

  for (const [cacheKey, cacheValue] of volatilityCache.entries()) {
    if (cacheValue.expiresAt <= now) {
      volatilityCache.delete(cacheKey);
    }
  }

  while (volatilityCache.size > VOL_CACHE_MAX_ITEMS) {
    const oldestKey = volatilityCache.keys().next().value;
    if (!oldestKey) break;
    volatilityCache.delete(oldestKey);
  }
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIsoUtc(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString();
}

function floorToBucket(tsSec: number, bucketSec: number): number {
  return Math.floor(tsSec / bucketSec) * bucketSec;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function formatLabel(tsSec: number, bucketSec: number): string {
  const d = new Date(tsSec * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  if (bucketSec < 3600) return `${mm}-${dd} ${hh}:${mi}`;
  return `${mm}-${dd} ${hh}:00`;
}

function computeCentMoveScore(prevPrice: number, currentPrice: number): number {
  return Math.abs(currentPrice - prevPrice) * 100;
}

function parseStartTime(raw: string | null, fallbackSec: number): number {
  if (!raw) return fallbackSec;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return fallbackSec;
  return Math.floor(parsed / 1000);
}

function parseEndTime(raw: string | null, fallbackSec: number): number {
  if (!raw) return fallbackSec;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return fallbackSec;
  return Math.floor(parsed / 1000);
}

function buildHistoryPoint(
  tsSec: number,
  bucketSec: number,
  yesPrice: number | null,
  noPrice: number | null,
  yesStepScore: number,
  noStepScore: number
) {
  return {
    ts: tsSec,
    timeLabel: formatLabel(tsSec, bucketSec),
    yesPrice,
    noPrice,
    yesStepScore: Number(yesStepScore.toFixed(2)),
    noStepScore: Number(noStepScore.toFixed(2)),
  };
}

function extractPriceForAsset(trade: TradeItem, assetId: string): number | null {
  const makerAssetId = String(trade.makerAssetId || "");
  const takerAssetId = String(trade.takerAssetId || "");
  const makerAmount = toNum(trade.makerAmountFilled);
  const takerAmount = toNum(trade.takerAmountFilled);

  if (makerAmount <= 0 || takerAmount <= 0) return null;

  let rawPrice = 0;

  // Asset sold for USDC: price = USDC received / shares sold.
  if (makerAssetId === assetId && takerAssetId === "0") {
    rawPrice = takerAmount / makerAmount;
  }

  // Asset bought with USDC: price = USDC paid / shares bought.
  if (takerAssetId === assetId && makerAssetId === "0") {
    rawPrice = makerAmount / takerAmount;
  }

  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;

  // Keep values close to $0-$1 YES/NO pricing and avoid polluted outliers.
  if (rawPrice < 0 || rawPrice > 1.2) return null;

  return rawPrice;
}

async function fetchSubgraphPage(
  assetIds: string[],
  timestampGte: number,
  timestampLte: number,
  first: number,
  skip: number,
  side: "maker" | "taker"
): Promise<TradeItem[]> {
  const list = assetIds.map((id) => `\"${id}\"`).join(",");
  const whereField = side === "maker" ? "makerAssetId_in" : "takerAssetId_in";
  const query = `
    query {
      orderFilledEvents(
        first: ${first}
        skip: ${skip}
        where: { ${whereField}: [${list}], timestamp_gte: "${timestampGte}", timestamp_lte: "${timestampLte}" }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        timestamp
        makerAssetId
        takerAssetId
        makerAmountFilled
        takerAmountFilled
      }
    }
  `;

  const res = await fetch(ORDERBOOK_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
    next: { revalidate: 120 },
  });

  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);

  const payload = await res.json();
  if (payload?.errors?.length) {
    const message = String(payload.errors[0]?.message || "Subgraph query error");
    // Upstream subgraph can timeout for hot assets. Return an empty page so caller can continue safely.
    if (message.toLowerCase().includes("statement timeout")) {
      return [];
    }
    throw new Error(message);
  }

  const rows = payload?.data?.orderFilledEvents;
  return Array.isArray(rows) ? rows : [];
}

export async function GET(req: NextRequest) {
  recordPull("poly_probe");
  const { searchParams } = new URL(req.url);
  const yesAssetId = searchParams.get("yesAssetId")?.trim() || "";
  const noAssetId = searchParams.get("noAssetId")?.trim() || "";

  if (!yesAssetId || !noAssetId) {
    return NextResponse.json({ error: "yesAssetId and noAssetId are required" }, { status: 400 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const fallbackStartSec = nowSec - 7 * 24 * 3600;
  const startSecRaw = parseStartTime(searchParams.get("startTime"), fallbackStartSec);
  const endSecRaw = parseEndTime(searchParams.get("endTime"), nowSec);
  const startSec = Math.min(startSecRaw, endSecRaw);
  const endSec = Math.max(startSecRaw, endSecRaw);

  const limitRaw = toNum(searchParams.get("limit"));
  const pageSize = Math.min(Math.max(limitRaw || 300, 50), 1000);
  const maxPagesRaw = toNum(searchParams.get("maxPages"));
  const maxPages = Math.min(Math.max(maxPagesRaw || 140, 1), 400);
  const bucketRaw = Math.floor(toNum(searchParams.get("bucketSeconds")));
  const bucketSec = [300, 600, 900, 1800, 3600].includes(bucketRaw) ? bucketRaw : 3600;

  const cacheKey = makeCacheKey({
    yesAssetId,
    noAssetId,
    startSec,
    endSec,
    bucketSec,
    pageSize,
    maxPages,
  });

  const cached = getCachedVolatility(cacheKey);
  if (cached) {
    recordAvailability(true);
    return NextResponse.json(cached);
  }

  try {
    const assetIds = [yesAssetId, noAssetId];
    const tradeMap = new Map<string, TradeItem>();
    let scannedPages = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const skip = page * pageSize;
      const [makerRows, takerRows] = await Promise.all([
        fetchSubgraphPage(assetIds, startSec, endSec, pageSize, skip, "maker"),
        fetchSubgraphPage(assetIds, startSec, endSec, pageSize, skip, "taker"),
      ]);

      const pageRows = [...makerRows, ...takerRows];
      scannedPages += 1;
      if (pageRows.length === 0) break;

      for (const row of pageRows) {
        const id = String(row.id || "");
        if (id) tradeMap.set(id, row);
      }

      const makerOldestTs = makerRows.reduce((min, r) => {
        const ts = toNum(r.timestamp);
        return ts > 0 ? Math.min(min, ts) : min;
      }, Number.POSITIVE_INFINITY);

      const takerOldestTs = takerRows.reduce((min, r) => {
        const ts = toNum(r.timestamp);
        return ts > 0 ? Math.min(min, ts) : min;
      }, Number.POSITIVE_INFINITY);

      const reachedStart = makerOldestTs <= startSec && takerOldestTs <= startSec;
      if (reachedStart) break;
      if (makerRows.length < pageSize && takerRows.length < pageSize) break;
    }

    const trades = Array.from(tradeMap.values()).filter((t) => {
      const ts = toNum(t.timestamp);
      return ts >= startSec && ts <= endSec;
    });

    const yesObs: PriceObservation[] = [];
    const noObs: PriceObservation[] = [];

    for (const trade of trades) {
      const ts = toNum(trade.timestamp);
      if (ts <= 0) continue;

      const yesPrice = extractPriceForAsset(trade, yesAssetId);
      const noPrice = extractPriceForAsset(trade, noAssetId);

      if (yesPrice != null) yesObs.push({ ts, price: yesPrice });
      if (noPrice != null) noObs.push({ ts, price: noPrice });
    }

    yesObs.sort((a, b) => a.ts - b.ts);
    noObs.sort((a, b) => a.ts - b.ts);

    const firstBucket = floorToBucket(startSec, bucketSec);
    const lastBucket = floorToBucket(endSec, bucketSec);

    const history: Array<{
      ts: number;
      timeLabel: string;
      yesPrice: number | null;
      noPrice: number | null;
      yesStepScore: number;
      noStepScore: number;
    }> = [];

    let yesIdx = 0;
    let noIdx = 0;
    let yesLast: number | null = null;
    let noLast: number | null = null;
    let prevYesForScore: number | null = null;
    let prevNoForScore: number | null = null;
    let yesTotalScore = 0;
    let noTotalScore = 0;

    for (let bucketTs = firstBucket; bucketTs <= lastBucket; bucketTs += bucketSec) {
      const bucketEnd = bucketTs + bucketSec - 1;

      while (yesIdx < yesObs.length && yesObs[yesIdx].ts <= bucketEnd) {
        yesLast = yesObs[yesIdx].price;
        yesIdx += 1;
      }

      while (noIdx < noObs.length && noObs[noIdx].ts <= bucketEnd) {
        noLast = noObs[noIdx].price;
        noIdx += 1;
      }

      if (yesLast == null && noLast != null) {
        yesLast = clamp01(1 - noLast);
      }
      if (noLast == null && yesLast != null) {
        noLast = clamp01(1 - yesLast);
      }

      let yesStepScore = 0;
      if (yesLast != null && prevYesForScore != null) {
        yesStepScore = computeCentMoveScore(prevYesForScore, yesLast);
        yesTotalScore += yesStepScore;
      }
      if (yesLast != null) {
        prevYesForScore = yesLast;
      }

      let noStepScore = 0;
      if (noLast != null && prevNoForScore != null) {
        noStepScore = computeCentMoveScore(prevNoForScore, noLast);
        noTotalScore += noStepScore;
      }
      if (noLast != null) {
        prevNoForScore = noLast;
      }

      history.push(buildHistoryPoint(bucketTs, bucketSec, yesLast, noLast, yesStepScore, noStepScore));
    }

    const durationHours = Math.max((endSec - startSec + 1) / 3600, bucketSec / 3600);
    const totalHours = Number(durationHours.toFixed(4));
    const yesHoursWithPrice = history.filter((p) => p.yesPrice != null).length;
    const noHoursWithPrice = history.filter((p) => p.noPrice != null).length;

    const yesAvgPerHour = totalHours > 0 ? yesTotalScore / totalHours : 0;
    const noAvgPerHour = totalHours > 0 ? noTotalScore / totalHours : 0;

    const payload: VolatilityRatingPayload = {
      window: {
        startTime: toIsoUtc(startSec),
        endTime: toIsoUtc(endSec),
      },
      bucketSeconds: bucketSec,
      rule: "1 cent price move = 1 volatility point",
      metrics: {
        yes: {
          totalVolatilityRating: Number(yesTotalScore.toFixed(2)),
          averageVolatilityRatingPerHour: Number(yesAvgPerHour.toFixed(4)),
          totalHours,
          hoursWithPrice: yesHoursWithPrice,
        },
        no: {
          totalVolatilityRating: Number(noTotalScore.toFixed(2)),
          averageVolatilityRatingPerHour: Number(noAvgPerHour.toFixed(4)),
          totalHours,
          hoursWithPrice: noHoursWithPrice,
        },
      },
      diagnostics: {
        scannedPages,
        pageSize,
        fetchedTrades: trades.length,
        yesPriceObservations: yesObs.length,
        noPriceObservations: noObs.length,
      },
      points: history,
      fetchedAt: new Date().toISOString(),
    };

    setCachedVolatility(cacheKey, payload);
    recordAvailability(true);
    return NextResponse.json(payload);
  } catch (error) {
    recordAvailability(false);
    console.error("Volatility rating API error:", error);
    return NextResponse.json({ error: "Failed to compute volatility rating" }, { status: 500 });
  }
}
