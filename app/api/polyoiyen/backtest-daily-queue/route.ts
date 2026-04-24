import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendBacktestCompletedDiscord } from "@/lib/backtestDiscord";

type TopModelRow = {
  eventId: string;
  marketQuestion: string;
  marketTitle: string;
  category: string;
  tradeCount: number;
  totalReturn: number;
  winRate: number;
  hasExited: boolean;
  riskLevel: "low" | "medium" | "high";
};

type TopModelsPayload = {
  generatedAt: string;
  topModels: TopModelRow[];
};

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

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toModelName(row: TopModelRow): string {
  const base = (row.marketTitle || row.marketQuestion || `Event ${row.eventId}`).trim();
  const compact = base.replace(/\s+/g, " ").slice(0, 90);
  return `${compact} [${row.eventId}]`;
}

function buildDiagnostics(row: TopModelRow) {
  return {
    source: "backtest-daily-queue",
    queuedEventId: row.eventId,
    queuedCategory: row.category,
    queuedTradeCount: row.tradeCount,
    queuedHasExited: row.hasExited,
    queuedRiskLevel: row.riskLevel,
  };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron") || "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";
  const force = new URL(req.url).searchParams.get("force") === "true";

  if (cronSecret && auth !== expectedAuth && vercelCron !== "1" && !(force && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const reqUrl = new URL(req.url);
  const baseUrl = reqUrl.origin;
  const timeZone = process.env.POLYOIYEN_NOTIFY_TZ || "Asia/Kuala_Lumpur";
  const dateKey = toDateKeyInTimeZone(new Date(), timeZone);
  const markerKind = `backtest_daily_queue:${dateKey}`;

  const targetRaw = Number(reqUrl.searchParams.get("target") || process.env.BACKTEST_DAILY_QUEUE_TARGET || "12");
  const minTradesRaw = Number(reqUrl.searchParams.get("minTrades") || process.env.BACKTEST_DAILY_QUEUE_MIN_TRADES || "3");
  const target = clampInt(targetRaw, 1, 40);
  const minTrades = clampInt(minTradesRaw, 1, 20);
  const shouldNotify = process.env.BACKTEST_NOTIFY_DAILY_QUEUE === "true";

  try {
    if (!force) {
      const alreadyQueued = await prisma.pullMetric.findFirst({
        where: { kind: markerKind },
        select: { id: true },
      });

      if (alreadyQueued) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "Daily queue already executed",
          markerKind,
          target,
          minTrades,
        });
      }
    }

    const topModelsRes = await fetch(
      `${baseUrl}/api/polyoiyen/top-backtest-models?page=1&pageSize=100&minTrades=${minTrades}&sortBy=return&sortDir=desc`,
      { cache: "no-store" }
    );

    if (!topModelsRes.ok) {
      throw new Error(`Failed to fetch top backtest models (${topModelsRes.status})`);
    }

    const payload = (await topModelsRes.json()) as TopModelsPayload;
    const candidates = Array.isArray(payload.topModels) ? payload.topModels.slice(0, target) : [];

    if (candidates.length === 0) {
      await prisma.pullMetric.create({ data: { kind: markerKind } });
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: 0,
        failed: 0,
        reason: "No qualifying backtests found",
        markerKind,
        target,
        minTrades,
      });
    }

    const queued: Array<{ eventId: string; modelBacktestId: number; runId: number }> = [];
    const failed: Array<{ eventId: string; reason: string }> = [];

    for (const row of candidates) {
      try {
        const modelName = toModelName(row);
        const parameterJson = JSON.stringify({
          source: "backtest-daily-queue",
          eventId: row.eventId,
          category: row.category,
          title: row.marketTitle || row.marketQuestion,
        });

        const existing = await prisma.modelBacktest.findFirst({
          where: {
            modelType: "PolyOiyenDailyQueue",
            parameters: { contains: `\"eventId\":\"${row.eventId}\"` },
          },
          select: { id: true, version: true, name: true },
        });

        const model = existing
          ? await prisma.modelBacktest.update({
              where: { id: existing.id },
              data: {
                name: modelName,
                version: dateKey,
                description: row.marketTitle || row.marketQuestion,
                notes: `Auto queued daily backtest for event ${row.eventId}`,
                status: "active",
                parameters: parameterJson,
              },
              select: { id: true, name: true, version: true },
            })
          : await prisma.modelBacktest.create({
              data: {
                name: modelName,
                version: dateKey,
                description: row.marketTitle || row.marketQuestion,
                notes: `Auto queued daily backtest for event ${row.eventId}`,
                modelType: "PolyOiyenDailyQueue",
                status: "active",
                parameters: parameterJson,
              },
              select: { id: true, name: true, version: true },
            });

        const run = await prisma.backtestVersionRun.create({
          data: {
            modelBacktestId: model.id,
            totalRuns: row.tradeCount,
            aggregateWinRate: row.winRate,
            avgReturn: row.totalReturn,
            avgMaxDrawdown: null,
            equityCurveJson: JSON.stringify({ aggregate: [], byStrategy: [] }),
            lossAttributionJson: JSON.stringify({ byStrategy: [], worstEvents: [], bestEvents: [] }),
            worstEventsJson: JSON.stringify([
              {
                eventId: row.eventId,
                marketQuestion: row.marketQuestion,
                marketTitle: row.marketTitle,
                totalReturn: row.totalReturn,
              },
            ]),
            diagnosticsJson: JSON.stringify(buildDiagnostics(row)),
            backtestStatus: row.totalReturn >= 0 ? "healthy" : "degraded",
          },
        });

        if (shouldNotify) {
          await sendBacktestCompletedDiscord({
            modelBacktestId: model.id,
            modelName: model.name,
            modelVersion: model.version,
            runId: run.id,
            totalRuns: run.totalRuns,
            aggregateWinRate: run.aggregateWinRate,
            avgReturn: run.avgReturn,
            avgMaxDrawdown: run.avgMaxDrawdown,
            backtestStatus: run.backtestStatus,
            createdAt: run.createdAt,
            source: "backtest-daily-queue",
          });
        }

        queued.push({ eventId: row.eventId, modelBacktestId: model.id, runId: run.id });
      } catch (err) {
        failed.push({
          eventId: row.eventId,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    await prisma.pullMetric.create({ data: { kind: markerKind } });

    return NextResponse.json({
      ok: true,
      markerKind,
      target,
      minTrades,
      notificationsEnabled: shouldNotify,
      queued: queued.length,
      failed: failed.length,
      queue: queued,
      failures: failed,
      sampledAt: payload.generatedAt || new Date().toISOString(),
      force,
    });
  } catch (error) {
    console.error("Backtest daily queue failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
