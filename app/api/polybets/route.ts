import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: fetch user's bets, or check if a large order exists for an event
// ?checkLargeOrder=true&eventId=X&side=YES&threshold=500
//   → returns { hit: boolean } without exposing individual bet details
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const checkLargeOrder = searchParams.get("checkLargeOrder") === "true";

    if (checkLargeOrder) {
      const eventId = searchParams.get("eventId");
      const side = searchParams.get("side");
      const threshold = Number(searchParams.get("threshold") ?? "0");

      if (!eventId || !side || threshold <= 0) {
        return NextResponse.json({ error: "Missing eventId, side, or threshold" }, { status: 400 });
      }

      // Find any single bet (from any user) on this event+side with amount >= threshold
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

    const bets = await prisma.polyBet.findMany({
      where: { userId: authUser.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ bets });
  } catch (error) {
    console.error("Get bets error:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

// POST: place a new bet
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { eventId, marketQuestion, side, amount, shares, price } = body;

    if (!eventId || !marketQuestion || !side || !amount || !shares || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (side !== "YES" && side !== "NO") {
      return NextResponse.json({ error: "Side must be YES or NO" }, { status: 400 });
    }

    if (Number(amount) <= 0 || Number(shares) <= 0 || Number(price) <= 0) {
      return NextResponse.json({ error: "Values must be positive" }, { status: 400 });
    }

    const bet = await prisma.polyBet.create({
      data: {
        userId: authUser.userId,
        eventId: String(eventId),
        marketQuestion: String(marketQuestion),
        side: String(side),
        amount: Number(amount),
        shares: Number(shares),
        price: Number(price),
      },
    });

    return NextResponse.json({ bet }, { status: 201 });
  } catch (error) {
    console.error("Create bet error:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
