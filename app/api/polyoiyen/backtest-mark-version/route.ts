import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/polyoiyen/backtest-mark-version
 * Promote one auto-saved run into a named versioned model snapshot.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      runId,
      name,
      version,
      notes,
      description,
      status = "active",
    } = body as {
      runId?: number;
      name?: string;
      version?: string;
      notes?: string;
      description?: string;
      status?: "active" | "archived" | "compare" | "experimental";
    };

    if (!runId || !name || !version) {
      return NextResponse.json({ error: "runId, name and version are required" }, { status: 400 });
    }

    const sourceRun = await prisma.backtestVersionRun.findUnique({
      where: { id: Number(runId) },
      include: {
        modelBacktest: true,
      },
    });

    if (!sourceRun) {
      return NextResponse.json({ error: "Source run not found" }, { status: 404 });
    }

    const newModel = await prisma.modelBacktest.create({
      data: {
        name,
        version,
        description: description ?? null,
        notes: notes ?? null,
        modelType: sourceRun.modelBacktest.modelType,
        parameters: sourceRun.modelBacktest.parameters,
        dataStartDate: sourceRun.modelBacktest.dataStartDate,
        dataEndDate: sourceRun.modelBacktest.dataEndDate,
        status,
      },
    });

    const copiedRun = await prisma.backtestVersionRun.create({
      data: {
        modelBacktestId: newModel.id,
        totalRuns: sourceRun.totalRuns,
        aggregateWinRate: sourceRun.aggregateWinRate,
        avgReturn: sourceRun.avgReturn,
        avgMaxDrawdown: sourceRun.avgMaxDrawdown,
        equityCurveJson: sourceRun.equityCurveJson,
        lossAttributionJson: sourceRun.lossAttributionJson,
        worstEventsJson: sourceRun.worstEventsJson,
        diagnosticsJson: sourceRun.diagnosticsJson,
        backtestStatus: sourceRun.backtestStatus,
      },
    });

    const sourceStrategies = await prisma.strategyVariant.findMany({
      where: { modelBacktestId: sourceRun.modelBacktestId },
      orderBy: { id: "asc" },
    });

    if (sourceStrategies.length > 0) {
      for (const s of sourceStrategies) {
        await prisma.strategyVariant.create({
          data: {
            modelBacktestId: newModel.id,
            strategyName: s.strategyName,
            isInverse: s.isInverse,
            runsCount: s.runsCount,
            winRate: s.winRate,
            avgReturn: s.avgReturn,
            maxDrawdown: s.maxDrawdown,
            lossContributionPct: s.lossContributionPct,
          },
        });
      }
    }

    return NextResponse.json(
      {
        message: "Run promoted to versioned model",
        model: newModel,
        run: copiedRun,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to mark run as version:", error);
    return NextResponse.json({ error: "Failed to mark run as version" }, { status: 500 });
  }
}
