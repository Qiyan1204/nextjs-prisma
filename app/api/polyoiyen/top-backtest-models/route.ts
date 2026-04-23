import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { BACKTEST_MARKET_SEGMENTS } from "@/app/polyoiyen/shared/categoryConfig";

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
  bets: RawBetRow[];
};

type TrendDirection = "up" | "down" | "flat" | "new";
type RiskLevel = "low" | "medium" | "high";

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
  trendDirection: TrendDirection;
  trendDeltaPct: number | null;
  trendLabel: string;
  recentTradeCount7d: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
};

type SortBy = "return" | "winRate" | "tradeCount";
type SortDir = "asc" | "desc";

type EventMeta = {
  title: string;
  winner: "YES" | "NO" | null;
  yesPrice: number | null;
  noPrice: number | null;
};

function isAllowedBacktestMarket(row: Pick<ModelSummary, "marketTitle" | "marketQuestion" | "category">): boolean {
  const haystack = `${row.marketTitle || ""} ${row.marketQuestion || ""} ${row.category || ""}`.toLowerCase();
  return BACKTEST_MARKET_SEGMENTS.some((segment) => haystack.includes(segment));
}

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

async function fetchEventMetaMap(eventIds: string[]): Promise<Record<string, EventMeta>> {
  const uniqueEventIds = [...new Set(eventIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueEventIds.map(async (eventId) => {
      try {
        const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return [eventId, { title: "", winner: null, yesPrice: null, noPrice: null }] as const;
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
        return [eventId, { title, winner, yesPrice: prices.yesPrice, noPrice: prices.noPrice }] as const;
      } catch {
        return [eventId, { title: "", winner: null, yesPrice: null, noPrice: null }] as const;
      }
    })
  );

  return Object.fromEntries(entries) as Record<string, EventMeta>;
}

function summarizeGroup(group: GroupedModel, meta: EventMeta | undefined, cutoffMs?: number): ModelSummary | null {
  const relevantBets = cutoffMs == null
    ? group.bets
    : group.bets.filter((bet) => bet.createdAt.getTime() <= cutoffMs);

  if (relevantBets.length === 0) return null;

  const winner = meta?.winner ?? null;
  const totals = {
    yesBuyAmount: 0,
    yesBuyShares: 0,
    yesSellAmount: 0,
    yesSellShares: 0,
    noBuyAmount: 0,
    noBuyShares: 0,
    noSellAmount: 0,
    noSellShares: 0,
    claimAmount: 0,
  };

  const participantUserIds = new Set<number>();
  let firstTradeAt = relevantBets[0].createdAt;
  let lastTradeAt = relevantBets[0].createdAt;

  for (const bet of relevantBets) {
    const side = bet.side === "YES" || bet.side === "NO" ? bet.side : null;
    if (!side) continue;

    const amount = Number(bet.amount || 0);
    const shares = Number(bet.shares || 0);
    const tradeType = bet.type || "BUY";

    participantUserIds.add(bet.userId);
    if (bet.createdAt < firstTradeAt) firstTradeAt = bet.createdAt;
    if (bet.createdAt > lastTradeAt) lastTradeAt = bet.createdAt;

    if (tradeType === "BUY") {
      if (side === "YES") {
        totals.yesBuyAmount += amount;
        totals.yesBuyShares += shares;
      } else {
        totals.noBuyAmount += amount;
        totals.noBuyShares += shares;
      }
    } else if (tradeType === "SELL") {
      if (side === "YES") {
        totals.yesSellAmount += amount;
        totals.yesSellShares += shares;
      } else {
        totals.noSellAmount += amount;
        totals.noSellShares += shares;
      }
    } else if (tradeType === "CLAIM") {
      totals.claimAmount += amount;
    }
  }

  const netYesShares = Math.max(0, totals.yesBuyShares - totals.yesSellShares);
  const netNoShares = Math.max(0, totals.noBuyShares - totals.noSellShares);
  const realizedCash = totals.yesSellAmount + totals.noSellAmount + totals.claimAmount;

  let remainingValue = 0;
  if (winner) {
    remainingValue = winner === "YES" ? netYesShares : netNoShares;
  } else {
    const yesPrice = meta?.yesPrice;
    const noPrice = meta?.noPrice;
    if (yesPrice == null && noPrice == null) return null;
    remainingValue = netYesShares * Number(yesPrice || 0) + netNoShares * Number(noPrice || 0);
  }

  const realizedValue = realizedCash + remainingValue;
  const invested = totals.yesBuyAmount + totals.noBuyAmount;
  if (invested <= 0) return null;

  const isYesBias = totals.yesBuyAmount >= totals.noBuyAmount;
  const entryAmount = isYesBias ? totals.yesBuyAmount : totals.noBuyAmount;
  const entryShares = isYesBias ? totals.yesBuyShares : totals.noBuyShares;
  const exitAmount = isYesBias ? totals.yesSellAmount : totals.noSellAmount;
  const exitShares = isYesBias ? totals.yesSellShares : totals.noSellShares;
  const entryPrice = entryShares > 0 ? entryAmount / entryShares : null;
  const exitPrice = exitShares > 0 ? exitAmount / exitShares : null;
  const totalReturn = ((realizedValue - invested) / invested) * 100;

  const currentTradeCount = relevantBets.length;
  const riskReasons: string[] = [];
  if (!winner && meta?.yesPrice == null && meta?.noPrice == null) riskReasons.push("No clear exit price");
  if (currentTradeCount < 8) riskReasons.push("Small sample");
  if (!((totals.yesSellAmount + totals.noSellAmount + totals.claimAmount) > 0 || (netYesShares <= 0.000001 && netNoShares <= 0.000001))) {
    riskReasons.push("Open position");
  }
  if (participantUserIds.size <= 1) riskReasons.push("Single participant");
  if (Math.abs(totalReturn) >= 100) riskReasons.push("Extreme return swing");
  if (totalReturn < -20) riskReasons.push("Negative return");

  let riskLevel: RiskLevel = "low";
  if (riskReasons.length >= 3 || riskReasons.includes("Open position") || riskReasons.includes("Extreme return swing")) {
    riskLevel = "high";
  } else if (riskReasons.length >= 1) {
    riskLevel = "medium";
  }

  return {
    eventId: group.eventId,
    marketQuestion: group.marketQuestion,
    marketTitle: group.marketTitle || group.marketQuestion,
    category: group.category,
    userCount: participantUserIds.size,
    sideBias: isYesBias ? "YES_BIAS" : "NO_BIAS",
    tradeCount: currentTradeCount,
    invested: Number(invested.toFixed(2)),
    totalReturn: Number(totalReturn.toFixed(2)),
    winRate: totalReturn >= 0 ? 100 : 0,
    entryPrice: entryPrice == null ? null : Number(entryPrice.toFixed(6)),
    exitPrice: exitPrice == null ? null : Number(exitPrice.toFixed(6)),
    firstTradeAt: firstTradeAt.toISOString(),
    lastTradeAt: lastTradeAt.toISOString(),
    hasExited: (totals.yesSellAmount + totals.noSellAmount + totals.claimAmount) > 0 || (netYesShares <= 0.000001 && netNoShares <= 0.000001),
    trendDirection: "flat",
    trendDeltaPct: null,
    trendLabel: "New",
    recentTradeCount7d: 0,
    riskLevel,
    riskReasons,
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

    const rawBets = await prisma.polyBet.findMany({
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

    const bets: RawBetRow[] = rawBets.map((bet) => ({
      userId: bet.userId,
      eventId: bet.eventId,
      marketQuestion: bet.marketQuestion,
      side: bet.side,
      type: bet.type,
      amount: Number(bet.amount),
      shares: Number(bet.shares),
      price: Number(bet.price),
      category: bet.category,
      createdAt: bet.createdAt,
    }));

    const grouped = new Map<string, GroupedModel>();

    for (const bet of bets) {
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
        bets: [],
      };

      const amount = Number(bet.amount || 0);
      const shares = Number(bet.shares || 0);
      const tradeType = bet.type || "BUY";

      current.tradeCount += 1;
      current.bets.push(bet);
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
    const trendCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const summaries = Array.from(grouped.values())
      .map((group) => {
        const meta = metaMap[group.eventId];
        group.marketTitle = meta?.title || group.marketQuestion;
        const current = summarizeGroup(group, meta);
        if (!current) return null;
        const previous = summarizeGroup(group, meta, trendCutoff);
        const trendDeltaPct = previous ? Number((current.totalReturn - previous.totalReturn).toFixed(2)) : null;
        const recentTradeCount7d = previous ? Math.max(0, current.tradeCount - previous.tradeCount) : current.tradeCount;
        const trendDirection: TrendDirection = !previous
          ? "new"
          : trendDeltaPct == null
            ? "flat"
            : trendDeltaPct > 1
              ? "up"
              : trendDeltaPct < -1
                ? "down"
                : "flat";

        const trendLabel = trendDirection === "new"
          ? "New"
          : trendDirection === "up"
            ? `↑ ${Math.abs(trendDeltaPct || 0).toFixed(2)}% vs 7d`
            : trendDirection === "down"
              ? `↓ ${Math.abs(trendDeltaPct || 0).toFixed(2)}% vs 7d`
              : `→ ${Math.abs(trendDeltaPct || 0).toFixed(2)}% vs 7d`;

        return {
          ...current,
          trendDirection,
          trendDeltaPct,
          trendLabel,
          recentTradeCount7d,
        };
      })
      .filter((item): item is ModelSummary => item !== null)
      .filter((row) => row.tradeCount >= minTrades)
      .filter((row) => isAllowedBacktestMarket(row));

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