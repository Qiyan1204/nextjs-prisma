import { NextRequest, NextResponse } from "next/server";

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

interface VolatilityPoint {
  ts: number;
  timeLabel: string;
  windowStart: string;
  windowEnd: string;
  tradeCount: number;
  notional: number;
  yesTrades: number;
  noTrades: number;
  imbalanceRate: number;
  volatilityRate: number;
}

const ORDERBOOK_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toUsdNotionalFromFill(t: TradeItem): number {
  const makerAssetId = String(t.makerAssetId || "");
  const takerAssetId = String(t.takerAssetId || "");
  const makerAmt = toNum(t.makerAmountFilled);
  const takerAmt = toNum(t.takerAmountFilled);

  if (makerAssetId === "0") return makerAmt / 1_000_000;
  if (takerAssetId === "0") return takerAmt / 1_000_000;
  return 0;
}

function toIsoUtc(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString();
}

function floorToBucket(tsSec: number, bucketSec: number): number {
  return Math.floor(tsSec / bucketSec) * bucketSec;
}

function formatLabel(tsSec: number, bucketSec: number): string {
  const d = new Date(tsSec * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  if (bucketSec < 24 * 3600) return `${mm}-${dd} ${hh}:${mi}`;
  return `${mm}-${dd}`;
}

function getRangeConfig(range: string): { rangeSec: number; bucketSec: number } {
  switch (range) {
    case "1H":
      return { rangeSec: 3600, bucketSec: 5 * 60 };
    case "6H":
      return { rangeSec: 6 * 3600, bucketSec: 15 * 60 };
    case "1D":
      return { rangeSec: 24 * 3600, bucketSec: 60 * 60 };
    case "1W":
      return { rangeSec: 7 * 24 * 3600, bucketSec: 6 * 3600 };
    case "1M":
      return { rangeSec: 30 * 24 * 3600, bucketSec: 24 * 3600 };
    case "ALL":
      // 120 days max to keep response performant; still much richer than daily/weekly-only panel.
      return { rangeSec: 120 * 24 * 3600, bucketSec: 24 * 3600 };
    default:
      return { rangeSec: 7 * 24 * 3600, bucketSec: 6 * 3600 };
  }
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
    next: { revalidate: 60 },
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
  const { searchParams } = new URL(req.url);
  const yesAssetId = searchParams.get("yesAssetId")?.trim() || "";
  const noAssetId = searchParams.get("noAssetId")?.trim() || "";
  const range = (searchParams.get("range") || "1W").toUpperCase();

  const limitRaw = toNum(searchParams.get("limit"));
  const pageSize = Math.min(Math.max(limitRaw || 300, 50), 1000);
  const maxPagesRaw = toNum(searchParams.get("maxPages"));
  const maxPages = Math.min(Math.max(maxPagesRaw || 120, 1), 300);

  if (!yesAssetId || !noAssetId) {
    return NextResponse.json({ error: "yesAssetId and noAssetId are required" }, { status: 400 });
  }

  try {
    const { rangeSec, bucketSec } = getRangeConfig(range);
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - rangeSec;

    const assetIds = [yesAssetId, noAssetId];
    const tradeMap = new Map<string, TradeItem>();
    let scannedPages = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const skip = page * pageSize;
      const [makerRows, takerRows] = await Promise.all([
        fetchSubgraphPage(assetIds, startSec, pageSize, skip, "maker"),
        fetchSubgraphPage(assetIds, startSec, pageSize, skip, "taker"),
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

      if (makerOldestTs <= startSec && takerOldestTs <= startSec) break;
      if (makerRows.length < pageSize && takerRows.length < pageSize) break;
    }

    const trades = Array.from(tradeMap.values());

    const bucketMap = new Map<
      number,
      {
        tradeCount: number;
        notional: number;
        yesTrades: number;
        noTrades: number;
        yesWallets: Set<string>;
        noWallets: Set<string>;
      }
    >();

    for (const t of trades) {
      const ts = toNum(t.timestamp);
      if (ts <= 0 || ts < startSec || ts > nowSec) continue;

      const bucketTs = floorToBucket(ts, bucketSec);
      let b = bucketMap.get(bucketTs);
      if (!b) {
        b = {
          tradeCount: 0,
          notional: 0,
          yesTrades: 0,
          noTrades: 0,
          yesWallets: new Set<string>(),
          noWallets: new Set<string>(),
        };
        bucketMap.set(bucketTs, b);
      }

      const maker = (t.maker || "").toLowerCase();
      const taker = (t.taker || "").toLowerCase();
      const makerAssetId = String(t.makerAssetId || "");
      const takerAssetId = String(t.takerAssetId || "");
      const touchesYes = makerAssetId === yesAssetId || takerAssetId === yesAssetId;
      const touchesNo = makerAssetId === noAssetId || takerAssetId === noAssetId;

      b.tradeCount += 1;
      b.notional += toUsdNotionalFromFill(t);

      if (touchesYes) {
        b.yesTrades += 1;
        if (maker) b.yesWallets.add(maker);
        if (taker) b.yesWallets.add(taker);
      }

      if (touchesNo) {
        b.noTrades += 1;
        if (maker) b.noWallets.add(maker);
        if (taker) b.noWallets.add(taker);
      }
    }

    const points: VolatilityPoint[] = [];

    for (let ts = floorToBucket(startSec, bucketSec); ts <= nowSec; ts += bucketSec) {
      const b = bucketMap.get(ts);
      const tradeCount = b ? b.tradeCount : 0;
      const notional = b ? b.notional : 0;
      const yesTrades = b ? b.yesTrades : 0;
      const noTrades = b ? b.noTrades : 0;
      const yesParticipants = b ? b.yesWallets.size : 0;
      const noParticipants = b ? b.noWallets.size : 0;
      const participantGap = Math.abs(yesParticipants - noParticipants);
      const participantBase = yesParticipants + noParticipants;
      const gapRatio = participantBase > 0 ? participantGap / participantBase : 0;
      const imbalanceRate =
        yesTrades + noTrades > 0 ? ((yesTrades - noTrades) / (yesTrades + noTrades)) * 100 : 0;

      const rawScore =
        Math.log1p(tradeCount) * 1.25 +
        Math.log1p(notional / 1000) * 1.1 +
        gapRatio * 2.6;

      points.push({
        ts,
        timeLabel: formatLabel(ts, bucketSec),
        windowStart: toIsoUtc(ts),
        windowEnd: toIsoUtc(Math.min(ts + bucketSec - 1, nowSec)),
        tradeCount,
        notional: Number(notional.toFixed(2)),
        yesTrades,
        noTrades,
        imbalanceRate: Number(imbalanceRate.toFixed(2)),
        volatilityRate: rawScore,
      });
    }

    const maxRaw = Math.max(...points.map((p) => p.volatilityRate), 1);
    const normalized = points.map((p) => ({
      ...p,
      volatilityRate: Number(((p.volatilityRate / maxRaw) * 100).toFixed(2)),
    }));

    return NextResponse.json({
      range,
      bucketSeconds: bucketSec,
      startTime: toIsoUtc(startSec),
      endTime: toIsoUtc(nowSec),
      diagnostics: {
        fetchedTrades: trades.length,
        scannedPages,
        pageSize,
      },
      points: normalized,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Volatility cluster API error:", error);
    return NextResponse.json({ error: "Failed to fetch volatility cluster" }, { status: 500 });
  }
}
