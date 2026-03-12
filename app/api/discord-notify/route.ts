import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let body: {
    alertType?: string;
    side?: string;
    marketQuestion?: string;
    targetPrice?: number | null;
    threshold?: number | null;
    triggeredAt?: string | null;
    eventId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { alertType, side, marketQuestion, targetPrice, threshold, triggeredAt, eventId } = body;

  const isPriceAlert = alertType === "PRICE";
  const sideEmoji = side === "YES" ? "✅" : "❌";

  let description = "";
  if (isPriceAlert) {
    const targetPct = targetPrice != null ? `${Math.round(Number(targetPrice) * 100)}¢` : "—";
    description = `**${side}** price reached **${targetPct}** target`;
  } else {
    const thresholdStr = threshold != null ? `$${Number(threshold).toLocaleString()}` : "—";
    description = `Large **${side}** order ≥ **${thresholdStr}** detected in order book`;
  }

  const marketUrl = eventId ? `https://oiyen.quadrawebs.com/polyoiyen?eventId=${eventId}` : null;

  const timestamp = triggeredAt ? new Date(triggeredAt).toISOString() : new Date().toISOString();

  const discordPayload = {
    embeds: [
      {
        title: `${sideEmoji} Alert Triggered!`,
        description: [
          `**Market:** ${marketQuestion ?? "Unknown market"}`,
          description,
          marketUrl ? `[View Market](${marketUrl})` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        color: side === "YES" ? 0x34d399 : 0xf87171,
        footer: {
          text: "PolyOiyen Alerts",
        },
        timestamp,
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
      const text = await res.text();
      return NextResponse.json({ error: `Discord error: ${text}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
