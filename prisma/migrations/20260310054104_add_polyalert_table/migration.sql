-- CreateTable
CREATE TABLE "PolyAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "marketQuestion" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "targetPrice" DECIMAL(10,6),
    "threshold" DECIMAL(18,6),
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredAt" TIMESTAMP(3),

    CONSTRAINT "PolyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolyAlert_userId_idx" ON "PolyAlert"("userId");

-- CreateIndex
CREATE INDEX "PolyAlert_eventId_idx" ON "PolyAlert"("eventId");

-- AddForeignKey
ALTER TABLE "PolyAlert" ADD CONSTRAINT "PolyAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
