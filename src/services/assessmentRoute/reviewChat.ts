import prisma from "../../db/prisma";
import { AssessmentAnswerPayload, toAssessmentQuestions } from "../assessment";
import { generateAssistantTextForUser } from "../chatService";
import { buildReviewChatTitle, buildReviewPromptData } from "./reviewHelpers";
import { CreateAttemptReviewChatResult } from "./types";

export const createAttemptReviewChatForUser = async (
  userId: string,
  attemptId: string
): Promise<CreateAttemptReviewChatResult> => {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      id: true,
      completedAt: true,
      reviewChatId: true,
      questions: true,
      answers: true,
      assessment: {
        select: {
          title: true,
          topic: true,
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

  if (attempt.reviewChatId) {
    return { kind: "success", chatId: attempt.reviewChatId, created: false };
  }

  const questions = toAssessmentQuestions(attempt.questions);
  const answers = Array.isArray(attempt.answers)
    ? (attempt.answers as AssessmentAnswerPayload[])
    : [];
  const { prompt, fallbackReviewText } = buildReviewPromptData(questions, answers);

  const assistantOutputText = await generateAssistantTextForUser(
    userId,
    [{ role: "user", outputText: prompt }],
    fallbackReviewText,
    "Assessment review generation failed"
  );

  const reviewChat = await prisma.chat.create({
    data: {
      title: buildReviewChatTitle({
        assessmentTitle: attempt.assessment?.title ?? null,
        assessmentTopic: attempt.assessment?.topic ?? null,
      }),
      userId,
      messages: {
        create: [
          { role: "user", outputText: prompt },
          { role: "assistant", outputText: assistantOutputText },
        ],
      },
    },
  });

  const updatedAttempt = await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { reviewChatId: reviewChat.id },
    select: { reviewChatId: true },
  });

  return {
    kind: "success",
    chatId: updatedAttempt.reviewChatId ?? reviewChat.id,
    created: true,
  };
};
