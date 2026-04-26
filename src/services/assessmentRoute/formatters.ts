import { EXPOSE_CORRECT_ANSWERS } from "../../config";
import {
  AssessmentAnswerPayload,
  AssessmentQuestion,
  normalizeAnswer,
  sanitizeQuestions,
} from "../assessment";
import { AttemptResponse, AttemptReviewItem } from "./types";

const formatAttemptQuestions = (questions: AssessmentQuestion[]) => {
  const sanitized = sanitizeQuestions(questions);
  if (!EXPOSE_CORRECT_ANSWERS) return sanitized;

  const answerById = new Map(
    questions.map((question) => [question.id, question.correctAnswer])
  );

  return sanitized.map((question) => ({
    ...question,
    correctAnswer: answerById.get(question.id) ?? "",
  }));
};

export const formatAttemptResponse = (
  attempt: {
    id: string;
    assessmentId: string;
    totalCount: number | null;
    createdAt: Date;
  },
  questions: AssessmentQuestion[]
): AttemptResponse => ({
  id: attempt.id,
  assessmentId: attempt.assessmentId,
  questions: formatAttemptQuestions(questions),
  totalCount: attempt.totalCount ?? questions.length,
  createdAt: attempt.createdAt,
});

export const toAnswerPayload = (
  answers: unknown
): AssessmentAnswerPayload[] | null => {
  if (!Array.isArray(answers)) return null;
  return answers as AssessmentAnswerPayload[];
};

export const buildAttemptReview = (
  questions: AssessmentQuestion[],
  answers: AssessmentAnswerPayload[]
): AttemptReviewItem[] => {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionId, answer.answer])
  );

  return questions.map((question) => {
    const userAnswer = answerMap.get(question.id) ?? "";
    return {
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      correctAnswer: question.correctAnswer,
      userAnswer,
      isCorrect:
        normalizeAnswer(userAnswer) === normalizeAnswer(question.correctAnswer),
      explanation: question.explanation ?? null,
    };
  });
};
