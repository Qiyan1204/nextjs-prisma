import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 50;

    const kind = url.searchParams.get("kind");
    const deliveryStatus = url.searchParams.get("deliveryStatus");

    const modelBacktestIdRaw = url.searchParams.get("modelBacktestId");
    const modelBacktestId = modelBacktestIdRaw ? Number(modelBacktestIdRaw) : null;

    const eventId = url.searchParams.get("eventId");

    const where: Prisma.BacktestNotificationEventWhereInput = {
      ...(kind ? { kind } : {}),
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(modelBacktestIdRaw && Number.isFinite(modelBacktestId) ? { modelBacktestId } : {}),
      ...(eventId ? { eventId } : {}),
    };

    const items = await prisma.backtestNotificationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        modelBacktest: { select: { id: true, name: true, version: true } },
        backtestVersionRun: { select: { id: true, createdAt: true } },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to list backtest notifications:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
