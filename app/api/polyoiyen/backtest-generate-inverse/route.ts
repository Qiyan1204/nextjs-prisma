import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  flipTrade,
  buildInverseEquityCurvePoints,
  computeMaxDrawdownFromReturns,
  analyzeStrategyEdge,
  getInverseStrategyName,
  type TradeRecord,
} from "@/lib/inverseStrategyEngine";

/**
 * POST /api/polyoiyen/backtest-generate-inverse
 * Generate inverse strategy and run backtest on it
 * Expects: { modelBacktestId: number, originalEquityCurve, lossAttribution }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      originalModelBacktestId,
      tradeData, // Array of trade records
      strategyMetrics, // { [strategyName]: { winRate, avgReturn, maxDrawdown, ... } }
      equityCurveAggregate,
    } = body;

    if (!originalModelBacktestId || !tradeData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch original model
    const originalModel = await prisma.modelBacktest.findUnique({
      where: { id: originalModelBacktestId },
      include: { strategies: true },
    });

    if (!originalModel) {
      return NextResponse.json({ error: "Original model not found" }, { status: 404 });
    }

    // Create inverse model
    const inverseModel = await prisma.modelBacktest.create({
      data: {
        name: `${originalModel.name} (inverse)`,
        version: `${originalModel.version}-inv`,
        description: `Inverse version of ${originalModel.name}`,
        notes: `Automatically generated inverse: all trading decisions flipped from original model ${originalModel.id}`,
        modelType: originalModel.modelType,
        parameters: originalModel.parameters,
        dataStartDate: originalModel.dataStartDate,
        dataEndDate: originalModel.dataEndDate,
        status: "compare",
        isInversePair: true,
        parentModelId: originalModelBacktestId,
      },
    });

    // Generate inverse trades
    const inverseTrades = (tradeData as TradeRecord[]).map(flipTrade);

    // Group inverse trades by strategy
    const inverseByStrategy = new Map<string, TradeRecord[]>();
    for (const trade of inverseTrades) {
      const stratKey = trade.strategyName;
      if (!inverseByStrategy.has(stratKey)) {
        inverseByStrategy.set(stratKey, []);
      }
      inverseByStrategy.get(stratKey)!.push(trade);
    }

    // Calculate metrics for each inverse strategy
    const inverseStrategyMetrics = new Map<
      string,
      { winRate: number | null; avgReturn: number | null; maxDrawdown: number }
    >();

    for (const [stratName, trades] of inverseByStrategy.entries()) {
      const returns = trades.map((t) => t.totalReturn);
      const wins = trades.filter((t) => t.totalReturn > 0).length;
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : null;
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
      const maxDrawdown = computeMaxDrawdownFromReturns(returns);

      inverseStrategyMetrics.set(stratName, { winRate, avgReturn, maxDrawdown });
    }

    // Create strategy variants for inverse model
    for (const [stratName, inverseMets] of inverseStrategyMetrics.entries()) {
      const originalMets = strategyMetrics?.[stratName];

      // Find original strategy
      const origStrat = originalModel.strategies.find((s: any) => s.strategyName === stratName);

      await prisma.strategyVariant.create({
        data: {
          modelBacktestId: inverseModel.id,
          strategyName: getInverseStrategyName(stratName),
          isInverse: true,
          parentStrategyId: origStrat?.id,
          runsCount: inverseByStrategy.get(stratName)?.length || 0,
          winRate: inverseMets.winRate,
          avgReturn: inverseMets.avgReturn,
          maxDrawdown: inverseMets.maxDrawdown,
        },
      });
    }

    // Calculate inverse aggregate metrics
    const inverseReturns = inverseTrades.map((t) => t.totalReturn);
    const inverseWins = inverseTrades.filter((t) => t.totalReturn > 0).length;
    const inverseWinRate = inverseTrades.length > 0 ? (inverseWins / inverseTrades.length) * 100 : null;
    const inverseAvgReturn = inverseReturns.length > 0 ? inverseReturns.reduce((a, b) => a + b, 0) / inverseReturns.length : null;
    const inverseMaxDD = computeMaxDrawdownFromReturns(inverseReturns);
    const inverseEquityCurve = buildInverseEquityCurvePoints(inverseTrades);

    // Store inverse backtest run
    await prisma.backtestVersionRun.create({
      data: {
        modelBacktestId: inverseModel.id,
        totalRuns: inverseTrades.length,
        aggregateWinRate: inverseWinRate,
        avgReturn: inverseAvgReturn,
        avgMaxDrawdown: inverseMaxDD,
        equityCurveJson: JSON.stringify({
          aggregate: inverseEquityCurve,
          byStrategy: Array.from(inverseByStrategy.entries()).map(([stratName, trades]) => ({
            strategyName: getInverseStrategyName(stratName),
            maxDrawdown: inverseStrategyMetrics.get(stratName)?.maxDrawdown || 0,
            points: buildInverseEquityCurvePoints(trades),
          })),
        }),
        lossAttributionJson: JSON.stringify(
          Array.from(inverseStrategyMetrics.entries()).map(([stratName, metrics]) => ({
            strategyName: getInverseStrategyName(stratName),
            runs: inverseByStrategy.get(stratName)?.length || 0,
            winRate: metrics.winRate,
            avgReturn: metrics.avgReturn,
            maxDrawdown: metrics.maxDrawdown,
            lossContributionPct: 0, // Can be calculated in data-health
          }))
        ),
        worstEventsJson: JSON.stringify(
          inverseTrades
            .filter((t) => t.totalReturn < -5)
            .sort((a, b) => a.totalReturn - b.totalReturn)
            .slice(0, 10)
        ),
        diagnosticsJson: JSON.stringify({
          resolvedSamples: inverseTrades.length,
          unresolvedEvents: 0,
          excludedNoBuyEvents: 0,
          scannedEvents: inverseTrades.length,
        }),
        backtestStatus: "sufficient",
      },
    });

    // Perform edge analysis
    const originalAgg = {
      winRate: equityCurveAggregate?.aggregateWinRate ?? 0,
      avgReturn: equityCurveAggregate?.avgReturn ?? 0,
    };
    const inverseAgg = {
      winRate: inverseWinRate ?? 0,
      avgReturn: inverseAvgReturn ?? 0,
    };

    const edgeAnalysis = analyzeStrategyEdge(originalAgg, inverseAgg);

    return NextResponse.json(
      {
        inverseModel: {
          id: inverseModel.id,
          name: inverseModel.name,
          version: inverseModel.version,
        },
        metrics: {
          original: { winRate: originalAgg.winRate, avgReturn: originalAgg.avgReturn },
          inverse: { winRate: inverseAgg.winRate, avgReturn: inverseAgg.avgReturn },
        },
        edgeAnalysis,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to generate inverse backtest:", error);
    return NextResponse.json({ error: "Failed to generate inverse backtest" }, { status: 500 });
  }
}
