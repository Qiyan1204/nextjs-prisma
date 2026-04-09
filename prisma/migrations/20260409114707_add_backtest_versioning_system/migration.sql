-- CreateTable
CREATE TABLE "ModelBacktest" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "modelType" TEXT NOT NULL DEFAULT 'PolyOiyen',
    "parameters" TEXT NOT NULL,
    "dataStartDate" TIMESTAMP(3),
    "dataEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "isInversePair" BOOLEAN NOT NULL DEFAULT false,
    "parentModelId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelBacktest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestVersionRun" (
    "id" SERIAL NOT NULL,
    "modelBacktestId" INTEGER NOT NULL,
    "totalRuns" INTEGER NOT NULL,
    "aggregateWinRate" DOUBLE PRECISION,
    "avgReturn" DOUBLE PRECISION,
    "avgMaxDrawdown" DOUBLE PRECISION,
    "equityCurveJson" TEXT NOT NULL,
    "lossAttributionJson" TEXT NOT NULL,
    "worstEventsJson" TEXT NOT NULL,
    "diagnosticsJson" TEXT NOT NULL,
    "backtestStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestVersionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVariant" (
    "id" SERIAL NOT NULL,
    "modelBacktestId" INTEGER NOT NULL,
    "strategyName" TEXT NOT NULL,
    "isInverse" BOOLEAN NOT NULL DEFAULT false,
    "parentStrategyId" INTEGER,
    "runsCount" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "avgReturn" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "lossContributionPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestTradeSnapshot" (
    "id" SERIAL NOT NULL,
    "modelBacktestId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestTradeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelBacktest_status_idx" ON "ModelBacktest"("status");

-- CreateIndex
CREATE INDEX "ModelBacktest_modelType_createdAt_idx" ON "ModelBacktest"("modelType", "createdAt");

-- CreateIndex
CREATE INDEX "ModelBacktest_parentModelId_idx" ON "ModelBacktest"("parentModelId");

-- CreateIndex
CREATE INDEX "BacktestVersionRun_modelBacktestId_createdAt_idx" ON "BacktestVersionRun"("modelBacktestId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyVariant_modelBacktestId_idx" ON "StrategyVariant"("modelBacktestId");

-- CreateIndex
CREATE INDEX "StrategyVariant_parentStrategyId_idx" ON "StrategyVariant"("parentStrategyId");

-- CreateIndex
CREATE INDEX "BacktestTradeSnapshot_modelBacktestId_eventId_idx" ON "BacktestTradeSnapshot"("modelBacktestId", "eventId");

-- CreateIndex
CREATE INDEX "BacktestTradeSnapshot_strategyName_idx" ON "BacktestTradeSnapshot"("strategyName");

-- AddForeignKey
ALTER TABLE "ModelBacktest" ADD CONSTRAINT "ModelBacktest_parentModelId_fkey" FOREIGN KEY ("parentModelId") REFERENCES "ModelBacktest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestVersionRun" ADD CONSTRAINT "BacktestVersionRun_modelBacktestId_fkey" FOREIGN KEY ("modelBacktestId") REFERENCES "ModelBacktest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVariant" ADD CONSTRAINT "StrategyVariant_modelBacktestId_fkey" FOREIGN KEY ("modelBacktestId") REFERENCES "ModelBacktest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVariant" ADD CONSTRAINT "StrategyVariant_parentStrategyId_fkey" FOREIGN KEY ("parentStrategyId") REFERENCES "StrategyVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
