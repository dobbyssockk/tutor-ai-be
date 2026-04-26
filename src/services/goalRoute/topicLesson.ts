import { GoalTopicStatus } from "@prisma/client";

import prisma from "../../db/prisma";
import { createChatWithPrompt } from "../chatService";
import { addWeeks, completeTopicIfReady } from "../goalService";
import { buildLessonPrompt } from "./helpers";

export type CreateTopicLessonForUserResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "success"; chatId: string; statusCode: 200 | 201 };

export const createTopicLessonForUser = async (params: {
  userId: string;
  goalId: string;
  topicId: string;
  regenerate: boolean;
}): Promise<CreateTopicLessonForUserResult> => {
  const { userId, goalId, topicId, regenerate } = params;

  const topic = await prisma.goalTopic.findFirst({
    where: { id: topicId, goalId, goal: { userId } },
    include: {
      goal: {
        select: {
          title: true,
          description: true,
          currentLevel: true,
          targetLevel: true,
          minutesPerDay: true,
        },
      },
    },
  });

  if (!topic) {
    return { kind: "not_found" };
  }

  const allowRegenerate = Boolean(regenerate) && topic.status === GoalTopicStatus.done;
  if (topic.status !== GoalTopicStatus.in_progress && !allowRegenerate) {
    return { kind: "forbidden" };
  }

  if (topic.lessonChatId) {
    if (!allowRegenerate) {
      const existingChat = await prisma.chat.findFirst({
        where: { id: topic.lessonChatId, userId },
        select: { id: true },
      });
      if (existingChat) {
        return { kind: "success", chatId: topic.lessonChatId, statusCode: 200 };
      }
    }

    await prisma.goalTopic.update({
      where: { id: topic.id },
      data: { lessonChatId: null },
    });
  }

  const prompt = buildLessonPrompt(topic);
  const chat = await createChatWithPrompt(userId, prompt, `Урок: ${topic.title}`);

  const now = new Date();
  const startAt = topic.startAt ?? now;
  const dueAt = topic.dueAt ?? addWeeks(startAt, topic.durationWeeks);

  await prisma.goalTopic.update({
    where: { id: topic.id },
    data: {
      lessonChatId: chat.id,
      startAt,
      dueAt,
    },
  });

  await completeTopicIfReady(topic.id, userId);

  return { kind: "success", chatId: chat.id, statusCode: 201 };
};
