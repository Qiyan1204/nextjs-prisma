import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkAndTriggerVolumeSpikeAlerts } from "@/lib/triggerAlerts";
import { recordPull } from "@/lib/pullMetrics";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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

  try {
    const todayStart = startOfUtcDay(new Date());

    // Only events with BUY activity today can satisfy today's volume spike condition.
    const todayEvents = await prisma.polyBet.findMany({
      where: {
        type: "BUY",
        createdAt: { gte: todayStart },
      },
      distinct: ["eventId"],
      select: {
        eventId: true,
        marketQuestion: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let checked = 0;
    let failed = 0;
    const failures: Array<{ eventId: string; error: string }> = [];

    for (const row of todayEvents) {
      try {
        await checkAndTriggerVolumeSpikeAlerts(String(row.eventId), String(row.marketQuestion || "Market"));
        checked += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          eventId: row.eventId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      checked,
      failed,
      failures,
      scannedEvents: todayEvents.length,
      sampledAt: new Date().toISOString(),
      force,
    });
  } catch (error) {
    console.error("Volume spike daily job failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}