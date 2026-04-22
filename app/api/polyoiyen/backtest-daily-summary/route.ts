import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordPull } from "@/lib/pullMetrics";
import { sendBacktestDailySummaryDiscord } from "@/lib/backtestDiscord";

function toDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export async function GET(req: NextRequest) {
  recordPull("poly_probe");

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron") || "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";
  const force = new URL(req.url).searchParams.get("force") === "true";

  if (cronSecret && auth !== expectedAuth && vercelCron !== "1" && !(force && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const timeZone = process.env.POLYOIYEN_NOTIFY_TZ || "Asia/Kuala_Lumpur";
  const dateKey = toDateKeyInTimeZone(new Date(), timeZone);
  const markerKind = `backtest_daily_summary:${dateKey}`;

  try {
    if (!force) {
      const alreadySent = await prisma.pullMetric.findFirst({
        where: { kind: markerKind },
        select: { id: true },
      });

      if (alreadySent) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "Daily summary already sent",
          markerKind,
        });
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const runs = await prisma.backtestVersionRun.findMany({
      where: {
        createdAt: { gte: since },
      },
      include: {
        modelBacktest: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const statusCounts: Record<string, number> = {};
    for (const run of runs) {
      const key = run.backtestStatus || "unknown";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }

    const topRuns = [...runs]
      .sort((a, b) => {
        const aRet = a.avgReturn == null ? -Infinity : a.avgReturn;
        const bRet = b.avgReturn == null ? -Infinity : b.avgReturn;
        return bRet - aRet;
      })
      .slice(0, 5)
      .map((run) => ({
        runId: run.id,
        modelBacktestId: run.modelBacktestId,
        modelName: run.modelBacktest.name,
        modelVersion: run.modelBacktest.version,
        avgReturn: run.avgReturn,
        aggregateWinRate: run.aggregateWinRate,
        totalRuns: run.totalRuns,
        backtestStatus: run.backtestStatus,
      }));

    await sendBacktestDailySummaryDiscord({
      periodLabel: `Last 24h · ${timeZone}`,
      totalCompleted: runs.length,
      avgReturn: average(runs.map((run) => run.avgReturn)),
      avgWinRate: average(runs.map((run) => run.aggregateWinRate)),
      statusCounts,
      topRuns,
    });

    await prisma.pullMetric.create({
      data: {
        kind: markerKind,
      },
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      markerKind,
      timeZone,
      totalCompleted: runs.length,
      topRuns: topRuns.length,
      sampledAt: new Date().toISOString(),
      force,
    });
  } catch (error) {
    console.error("Backtest daily summary failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
