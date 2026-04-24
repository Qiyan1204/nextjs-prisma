import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type BetRow = {
  userId: number;
  eventId: string;
  marketQuestion: string;
  side: string;
  type: string;
  amount: number;
  shares: number;
  category: string;
  createdAt: Date;
};

type EventMeta = {
  title: string;
  winner: "YES" | "NO" | null;
  yesPrice: number | null;
  noPrice: number | null;
};

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function inferWinnerSideFromOutcomes(outcomesRaw: unknown, pricesRaw: unknown): "YES" | "NO" | null {
  const outcomes = parseJsonArray<string>(outcomesRaw).map((x) => String(x).toUpperCase());
  const prices = parseJsonArray<number | string>(pricesRaw).map((x) => Number(x));
  if (outcomes.length < 2 || prices.length < 2) return null;

  let bestIdx = -1;
  let bestPrice = -1;
  for (let index = 0; index < prices.length; index += 1) {
    const price = prices[index];
    if (!Number.isFinite(price)) continue;
    if (price > bestPrice) {
      bestPrice = price;
      bestIdx = index;
    }
  }

  if (bestIdx < 0 || bestPrice < 0.97) return null;
  const label = outcomes[bestIdx] || "";
  if (label.includes("YES")) return "YES";
  if (label.includes("NO")) return "NO";
  return null;
}

function inferYesNoPrices(outcomesRaw: unknown, pricesRaw: unknown): { yesPrice: number | null; noPrice: number | null } {
  const outcomes = parseJsonArray<string>(outcomesRaw).map((x) => String(x).toUpperCase());
  const prices = parseJsonArray<number | string>(pricesRaw).map((x) => Number(x));
  if (outcomes.length < 2 || prices.length < 2) return { yesPrice: null, noPrice: null };

  let yesPrice: number | null = null;
  let noPrice: number | null = null;

  for (let index = 0; index < outcomes.length; index += 1) {
    const label = outcomes[index] || "";
    const price = prices[index];
    if (!Number.isFinite(price) || price < 0 || price > 1) continue;
    if (yesPrice == null && label.includes("YES")) yesPrice = price;
    if (noPrice == null && label.includes("NO")) noPrice = price;
  }

  if (yesPrice == null && noPrice != null) yesPrice = Math.max(0, Math.min(1, 1 - noPrice));
  if (noPrice == null && yesPrice != null) noPrice = Math.max(0, Math.min(1, 1 - yesPrice));
  return { yesPrice, noPrice };
}

async function fetchEventMeta(eventId: string): Promise<EventMeta> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { title: "", winner: null, yesPrice: null, noPrice: null };

    const payload = await res.json();
    const markets = Array.isArray(payload?.markets) ? (payload.markets as Array<{ outcomes?: unknown; outcomePrices?: unknown }>) : [];
    const title = typeof payload?.title === "string" ? payload.title : typeof payload?.question === "string" ? payload.question : "";

    const topLevelWinner = inferWinnerSideFromOutcomes(payload?.outcomes, payload?.outcomePrices);
    let prices = inferYesNoPrices(payload?.outcomes, payload?.outcomePrices);
    let winner: "YES" | "NO" | null = topLevelWinner;

    for (const market of markets) {
      winner = winner || inferWinnerSideFromOutcomes(market?.outcomes, market?.outcomePrices);
      if (prices.yesPrice == null && prices.noPrice == null) {
        prices = inferYesNoPrices(market?.outcomes, market?.outcomePrices);
      }
    }

    return { title, winner, yesPrice: prices.yesPrice, noPrice: prices.noPrice };
  } catch {
    return { title: "", winner: null, yesPrice: null, noPrice: null };
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const decodedEventId = decodeURIComponent(eventId || "").trim();
    if (!decodedEventId) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const rawBets = await prisma.polyBet.findMany({
      where: { eventId: decodedEventId },
      select: {
        userId: true,
        eventId: true,
        marketQuestion: true,
        side: true,
        type: true,
        amount: true,
        shares: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (rawBets.length === 0) {
      return NextResponse.json({ error: "No backtest details found for this event." }, { status: 404 });
    }

    const bets: BetRow[] = rawBets.map((bet) => ({
      userId: bet.userId,
      eventId: bet.eventId,
      marketQuestion: bet.marketQuestion,
      side: bet.side,
      type: bet.type,
      amount: Number(bet.amount),
      shares: Number(bet.shares),
      category: bet.category,
      createdAt: bet.createdAt,
    }));

    const meta = await fetchEventMeta(decodedEventId);
    const userSet = new Set<number>();

    let yesBuyAmount = 0;
    let yesBuyShares = 0;
    let yesSellAmount = 0;
    let yesSellShares = 0;
    let noBuyAmount = 0;
    let noBuyShares = 0;
    let noSellAmount = 0;
    let noSellShares = 0;
    let claimAmount = 0;

    let firstTradeAt = bets[0].createdAt;
    let lastTradeAt = bets[0].createdAt;

    for (const bet of bets) {
      if (bet.side !== "YES" && bet.side !== "NO") continue;
      const amount = Number(bet.amount || 0);
      const shares = Number(bet.shares || 0);
      userSet.add(bet.userId);
      if (bet.createdAt < firstTradeAt) firstTradeAt = bet.createdAt;
      if (bet.createdAt > lastTradeAt) lastTradeAt = bet.createdAt;

      if (bet.type === "BUY") {
        if (bet.side === "YES") {
          yesBuyAmount += amount;
          yesBuyShares += shares;
        } else {
          noBuyAmount += amount;
          noBuyShares += shares;
        }
      } else if (bet.type === "SELL") {
        if (bet.side === "YES") {
          yesSellAmount += amount;
          yesSellShares += shares;
        } else {
          noSellAmount += amount;
          noSellShares += shares;
        }
      } else if (bet.type === "CLAIM") {
        claimAmount += amount;
      }
    }

    const invested = yesBuyAmount + noBuyAmount;
    if (invested <= 0) {
      return NextResponse.json({ error: "No backtest details found for this event." }, { status: 404 });
    }

    const netYesShares = Math.max(0, yesBuyShares - yesSellShares);
    const netNoShares = Math.max(0, noBuyShares - noSellShares);
    const realizedCash = yesSellAmount + noSellAmount + claimAmount;

    let remainingValue = 0;
    if (meta.winner) {
      remainingValue = meta.winner === "YES" ? netYesShares : netNoShares;
    } else {
      const yesPrice = Number(meta.yesPrice || 0);
      const noPrice = Number(meta.noPrice || 0);
      remainingValue = netYesShares * yesPrice + netNoShares * noPrice;
    }

    const realizedValue = realizedCash + remainingValue;
    const totalReturn = ((realizedValue - invested) / invested) * 100;

    const isYesBias = yesBuyAmount >= noBuyAmount;
    const entryAmount = isYesBias ? yesBuyAmount : noBuyAmount;
    const entryShares = isYesBias ? yesBuyShares : noBuyShares;
    const exitAmount = isYesBias ? yesSellAmount : noSellAmount;
    const exitShares = isYesBias ? yesSellShares : noSellShares;

    const entryPrice = entryShares > 0 ? entryAmount / entryShares : null;
    const exitPrice = exitShares > 0 ? exitAmount / exitShares : null;

    const hasExited = realizedCash > 0 || (netYesShares <= 0.000001 && netNoShares <= 0.000001);

    const riskReasons: string[] = [];
    if (rawBets.length < 8) riskReasons.push("Small sample");
    if (!hasExited) riskReasons.push("Open position");
    if (Math.abs(totalReturn) >= 100) riskReasons.push("Extreme return swing");
    if (totalReturn < -20) riskReasons.push("Negative return");

    let riskLevel: "low" | "medium" | "high" = "low";
    if (riskReasons.length >= 3 || riskReasons.includes("Open position") || riskReasons.includes("Extreme return swing")) {
      riskLevel = "high";
    } else if (riskReasons.length >= 1) {
      riskLevel = "medium";
    }

    const payload = {
      eventId: decodedEventId,
      marketQuestion: bets[0].marketQuestion,
      marketTitle: meta.title || bets[0].marketQuestion,
      category: bets[0].category || "Other",
      userCount: userSet.size,
      sideBias: isYesBias ? "YES_BIAS" : "NO_BIAS",
      tradeCount: rawBets.length,
      invested: Number(invested.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      winRate: totalReturn >= 0 ? 100 : 0,
      entryPrice: entryPrice == null ? null : Number(entryPrice.toFixed(6)),
      exitPrice: exitPrice == null ? null : Number(exitPrice.toFixed(6)),
      firstTradeAt: firstTradeAt.toISOString(),
      lastTradeAt: lastTradeAt.toISOString(),
      hasExited,
      trendDirection: "flat",
      trendDeltaPct: null,
      trendLabel: "Event snapshot",
      recentTradeCount7d: 0,
      riskLevel,
      riskReasons,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to fetch backtest event details:", error);
    return NextResponse.json({ error: "Failed to fetch backtest event details" }, { status: 500 });
  }
}
