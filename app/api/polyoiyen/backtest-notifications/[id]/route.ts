import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const item = await prisma.backtestNotificationEvent.findUnique({
      where: { id: numericId },
      include: {
        modelBacktest: { select: { id: true, name: true, version: true } },
        backtestVersionRun: { select: { id: true, createdAt: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      item,
      payload: typeof item.payloadJson === "string" ? safeJsonParse(item.payloadJson) : null,
    });
  } catch (error) {
    console.error("Failed to fetch backtest notification:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
