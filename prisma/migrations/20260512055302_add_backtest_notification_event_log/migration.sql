/*
  Warnings:

  - You are about to drop the `TopBacktestManualInclude` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "TopBacktestManualInclude";

-- CreateTable
CREATE TABLE "BacktestNotificationEvent" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'DISCORD',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "modelBacktestId" INTEGER,
    "backtestVersionRunId" INTEGER,
    "eventId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestNotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_createdAt_idx" ON "BacktestNotificationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_kind_createdAt_idx" ON "BacktestNotificationEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_deliveryStatus_createdAt_idx" ON "BacktestNotificationEvent"("deliveryStatus", "createdAt");

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_modelBacktestId_createdAt_idx" ON "BacktestNotificationEvent"("modelBacktestId", "createdAt");

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_backtestVersionRunId_createdAt_idx" ON "BacktestNotificationEvent"("backtestVersionRunId", "createdAt");

-- CreateIndex
CREATE INDEX "BacktestNotificationEvent_eventId_createdAt_idx" ON "BacktestNotificationEvent"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "BacktestNotificationEvent" ADD CONSTRAINT "BacktestNotificationEvent_modelBacktestId_fkey" FOREIGN KEY ("modelBacktestId") REFERENCES "ModelBacktest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestNotificationEvent" ADD CONSTRAINT "BacktestNotificationEvent_backtestVersionRunId_fkey" FOREIGN KEY ("backtestVersionRunId") REFERENCES "BacktestVersionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
