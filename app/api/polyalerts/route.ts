import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: fetch user's alerts (optionally filtered by eventId)
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");

    const where: { userId: number; eventId?: string } = { userId: authUser.userId };
    if (eventId) where.eventId = eventId;

    const alerts = await prisma.polyAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Get alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

// POST: create a new alert
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { eventId, tokenId, marketQuestion, alertType, side, targetPrice, threshold } = body;

    if (!eventId || !tokenId || !marketQuestion || !alertType || !side) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (alertType !== "PRICE" && alertType !== "LARGE_ORDER") {
      return NextResponse.json({ error: "alertType must be PRICE or LARGE_ORDER" }, { status: 400 });
    }

    if (side !== "YES" && side !== "NO") {
      return NextResponse.json({ error: "side must be YES or NO" }, { status: 400 });
    }

    if (alertType === "PRICE" && (targetPrice == null || Number(targetPrice) <= 0 || Number(targetPrice) >= 1)) {
      return NextResponse.json({ error: "targetPrice must be between 0 and 1" }, { status: 400 });
    }

    if (alertType === "LARGE_ORDER" && (threshold == null || Number(threshold) <= 0)) {
      return NextResponse.json({ error: "threshold must be positive" }, { status: 400 });
    }

    const alert = await prisma.polyAlert.create({
      data: {
        userId: authUser.userId,
        eventId: String(eventId),
        tokenId: String(tokenId),
        marketQuestion: String(marketQuestion),
        alertType: String(alertType),
        side: String(side),
        targetPrice: alertType === "PRICE" ? Number(targetPrice) : null,
        threshold: alertType === "LARGE_ORDER" ? Number(threshold) : null,
      },
    });

    return NextResponse.json({ alert }, { status: 201 });
  } catch (error) {
    console.error("Create alert error:", error);
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}

// DELETE: remove an alert
export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing alert id" }, { status: 400 });
    }

    const alert = await prisma.polyAlert.findUnique({ where: { id: Number(id) } });
    if (!alert || alert.userId !== authUser.userId) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    await prisma.polyAlert.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete alert error:", error);
    return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
  }
}

// PUT: mark a single alert as triggered=true AND fire Discord webhook
export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const alert = await prisma.polyAlert.findUnique({ where: { id: Number(id) } });
    if (!alert || alert.userId !== authUser.userId) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Idempotent: if already triggered, skip discord but return success
    if (!alert.triggered) {
      const now = new Date();
      await prisma.polyAlert.update({
        where: { id: Number(id) },
        data: { triggered: true, triggeredAt: now },
      });

      // Fire Discord webhook server-side
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const isPriceAlert = alert.alertType === "PRICE";
        const sideEmoji = alert.side === "YES" ? "✅" : "❌";
        let description = "";
        if (isPriceAlert) {
          const targetPct = alert.targetPrice != null ? `${Math.round(Number(alert.targetPrice) * 100)}¢` : "—";
          description = `**${alert.side}** price reached **${targetPct}** target`;
        } else {
          const thresholdStr = alert.threshold != null ? `$${Number(alert.threshold).toLocaleString()}` : "—";
          description = `Large **${alert.side}** order ≥ **${thresholdStr}** detected in order book`;
        }
        const marketUrl = `https://oiyen.quadrawebs.com/polyoiyen?eventId=${alert.eventId}`;
        const discordPayload = {
          embeds: [
            {
              title: `${sideEmoji} Alert Triggered!`,
              description: `**Market:** ${alert.marketQuestion}\n${description}\n[View Market](${marketUrl})`,
              color: alert.side === "YES" ? 0x34d399 : 0xf87171,
              footer: { text: "PolyOiyen Alerts" },
              timestamp: now.toISOString(),
            },
          ],
        };
        // Fire-and-forget — don't block response
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trigger alert error:", error);
    return NextResponse.json({ error: "Failed to trigger alert" }, { status: 500 });
  }
}

// PATCH: mark alert(s) as read (triggered=true, active=false) or dismiss
export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { id, dismissAll } = body;

    if (dismissAll) {
      await prisma.polyAlert.updateMany({
        where: { userId: authUser.userId, triggered: true },
        data: { active: false },
      });
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const alert = await prisma.polyAlert.findUnique({ where: { id: Number(id) } });
    if (!alert || alert.userId !== authUser.userId) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const updated = await prisma.polyAlert.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    return NextResponse.json({ alert: updated });
  } catch (error) {
    console.error("Patch alert error:", error);
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}
