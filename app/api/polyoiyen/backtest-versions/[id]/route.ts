import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/polyoiyen/backtest-versions/[id]
 * Get detailed backtest information including all runs and strategies
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);

    const backtest = await prisma.modelBacktest.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
        },
        strategies: {
          orderBy: { createdAt: "asc" },
        },
        parentModel: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
        inverseModels: {
          select: {
            id: true,
            name: true,
            version: true,
            runs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!backtest) {
      return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
    }

    // Parse JSON fields
    const enriched = {
      ...backtest,
      runs: backtest.runs.map((run) => ({
        ...run,
        equityCurve: JSON.parse(run.equityCurveJson),
        lossAttribution: JSON.parse(run.lossAttributionJson),
        worstEvents: JSON.parse(run.worstEventsJson),
        diagnostics: JSON.parse(run.diagnosticsJson),
      })),
      parameters: JSON.parse(backtest.parameters),
    };

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Failed to fetch backtest details:", error);
    return NextResponse.json({ error: "Failed to fetch backtest details" }, { status: 500 });
  }
}

/**
 * PUT /api/polyoiyen/backtest-versions/[id]
 * Update backtest metadata (name, notes, status, etc.)
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const { name, notes, status, description } = body;

    const updated = await prisma.modelBacktest.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(notes && { notes }),
        ...(status && { status }),
        ...(description && { description }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update backtest:", error);
    return NextResponse.json({ error: "Failed to update backtest" }, { status: 500 });
  }
}

/**
 * DELETE /api/polyoiyen/backtest-versions/[id]
 * Archive or delete a backtest version
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);

    // Just mark as archived instead of deleting
    const updated = await prisma.modelBacktest.update({
      where: { id },
      data: { status: "archived" },
    });

    return NextResponse.json({ message: "Backtest archived", backtest: updated });
  } catch (error) {
    console.error("Failed to archive backtest:", error);
    return NextResponse.json({ error: "Failed to archive backtest" }, { status: 500 });
  }
}
