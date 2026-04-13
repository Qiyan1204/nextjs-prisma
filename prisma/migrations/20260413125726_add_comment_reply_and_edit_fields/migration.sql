-- AlterTable
ALTER TABLE "PolyEventComment" ADD COLUMN     "parentCommentId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "PolyEventComment_parentCommentId_createdAt_idx" ON "PolyEventComment"("parentCommentId", "createdAt");

-- AddForeignKey
ALTER TABLE "PolyEventComment" ADD CONSTRAINT "PolyEventComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "PolyEventComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
