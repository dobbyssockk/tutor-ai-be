import prisma from "../../db/prisma";
import { AssessmentAnswerPayload, toAssessmentQuestions } from "../assessment";
import { buildAttemptReview } from "./formatters";
import { GetAssessmentAttemptDetailsResult } from "./types";

export const getAssessmentAttemptDetailsForUser = async (
  userId: string,
  attemptId: string
): Promise<GetAssessmentAttemptDetailsResult> => {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      assessment: {
        select: {
          id: true,
          goalId: true,
          goalTopicId: true,
        },
      },
    },
  });

  if (!attempt) {
    return { kind: "not_found" };
  }

  if (!attempt.completedAt) {
    return { kind: "not_completed" };
  }

  const totalCount = attempt.totalCount ?? 0;
  const correctCount = attempt.correctCount ?? 0;
  const questions = toAssessmentQuestions(attempt.questions);
  const answers = Array.isArray(attempt.answers)
    ? (attempt.answers as AssessmentAnswerPayload[])
    : [];
  const review = buildAttemptReview(questions, answers);

  return {
    kind: "success",
    result: {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      score: attempt.score ?? 0,
      correctCount,
      totalCount,
      completedAt: attempt.completedAt,
      chatId: attempt.reviewChatId ?? null,
      mistakesCount: Math.max(totalCount - correctCount, 0),
      goalId: attempt.assessment?.goalId ?? null,
      goalTopicId: attempt.assessment?.goalTopicId ?? null,
      review,
    },
  };
};
