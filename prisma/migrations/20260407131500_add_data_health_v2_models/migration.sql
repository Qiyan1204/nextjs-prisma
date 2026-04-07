-- Data Health v2 support: endpoint probe logs + alert notification audit logs
CREATE TABLE "EndpointProbe" (
  "id" SERIAL NOT NULL,
  "endpoint" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "statusCode" INTEGER,
  "latencyMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EndpointProbe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EndpointProbe_endpoint_createdAt_idx" ON "EndpointProbe"("endpoint", "createdAt");
CREATE INDEX "EndpointProbe_createdAt_idx" ON "EndpointProbe"("createdAt");

CREATE TABLE "AlertNotificationEvent" (
  "id" SERIAL NOT NULL,
  "alertId" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'DISCORD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AlertNotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertNotificationEvent_alertId_createdAt_idx" ON "AlertNotificationEvent"("alertId", "createdAt");
CREATE INDEX "AlertNotificationEvent_eventType_createdAt_idx" ON "AlertNotificationEvent"("eventType", "createdAt");
CREATE INDEX "AlertNotificationEvent_createdAt_idx" ON "AlertNotificationEvent"("createdAt");
