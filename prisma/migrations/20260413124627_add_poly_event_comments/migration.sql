-- CreateTable
CREATE TABLE "PolyEventComment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolyEventComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolyEventComment_eventId_createdAt_idx" ON "PolyEventComment"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "PolyEventComment_userId_createdAt_idx" ON "PolyEventComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PolyEventComment" ADD CONSTRAINT "PolyEventComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
