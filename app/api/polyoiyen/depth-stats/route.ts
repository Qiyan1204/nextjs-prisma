import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type DepthStats = {
  eventId: string;
  sampleCount: number;
  avgDepthUsd: number;
  peakDepthUsd: number;
  minDepthUsd: number;
  stdDepthUsd: number;
  rangeLowUsd: number;
  rangeHighUsd: number;
  latestDepthUsd: number;
  latestSampledAt: string;
};

type DepthSeriesPoint = {
  ts: number;
  label: string;
  depthUsd: number;
};

function toNum(v: string | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function floorToBucket(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs;
}

function formatBucketLabel(ts: number, bucketMinutes: number): string {
  const d = new Date(ts);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  if (bucketMinutes <= 30) return `${hh}:${mi}`;
  return `${mm}-${dd} ${hh}:00`;
}

function computeStats(eventId: string, rows: Array<{ totalDepthUsd: number; sampledAt: Date }>): DepthStats | null {
  if (rows.length === 0) return null;

  const values = rows.map((r) => Number(r.totalDepthUsd || 0)).filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  const latest = rows.reduce((curr, row) => (row.sampledAt > curr.sampledAt ? row : curr), rows[0]);

  return {
    eventId,
    sampleCount: values.length,
    avgDepthUsd: Number(mean.toFixed(4)),
    peakDepthUsd: Number(max.toFixed(4)),
    minDepthUsd: Number(min.toFixed(4)),
    stdDepthUsd: Number(std.toFixed(4)),
    rangeLowUsd: Number(Math.max(0, mean - std).toFixed(4)),
    rangeHighUsd: Number((mean + std).toFixed(4)),
    latestDepthUsd: Number(Number(latest.totalDepthUsd || 0).toFixed(4)),
    latestSampledAt: latest.sampledAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventIds = (searchParams.get("eventIds") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (eventIds.length === 0) {
    return NextResponse.json({ error: "eventIds is required" }, { status: 400 });
  }

  const hoursBack = Math.min(Math.max(Math.floor(toNum(searchParams.get("hoursBack"), 168)), 1), 24 * 90);
  const includeSeries = searchParams.get("includeSeries") === "true";
  const bucketMinutesRaw = Math.floor(toNum(searchParams.get("bucketMinutes"), 60));
  const bucketMinutes = [10, 30, 60, 180].includes(bucketMinutesRaw) ? bucketMinutesRaw : 60;
  const bucketMs = bucketMinutes * 60 * 1000;
  const from = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  try {
    const rows = await prisma.marketDepthSnapshot.findMany({
      where: {
        eventId: { in: eventIds },
        sampledAt: { gte: from },
      },
      select: {
        eventId: true,
        totalDepthUsd: true,
        sampledAt: true,
      },
      orderBy: { sampledAt: "asc" },
    });

    const grouped = new Map<string, Array<{ totalDepthUsd: number; sampledAt: Date }>>();
    for (const row of rows) {
      const bucket = grouped.get(row.eventId) || [];
      bucket.push({ totalDepthUsd: row.totalDepthUsd, sampledAt: row.sampledAt });
      grouped.set(row.eventId, bucket);
    }

    const statsByEvent: DepthStats[] = [];
    const seriesByEvent: Array<{ eventId: string; points: DepthSeriesPoint[] }> = [];
    for (const eventId of eventIds) {
      const eventRows = grouped.get(eventId) || [];
      const stats = computeStats(eventId, eventRows);
      if (stats) statsByEvent.push(stats);

      if (includeSeries && eventRows.length > 0) {
        const bucketMap = new Map<number, { sum: number; count: number }>();
        for (const row of eventRows) {
          const ts = row.sampledAt.getTime();
          const bucketTs = floorToBucket(ts, bucketMs);
          const curr = bucketMap.get(bucketTs) || { sum: 0, count: 0 };
          curr.sum += Number(row.totalDepthUsd || 0);
          curr.count += 1;
          bucketMap.set(bucketTs, curr);
        }

        const points = Array.from(bucketMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([ts, agg]) => ({
            ts,
            label: formatBucketLabel(ts, bucketMinutes),
            depthUsd: Number((agg.sum / Math.max(1, agg.count)).toFixed(4)),
          }));

        seriesByEvent.push({ eventId, points });
      }
    }

    return NextResponse.json({
      hoursBack,
      bucketMinutes,
      from: from.toISOString(),
      to: new Date().toISOString(),
      statsByEvent,
      seriesByEvent,
    });
  } catch (error) {
    console.error("Depth stats API failed:", error);
    return NextResponse.json(
      { error: "Failed to load depth stats" },
      { status: 500 }
    );
  }
}
