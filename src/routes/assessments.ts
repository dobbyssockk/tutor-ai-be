import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";
import { GoalTopicStatus } from "@prisma/client";

import prisma from "../db/prisma";
import { EXPOSE_CORRECT_ANSWERS, PASSING_SCORE } from "../config";
import { requireAuth } from "../middleware/requireAuth";
import {
  AssessmentAnswerPayload,
  AssessmentQuestion,
  buildAssessmentPrompt,
  buildAttemptResults,
  getRequiredPasses,
  normalizeAnswer,
  sanitizeQuestions,
  toAssessmentQuestions,
} from "../services/assessment";
import { completeTopicIfReady } from "../services/goalService";
import { generateAssistantTextForUser } from "../services/chatService";

const router = Router();

router.use(requireAuth);

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

const formatAttemptResponse = (
  attempt: {
    id: string;
    assessmentId: string;
    totalCount: number | null;
    createdAt: Date;
  },
  questions: AssessmentQuestion[]
) => ({
  id: attempt.id,
  assessmentId: attempt.assessmentId,
  questions: formatAttemptQuestions(questions),
  totalCount: attempt.totalCount ?? questions.length,
  createdAt: attempt.createdAt,
});

const buildReviewPromptData = (
  questions: AssessmentQuestion[],
  answers: AssessmentAnswerPayload[]
) => {
  const { mistakes, correctCount, totalCount } = buildAttemptResults(
    questions,
    answers
  );
  const prompt = buildAssessmentPrompt(mistakes);
  const fallbackReviewText =
    mistakes.length === 0
      ? "Отличный результат. Все ответы верные. Продолжай в том же темпе."
      : [
          "Не удалось сгенерировать подробный разбор сейчас.",
          "Краткий итог:",
          `- Верных ответов: ${correctCount} из ${totalCount}`,
          `- Ошибок: ${mistakes.length}`,
          "Попробуй открыть разбор позже или попроси тьютора объяснить сложные вопросы.",
        ].join("\n");

  return {
    mistakes,
    prompt,
    fallbackReviewText,
  };
};

const buildReviewChatTitle = ({
  assessmentTitle,
  assessmentTopic,
}: {
  assessmentTitle?: string | null;
  assessmentTopic?: string | null;
}) => {
  const base = (assessmentTitle || "").trim();
  if (base.length > 0) {
    return `Разбор теста: ${base}`.slice(0, 120);
  }
  const topic = (assessmentTopic || "").trim();
  if (topic.length > 0) {
    return `Разбор ошибок: ${topic}`.slice(0, 120);
  }
  return "Разбор ошибок теста";
};

router.get("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const currentTopics = await prisma.goalTopic.findMany({
      where: { goal: { userId }, status: GoalTopicStatus.in_progress },
      select: { id: true },
    });

    const topicIds = currentTopics.map((topic) => topic.id);

    if (topicIds.length === 0) {
      res.status(200).json({ assessments: [] });
      return;
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

    const now = new Date();

    const formatted = assessments.map((assessment) => {
      const questions = toAssessmentQuestions(assessment.questions);
      const lastAttempt = lastCompleted.get(assessment.id);

      const relatedAttempts = attemptsByAssessment.get(assessment.id) ?? [];
      const passingAttempts = relatedAttempts.filter(
        (attempt) =>
          attempt.completedAt && (attempt.score ?? 0) >= PASSING_SCORE
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

    res.status(200).json({ assessments: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:assessmentId/attempts", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { assessmentId } = req.params;

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
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    if (assessment.goalId && assessment.goal?.userId !== userId) {
      res.status(403).json({ error: "Assessment not available" });
      return;
    }

    if (assessment.goalTopicId) {
      const status = assessment.goalTopic?.status;
      if (
        status !== GoalTopicStatus.in_progress &&
        status !== GoalTopicStatus.done
      ) {
        res.status(403).json({ error: "Assessment not available" });
        return;
      }
    }

    const questions = toAssessmentQuestions(assessment.questions);
    if (questions.length === 0) {
      res.status(400).json({ error: "Assessment has no questions" });
      return;
    }

    const attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id,
        userId,
        questions,
        totalCount: questions.length,
      },
    });

    res.status(201).json({
      attempt: formatAttemptResponse(attempt, questions),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attempts/:attemptId", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, userId },
    });

    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    const questions = toAssessmentQuestions(attempt.questions);

    res.status(200).json({
      attempt: formatAttemptResponse(attempt, questions),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/attempts/:attemptId/submit", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;
    const { answers } = req.body as { answers?: AssessmentAnswerPayload[] };

    if (!Array.isArray(answers)) {
      res.status(400).json({ error: "Answers are required" });
      return;
    }

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, userId },
      include: { assessment: { select: { goalTopicId: true } } },
    });

    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
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
      const topic = await prisma.goalTopic.findFirst({
        where: { id: topicId, goal: { userId } },
        select: { id: true, dueAt: true, durationWeeks: true },
      });
      if (topic) {
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
            data: { assessmentAttemptId: attempt.id },
          });
          await completeTopicIfReady(topic.id, userId);
        }
      }
    }

    res.status(200).json({
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attempts/:attemptId/results", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

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
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (!attempt.completedAt) {
      res.status(400).json({ error: "Assessment not completed yet" });
      return;
    }

    const totalCount = attempt.totalCount ?? 0;
    const correctCount = attempt.correctCount ?? 0;
    const questions = toAssessmentQuestions(attempt.questions);
    const answers = Array.isArray(attempt.answers)
      ? (attempt.answers as AssessmentAnswerPayload[])
      : [];
    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer.answer])
    );
    const review = questions.map((question) => {
      const userAnswer = answerMap.get(question.id) ?? "";
      return {
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        correctAnswer: question.correctAnswer,
        userAnswer,
        isCorrect:
          normalizeAnswer(userAnswer) ===
          normalizeAnswer(question.correctAnswer),
        explanation: question.explanation ?? null,
      };
    });

    res.status(200).json({
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/attempts/:attemptId/review-chat", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

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
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (!attempt.completedAt) {
      res.status(400).json({ error: "Assessment not completed yet" });
      return;
    }

    if (attempt.reviewChatId) {
      res.status(200).json({ chatId: attempt.reviewChatId });
      return;
    }

    const questions = toAssessmentQuestions(attempt.questions);
    const answers = Array.isArray(attempt.answers)
      ? (attempt.answers as AssessmentAnswerPayload[])
      : [];
    const { prompt, fallbackReviewText } = buildReviewPromptData(
      questions,
      answers
    );

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

    res.status(201).json({
      chatId: updatedAttempt.reviewChatId ?? reviewChat.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
