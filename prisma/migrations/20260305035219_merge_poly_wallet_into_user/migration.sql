/*
  Warnings:

  - You are about to drop the column `walletId` on the `PolyTransaction` table. All the data in the column will be lost.
  - You are about to drop the `PolyWallet` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `userId` to the `PolyTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PolyTransaction" DROP CONSTRAINT "PolyTransaction_walletId_fkey";

-- DropForeignKey
ALTER TABLE "PolyWallet" DROP CONSTRAINT "PolyWallet_userId_fkey";

-- DropIndex
DROP INDEX "PolyTransaction_walletId_idx";

-- AlterTable
ALTER TABLE "PolyTransaction" DROP COLUMN "walletId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "PolyWallet";

-- CreateIndex
CREATE INDEX "PolyTransaction_userId_idx" ON "PolyTransaction"("userId");

-- AddForeignKey
ALTER TABLE "PolyTransaction" ADD CONSTRAINT "PolyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
