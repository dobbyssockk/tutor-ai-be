import { GoalStatus, GoalTopicStatus } from "@prisma/client";

import prisma from "../db/prisma";

export type ProgramTopicInput = {
  title: string;
  summary: string | null;
  subtopics: string[];
  durationWeeks: number;
};

/** Nominal daily effort that stored `durationWeeks` is calibrated to (see `computeTopicDueAt`). */
export const TOPIC_DURATION_REFERENCE_MINUTES_PER_DAY = 45;

export const resolveGoalMinutesPerDay = (
  minutesPerDay: number | null | undefined
): number => Math.max(minutesPerDay ?? TOPIC_DURATION_REFERENCE_MINUTES_PER_DAY, 5);

/**
 * Calendar days for a topic: `durationWeeks` × 7 at reference pace, scaled by actual minutes/day.
 */
export const topicCalendarDaySpan = (
  durationWeeks: number,
  minutesPerDay: number | null | undefined
): number => {
  const m = resolveGoalMinutesPerDay(minutesPerDay);
  const days =
    durationWeeks * 7 * (TOPIC_DURATION_REFERENCE_MINUTES_PER_DAY / m);
  return Math.max(1, Math.ceil(days));
};

export const computeTopicDueAt = (
  startAt: Date,
  durationWeeks: number,
  minutesPerDay: number | null | undefined
): Date => {
  const end = new Date(startAt);
  end.setDate(end.getDate() + topicCalendarDaySpan(durationWeeks, minutesPerDay));
  return end;
};

export const normalizeProgramTopics = (topics: Array<Record<string, unknown>>) => {
  const normalized = topics
    .map((topic) => {
      const title = String(topic.title ?? "").trim();
      if (!title) return null;
      const summary =
        typeof topic.summary === "string" ? topic.summary.trim() : "";
      const subtopics = Array.isArray(topic.subtopics)
        ? (topic.subtopics as unknown[])
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .slice(0, 12)
        : [];
      const durationWeeks = Math.min(
        Math.max(Math.floor(Number(topic.durationWeeks) || 0), 1),
        12
      );

      return {
        title,
        summary: summary || null,
        subtopics,
        durationWeeks,
      };
    })
    .filter((topic): topic is ProgramTopicInput => Boolean(topic));

  return normalized.slice(0, 20);
};

export const completeTopicIfReady = async (topicId: string, userId: string) => {
  const topic = await prisma.goalTopic.findFirst({
    where: { id: topicId, goal: { userId } },
    include: { goal: { select: { minutesPerDay: true } } },
  });

  if (!topic) return null;
  if (topic.status !== GoalTopicStatus.in_progress) return null;
  if (!topic.lessonChatId || !topic.assessmentAttemptId) return null;

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updatedTopic = await tx.goalTopic.update({
      where: { id: topic.id },
      data: { status: GoalTopicStatus.done },
    });

    const nextTopic = await tx.goalTopic.findFirst({
      where: { goalId: topic.goalId, status: GoalTopicStatus.locked },
      orderBy: { order: "asc" },
    });

    if (nextTopic) {
      const startAt = now;
      const dueAt = computeTopicDueAt(
        startAt,
        nextTopic.durationWeeks,
        topic.goal.minutesPerDay
      );
      await tx.goalTopic.update({
        where: { id: nextTopic.id },
        data: { status: GoalTopicStatus.in_progress, startAt, dueAt },
      });
    } else {
      await tx.goal.update({
        where: { id: topic.goalId },
        data: { status: GoalStatus.done },
      });
    }

    return {
      updatedTopicId: updatedTopic.id,
      nextTopicId: nextTopic?.id ?? null,
    };
  });
};
