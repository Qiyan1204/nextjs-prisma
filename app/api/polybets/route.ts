import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { checkAndTriggerLargeOrderAlerts } from "@/lib/triggerAlerts";

// GET: fetch user's bets, positions, or check if a large order exists
// ?positions=true → computed grouped portfolio positions
// ?checkLargeOrder=true&eventId=X&side=YES&threshold=500 → large order detection
// default → raw bet list
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const checkLargeOrder = searchParams.get("checkLargeOrder") === "true";
    const positions = searchParams.get("positions") === "true";

    if (checkLargeOrder) {
      const eventId = searchParams.get("eventId");
      const side = searchParams.get("side");
      const threshold = Number(searchParams.get("threshold") ?? "0");

      if (!eventId || !side || threshold <= 0) {
        return NextResponse.json({ error: "Missing eventId, side, or threshold" }, { status: 400 });
      }

      const match = await prisma.polyBet.findFirst({
        where: {
          eventId: String(eventId),
          side: String(side),
          amount: { gte: threshold },
        },
        select: { id: true, amount: true, createdAt: true },
      });

      return NextResponse.json({ hit: match !== null, amount: match ? Number(match.amount) : null });
    }

    // Fetch all user bets
    const bets = await prisma.polyBet.findMany({
      where: { userId: authUser.userId },
      orderBy: { createdAt: "desc" },
    });

    if (positions) {
      // Group by eventId+side → compute net position
      const grouped: Record<string, {
        eventId: string;
        marketQuestion: string;
        side: string;
        category: string;
        totalBuyShares: number;
        totalSellShares: number;
        totalBuyCost: number;
        totalSellRevenue: number;
        claimedAmount: number;
      }> = {};

      for (const b of bets) {
        const key = `${b.eventId}::${b.side}`;
        if (!grouped[key]) {
          grouped[key] = {
            eventId: b.eventId,
            marketQuestion: b.marketQuestion,
            side: b.side,
            category: b.category || "Other",
            totalBuyShares: 0,
            totalSellShares: 0,
            totalBuyCost: 0,
            totalSellRevenue: 0,
            claimedAmount: 0,
          };
        }
        const g = grouped[key];
        const type = b.type || "BUY";
        const shares = Number(b.shares);
        const amount = Number(b.amount);

        if (type === "BUY") {
          g.totalBuyShares += shares;
          g.totalBuyCost += amount;
        } else if (type === "SELL") {
          g.totalSellShares += shares;
          g.totalSellRevenue += amount;
        } else if (type === "CLAIM") {
          g.claimedAmount += amount;
        }
        // Always keep the latest category / marketQuestion
        if (b.category) g.category = b.category;
        g.marketQuestion = b.marketQuestion;
      }

      const positionList = Object.values(grouped).map((g) => {
        const netShares = g.totalBuyShares - g.totalSellShares;
        const avgPrice = g.totalBuyShares > 0 ? g.totalBuyCost / g.totalBuyShares : 0;
        const realizedPL = g.totalSellRevenue - (g.totalSellShares * avgPrice) + g.claimedAmount;
        return {
          eventId: g.eventId,
          marketQuestion: g.marketQuestion,
          side: g.side,
          category: g.category,
          netShares: Math.max(netShares, 0),
          avgPrice,
          totalInvested: g.totalBuyCost,
          realizedPL,
        };
      });

      return NextResponse.json({ positions: positionList, bets: bets.map(b => ({
        id: b.id,
        eventId: b.eventId,
        marketQuestion: b.marketQuestion,
        side: b.side,
        type: b.type || "BUY",
        amount: Number(b.amount),
        shares: Number(b.shares),
        price: Number(b.price),
        category: b.category || "Other",
        createdAt: b.createdAt,
      })) });
    }

    return NextResponse.json({ bets });
  } catch (error) {
    console.error("Get bets error:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

// POST: place a new bet (BUY, SELL, or CLAIM)
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { eventId, marketQuestion, side, amount, shares, price, type, category } = body;
    const betType = type || "BUY";

    if (!eventId || !marketQuestion || !side || !amount || !shares || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (side !== "YES" && side !== "NO") {
      return NextResponse.json({ error: "Side must be YES or NO" }, { status: 400 });
    }

    if (!["BUY", "SELL", "CLAIM"].includes(betType)) {
      return NextResponse.json({ error: "Type must be BUY, SELL, or CLAIM" }, { status: 400 });
    }

    if (Number(amount) <= 0 || Number(shares) <= 0 || Number(price) <= 0) {
      return NextResponse.json({ error: "Values must be positive" }, { status: 400 });
    }

    // For SELL: ensure user has enough shares
    if (betType === "SELL") {
      const userBets = await prisma.polyBet.findMany({
        where: { userId: authUser.userId, eventId: String(eventId), side: String(side) },
      });
      let netShares = 0;
      for (const b of userBets) {
        if ((b.type || "BUY") === "BUY") netShares += Number(b.shares);
        else if (b.type === "SELL") netShares -= Number(b.shares);
      }
      if (Number(shares) > netShares) {
        return NextResponse.json({ error: `Not enough shares. You have ${netShares.toFixed(3)} shares.` }, { status: 400 });
      }
    }

    const bet = await prisma.polyBet.create({
      data: {
        userId: authUser.userId,
        eventId: String(eventId),
        marketQuestion: String(marketQuestion),
        side: String(side),
        type: betType,
        amount: Number(amount),
        shares: Number(shares),
        price: Number(price),
        category: category ? String(category) : "Other",
      },
    });

    // Check if this bet triggers any user's LARGE_ORDER alerts (any user, not just the bettor)
    if (betType === "BUY") {
      checkAndTriggerLargeOrderAlerts(String(eventId), String(side), Number(amount)).catch((err) =>
        console.error("Alert trigger check failed:", err)
      );
    }

    return NextResponse.json({ bet }, { status: 201 });
  } catch (error) {
    console.error("Create bet error:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
