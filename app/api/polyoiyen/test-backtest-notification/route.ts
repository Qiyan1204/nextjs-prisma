import { NextRequest, NextResponse } from "next/server";
import { sendBacktestCompletedDiscord } from "@/lib/backtestDiscord";

/**
 * GET /api/polyoiyen/test-backtest-notification
 * Send a test backtest completion notification to Discord
 * ?modelBacktestId=1 (optional, defaults to 1)
 */
export async function GET(request: NextRequest) {
  try {
    // Get modelBacktestId from query params, default to 1
    const modelBacktestId = parseInt(request.nextUrl.searchParams.get("modelBacktestId") || "1");

    if (isNaN(modelBacktestId) || modelBacktestId <= 0) {
      return NextResponse.json({ error: "Invalid modelBacktestId" }, { status: 400 });
    }

    await sendBacktestCompletedDiscord({
      modelBacktestId,
      modelName: "Test Model",
      modelVersion: "v1.0",
      runId: 12345,
      totalRuns: 100,
      aggregateWinRate: 55.5,
      avgReturn: 12.3,
      avgMaxDrawdown: -8.5,
      backtestStatus: "completed",
      createdAt: new Date(),
      source: "Test Notification",
    });

    return NextResponse.json({
      message: "Test notification sent successfully",
      modelBacktestId,
      dashboardUrl: `https://oiyen.quadrawebs.com/polyoiyen/TopBacktestModels`,
    });
  } catch (error) {
    console.error("Failed to send test notification:", error);
    return NextResponse.json(
      { error: "Failed to send test notification", details: String(error) },
      { status: 500 }
    );
  }
}
