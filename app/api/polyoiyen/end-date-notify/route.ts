import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordPull } from "@/lib/pullMetrics";

type BetRow = {
  userId: number;
  eventId: string;
  marketQuestion: string;
  side: string;
  type: string;
  shares: number;
  amount: number;
};

type PositionSummary = {
  userId: number;
  eventId: string;
  marketQuestion: string;
  netSharesYes: number;
  netSharesNo: number;
  totalNotional: number;
};

type EventMeta = {
  id: string;
  title: string;
  endDate: string;
};

const sentReminderKeys = new Map<string, number>();
const SENT_KEY_TTL_MS = 36 * 60 * 60 * 1000;

function toDateKeyInTimeZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${day}`;
}

function getHourMinuteInTimeZone(d: Date, timeZone: string): { hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);

  return {
    hour: parts.find((p) => p.type === "hour")?.value || "00",
    minute: parts.find((p) => p.type === "minute")?.value || "00",
  };
}

async function fetchEventMeta(eventId: string): Promise<EventMeta | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload?.id || !payload?.endDate) return null;

    return {
      id: String(payload.id),
      title: String(payload.title || "Market Event"),
      endDate: String(payload.endDate),
    };
  } catch {
    return null;
  }
}

function summarizePositions(bets: BetRow[]): PositionSummary[] {
  const grouped = new Map<string, PositionSummary>();

  for (const b of bets) {
    if (!b.eventId || (b.side !== "YES" && b.side !== "NO")) continue;

    const key = `${b.userId}::${b.eventId}`;
    const current =
      grouped.get(key) ||
      ({
        userId: b.userId,
        eventId: b.eventId,
        marketQuestion: b.marketQuestion || "Market Event",
        netSharesYes: 0,
        netSharesNo: 0,
        totalNotional: 0,
      } as PositionSummary);

    const isBuy = (b.type || "BUY") === "BUY";
    const isSell = b.type === "SELL";
    const signedShares = isBuy ? b.shares : isSell ? -b.shares : 0;

    if (b.side === "YES") current.netSharesYes += signedShares;
    if (b.side === "NO") current.netSharesNo += signedShares;

    current.totalNotional += Math.abs(b.amount);
    current.marketQuestion = b.marketQuestion || current.marketQuestion;

    grouped.set(key, current);
  }

  return Array.from(grouped.values()).filter(
    (p) => p.netSharesYes > 0 || p.netSharesNo > 0
  );
}

async function sendDiscord(webhookUrl: string, payload: unknown) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Discord error ${res.status}: ${txt}`);
  }
}

export async function GET(req: NextRequest) {
  recordPull("poly_probe");

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ ok: false, error: "DISCORD_WEBHOOK_URL is not configured" }, { status: 500 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";
  const force = new URL(req.url).searchParams.get("force") === "true";

  if (cronSecret && auth !== expectedAuth) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const notifyTimeZone = process.env.POLYOIYEN_NOTIFY_TZ || "Asia/Kuala_Lumpur";
  const strictMinuteOnly = process.env.POLYOIYEN_NOTIFY_STRICT_MINUTE === "true";
  const now = new Date();
  const { hour, minute } = getHourMinuteInTimeZone(now, notifyTimeZone);

  const inNotificationWindow = strictMinuteOnly ? hour === "00" && minute === "01" : hour === "00";

  if (!force && !inNotificationWindow) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: strictMinuteOnly ? "Not notification minute yet" : "Not midnight notification window yet",
      now: now.toISOString(),
      timezone: notifyTimeZone,
      localTime: `${hour}:${minute}`,
      strictMinuteOnly,
    });
  }

  try {
    const rawBets = await prisma.polyBet.findMany({
      select: {
        userId: true,
        eventId: true,
        marketQuestion: true,
        side: true,
        type: true,
        shares: true,
        amount: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const bets: BetRow[] = rawBets.map((b) => ({
      userId: b.userId,
      eventId: b.eventId,
      marketQuestion: b.marketQuestion,
      side: b.side,
      type: b.type || "BUY",
      shares: Number(b.shares),
      amount: Number(b.amount),
    }));

    const positions = summarizePositions(bets);
    if (positions.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: false, reason: "No active positions" });
    }

    const userIds = Array.from(new Set(positions.map((p) => p.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const eventIds = Array.from(new Set(positions.map((p) => p.eventId)));
    const eventMetaMap = new Map<string, EventMeta>();
    for (const eventId of eventIds) {
      const meta = await fetchEventMeta(eventId);
      if (meta) eventMetaMap.set(eventId, meta);
    }

    const todayKey = toDateKeyInTimeZone(now, notifyTimeZone);
    const cleanupBefore = Date.now() - SENT_KEY_TTL_MS;
    for (const [key, sentAt] of sentReminderKeys.entries()) {
      if (sentAt < cleanupBefore) sentReminderKeys.delete(key);
    }

    const targets = positions.filter((p) => {
      const meta = eventMetaMap.get(p.eventId);
      if (!meta?.endDate) return false;
      const end = new Date(meta.endDate);
      if (Number.isNaN(end.getTime())) return false;
      return toDateKeyInTimeZone(end, notifyTimeZone) === todayKey;
    });

    let sent = 0;
    const failures: Array<{ userId: number; eventId: string; error: string }> = [];

    for (const target of targets) {
      const meta = eventMetaMap.get(target.eventId);
      if (!meta) continue;

      const dedupeKey = `${todayKey}::${target.userId}::${target.eventId}`;
      if (sentReminderKeys.has(dedupeKey)) continue;

      const user = userMap.get(target.userId);
      const yesShares = Math.max(target.netSharesYes, 0);
      const noShares = Math.max(target.netSharesNo, 0);
      const sideSummary = [
        yesShares > 0 ? `YES ${yesShares.toFixed(3)} shares` : null,
        noShares > 0 ? `NO ${noShares.toFixed(3)} shares` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const marketUrl = `https://oiyen.quadrawebs.com/polyoiyen/${target.eventId}`;

      const embed = {
        embeds: [
          {
            title: strictMinuteOnly ? "Event Ends Today (00:01 Reminder)" : "Event Ends Today (Midnight Reminder)",
            description: [
              `User: **${user?.name || "User"}** (${user?.email || `ID ${target.userId}`})`,
              `Market: **${meta.title || target.marketQuestion}**`,
              `Position: ${sideSummary || "Active"}`,
              `My notional: **$${target.totalNotional.toLocaleString(undefined, { maximumFractionDigits: 2 })}**`,
              `End date: **${new Date(meta.endDate).toLocaleString("en-US", { timeZone: notifyTimeZone })} (${notifyTimeZone})**`,
              `[Open Market](${marketUrl})`,
            ].join("\n"),
            color: 0xf97316,
            footer: { text: "PolyOiyen End-Date Reminder" },
            timestamp: now.toISOString(),
          },
        ],
      };

      try {
        await sendDiscord(webhookUrl, embed);
        sentReminderKeys.set(dedupeKey, Date.now());
        sent += 1;
      } catch (error) {
        failures.push({
          userId: target.userId,
          eventId: target.eventId,
          error: error instanceof Error ? error.message : "Unknown Discord error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      matched: targets.length,
      failed: failures.length,
      failures,
      timezone: notifyTimeZone,
      localDateKey: todayKey,
      force,
    });
  } catch (error) {
    console.error("End-date notify job failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
