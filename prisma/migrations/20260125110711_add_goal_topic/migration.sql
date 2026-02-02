-- CreateEnum
CREATE TYPE "GoalTopicStatus" AS ENUM ('locked', 'in_progress', 'done');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "goal_id" UUID,
ADD COLUMN     "goal_topic_id" UUID;

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "current_level" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "minutes_per_day" INTEGER,
ADD COLUMN     "target_level" TEXT;

-- CreateTable
CREATE TABLE "goal_topics" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "subtopics" JSONB,
    "duration_weeks" INTEGER NOT NULL,
    "status" "GoalTopicStatus" NOT NULL DEFAULT 'locked',
    "start_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "lesson_chat_id" UUID,
    "assessment_attempt_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_topics_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "goal_topics" ADD CONSTRAINT "goal_topics_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_goal_topic_id_fkey" FOREIGN KEY ("goal_topic_id") REFERENCES "goal_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
