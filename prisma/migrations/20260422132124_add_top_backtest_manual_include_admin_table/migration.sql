-- CreateTable
CREATE TABLE "TopBacktestManualInclude" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopBacktestManualInclude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopBacktestManualInclude_eventId_key" ON "TopBacktestManualInclude"("eventId");

-- CreateIndex
CREATE INDEX "TopBacktestManualInclude_enabled_createdAt_idx" ON "TopBacktestManualInclude"("enabled", "createdAt");
