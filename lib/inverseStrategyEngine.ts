/**
 * Inverse Strategy Generation Engine
 * Flips trading decisions to create opposite strategies for testing edge detection
 */

export interface TradeRecord {
  eventId: string;
  createdAt: string;
  strategyName: string;
  side: "YES" | "NO";
  amount: number;
  shares: number;
  price: number;
  category: string;
  totalReturn: number;
}

export interface InverseTradeRecord extends TradeRecord {
  isInverse: true;
  originalSide: "YES" | "NO";
}

/**
 * Generates an inverse version of a trade
 * Original: BUY YES → Inverse: SELL NO
 * Original: SELL YES → Inverse: BUY NO
 */
export function flipTrade(trade: TradeRecord): InverseTradeRecord {
  return {
    ...trade,
    isInverse: true,
    originalSide: trade.side,
    side: trade.side === "YES" ? "NO" : "YES",
    totalReturn: -trade.totalReturn, // Flip return: if original won, inverse lost, and vice versa
  };
}

/**
 * Generates inverse backtest data from original trades
 * Returns equity curve points for the inverse strategy
 */
export function buildInverseEquityCurvePoints(
  inverseTrades: TradeRecord[]
): Array<{
  index: number;
  eventId: string;
  createdAt: string;
  label: string;
  equity: number;
  drawdown: number;
  returnPct: number;
}> {
  let equity = 100;
  let peak = 100;

  return inverseTrades.map((trade, index) => {
    equity *= 1 + trade.totalReturn / 100;
    if (!Number.isFinite(equity) || equity <= 0) equity = 0;
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

    return {
      index: index + 1,
      eventId: trade.eventId,
      createdAt: trade.createdAt,
      label: new Date(trade.createdAt).toLocaleDateString([], { month: "numeric", day: "numeric" }),
      equity: Number(equity.toFixed(2)),
      drawdown: Number(drawdown.toFixed(2)),
      returnPct: Number(trade.totalReturn.toFixed(2)),
    };
  });
}

/**
 * Computes max drawdown from returns array
 */
export function computeMaxDrawdownFromReturns(returnsPct: number[]): number {
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  for (const ret of returnsPct) {
    equity *= 1 + ret / 100;
    if (!Number.isFinite(equity) || equity <= 0) {
      return 100;
    }

    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return Number(maxDrawdown.toFixed(2));
}

/**
 * Analyzes inverse performance to determine if original strategy has real edge
 * If inverse performs significantly worse, original has real edge (not just luck)
 */
export function analyzeStrategyEdge(
  originalMetrics: { winRate: number | null; avgReturn: number | null },
  inverseMetrics: { winRate: number | null; avgReturn: number | null }
): {
  hasEdge: boolean;
  edgeStrength: "strong" | "moderate" | "weak" | "none";
  explanation: string;
} {
  const origWR = originalMetrics.winRate ?? 0;
  const origRet = originalMetrics.avgReturn ?? 0;
  const invWR = inverseMetrics.winRate ?? 0;
  const invRet = inverseMetrics.avgReturn ?? 0;

  const winRateDiff = origWR - invWR;
  const returnDiff = origRet - invRet;

  // Strong edge: original outperforms inverse by significant margin
  if (winRateDiff > 15 && returnDiff > 8) {
    return {
      hasEdge: true,
      edgeStrength: "strong",
      explanation: `Original strategy significantly outperforms inverse (+${winRateDiff.toFixed(1)}% WR, +${returnDiff.toFixed(1)}% return). Strong edge detected.`,
    };
  }

  // Moderate edge: noticeable outperformance
  if (winRateDiff > 8 && returnDiff > 4) {
    return {
      hasEdge: true,
      edgeStrength: "moderate",
      explanation: `Original strategy outperforms inverse (+${winRateDiff.toFixed(1)}% WR, +${returnDiff.toFixed(1)}% return). Moderate edge detected.`,
    };
  }

  // Weak edge: slight outperformance
  if (winRateDiff > 3 || returnDiff > 2) {
    return {
      hasEdge: true,
      edgeStrength: "weak",
      explanation: `Original strategy slightly outperforms inverse. Weak edge, may be noise.`,
    };
  }

  // No edge: performance similar or inverse better
  return {
    hasEdge: false,
    edgeStrength: "none",
    explanation: `Original and inverse have similar performance or inverse better. Limited edge evidence.`,
  };
}

/**
 * Generates strategy name for inverse variant
 */
export function getInverseStrategyName(originalName: string): string {
  // Avoid double-naming if already an inverse
  if (originalName.includes("(inverse version)")) {
    return originalName;
  }
  return `${originalName} (inverse version)`;
}
