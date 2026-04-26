import prisma from "../../db/prisma";
import { PASSING_SCORE } from "../../config";
import { getRequiredPasses } from "../assessment";
import { completeTopicIfReady } from "../goalService";

export const buildAttemptIndex = (
  attempts: Array<{
    id: string;
    assessmentId: string;
    score: number | null;
    completedAt: Date | null;
  }>
) => {
  const attemptsCount = new Map<string, number>();
  const lastCompleted = new Map<
    string,
    { id: string; score: number | null; completedAt: Date | null }
  >();
  const attemptsByAssessment = new Map<string, typeof attempts>();

  attempts.forEach((attempt) => {
    attemptsCount.set(
      attempt.assessmentId,
      (attemptsCount.get(attempt.assessmentId) || 0) + 1
    );
    if (!attemptsByAssessment.has(attempt.assessmentId)) {
      attemptsByAssessment.set(attempt.assessmentId, []);
    }
    attemptsByAssessment.get(attempt.assessmentId)!.push(attempt);
    if (attempt.completedAt && !lastCompleted.has(attempt.assessmentId)) {
      lastCompleted.set(attempt.assessmentId, {
        id: attempt.id,
        score: attempt.score ?? null,
        completedAt: attempt.completedAt,
      });
    }
  });

  return { attemptsCount, lastCompleted, attemptsByAssessment };
};

export const syncTopicProgressAfterPassingAttempt = async (
  userId: string,
  topicId: string,
  attemptId: string
) => {
  const topic = await prisma.goalTopic.findFirst({
    where: { id: topicId, goal: { userId } },
    select: { id: true, dueAt: true },
  });
  if (!topic) return;

  const passingAttempts = await prisma.assessmentAttempt.findMany({
    where: {
      userId,
      completedAt: { not: null },
      score: { gte: PASSING_SCORE },
      assessment: { goalTopicId: topicId },
    },
    select: { completedAt: true },
  });

  const passesCompleted = passingAttempts.length;
  const passesRequired = getRequiredPasses(topic.dueAt, passingAttempts);

  if (passesCompleted >= passesRequired) {
    await prisma.goalTopic.update({
      where: { id: topic.id },
      data: { assessmentAttemptId: attemptId },
    });
    await completeTopicIfReady(topic.id, userId);
  }
};
