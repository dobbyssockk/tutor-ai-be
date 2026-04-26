import { GoalTopicStatus } from "@prisma/client";

import prisma from "../../db/prisma";
import { PASSING_SCORE } from "../../config";
import {
  buildAttemptResults,
  toAssessmentQuestions,
} from "../assessment";
import { formatAttemptResponse, toAnswerPayload } from "./formatters";
import { syncTopicProgressAfterPassingAttempt } from "./progress";
import {
  GetAssessmentAttemptResult,
  StartAssessmentAttemptResult,
  SubmitAssessmentAttemptResult,
} from "./types";

export const startAssessmentAttemptForUser = async (
  userId: string,
  assessmentId: string
): Promise<StartAssessmentAttemptResult> => {
  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      isActive: true,
      OR: [{ goalId: null }, { goal: { userId } }],
    },
    include: {
      goal: { select: { userId: true } },
      goalTopic: { select: { status: true } },
    },
  });

  if (!assessment) {
    return { kind: "not_found" };
  }

  if (assessment.goalId && assessment.goal?.userId !== userId) {
    return { kind: "forbidden" };
  }

  if (assessment.goalTopicId) {
    const status = assessment.goalTopic?.status;
    if (
      status !== GoalTopicStatus.in_progress &&
      status !== GoalTopicStatus.done
    ) {
      return { kind: "forbidden" };
    }
  }

  const questions = toAssessmentQuestions(assessment.questions);
  if (questions.length === 0) {
    return { kind: "no_questions" };
  }

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      assessmentId: assessment.id,
      userId,
      questions,
      totalCount: questions.length,
    },
  });

  return {
    kind: "success",
    attempt: formatAttemptResponse(attempt, questions),
  };
};

export const getAssessmentAttemptForUser = async (
  userId: string,
  attemptId: string
): Promise<GetAssessmentAttemptResult> => {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
  });

  if (!attempt) {
    return { kind: "not_found" };
  }

  const questions = toAssessmentQuestions(attempt.questions);

  return {
    kind: "success",
    attempt: formatAttemptResponse(attempt, questions),
  };
};

export const submitAssessmentAttemptForUser = async (
  userId: string,
  attemptId: string,
  answersRaw: unknown
): Promise<SubmitAssessmentAttemptResult> => {
  const answers = toAnswerPayload(answersRaw);
  if (!answers) {
    return { kind: "invalid_answers" };
  }

  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { assessment: { select: { goalTopicId: true } } },
  });

  if (!attempt) {
    return { kind: "not_found" };
  }

  const questions = toAssessmentQuestions(attempt.questions);

  const { mistakes, correctCount, totalCount, score } = buildAttemptResults(
    questions,
    answers
  );
  const isPassingScore = score >= PASSING_SCORE;

  const updatedAttempt = await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      answers,
      score,
      correctCount,
      totalCount,
      completedAt: new Date(),
    },
  });

  const topicId = attempt.assessment?.goalTopicId ?? null;
  if (topicId && isPassingScore) {
    await syncTopicProgressAfterPassingAttempt(userId, topicId, attempt.id);
  }

  return {
    kind: "success",
    attempt: {
      id: updatedAttempt.id,
      assessmentId: updatedAttempt.assessmentId,
      score: updatedAttempt.score ?? score,
      correctCount: updatedAttempt.correctCount ?? correctCount,
      totalCount: updatedAttempt.totalCount ?? totalCount,
      completedAt: updatedAttempt.completedAt,
    },
    chatId: updatedAttempt.reviewChatId ?? null,
    mistakesCount: mistakes.length,
  };
};
