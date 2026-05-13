import prisma from "@/lib/prisma";

export type EnqueueBacktestNotificationParams = {
  kind: string;
  channel?: string;
  modelBacktestId?: number | null;
  backtestVersionRunId?: number | null;
  eventId?: string | number | null;
  payload: unknown;
  send: () => Promise<void>;
};

export async function recordBacktestNotification(params: EnqueueBacktestNotificationParams): Promise<number> {
  const created = await prisma.backtestNotificationEvent.create({
    data: {
      kind: params.kind,
      channel: params.channel || "DISCORD",
      deliveryStatus: "PENDING",
      modelBacktestId: params.modelBacktestId ?? null,
      backtestVersionRunId: params.backtestVersionRunId ?? null,
      eventId: params.eventId != null ? String(params.eventId) : null,
      payloadJson: JSON.stringify(params.payload ?? null),
    },
    select: { id: true },
  });

  try {
    await params.send();
    await prisma.backtestNotificationEvent.update({
      where: { id: created.id },
      data: {
        deliveryStatus: "SENT",
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    await prisma.backtestNotificationEvent.update({
      where: { id: created.id },
      data: {
        deliveryStatus: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  return created.id;
}

export function enqueueBacktestNotification(params: EnqueueBacktestNotificationParams): void {
  void recordBacktestNotification(params).catch((err) => {
    console.error("Backtest notification send failed:", err);
  });
}
