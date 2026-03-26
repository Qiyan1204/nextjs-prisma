import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordAvailability } from "@/lib/pullMetrics";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.user.findFirst({
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const latencyMs = Date.now() - startedAt;
    recordAvailability(true);

    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        latencyMs,
        checkedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    recordAvailability(false);
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        latencyMs,
        checkedAt: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
