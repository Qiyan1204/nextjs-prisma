import prisma from "@/lib/prisma";
import { sendBacktestCompletedDiscord } from "@/lib/backtestDiscord";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // 查询最近的一个 backtest run
    const latestRun = await prisma.backtestVersionRun.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        modelBacktest: true,
      },
    });

    if (!latestRun || !latestRun.modelBacktest) {
      return NextResponse.json(
        { error: "No backtest data found in database" },
        { status: 404 }
      );
    }

    // 发送通知
    await sendBacktestCompletedDiscord({
      modelBacktestId: latestRun.modelBacktestId,
      modelName: latestRun.modelBacktest.name,
      modelVersion: latestRun.modelBacktest.version,
      runId: latestRun.id,
      totalRuns: latestRun.totalRuns,
      aggregateWinRate: latestRun.aggregateWinRate,
      avgReturn: latestRun.avgReturn,
      avgMaxDrawdown: latestRun.avgMaxDrawdown,
      backtestStatus: latestRun.backtestStatus,
      createdAt: latestRun.createdAt,
      source: "manual-test",
    });

    return NextResponse.json({
      success: true,
      message: "Discord notification sent successfully",
      backtest: {
        modelName: latestRun.modelBacktest.name,
        version: latestRun.modelBacktest.version,
        runId: latestRun.id,
        totalRuns: latestRun.totalRuns,
        status: latestRun.backtestStatus,
      },
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return NextResponse.json(
      {
        error: "Failed to send notification",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
