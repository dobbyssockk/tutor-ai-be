/*
  Warnings:

  - You are about to drop the column `cooldown_days` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `retakePolicy` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessments" DROP COLUMN "cooldown_days",
DROP COLUMN "retakePolicy";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "username";

-- DropEnum
DROP TYPE "RetakePolicy";
