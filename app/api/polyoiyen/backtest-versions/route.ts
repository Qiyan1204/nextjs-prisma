import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/polyoiyen/backtest-versions
 * Create a new backtest version with metadata
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      version,
      description,
      notes,
      modelType = "PolyOiyen",
      parameters,
      dataStartDate,
      dataEndDate,
      status = "active",
    } = body;

    if (!name || !version) {
      return NextResponse.json({ error: "Name and version required" }, { status: 400 });
    }

    const modelBacktest = await prisma.modelBacktest.create({
      data: {
        name,
        version,
        description,
        notes,
        modelType,
        parameters: JSON.stringify(parameters || {}),
        dataStartDate: dataStartDate ? new Date(dataStartDate) : null,
        dataEndDate: dataEndDate ? new Date(dataEndDate) : null,
        status,
      },
    });

    return NextResponse.json(modelBacktest, { status: 201 });
  } catch (error) {
    console.error("Failed to create backtest version:", error);
    return NextResponse.json({ error: "Failed to create backtest" }, { status: 500 });
  }
}

/**
 * GET /api/polyoiyen/backtest-versions?status=active&type=PolyOiyen
 * List all backtest versions with optional filtering
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const modelType = url.searchParams.get("type") || "PolyOiyen";

    const where: any = { modelType };
    if (status) where.status = status;

    const backtests = await prisma.modelBacktest.findMany({
      where,
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1, // Most recent run
        },
        strategies: {
          where: { isInverse: false }, // Show only original strategies
        },
        inverseModels: {
          select: { id: true, version: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(backtests);
  } catch (error) {
    console.error("Failed to list backtest versions:", error);
    return NextResponse.json({ error: "Failed to list backtests" }, { status: 500 });
  }
}
