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

    let eventBacktestLinks:
      | Array<{ eventId: string | number; label?: string; totalReturn?: number | null }>
      | undefined;

    try {
      const baseUrl = (process.env.POLYOIYEN_BASE_URL || "https://oiyen.quadrawebs.com").replace(/\/$/, "");
      const res = await fetch(
        `${baseUrl}/api/polyoiyen/top-backtest-models?page=1&pageSize=10&minTrades=0&sortBy=return&sortDir=desc`,
        { method: "GET", cache: "no-store" }
      );
      if (res.ok) {
        const payload = await res.json();
        const models = Array.isArray(payload?.models) ? payload.models : [];
        eventBacktestLinks = models
          .slice(0, 10)
          .map((row: any) => ({
            eventId: row?.eventId,
            label: row?.marketTitle || row?.marketQuestion || (row?.eventId != null ? `Event ${row.eventId}` : "Event"),
            totalReturn: typeof row?.totalReturn === "number" ? row.totalReturn : null,
          }))
          .filter((row: any) => row?.eventId != null);
      }
    } catch {
      eventBacktestLinks = undefined;
    }

    await sendBacktestCompletedDiscord({
      modelBacktestId,
      modelName: "Test Model",
      modelVersion: "v1.0",
      runId: 12345,
      totalRuns: 10,
      aggregateWinRate: 55.5,
      avgReturn: 12.3,
      avgMaxDrawdown: -8.5,
      backtestStatus: "completed",
      createdAt: new Date(),
      source: "Test Notification",
      eventBacktestLinks,
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
