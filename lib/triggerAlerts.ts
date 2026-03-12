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
  // Find ALL users' active, un-triggered LARGE_ORDER alerts matching this event+side
  const matchingAlerts = await prisma.polyAlert.findMany({
    where: {
      eventId,
      side,
      alertType: "LARGE_ORDER",
      triggered: false,
      active: true,
      threshold: { lte: betAmount }, // bet amount >= alert threshold
    },
  });

  if (matchingAlerts.length === 0) return;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const now = new Date();

  for (const alert of matchingAlerts) {
    // Mark triggered in DB
    await prisma.polyAlert.update({
      where: { id: alert.id },
      data: { triggered: true, triggeredAt: now },
    });

    // Send Discord webhook
    if (webhookUrl) {
      const thresholdStr = alert.threshold != null
        ? `$${Number(alert.threshold).toLocaleString()}`
        : "—";
      const sideEmoji = alert.side === "YES" ? "✅" : "❌";
      const marketUrl = `https://oiyen.quadrawebs.com/polyoiyen?eventId=${alert.eventId}`;

      const discordPayload = {
        embeds: [
          {
            title: `${sideEmoji} Large Order Alert Triggered!`,
            description: [
              `**Market:** ${alert.marketQuestion}`,
              `Large **${alert.side}** order ≥ **${thresholdStr}** detected`,
              `Order size: **$${betAmount.toLocaleString()}**`,
              `[View Market](${marketUrl})`,
            ].join("\n"),
            color: alert.side === "YES" ? 0x34d399 : 0xf87171,
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
