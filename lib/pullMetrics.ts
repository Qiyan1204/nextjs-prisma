import prisma from "@/lib/prisma";

type PullKind = "poly_probe" | "invest_pull" | "invest_action" | "health_ok" | "health_fail";

type PullMetricDelegate = {
  create: (args: { data: { kind: PullKind; createdAt: Date } }) => Promise<unknown>;
  findMany: (args: {
    where: { createdAt: { gte: Date; lte: Date } };
    select: { kind: true; createdAt: true };
  }) => Promise<Array<{ kind: PullKind; createdAt: Date }>>;
};

const db = prisma as unknown as { pullMetric: PullMetricDelegate };

function floorToBucket(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs;
}

export function recordPull(kind: PullKind, ts = Date.now()): void {
  void db.pullMetric
    .create({
      data: {
        kind,
        createdAt: new Date(ts),
      },
    })
    .catch(() => {
      // Telemetry failure should never block core API behavior.
    });
}

export function recordAvailability(ok: boolean, ts = Date.now()): void {
  recordPull(ok ? "health_ok" : "health_fail", ts);
}

export async function getPullSeries(options: {
  startTs: number;
  endTs: number;
  bucketMinutes: number;
}) {
  const { startTs, endTs, bucketMinutes } = options;
  const bucketMs = bucketMinutes * 60 * 1000;

  const from = Math.min(startTs, endTs);
  const to = Math.max(startTs, endTs);
  const firstBucket = floorToBucket(from, bucketMs);

  const buckets: number[] = [];
  for (let ts = firstBucket; ts <= to; ts += bucketMs) {
    buckets.push(ts);
  }

  const rows = await db.pullMetric.findMany({
    where: {
      createdAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    select: {
      kind: true,
      createdAt: true,
    },
  });

  const polyCounts = new Map<number, number>();
  const investCounts = new Map<number, number>();

  for (const row of rows) {
    const ts = row.createdAt.getTime();
    const b = floorToBucket(ts, bucketMs);

    if (row.kind === "poly_probe") {
      polyCounts.set(b, (polyCounts.get(b) || 0) + 1);
    } else if (row.kind === "invest_pull" || row.kind === "invest_action") {
      investCounts.set(b, (investCounts.get(b) || 0) + 1);
    }
  }

  const points = buckets.map((ts) => {
    const polyCount = polyCounts.get(ts) || 0;
    const investCount = investCounts.get(ts) || 0;
    return {
      ts,
      polyPullsPerMin: polyCount / bucketMinutes,
      investPullsPerMin: investCount / bucketMinutes,
      polyCount,
      investCount,
    };
  });

  return {
    points,
    totals: {
      polyCount: points.reduce((acc, p) => acc + p.polyCount, 0),
      investCount: points.reduce((acc, p) => acc + p.investCount, 0),
    },
  };
}
