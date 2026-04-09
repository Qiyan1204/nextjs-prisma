import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/polyoiyen/backtest-save-version
 * Save current backtest analysis as a new version run
 * Requires: modelBacktestId, backtestData (from /api/polyoiyen/data-health response)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { modelBacktestId, backtestData } = body;

    if (!modelBacktestId || !backtestData) {
      return NextResponse.json({ error: "Missing modelBacktestId or backtestData" }, { status: 400 });
    }

    // Verify model exists
    const model = await prisma.modelBacktest.findUnique({
      where: { id: modelBacktestId },
    });

    if (!model) {
      return NextResponse.json({ error: "Model backtest not found" }, { status: 404 });
    }

    const quality = backtestData.backtestQuality;

    // Create backtest run
    const run = await prisma.backtestVersionRun.create({
      data: {
        modelBacktestId,
        totalRuns: quality.totalRuns,
        aggregateWinRate: quality.aggregateWinRate,
        avgReturn: quality.avgReturn,
        avgMaxDrawdown: quality.avgMaxDrawdown,
        equityCurveJson: JSON.stringify(quality.equityCurve),
        lossAttributionJson: JSON.stringify(quality.lossAttribution),
        worstEventsJson: JSON.stringify(quality.lossAttribution?.worstEvents || []),
        diagnosticsJson: JSON.stringify(quality.diagnostics),
        backtestStatus: quality.status,
      },
    });

    // Update or create strategy variants from this run
    if (quality.lossAttribution?.byStrategy) {
      for (const strat of quality.lossAttribution.byStrategy) {
        // Check if strategy already exists
        let stratVar = await prisma.strategyVariant.findFirst({
          where: {
            modelBacktestId,
            strategyName: strat.strategyName,
            isInverse: false,
          },
        });

        if (!stratVar) {
          stratVar = await prisma.strategyVariant.create({
            data: {
              modelBacktestId,
              strategyName: strat.strategyName,
              isInverse: false,
              runsCount: strat.runs,
              winRate: strat.winRate,
              avgReturn: strat.avgReturn,
              maxDrawdown: strat.maxDrawdown,
              lossContributionPct: strat.lossContributionPct,
            },
          });
        } else {
          // Update existing strategy
          await prisma.strategyVariant.update({
            where: { id: stratVar.id },
            data: {
              runsCount: strat.runs,
              winRate: strat.winRate,
              avgReturn: strat.avgReturn,
              maxDrawdown: strat.maxDrawdown,
              lossContributionPct: strat.lossContributionPct,
            },
          });
        }
      }
    }

    // Archive previous runs if this is a comparison model (inverse pair)
    if (model.isInversePair) {
      // Mark older runs as archived by their age
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await prisma.backtestVersionRun.deleteMany({
        where: {
          modelBacktestId,
          createdAt: { lt: twoHoursAgo },
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        run: {
          id: run.id,
          modelBacktestId: run.modelBacktestId,
          totalRuns: run.totalRuns,
          aggregateWinRate: run.aggregateWinRate,
          avgReturn: run.avgReturn,
          avgMaxDrawdown: run.avgMaxDrawdown,
          backtestStatus: run.backtestStatus,
          createdAt: run.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to save backtest version:", error);
    return NextResponse.json({ error: "Failed to save backtest version" }, { status: 500 });
  }
}
