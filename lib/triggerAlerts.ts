import prisma from "@/lib/prisma";

const VOLUME_SPIKE_MULTIPLIER = 2;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function ensureVolumeSpikeAlertForUser(
  userId: number,
  eventId: string,
  marketQuestion: string
) {
  const existing = await prisma.polyAlert.findFirst({
    where: {
      userId,
      eventId,
      alertType: "VOLUME_SPIKE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    await prisma.polyAlert.create({
      data: {
        userId,
        eventId,
        tokenId: "VOLUME_SPIKE",
        marketQuestion,
        alertType: "VOLUME_SPIKE",
        side: "YES",
        severity: "HIGH",
        cooldownMinutes: 24 * 60,
        triggered: false,
        active: true,
      },
    });
    return;
  }

  // Keep one reusable alert record per user-event subscription.
  await prisma.polyAlert.update({
    where: { id: existing.id },
    data: {
      marketQuestion,
      active: true,
    },
  });
}

/**
 * Check all active LARGE_ORDER alerts for a given event+side.
 * If the bet amount >= an alert's threshold, mark it triggered and send a Discord webhook.
 * This runs server-side — called when any user places a bet.
 */
export async function checkAndTriggerLargeOrderAlerts(
  eventId: string,
  side: string,
  betAmount: number
) {
  // Find ALL users' active LARGE_ORDER alerts matching this event+side
  const matchingAlerts = await prisma.polyAlert.findMany({
    where: {
      eventId,
      side,
      alertType: "LARGE_ORDER",
      active: true,
      threshold: { lte: betAmount }, // bet amount >= alert threshold
    },
  });

  if (matchingAlerts.length === 0) return;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const now = new Date();
  const severityColorMap: Record<string, number> = {
    LOW: 0x6ee7b7,
    MEDIUM: 0x38bdf8,
    HIGH: 0xf59e0b,
    CRITICAL: 0xef4444,
  };

  for (const alert of matchingAlerts) {
    const cooldownMs = Math.max(1, Number(alert.cooldownMinutes || 30)) * 60 * 1000;
    const lastNotifiedMs = alert.lastNotifiedAt ? new Date(alert.lastNotifiedAt).getTime() : 0;
    const canNotify = !lastNotifiedMs || now.getTime() - lastNotifiedMs >= cooldownMs;
    if (!canNotify) {
      await prisma.alertNotificationEvent.create({
        data: {
          alertId: alert.id,
          eventType: "SKIPPED_COOLDOWN",
          channel: "DISCORD",
        },
      });
      continue;
    }

    // Mark triggered in DB
    await prisma.polyAlert.update({
      where: { id: alert.id },
      data: {
        triggered: true,
        triggeredAt: alert.triggeredAt ?? now,
        lastNotifiedAt: now,
      },
    });

    await prisma.alertNotificationEvent.create({
      data: {
        alertId: alert.id,
        eventType: "SENT",
        channel: "DISCORD",
      },
    });

    // Send Discord webhook
    if (webhookUrl) {
      const thresholdStr = alert.threshold != null
        ? `$${Number(alert.threshold).toLocaleString()}`
        : "—";
      const sideEmoji = alert.side === "YES" ? "✅" : "❌";
      const severity = String(alert.severity || "MEDIUM").toUpperCase();
      const marketUrl = `https://oiyen.quadrawebs.com/polyoiyen/${encodeURIComponent(alert.eventId)}`;

      const discordPayload = {
        embeds: [
          {
            title: `${sideEmoji} [${severity}] Large Order Alert Triggered!`,
            description: [
              `**Market:** ${alert.marketQuestion}`,
              `Large **${alert.side}** order ≥ **${thresholdStr}** detected`,
              `Order size: **$${betAmount.toLocaleString()}**`,
              `Cooldown: **${alert.cooldownMinutes} min**`,
              `[View Market](${marketUrl})`,
            ].join("\n"),
            color: severityColorMap[severity] || (alert.side === "YES" ? 0x34d399 : 0xf87171),
            footer: { text: "PolyOiyen Alerts" },
            timestamp: now.toISOString(),
          },
        ],
      };

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload),
        });
        if (!res.ok) {
          console.error(`Discord webhook failed for alert ${alert.id}:`, res.status, await res.text());
        }
      } catch (err) {
        console.error(`Discord webhook error for alert ${alert.id}:`, err);
      }
    }
  }
}

/**
 * Trigger VOLUME_SPIKE alerts when today's BUY volume exceeds 2x
 * the previous 30-day average daily BUY volume for the same event.
 *
 * Alert recipients: users who have bought this event (type=BUY).
 */
export async function checkAndTriggerVolumeSpikeAlerts(
  eventId: string,
  marketQuestion: string
) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const prev30Start = new Date(todayStart);
  prev30Start.setUTCDate(prev30Start.getUTCDate() - 30);

  const [todayAgg, prev30Agg] = await Promise.all([
    prisma.polyBet.aggregate({
      where: {
        eventId,
        type: "BUY",
        createdAt: { gte: todayStart },
      },
      _sum: { amount: true },
    }),
    prisma.polyBet.aggregate({
      where: {
        eventId,
        type: "BUY",
        createdAt: { gte: prev30Start, lt: todayStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const todayVolume = Number(todayAgg._sum.amount || 0);
  const previous30Total = Number(prev30Agg._sum.amount || 0);
  const avg30Daily = previous30Total / 30;

  const thresholdVolume = avg30Daily * VOLUME_SPIKE_MULTIPLIER;

  const pendingAlerts = await prisma.polyAlert.findMany({
    where: {
      eventId,
      alertType: "VOLUME_SPIKE",
      active: true,
      triggered: false,
    },
  });
  if (pendingAlerts.length === 0) return;

  // Keep the latest computed threshold visible in users' alert rows.
  await prisma.polyAlert.updateMany({
    where: {
      eventId,
      alertType: "VOLUME_SPIKE",
      active: true,
      triggered: false,
    },
    data: {
      marketQuestion,
      threshold: avg30Daily > 0 ? thresholdVolume : null,
    },
  });

  if (avg30Daily <= 0) return;
  if (todayVolume <= thresholdVolume) return;

  await prisma.$transaction(async (tx) => {
    for (const alert of pendingAlerts) {
      await tx.polyAlert.update({
        where: { id: alert.id },
        data: {
          threshold: thresholdVolume,
          triggered: true,
          triggeredAt: now,
          lastNotifiedAt: now,
          marketQuestion,
        },
      });

      await tx.alertNotificationEvent.create({
        data: {
          alertId: alert.id,
          eventType: "SENT",
          channel: "IN_APP",
        },
      });
    }
  });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = {
    embeds: [
      {
        title: "📊 [HIGH] Volume Spike Alert Triggered!",
        description: [
          `**Market:** ${marketQuestion}`,
          `Today's BUY volume: **$${todayVolume.toLocaleString()}**`,
          `30D average daily volume: **$${avg30Daily.toLocaleString(undefined, { maximumFractionDigits: 2 })}**`,
          `Rule: today volume > **${VOLUME_SPIKE_MULTIPLIER}x** average`,
          `[View Market](https://oiyen.quadrawebs.com/polyoiyen/${encodeURIComponent(eventId)})`,
        ].join("\n"),
        color: 0xf59e0b,
        footer: { text: "PolyOiyen Alerts" },
        timestamp: now.toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Discord webhook failed for volume spike:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Discord webhook error for volume spike:", err);
  }
}
