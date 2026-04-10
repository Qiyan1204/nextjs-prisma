import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordPull } from "@/lib/pullMetrics";
import { CATEGORY_CONFIG, eventMatchesCategory } from "@/app/polyoiyen/shared/categoryConfig";

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

type OrderBookLevel = {
  price?: string | number;
  size?: string | number;
};

type OrderBookResponse = {
  bids?: OrderBookLevel[];
  asks?: OrderBookLevel[];
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

function computeDepthUsd(book: OrderBookResponse | null): number {
  if (!book) return 0;
  const topBids = Array.isArray(book.bids) ? book.bids.slice(0, 10) : [];
  const topAsks = Array.isArray(book.asks) ? book.asks.slice(0, 10) : [];

  const sideSum = (levels: OrderBookLevel[]) =>
    levels.reduce((sum, lvl) => {
      const price = Number(lvl?.price);
      const size = Number(lvl?.size);
      if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return sum;
      return sum + price * size;
    }, 0);

  return sideSum(topBids) + sideSum(topAsks);
}

async function fetchBookDepth(tokenId: string): Promise<number> {
  if (!tokenId) return 0;

  const upstream = new URL("https://clob.polymarket.com/book");
  upstream.searchParams.set("token_id", tokenId);

  const res = await fetch(upstream.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return 0;
  const data = (await res.json()) as OrderBookResponse;
  return computeDepthUsd(data);
}

async function fetchCandidateEvents(limit: number): Promise<PolyEventLite[]> {
  const upstream = new URL("https://gamma-api.polymarket.com/events");
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("offset", "0");
  upstream.searchParams.set("active", "true");
  upstream.searchParams.set("closed", "false");

  const res = await fetch(upstream.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 120 },
  });

  if (!res.ok) return [];
  const payload = await res.json();
  return Array.isArray(payload) ? payload : [];
}

export async function GET(req: NextRequest) {
  recordPull("poly_probe");

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron") || "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";
  const force = new URL(req.url).searchParams.get("force") === "true";

  if (cronSecret && auth !== expectedAuth && vercelCron !== "1" && !(force && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const maxEventScan = Math.min(Math.max(Number(process.env.DEPTH_SNAPSHOT_SCAN_LIMIT || 220), 40), 500);
  const maxPerCategory = Math.min(Math.max(Number(process.env.DEPTH_SNAPSHOT_PER_CATEGORY || 8), 2), 20);
  const retentionDays = Math.min(Math.max(Number(process.env.DEPTH_SNAPSHOT_RETENTION_DAYS || 45), 7), 180);

  try {
    const events = await fetchCandidateEvents(maxEventScan);
    const selected: Array<{ event: PolyEventLite; categoryKey: string; yesTokenId: string; noTokenId: string }> = [];

    for (const cat of CATEGORY_CONFIG) {
      const matches = events
        .filter((e) => eventMatchesCategory(e, cat.key))
        .sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0))
        .slice(0, maxPerCategory);

      for (const event of matches) {
        const market = pickActiveMarket(event.markets);
        const tokens = parseTokenIds(market);
        if (!tokens.yes || !tokens.no) continue;
        selected.push({
          event,
          categoryKey: cat.key,
          yesTokenId: tokens.yes,
          noTokenId: tokens.no,
        });
      }
    }

    const dedup = new Map<string, { event: PolyEventLite; categoryKey: string; yesTokenId: string; noTokenId: string }>();
    for (const row of selected) {
      if (!dedup.has(row.event.id)) dedup.set(row.event.id, row);
    }

    const rowsToInsert: Array<{
      eventId: string;
      marketTitle: string;
      categoryKey: string;
      yesTokenId: string;
      noTokenId: string;
      yesDepthUsd: number;
      noDepthUsd: number;
      totalDepthUsd: number;
      sampledAt: Date;
    }> = [];

    const failures: Array<{ eventId: string; reason: string }> = [];
    for (const row of dedup.values()) {
      try {
        const [yesDepth, noDepth] = await Promise.all([
          fetchBookDepth(row.yesTokenId),
          fetchBookDepth(row.noTokenId),
        ]);

        rowsToInsert.push({
          eventId: row.event.id,
          marketTitle: row.event.title || "Untitled Market",
          categoryKey: row.categoryKey,
          yesTokenId: row.yesTokenId,
          noTokenId: row.noTokenId,
          yesDepthUsd: Number(yesDepth.toFixed(4)),
          noDepthUsd: Number(noDepth.toFixed(4)),
          totalDepthUsd: Number((yesDepth + noDepth).toFixed(4)),
          sampledAt: new Date(),
        });
      } catch (error) {
        failures.push({
          eventId: row.event.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    if (rowsToInsert.length > 0) {
      await prisma.marketDepthSnapshot.createMany({
        data: rowsToInsert,
      });
    }

    const pruneBefore = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const pruned = await prisma.marketDepthSnapshot.deleteMany({
      where: {
        sampledAt: {
          lt: pruneBefore,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      scannedEvents: events.length,
      selectedEvents: dedup.size,
      insertedSnapshots: rowsToInsert.length,
      prunedSnapshots: pruned.count,
      retentionDays,
      failures,
      sampledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Depth snapshot job failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
