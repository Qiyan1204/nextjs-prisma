import prisma from "@/lib/prisma";
import { sendBacktestCompletedDiscord, sendEventBacktestDetailsDiscord } from "@/lib/backtestDiscord";
import { recordBacktestNotification } from "@/lib/backtestNotificationLog";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron") || "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";
  const force = new URL(req.url).searchParams.get("force") === "true";

  if (cronSecret && auth !== expectedAuth && vercelCron !== "1" && !(force && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

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

    // Prefer sending an event-specific notification if we can infer the event id from diagnostics.
    let diagnostics: Record<string, unknown> | null = null;
    try {
      const parsed = latestRun.diagnosticsJson ? JSON.parse(String(latestRun.diagnosticsJson)) : null;
      diagnostics = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      diagnostics = null;
    }

    const queuedEventIdRaw = diagnostics?.queuedEventId;
    const queuedEventId = (typeof queuedEventIdRaw === "string" || typeof queuedEventIdRaw === "number")
      ? queuedEventIdRaw
      : null;
    const queuedHasExited = diagnostics?.queuedHasExited;
    const queuedTradeCount = diagnostics?.queuedTradeCount;

    if (queuedEventId != null) {
      let eventTitle: string | undefined;
      try {
        const res = await fetch(`${process.env.POLYOIYEN_BASE_URL || "https://oiyen.quadrawebs.com"}/api/polymarket?id=${encodeURIComponent(String(queuedEventId))}`, {
          method: "GET",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const event = Array.isArray(data?.events) ? data.events[0] : data;
          if (event && typeof event === "object") {
            const t = (event as Record<string, unknown>)?.title;
            if (typeof t === "string" && t.trim()) eventTitle = t.trim();
          }
        }
      } catch {
        // ignore enrichment errors
      }

      const discordPayload = {
        eventId: queuedEventId,
        eventTitle,
        totalReturn: latestRun.avgReturn,
        winRate: latestRun.aggregateWinRate,
        trades: typeof queuedTradeCount === "number" ? queuedTradeCount : latestRun.totalRuns,
        statusLabel: queuedHasExited === true ? "Exited" : queuedHasExited === false ? "Active" : "Unknown",
        createdAt: latestRun.createdAt,
        source: "manual-latest-run",
      };

      const notificationId = await recordBacktestNotification({
        kind: "EVENT_BACKTEST_DETAILS",
        modelBacktestId: latestRun.modelBacktestId,
        backtestVersionRunId: latestRun.id,
        eventId: queuedEventId,
        payload: {
          ...discordPayload,
          createdAt: latestRun.createdAt.toISOString(),
        },
        send: () => sendEventBacktestDetailsDiscord(discordPayload),
      });

      return NextResponse.json({
        success: true,
        message: "Event backtest notification sent successfully",
        forced: force,
        eventId: String(queuedEventId),
        runId: latestRun.id,
        notificationId,
      });
    }

    // 发送通知
    const discordPayload = {
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
    };

    const notificationId = await recordBacktestNotification({
      kind: "BACKTEST_COMPLETED",
      modelBacktestId: latestRun.modelBacktestId,
      backtestVersionRunId: latestRun.id,
      payload: {
        ...discordPayload,
        createdAt: latestRun.createdAt.toISOString(),
      },
      send: () => sendBacktestCompletedDiscord(discordPayload),
    });

    return NextResponse.json({
      success: true,
      message: "Discord notification sent successfully",
      forced: force,
      notificationId,
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
