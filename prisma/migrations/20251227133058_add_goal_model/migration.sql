-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('todo', 'done');

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'todo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
