import { GoalTopicStatus } from "@prisma/client";

import prisma from "../../db/prisma";
import { toAssessmentQuestions } from "../assessment";
import {
  buildGoalContext,
  buildLessonContext,
  generateTopicAssessmentQuestions,
  toAssessmentSummary,
} from "./helpers";

export type CreateTopicAssessmentForUserResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_generated" }
  | {
      kind: "success";
      statusCode: 200 | 201;
      assessment: {
        id: string;
        title: string;
        description: string | null;
        topic: string | null;
        level: string | null;
        questionCount: number;
      };
    };

export const createTopicAssessmentForUser = async (params: {
  userId: string;
  goalId: string;
  topicId: string;
  regenerate: boolean;
}): Promise<CreateTopicAssessmentForUserResult> => {
  const { userId, goalId, topicId, regenerate } = params;

  const topic = await prisma.goalTopic.findFirst({
    where: { id: topicId, goalId, goal: { userId } },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          description: true,
          currentLevel: true,
          targetLevel: true,
        },
      },
    },
  });

  if (!topic) {
    return { kind: "not_found" };
  }

  if (topic.status !== GoalTopicStatus.in_progress) {
    return { kind: "forbidden" };
  }

  const existingAssessment = await prisma.assessment.findFirst({
    where: { goalTopicId: topic.id, isActive: true },
  });

  if (existingAssessment && !regenerate) {
    const questions = toAssessmentQuestions(existingAssessment.questions);
    return {
      kind: "success",
      statusCode: 200,
      assessment: toAssessmentSummary(existingAssessment, questions.length),
    };
  }

  const goalContext = buildGoalContext(topic);

  let lessonContext: string | null = null;
  if (topic.lessonChatId) {
    const lessonChat = await prisma.chat.findFirst({
      where: { id: topic.lessonChatId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (lessonChat?.messages?.length) {
      lessonContext = buildLessonContext(lessonChat.messages);
    }
  }

  const normalizedQuestions = await generateTopicAssessmentQuestions({
    topicTitle: topic.title,
    currentLevel: topic.goal.currentLevel ?? null,
    goalContext,
    lessonContext,
  });

  if (!normalizedQuestions) {
    return { kind: "invalid_generated" };
  }

  const assessment = existingAssessment
    ? await prisma.assessment.update({
        where: { id: existingAssessment.id },
        data: {
          title: `Тест по теме: ${topic.title}`,
          description: `Проверка по теме "${topic.title}".`,
          topic: topic.title,
          level: topic.goal.currentLevel ?? null,
          questions: normalizedQuestions,
          goalId: topic.goal.id,
          goalTopicId: topic.id,
          isActive: true,
        },
      })
    : await prisma.assessment.create({
        data: {
          title: `Тест по теме: ${topic.title}`,
          description: `Проверка по теме "${topic.title}".`,
          topic: topic.title,
          level: topic.goal.currentLevel ?? null,
          questions: normalizedQuestions,
          goalId: topic.goal.id,
          goalTopicId: topic.id,
        },
      });

  return {
    kind: "success",
    statusCode: 201,
    assessment: toAssessmentSummary(assessment, normalizedQuestions.length),
  };
};
