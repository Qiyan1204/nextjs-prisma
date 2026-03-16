import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type UserAgg = {
  userId: number;
  name: string;
  totalVolume: number;
  realizedPL: number;
  exitTrades: number;
  winningExits: number;
};

type PositionAgg = {
  buyShares: number;
  buyCost: number;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get("period") || "all").toLowerCase();
    const category = searchParams.get("category") || "All";

    const now = new Date();
    let gte: Date | undefined;
    if (period === "today") {
      gte = new Date(now);
      gte.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      gte = new Date(now);
      const day = gte.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      gte.setDate(gte.getDate() + diff);
      gte.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      gte = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const whereClause: {
      createdAt?: { gte: Date };
      category?: string;
    } = {};

    if (gte) whereClause.createdAt = { gte };
    if (category !== "All") whereClause.category = category;

    const bets = await prisma.polyBet.findMany({
      where: whereClause,
      select: {
        userId: true,
        eventId: true,
        side: true,
        type: true,
        amount: true,
        shares: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const byUser = new Map<number, UserAgg>();
    const positionBook = new Map<string, PositionAgg>();

    for (const b of bets) {
      const user = byUser.get(b.userId) ?? {
        userId: b.userId,
        name: b.user?.name || `User ${b.userId}`,
        totalVolume: 0,
        realizedPL: 0,
        exitTrades: 0,
        winningExits: 0,
      };
      byUser.set(b.userId, user);

      const amount = Number(b.amount);
      const shares = Number(b.shares);
      const type = b.type || "BUY";

      if (type === "BUY" || type === "SELL") {
        user.totalVolume += amount;
      }

      const key = `${b.userId}::${b.eventId}::${b.side}`;
      const pos = positionBook.get(key) ?? { buyShares: 0, buyCost: 0 };

      if (type === "BUY") {
        pos.buyShares += shares;
        pos.buyCost += amount;
        positionBook.set(key, pos);
      } else if (type === "SELL") {
        const avgCost = pos.buyShares > 0 ? pos.buyCost / pos.buyShares : 0;
        const matchedShares = Math.min(shares, pos.buyShares);
        const costBasis = matchedShares * avgCost;
        const tradePL = amount - costBasis;

        user.realizedPL += tradePL;
        user.exitTrades += 1;
        if (tradePL > 0) user.winningExits += 1;

        pos.buyShares = Math.max(0, pos.buyShares - matchedShares);
        pos.buyCost = Math.max(0, pos.buyCost - costBasis);
        positionBook.set(key, pos);
      } else if (type === "CLAIM") {
        user.realizedPL += amount;
        user.exitTrades += 1;
        if (amount > 0) user.winningExits += 1;
      }
    }

    const leaderboard = Array.from(byUser.values())
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        totalVolume: u.totalVolume,
        realizedPL: u.realizedPL,
        winRate: u.exitTrades > 0 ? (u.winningExits / u.exitTrades) * 100 : 0,
        exitTrades: u.exitTrades,
      }))
      .sort((a, b) => b.realizedPL - a.realizedPL || b.totalVolume - a.totalVolume)
      .slice(0, 50)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
