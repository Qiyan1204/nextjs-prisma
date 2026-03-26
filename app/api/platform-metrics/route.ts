import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordAvailability } from "@/lib/pullMetrics";

function annualizeReturn(
  initialCapital: number,
  finalValue: number,
  startDate: Date,
  endDate: Date
) {
  if (initialCapital <= 0 || finalValue <= 0) return null;

  const ms = endDate.getTime() - startDate.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 0) return null;

  const years = days / 365;
  if (years <= 0) return null;

  const annualized = (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;
  if (!Number.isFinite(annualized)) return null;

  return annualized;
}

function floorToMinute(ts: number) {
  return Math.floor(ts / 60000) * 60000;
}

function computeCostBasisFromBets(
  bets: Array<{
    userId: number;
    eventId: string;
    side: string;
    type: string;
    shares: number;
    amount: number;
  }>
) {
  const positionsByUser = new Map<number, Map<string, { shares: number; cost: number }>>();

  for (const bet of bets) {
    const userMap = positionsByUser.get(bet.userId) ?? new Map<string, { shares: number; cost: number }>();
    const key = `${bet.eventId}::${bet.side}`;
    const current = userMap.get(key) ?? { shares: 0, cost: 0 };

    if (bet.type === "BUY") {
      current.shares += bet.shares;
      current.cost += bet.amount;
    } else if (bet.type === "SELL") {
      if (current.shares > 0) {
        const sellShares = Math.min(bet.shares, current.shares);
        const avgCost = current.cost / current.shares;
        current.shares -= sellShares;
        current.cost -= avgCost * sellShares;
      }
    }

    userMap.set(key, {
      shares: Math.max(0, current.shares),
      cost: Math.max(0, current.cost),
    });
    positionsByUser.set(bet.userId, userMap);
  }

  const costBasisByUser = new Map<number, number>();
  for (const [userId, posMap] of positionsByUser.entries()) {
    let totalCost = 0;
    for (const pos of posMap.values()) {
      totalCost += pos.cost;
    }
    costBasisByUser.set(userId, totalCost);
  }

  return costBasisByUser;
}

export async function GET() {
  try {
    const now = Date.now();
    const windowMinutes = 24 * 60;
    const windowStart = now - windowMinutes * 60 * 1000;

    const [walletAggregate, activeInvestors, users, transactions, bets, backtestResults, pullRows] = await Promise.all([
      prisma.user.aggregate({
        _sum: {
          walletBalance: true,
        },
      }),
      prisma.user.count({
        where: {
          status: "ACTIVE",
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          createdAt: true,
          walletBalance: true,
        },
      }),
      prisma.polyTransaction.findMany({
        where: {
          type: {
            in: ["DEPOSIT", "WITHDRAW"],
          },
        },
        select: {
          userId: true,
          type: true,
          amount: true,
          createdAt: true,
        },
      }),
      prisma.polyBet.findMany({
        select: {
          userId: true,
          eventId: true,
          side: true,
          type: true,
          shares: true,
          amount: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      prisma.backtestResult.findMany({
        select: {
          initialCapital: true,
          finalValue: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.pullMetric.findMany({
        where: {
          createdAt: {
            gte: new Date(windowStart),
            lte: new Date(now),
          },
        },
        select: {
          kind: true,
          createdAt: true,
        },
      }),
    ]);

    const aum = walletAggregate._sum.walletBalance?.toNumber() ?? 0;

    const netDepositsByUser = new Map<number, number>();
    const firstCapitalTsByUser = new Map<number, number>();

    for (const tx of transactions) {
      const current = netDepositsByUser.get(tx.userId) ?? 0;
      const signed = tx.type === "DEPOSIT" ? Number(tx.amount) : -Number(tx.amount);
      netDepositsByUser.set(tx.userId, current + signed);

      const ts = tx.createdAt.getTime();
      const prevTs = firstCapitalTsByUser.get(tx.userId);
      if (prevTs === undefined || ts < prevTs) {
        firstCapitalTsByUser.set(tx.userId, ts);
      }
    }

    const costBasisByUser = computeCostBasisFromBets(
      bets.map((b) => ({
        userId: b.userId,
        eventId: b.eventId,
        side: b.side,
        type: b.type,
        shares: Number(b.shares),
        amount: Number(b.amount),
      }))
    );

    const accountAnnualizedReturns: number[] = [];
    const nowDate = new Date(now);

    for (const user of users) {
      const principal = netDepositsByUser.get(user.id) ?? 0;
      if (principal <= 0) continue;

      const wallet = Number(user.walletBalance);
      const positionCost = costBasisByUser.get(user.id) ?? 0;
      const equity = wallet + positionCost;
      if (equity <= 0) continue;

      const startTs = firstCapitalTsByUser.get(user.id) ?? user.createdAt.getTime();
      const annualized = annualizeReturn(principal, equity, new Date(startTs), nowDate);
      if (annualized !== null) {
        accountAnnualizedReturns.push(annualized);
      }
    }

    const annualizedReturns = backtestResults
      .map((result) =>
        annualizeReturn(
          result.initialCapital,
          result.finalValue,
          result.startDate,
          result.endDate
        )
      )
      .filter((value): value is number => value !== null);

    const returnsForDisplay =
      accountAnnualizedReturns.length > 0 ? accountAnnualizedReturns : annualizedReturns;

    const avgAnnualReturn =
      returnsForDisplay.length > 0
        ? returnsForDisplay.reduce((sum, value) => sum + value, 0) / returnsForDisplay.length
        : null;

    const minuteBuckets = new Set<number>();
    let healthOk = 0;
    let healthFail = 0;
    for (const row of pullRows) {
      minuteBuckets.add(floorToMinute(row.createdAt.getTime()));
      if (row.kind === "health_ok") healthOk += 1;
      if (row.kind === "health_fail") healthFail += 1;
    }

    const healthTotal = healthOk + healthFail;
    const uptimeFromHealth = healthTotal > 0 ? (healthOk / healthTotal) * 100 : null;
    const fallbackCoveragePercent = (minuteBuckets.size / windowMinutes) * 100;
    const uptimePercent = Math.min(
      100,
      uptimeFromHealth ?? fallbackCoveragePercent
    );

    recordAvailability(true);

    return NextResponse.json({
      aum,
      activeInvestors,
      uptimePercent,
      avgAnnualReturn,
      hasReturnData: returnsForDisplay.length > 0,
    });
  } catch (error) {
    recordAvailability(false);
    console.error("Platform metrics error:", error);
    return NextResponse.json({ error: "Failed to load platform metrics" }, { status: 500 });
  }
}
