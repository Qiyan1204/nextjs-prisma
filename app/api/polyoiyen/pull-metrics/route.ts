import { NextRequest, NextResponse } from "next/server";
import { getPullSeries } from "@/lib/pullMetrics";

function toNum(v: string | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bucketMinutesRaw = Math.floor(toNum(searchParams.get("bucketMinutes"), 60));
  const bucketMinutes = [5, 15, 60].includes(bucketMinutesRaw) ? bucketMinutesRaw : 60;
  const hoursBack = Math.min(Math.max(Math.floor(toNum(searchParams.get("hoursBack"), 12)), 1), 72);

  const endTs = Date.now();
  const startTs = endTs - hoursBack * 60 * 60 * 1000;

  const data = await getPullSeries({
    startTs,
    endTs,
    bucketMinutes,
  });

  const points = data.points.map((p) => ({
    ts: p.ts,
    label: new Date(p.ts).toISOString().slice(11, 16),
    polyPullsPerMin: Number(p.polyPullsPerMin.toFixed(4)),
    investPullsPerMin: Number(p.investPullsPerMin.toFixed(4)),
    polyCount: p.polyCount,
    investCount: p.investCount,
  }));

  return NextResponse.json({
    bucketMinutes,
    hoursBack,
    points,
    totals: data.totals,
  });
}
