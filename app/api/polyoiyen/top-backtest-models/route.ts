import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RawBetRow = {
  userId: number;
  eventId: string;
  marketQuestion: string;
  side: string;
  type: string;
  amount: number;
  shares: number;
  price: number;
  category: string;
  createdAt: Date;
};

type GroupedModel = {
  eventId: string;
  marketQuestion: string;
  marketTitle: string;
  category: string;
  participantUserIds: Set<number>;
  yesBuyAmount: number;
  yesBuyShares: number;
  yesSellAmount: number;
  yesSellShares: number;
  noBuyAmount: number;
  noBuyShares: number;
  noSellAmount: number;
  noSellShares: number;
  claimAmount: number;
  tradeCount: number;
  firstTradeAt: Date;
  lastTradeAt: Date;
};

type ModelSummary = {
  eventId: string;
  marketQuestion: string;
  marketTitle: string;
  category: string;
  userCount: number;
  sideBias: "YES_BIAS" | "NO_BIAS";
  tradeCount: number;
  invested: number;
  totalReturn: number;
  winRate: number;
  entryPrice: number | null;
  exitPrice: number | null;
  firstTradeAt: string;
  lastTradeAt: string;
  hasExited: boolean;
};

type SortBy = "return" | "winRate" | "tradeCount";
type SortDir = "asc" | "desc";

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

async function fetchEventMetaMap(eventIds: string[]): Promise<Record<string, { title: string; winner: "YES" | "NO" | null }>> {
  const uniqueEventIds = [...new Set(eventIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueEventIds.map(async (eventId) => {
      try {
        const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return [eventId, { title: "", winner: null }] as const;
        const payload = await res.json();
        const markets = Array.isArray(payload?.markets) ? (payload.markets as Array<{ outcomes?: unknown; outcomePrices?: unknown }>) : [];
        const title = typeof payload?.title === "string" ? payload.title : typeof payload?.question === "string" ? payload.question : "";
        const topLevelWinner = inferWinnerSideFromOutcomes(payload?.outcomes, payload?.outcomePrices);
        let winner: "YES" | "NO" | null = topLevelWinner;
        for (const market of markets) {
          winner = winner || inferWinnerSideFromOutcomes(market?.outcomes, market?.outcomePrices);
        }
        return [eventId, { title, winner }] as const;
      } catch {
        return [eventId, { title: "", winner: null }] as const;
      }
    })
  );

  return Object.fromEntries(entries) as Record<string, { title: string; winner: "YES" | "NO" | null }>;
}

function summarizeGroup(group: GroupedModel, winner: "YES" | "NO" | null): ModelSummary | null {
  if (!winner) return null;

  const netYesShares = Math.max(0, group.yesBuyShares - group.yesSellShares);
  const netNoShares = Math.max(0, group.noBuyShares - group.noSellShares);
  const payoutRemaining = winner === "YES" ? netYesShares : netNoShares;
  const realizedValue = group.yesSellAmount + group.noSellAmount + group.claimAmount + payoutRemaining;
  const invested = group.yesBuyAmount + group.noBuyAmount;
  if (invested <= 0) return null;

  const isYesBias = group.yesBuyAmount >= group.noBuyAmount;
  const entryAmount = isYesBias ? group.yesBuyAmount : group.noBuyAmount;
  const entryShares = isYesBias ? group.yesBuyShares : group.noBuyShares;
  const exitAmount = isYesBias ? group.yesSellAmount : group.noSellAmount;
  const exitShares = isYesBias ? group.yesSellShares : group.noSellShares;
  const entryPrice = entryShares > 0 ? entryAmount / entryShares : null;
  const exitPrice = exitShares > 0 ? exitAmount / exitShares : null;
  const totalReturn = ((realizedValue - invested) / invested) * 100;

  return {
    eventId: group.eventId,
    marketQuestion: group.marketQuestion,
    marketTitle: group.marketTitle || group.marketQuestion,
    category: group.category,
    userCount: group.participantUserIds.size,
    sideBias: isYesBias ? "YES_BIAS" : "NO_BIAS",
    tradeCount: group.tradeCount,
    invested: Number(invested.toFixed(2)),
    totalReturn: Number(totalReturn.toFixed(2)),
    winRate: totalReturn >= 0 ? 100 : 0,
    entryPrice: entryPrice == null ? null : Number(entryPrice.toFixed(6)),
    exitPrice: exitPrice == null ? null : Number(exitPrice.toFixed(6)),
    firstTradeAt: group.firstTradeAt.toISOString(),
    lastTradeAt: group.lastTradeAt.toISOString(),
    hasExited: (group.yesSellAmount + group.noSellAmount + group.claimAmount) > 0 || (netYesShares <= 0.000001 && netNoShares <= 0.000001),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || "20") || 20));
    const minTrades = Math.max(0, Number(searchParams.get("minTrades") || "3") || 3);
    const sortByRaw = (searchParams.get("sortBy") || "return").trim();
    const sortDirRaw = (searchParams.get("sortDir") || "desc").trim();
    const searchQuery = (searchParams.get("q") || "").trim().toLowerCase();
    const sortBy: SortBy = sortByRaw === "winRate" || sortByRaw === "tradeCount" ? sortByRaw : "return";
    const sortDir: SortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const bets = await prisma.polyBet.findMany({
      select: {
        userId: true,
        eventId: true,
        marketQuestion: true,
        side: true,
        type: true,
        amount: true,
        shares: true,
        price: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const grouped = new Map<string, GroupedModel>();

    for (const bet of bets as RawBetRow[]) {
      const side = bet.side === "YES" || bet.side === "NO" ? bet.side : null;
      if (!side) continue;

      const current = grouped.get(bet.eventId) || {
        eventId: bet.eventId,
        marketQuestion: bet.marketQuestion,
        marketTitle: bet.marketQuestion,
        category: bet.category || "Other",
        participantUserIds: new Set<number>(),
        yesBuyAmount: 0,
        yesBuyShares: 0,
        yesSellAmount: 0,
        yesSellShares: 0,
        noBuyAmount: 0,
        noBuyShares: 0,
        noSellAmount: 0,
        noSellShares: 0,
        claimAmount: 0,
        tradeCount: 0,
        firstTradeAt: bet.createdAt,
        lastTradeAt: bet.createdAt,
      };

      const amount = Number(bet.amount || 0);
      const shares = Number(bet.shares || 0);
      const tradeType = bet.type || "BUY";

      current.tradeCount += 1;
      current.participantUserIds.add(bet.userId);
      if (bet.createdAt < current.firstTradeAt) current.firstTradeAt = bet.createdAt;
      if (bet.createdAt > current.lastTradeAt) current.lastTradeAt = bet.createdAt;
      current.marketQuestion = bet.marketQuestion || current.marketQuestion;
      current.category = bet.category || current.category;

      if (tradeType === "BUY") {
        if (side === "YES") {
          current.yesBuyAmount += amount;
          current.yesBuyShares += shares;
        } else {
          current.noBuyAmount += amount;
          current.noBuyShares += shares;
        }
      } else if (tradeType === "SELL") {
        if (side === "YES") {
          current.yesSellAmount += amount;
          current.yesSellShares += shares;
        } else {
          current.noSellAmount += amount;
          current.noSellShares += shares;
        }
      } else if (tradeType === "CLAIM") {
        current.claimAmount += amount;
      }

      grouped.set(bet.eventId, current);
    }

    const metaMap = await fetchEventMetaMap([...grouped.keys()]);
    const summaries = Array.from(grouped.values())
      .map((group) => {
        const meta = metaMap[group.eventId];
        group.marketTitle = meta?.title || group.marketQuestion;
        return summarizeGroup(group, meta?.winner ?? null);
      })
      .filter((item): item is ModelSummary => item !== null)
      .filter((row) => row.tradeCount >= minTrades);

    const searched = searchQuery
      ? summaries.filter((row) => {
          const title = (row.marketTitle || "").toLowerCase();
          const question = (row.marketQuestion || "").toLowerCase();
          const eventId = (row.eventId || "").toLowerCase();
          return title.includes(searchQuery) || question.includes(searchQuery) || eventId.includes(searchQuery);
        })
      : summaries;

    const sorted = [...searched].sort((a, b) => {
      const av = sortBy === "return" ? a.totalReturn : sortBy === "winRate" ? a.winRate : a.tradeCount;
      const bv = sortBy === "return" ? b.totalReturn : sortBy === "winRate" ? b.winRate : b.tradeCount;
      if (av === bv) return b.lastTradeAt.localeCompare(a.lastTradeAt);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    const byReturnDesc = [...summaries].sort((a, b) => b.totalReturn - a.totalReturn);
    const byReturnAsc = [...summaries].sort((a, b) => a.totalReturn - b.totalReturn);

    const totalModels = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalModels / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageModels = sorted.slice(start, start + pageSize);
    const topModels = byReturnDesc.slice(0, 20);
    const bottomModels = byReturnAsc.slice(0, 20);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      page: safePage,
      pageSize,
      minTrades,
      sortBy,
      sortDir,
      q: searchQuery,
      totalModels,
      totalPages,
      models: pageModels,
      topModels,
      bottomModels,
    });
  } catch (error) {
    console.error("Top backtest models error:", error);
    return NextResponse.json({ error: "Failed to load backtest models" }, { status: 500 });
  }
}