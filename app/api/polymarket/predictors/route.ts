import { NextRequest, NextResponse } from "next/server";
import { recordPull } from "@/lib/pullMetrics";

interface TradeItem {
  id?: string;
  maker?: string;
  taker?: string;
  makerAssetId?: string;
  takerAssetId?: string;
  makerAmountFilled?: number | string;
  takerAmountFilled?: number | string;
  timestamp?: number | string;
}

const ORDERBOOK_SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn";

interface HistoryPoint {
  label: string;
  windowStart: string;
  windowEnd: string;
  uniquePredictors: number;
  tradeCount: number;
  notional: number;
}

function cloneUtcDate(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addUtcDays(d: Date, days: number): Date {
  const x = cloneUtcDate(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function startOfUtcWeekMonday(d: Date): Date {
  const x = cloneUtcDate(d);
  const day = (x.getUTCDay() + 6) % 7; // Monday=0 ... Sunday=6
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toShortLabel(dateKey: string): string {
  return dateKey.slice(5);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toUsdNotionalFromFill(t: TradeItem): number {
  const makerAssetId = String(t.makerAssetId || "");
  const takerAssetId = String(t.takerAssetId || "");
  const makerAmt = toNum(t.makerAmountFilled);
  const takerAmt = toNum(t.takerAmountFilled);

  // In orderFilledEvents, assetId=0 side is USDC leg (6 decimals).
  if (makerAssetId === "0") return makerAmt / 1_000_000;
  if (takerAssetId === "0") return takerAmt / 1_000_000;
  return 0;
}

async function fetchSubgraphPage(
  assetIds: string[],
  timestampGte: number,
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
        where: { ${whereField}: [${list}], timestamp_gte: \"${timestampGte}\" }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        maker
        taker
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

  if (!res.ok) {
    throw new Error(`Subgraph HTTP ${res.status}`);
  }

  const payload = await res.json();
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Subgraph query error");
  }

  const rows = payload?.data?.orderFilledEvents;
  return Array.isArray(rows) ? rows : [];
}

export async function GET(req: NextRequest) {
  recordPull("poly_probe");
  const { searchParams } = new URL(req.url);
  const conditionId = searchParams.get("conditionId")?.trim();
  const assetIdsParam = searchParams.get("assetIds")?.trim() || "";
  const volumeParam = searchParams.get("volume");
  const limitRaw = toNum(searchParams.get("limit"));
  const pageSize = Math.min(Math.max(limitRaw || 300, 50), 1000);
  const maxPagesRaw = toNum(searchParams.get("maxPages"));
  const maxPages = Math.min(Math.max(maxPagesRaw || 120, 1), 300);
  const assetIdSet = new Set(
    assetIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  if (assetIdSet.size === 0) {
    return NextResponse.json({ error: "assetIds is required" }, { status: 400 });
  }

  try {
    const today = cloneUtcDate(new Date());
    const dailyStart = addUtcDays(today, -9);
    const dailyEnd = today;
    const currentWeekStart = startOfUtcWeekMonday(today);
    const weeklyStart = addUtcDays(currentWeekStart, -(9 * 7));
    const weeklyEnd = addUtcDays(currentWeekStart, 6);
    const weeklyStartTs = Math.floor(weeklyStart.getTime() / 1000);

    const assetIds = Array.from(assetIdSet);
    const tradeMap = new Map<string, TradeItem>();
    let scannedPages = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const skip = page * pageSize;
      const [makerRows, takerRows] = await Promise.all([
        fetchSubgraphPage(assetIds, weeklyStartTs, pageSize, skip, "maker"),
        fetchSubgraphPage(assetIds, weeklyStartTs, pageSize, skip, "taker"),
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

      const reachedWeeklyStart = makerOldestTs <= weeklyStartTs && takerOldestTs <= weeklyStartTs;
      if (reachedWeeklyStart) break;

      if (makerRows.length < pageSize && takerRows.length < pageSize) break;
    }

    const trades = Array.from(tradeMap.values());

    const historyMap = new Map<string, { wallets: Set<string>; tradeCount: number; notional: number }>();

    for (const t of trades) {
      const maker = (t.maker || "").toLowerCase();
      const taker = (t.taker || "").toLowerCase();
      const notional = toUsdNotionalFromFill(t);

      const ts = toNum(t.timestamp);
      if (ts > 0) {
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        let bucket = historyMap.get(date);
        if (!bucket) {
          bucket = { wallets: new Set<string>(), tradeCount: 0, notional: 0 };
          historyMap.set(date, bucket);
        }
        bucket.tradeCount += 1;
        bucket.notional += notional;
        if (maker) bucket.wallets.add(maker);
        if (taker) bucket.wallets.add(taker);
      }
    }

    const dailyHistory: HistoryPoint[] = [];
    for (let i = 0; i < 10; i += 1) {
      const day = addUtcDays(dailyStart, i);
      const dayKey = toDateKey(day);
      const bucket = historyMap.get(dayKey);
      dailyHistory.push({
        label: toShortLabel(dayKey),
        windowStart: dayKey,
        windowEnd: dayKey,
        uniquePredictors: bucket ? bucket.wallets.size : 0,
        tradeCount: bucket ? bucket.tradeCount : 0,
        notional: bucket ? Number(bucket.notional.toFixed(2)) : 0,
      });
    }

    const weeklyHistory: HistoryPoint[] = [];
    for (let i = 0; i < 10; i += 1) {
      const wStart = addUtcDays(weeklyStart, i * 7);
      const wEnd = addUtcDays(wStart, 6);
      const weekWallets = new Set<string>();
      let weekTrades = 0;
      let weekNotional = 0;

      for (let d = 0; d < 7; d += 1) {
        const dayKey = toDateKey(addUtcDays(wStart, d));
        const bucket = historyMap.get(dayKey);
        if (!bucket) continue;
        weekTrades += bucket.tradeCount;
        weekNotional += bucket.notional;
        for (const w of bucket.wallets) weekWallets.add(w);
      }

      weeklyHistory.push({
        label: `${toShortLabel(toDateKey(wStart))}~${toShortLabel(toDateKey(wEnd))}`,
        windowStart: toDateKey(wStart),
        windowEnd: toDateKey(wEnd),
        uniquePredictors: weekWallets.size,
        tradeCount: weekTrades,
        notional: Number(weekNotional.toFixed(2)),
      });
    }

    const dailyWallets = new Set<string>();
    let totalTrades = 0;
    let totalNotional = 0;
    for (let i = 0; i < 10; i += 1) {
      const dayKey = toDateKey(addUtcDays(dailyStart, i));
      const bucket = historyMap.get(dayKey);
      if (!bucket) continue;
      totalTrades += bucket.tradeCount;
      totalNotional += bucket.notional;
      for (const w of bucket.wallets) dailyWallets.add(w);
    }

    const allTradeDates = Array.from(historyMap.keys()).sort((a, b) => a.localeCompare(b));
    const firstTradeDate = allTradeDates.length > 0 ? allTradeDates[0] : null;
    const lastTradeDate = allTradeDates.length > 0 ? allTradeDates[allTradeDates.length - 1] : null;
    const totalWeeklyTrades = weeklyHistory.reduce((sum, p) => sum + p.tradeCount, 0);
    const nonZeroDailyPoints = dailyHistory.filter((p) => p.tradeCount > 0).length;
    const nonZeroWeeklyPoints = weeklyHistory.filter((p) => p.tradeCount > 0).length;

    const uniquePredictors = dailyWallets.size;
    const marketVolume = volumeParam ? toNum(volumeParam) : 0;
    const averageTradeSizePerUser = uniquePredictors > 0 ? marketVolume / uniquePredictors : 0;
    const averageObservedTradeSizePerUser = uniquePredictors > 0 ? totalNotional / uniquePredictors : 0;

    let signal: "retail_hype" | "whale_accumulation" | "balanced" = "balanced";
    if (uniquePredictors >= 60 && averageTradeSizePerUser > 0 && averageTradeSizePerUser <= 600) {
      signal = "retail_hype";
    } else if (uniquePredictors > 0 && uniquePredictors <= 15 && averageTradeSizePerUser >= 2500) {
      signal = "whale_accumulation";
    }

    return NextResponse.json({
      conditionId,
      assetIds: Array.from(assetIdSet),
      uniquePredictors,
      totalTrades,
      totalTradeNotional: Number(totalNotional.toFixed(2)),
      marketVolume,
      averageTradeSizePerUser: Number(averageTradeSizePerUser.toFixed(2)),
      averageObservedTradeSizePerUser: Number(averageObservedTradeSizePerUser.toFixed(2)),
      signal,
      history: {
        daily: dailyHistory,
        weekly: weeklyHistory,
      },
      analysisWindow: {
        daily: {
          startDate: toDateKey(dailyStart),
          endDate: toDateKey(dailyEnd),
          days: 10,
        },
        weekly: {
          startDate: toDateKey(weeklyStart),
          endDate: toDateKey(weeklyEnd),
          weeks: 10,
        },
      },
      diagnostics: {
        fetchedTrades: trades.length,
        scannedPages,
        pageSize,
        firstTradeDate,
        lastTradeDate,
        nonZeroDailyPoints,
        nonZeroWeeklyPoints,
        tradesInDailyWindow: totalTrades,
        tradesInWeeklyWindow: totalWeeklyTrades,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Predictors metrics proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch predictors metrics" }, { status: 500 });
  }
}
