-- CreateTable
CREATE TABLE "PolyBet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketQuestion" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolyBet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolyBet_userId_idx" ON "PolyBet"("userId");

-- CreateIndex
CREATE INDEX "PolyBet_eventId_idx" ON "PolyBet"("eventId");

-- AddForeignKey
ALTER TABLE "PolyBet" ADD CONSTRAINT "PolyBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
