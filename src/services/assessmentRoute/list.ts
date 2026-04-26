import { GoalTopicStatus } from "@prisma/client";

import prisma from "../../db/prisma";
import { PASSING_SCORE } from "../../config";
import { getRequiredPasses, toAssessmentQuestions } from "../assessment";
import { buildAttemptIndex } from "./progress";

export const listAssessmentsForUser = async (userId: string) => {
  const currentTopics = await prisma.goalTopic.findMany({
    where: { goal: { userId }, status: GoalTopicStatus.in_progress },
    select: { id: true },
  });

  const topicIds = currentTopics.map((topic) => topic.id);
  if (topicIds.length === 0) {
    return [];
  }

  const [assessments, attempts] = await Promise.all([
    prisma.assessment.findMany({
      where: { isActive: true, goalTopicId: { in: topicIds } },
      orderBy: { createdAt: "desc" },
      include: {
        goal: { select: { id: true, title: true } },
        goalTopic: { select: { id: true, title: true, dueAt: true } },
      },
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const { attemptsCount, lastCompleted, attemptsByAssessment } =
    buildAttemptIndex(attempts);
  const now = new Date();

  return assessments.map((assessment) => {
    const questions = toAssessmentQuestions(assessment.questions);
    const lastAttempt = lastCompleted.get(assessment.id);

    const relatedAttempts = attemptsByAssessment.get(assessment.id) ?? [];
    const passingAttempts = relatedAttempts.filter(
      (attempt) => attempt.completedAt && (attempt.score ?? 0) >= PASSING_SCORE
    );
    const recentAttempts = relatedAttempts
      .filter((attempt) => attempt.completedAt)
      .slice(0, 3)
      .map((attempt) => ({
        id: attempt.id,
        score: attempt.score ?? 0,
        completedAt: attempt.completedAt,
      }));
    const passesCompleted = passingAttempts.length;
    const passesRequired = getRequiredPasses(
      assessment.goalTopic?.dueAt,
      passingAttempts,
      now
    );

    return {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      topic: assessment.topic,
      level: assessment.level,
      goalId: assessment.goal?.id ?? null,
      goalTitle: assessment.goal?.title ?? null,
      goalTopicId: assessment.goalTopic?.id ?? null,
      goalTopicTitle: assessment.goalTopic?.title ?? null,
      goalTopicDueAt: assessment.goalTopic?.dueAt ?? null,
      questionCount: questions.length,
      attemptsCount: attemptsCount.get(assessment.id) ?? 0,
      passesRequired,
      passesCompleted,
      recentAttempts,
      lastAttempt: lastAttempt
        ? {
            id: lastAttempt.id,
            score: lastAttempt.score,
            completedAt: lastAttempt.completedAt,
          }
        : null,
      canStart: true,
      nextAvailableAt: null,
    };
  });
};
