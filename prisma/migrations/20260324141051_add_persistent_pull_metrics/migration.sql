-- CreateTable
CREATE TABLE "PullMetric" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PullMetric_createdAt_idx" ON "PullMetric"("createdAt");

-- CreateIndex
CREATE INDEX "PullMetric_kind_createdAt_idx" ON "PullMetric"("kind", "createdAt");
