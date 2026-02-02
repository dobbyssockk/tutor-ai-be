import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";
import { GoalTopicStatus } from "@prisma/client";

import prisma from "../db/prisma";
import { PASSING_SCORE } from "../config";
import { requireAuth } from "../middleware/requireAuth";
import {
  AssessmentAnswerPayload,
  AssessmentQuestion,
  buildAssessmentPrompt,
  buildAttemptResults,
  sanitizeQuestions,
} from "../services/assessment";
import { completeTopicIfReady } from "../services/goalService";
import { generateGPT } from "../libs/openai";

const router = Router();

router.use(requireAuth);

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
      const questions = Array.isArray(assessment.questions)
        ? assessment.questions
        : [];
      const lastAttempt = lastCompleted.get(assessment.id);
      let canStart = true;
      let nextAvailableAt: string | null = null;

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
      let passesRequired = 1;
      if (assessment.goalTopic?.dueAt) {
        const dueAtDate = new Date(assessment.goalTopic.dueAt);
        const hasPassBeforeDeadline = passingAttempts.some(
          (attempt) => attempt.completedAt && attempt.completedAt <= dueAtDate
        );
        if (now > dueAtDate && !hasPassBeforeDeadline) {
          passesRequired = 2;
        }
      }

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
        canStart,
        nextAvailableAt,
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

    const lastCompletedAttempt = await prisma.assessmentAttempt.findFirst({
      where: {
        assessmentId: assessment.id,
        userId,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
    });

    const lastAttemptPassed =
      typeof lastCompletedAttempt?.score === "number" &&
      lastCompletedAttempt.score >= PASSING_SCORE;

    const questions = Array.isArray(assessment.questions)
      ? (assessment.questions as AssessmentQuestion[])
      : [];
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
      attempt: {
        id: attempt.id,
        assessmentId: attempt.assessmentId,
        questions: sanitizeQuestions(questions),
        totalCount: attempt.totalCount ?? questions.length,
        createdAt: attempt.createdAt,
      },
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
      include: { assessment: { select: { goalTopicId: true } } },
    });

    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    const questions = Array.isArray(attempt.questions)
      ? (attempt.questions as AssessmentQuestion[])
      : [];

    res.status(200).json({
      attempt: {
        id: attempt.id,
        assessmentId: attempt.assessmentId,
        questions: sanitizeQuestions(questions),
        totalCount: attempt.totalCount ?? questions.length,
        createdAt: attempt.createdAt,
      },
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

    const questions = Array.isArray(attempt.questions)
      ? (attempt.questions as AssessmentQuestion[])
      : [];

    const { mistakes, correctCount, totalCount, score } = buildAttemptResults(
      questions,
      answers
    );
    const isPassingScore = score >= PASSING_SCORE;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        tutorInstructions: true,
        displayName: true,
        email: true,
      },
    });
    const prompt = buildAssessmentPrompt(mistakes);

    const assistantOutputText = await generateGPT(
      [{ role: "user", outputText: prompt }],
      user?.tutorInstructions,
      user?.displayName
    );

    const reviewChat = await prisma.chat.create({
      data: {
        title: "Assessment review",
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
      where: { id: attemptId },
      data: {
        answers,
        score,
        correctCount,
        totalCount,
        completedAt: new Date(),
        reviewChatId: reviewChat.id,
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
        let passesRequired = 1;
        if (topic.dueAt) {
          const dueAtDate = new Date(topic.dueAt);
          const hasPassBeforeDeadline = passingAttempts.some(
            (item) => item.completedAt && item.completedAt <= dueAtDate
          );
          if (new Date() > dueAtDate && !hasPassBeforeDeadline) {
            passesRequired = 2;
          }
        }

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
      chatId: reviewChat.id,
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

    if (!attempt.completedAt || !attempt.reviewChatId) {
      res.status(400).json({ error: "Assessment not completed yet" });
      return;
    }

    const totalCount = attempt.totalCount ?? 0;
    const correctCount = attempt.correctCount ?? 0;
    const questions = Array.isArray(attempt.questions)
      ? (attempt.questions as AssessmentQuestion[])
      : [];
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
        isCorrect: userAnswer === question.correctAnswer,
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
        chatId: attempt.reviewChatId,
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

export default router;
