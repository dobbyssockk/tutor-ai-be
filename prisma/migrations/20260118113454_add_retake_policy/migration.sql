-- CreateEnum
CREATE TYPE "RetakePolicy" AS ENUM ('always', 'once', 'cooldown');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "cooldown_days" INTEGER,
ADD COLUMN     "retakePolicy" "RetakePolicy" NOT NULL DEFAULT 'always';
