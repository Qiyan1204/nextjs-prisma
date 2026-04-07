import prisma from "@/lib/prisma";

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
      const marketUrl = `https://oiyen.quadrawebs.com/polyoiyen?eventId=${alert.eventId}`;

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
