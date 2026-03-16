import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

type PositionAgg = {
  buyShares: number;
  buyCost: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = authUser.userId;
    const [bets, alerts] = await Promise.all([
      prisma.polyBet.findMany({
        where: { userId },
        select: {
          eventId: true,
          side: true,
          type: true,
          amount: true,
          shares: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.polyAlert.findMany({
        where: { userId },
        select: { id: true, active: true, triggered: true },
      }),
    ]);

    const todayStart = startOfToday();
    const weekStart = startOfWeekMonday();

    let tradesToday = 0;
    let weeklyVolume = 0;

    for (const b of bets) {
      const amount = Number(b.amount);
      const type = b.type || "BUY";
      if (type === "BUY" || type === "SELL") {
        if (b.createdAt >= todayStart) tradesToday += 1;
        if (b.createdAt >= weekStart) weeklyVolume += amount;
      }
    }

    const positionBook = new Map<string, PositionAgg>();
    const sellProfitFlags: boolean[] = [];

    for (const b of bets) {
      const key = `${b.eventId}::${b.side}`;
      const pos = positionBook.get(key) ?? { buyShares: 0, buyCost: 0 };
      const amount = Number(b.amount);
      const shares = Number(b.shares);
      const type = b.type || "BUY";

      if (type === "BUY") {
        pos.buyShares += shares;
        pos.buyCost += amount;
      } else if (type === "SELL") {
        const avgCost = pos.buyShares > 0 ? pos.buyCost / pos.buyShares : 0;
        const matchedShares = Math.min(shares, pos.buyShares);
        const costBasis = matchedShares * avgCost;
        const tradePL = amount - costBasis;
        sellProfitFlags.push(tradePL > 0);

        pos.buyShares = Math.max(0, pos.buyShares - matchedShares);
        pos.buyCost = Math.max(0, pos.buyCost - costBasis);
      }

      positionBook.set(key, pos);
    }

    let currentWinStreak = 0;
    for (let i = sellProfitFlags.length - 1; i >= 0; i -= 1) {
      if (sellProfitFlags[i]) currentWinStreak += 1;
      else break;
    }

    const activeAlerts = alerts.filter((a) => a.active).length;
    const triggeredAlerts = alerts.filter((a) => a.triggered).length;

    const missions = [
      {
        key: "daily_checkin",
        title: "Daily Check-in",
        desc: "Log in and place at least one trade today.",
        points: 20,
        progress: tradesToday,
        target: 1,
        achieved: tradesToday >= 1,
      },
      {
        key: "win_streak",
        title: "3 Win Streak",
        desc: "Close 3 profitable sell trades in a row.",
        points: 80,
        progress: currentWinStreak,
        target: 3,
        achieved: currentWinStreak >= 3,
      },
      {
        key: "high_volume",
        title: "High Volume",
        desc: "Reach $2,000 trading volume this week.",
        points: 120,
        progress: weeklyVolume,
        target: 2000,
        achieved: weeklyVolume >= 2000,
      },
      {
        key: "alert_hunter",
        title: "Early Signal",
        desc: "Set 5 active alerts and trigger 2 alerts.",
        points: 60,
        progress: Math.min(activeAlerts / 5, 1) * 0.5 + Math.min(triggeredAlerts / 2, 1) * 0.5,
        target: 1,
        achieved: activeAlerts >= 5 && triggeredAlerts >= 2,
        detail: { activeAlerts, triggeredAlerts },
      },
    ];

    const totalXP = missions.filter((m) => m.achieved).reduce((sum, m) => sum + m.points, 0);

    return NextResponse.json({
      summary: {
        tradesToday,
        weeklyVolume,
        currentWinStreak,
        activeAlerts,
        triggeredAlerts,
        totalXP,
      },
      missions,
    });
  } catch (error) {
    console.error("Reward fetch error:", error);
    return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
  }
}
