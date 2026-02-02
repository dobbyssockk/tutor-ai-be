import { GoalStatus, GoalTopicStatus } from "@prisma/client";

import prisma from "../db/prisma";

export type ProgramTopicInput = {
  title: string;
  summary: string | null;
  subtopics: string[];
  durationWeeks: number;
};

export const addWeeks = (date: Date, weeks: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
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
  });

  if (!topic) return null;
  if (topic.status !== GoalTopicStatus.in_progress) return null;
  if (!topic.lessonChatId || !topic.assessmentAttemptId) return null;

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updatedTopic = await tx.goalTopic.update({
      where: { id: topic.id },
      data: { status: GoalTopicStatus.done, completedAt: now },
    });

    const nextTopic = await tx.goalTopic.findFirst({
      where: { goalId: topic.goalId, status: GoalTopicStatus.locked },
      orderBy: { order: "asc" },
    });

    if (nextTopic) {
      const startAt = now;
      const dueAt = addWeeks(startAt, nextTopic.durationWeeks);
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
