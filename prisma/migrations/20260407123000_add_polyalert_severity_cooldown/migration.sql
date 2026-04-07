-- Add severity + cooldown support for recurring alert notifications
ALTER TABLE "PolyAlert"
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "lastNotifiedAt" TIMESTAMP(3);
