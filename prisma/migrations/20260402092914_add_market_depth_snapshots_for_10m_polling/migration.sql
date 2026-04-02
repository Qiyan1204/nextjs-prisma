-- CreateTable
CREATE TABLE "MarketDepthSnapshot" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketTitle" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "yesTokenId" TEXT NOT NULL,
    "noTokenId" TEXT NOT NULL,
    "yesDepthUsd" DOUBLE PRECISION NOT NULL,
    "noDepthUsd" DOUBLE PRECISION NOT NULL,
    "totalDepthUsd" DOUBLE PRECISION NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDepthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketDepthSnapshot_sampledAt_idx" ON "MarketDepthSnapshot"("sampledAt");

-- CreateIndex
CREATE INDEX "MarketDepthSnapshot_eventId_sampledAt_idx" ON "MarketDepthSnapshot"("eventId", "sampledAt");

-- CreateIndex
CREATE INDEX "MarketDepthSnapshot_categoryKey_sampledAt_idx" ON "MarketDepthSnapshot"("categoryKey", "sampledAt");
