import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type CandidateRow = { eventId: string; title?: string; slug?: string };

type SeededEvent = {
  eventId: string;
  title: string;
  side: "YES" | "NO";
  buyPrice: number;
  sellPrice: number;
  shares: number;
  invested: number;
  realizedCash: number;
  expectedReturnPct: number;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function pickTopCandidateEvents(payload: any): Array<{ eventId: string; title: string; categoryKey: string }> {
  const desiredCategories = ["elonTweets", "movieBoxOffice", "fedRates", "nbaGames", "nflMarkets"] as const;
  const perCategory = 2;
  const desiredCount = 10;

  const categories = payload && typeof payload === "object" ? (payload as Record<string, unknown>).categories : undefined;
  if (!categories || typeof categories !== "object") return [];

  const normalizeRows = (categoryKey: string): CandidateRow[] => {
    const rowsRaw = (categories as Record<string, unknown>)[categoryKey];
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    return rows
      .map((row) => {
        const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const eventId = typeof rec.eventId === "string" ? rec.eventId : "";
        const title = typeof rec.title === "string" ? rec.title : "";
        const slug = typeof rec.slug === "string" ? rec.slug : "";
        return { eventId, title: title || slug };
      })
      .filter((r) => Boolean(r.eventId));
  };

  const out: Array<{ eventId: string; title: string; categoryKey: string }> = [];
  const seen = new Set<string>();

  const tryAdd = (categoryKey: string, row: CandidateRow) => {
    if (out.length >= desiredCount) return;
    const eventId = String(row.eventId || "").trim();
    if (!eventId) return;
    if (seen.has(eventId)) return;
    seen.add(eventId);
    const title = (row.title || row.slug || `Event ${eventId}`).trim();
    out.push({ eventId, title, categoryKey });
  };

  for (const categoryKey of desiredCategories) {
    const rows = normalizeRows(categoryKey);
    for (const row of rows.slice(0, perCategory)) {
      tryAdd(categoryKey, row);
    }
  }

  if (out.length < desiredCount) {
    for (const categoryKey of desiredCategories) {
      if (out.length >= desiredCount) break;
      const rows = normalizeRows(categoryKey);
      for (const row of rows) {
        if (out.length >= desiredCount) break;
        tryAdd(categoryKey, row);
      }
    }
  }

  return out.slice(0, desiredCount);
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "This endpoint is disabled in production" }, { status: 403 });
    }

    const replace = req.nextUrl.searchParams.get("replace") !== "0";
    const shares = clampInt(req.nextUrl.searchParams.get("shares"), 1, 10_000, 100);

    const baseUrl = req.nextUrl.origin.replace(/\/$/, "");
    const candidatesRes = await fetch(`${baseUrl}/api/polyoiyen/top-candidates?limit=30`, {
      method: "GET",
      cache: "no-store",
    });

    if (!candidatesRes.ok) {
      const text = await candidatesRes.text().catch(() => "");
      return NextResponse.json({ error: "Failed to load top candidates", status: candidatesRes.status, body: text }, { status: 500 });
    }

    const candidatesPayload = await candidatesRes.json();
    const selected = pickTopCandidateEvents(candidatesPayload);

    if (selected.length === 0) {
      return NextResponse.json({ error: "No candidate events selected" }, { status: 500 });
    }

    const seedEmail = "seed.backtest@local";
    const seedUser = await prisma.user.upsert({
      where: { email: seedEmail },
      update: { name: "Backtest Seed" },
      create: { name: "Backtest Seed", email: seedEmail },
      select: { id: true, email: true },
    });

    if (replace) {
      await prisma.polyBet.deleteMany({
        where: {
          userId: seedUser.id,
          eventId: { in: selected.map((x) => x.eventId) },
        },
      });
    }

    const now = Date.now();
    const seeded: SeededEvent[] = [];

    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      const side: SeededEvent["side"] = i % 2 === 0 ? "YES" : "NO";

      // Deterministic synthetic P&L: alternate winners/losers
      const buyPrice = i % 2 === 0 ? 0.42 : 0.58;
      const sellPrice = i % 2 === 0 ? 0.55 : 0.45;

      const invested = round6(shares * buyPrice);
      const realizedCash = round6(shares * sellPrice);
      const expectedReturnPct = round6(((realizedCash - invested) / invested) * 100);

      const createdBuy = new Date(now - (selected.length - i) * 60_000);
      const createdSell = new Date(now - (selected.length - i) * 30_000);

      await prisma.polyBet.createMany({
        data: [
          {
            userId: seedUser.id,
            eventId: item.eventId,
            marketQuestion: item.title,
            side,
            type: "BUY",
            amount: String(invested),
            shares: String(shares),
            price: String(buyPrice),
            category: item.categoryKey,
            createdAt: createdBuy,
          },
          {
            userId: seedUser.id,
            eventId: item.eventId,
            marketQuestion: item.title,
            side,
            type: "SELL",
            amount: String(realizedCash),
            shares: String(shares),
            price: String(sellPrice),
            category: item.categoryKey,
            createdAt: createdSell,
          },
        ],
      });

      seeded.push({
        eventId: item.eventId,
        title: item.title,
        side,
        buyPrice,
        sellPrice,
        shares,
        invested,
        realizedCash,
        expectedReturnPct,
      });
    }

    return NextResponse.json({
      ok: true,
      user: seedUser,
      replace,
      shares,
      seededCount: seeded.length,
      seeded,
      next:
        "Now call /api/polyoiyen/test-backtest-notification?split=1 to send 10 notifications with returns (no N/A).",
    });
  } catch (error) {
    console.error("Failed to seed PolyBet rows:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
