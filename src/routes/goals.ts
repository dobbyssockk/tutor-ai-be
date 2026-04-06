import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";
import { GoalStatus, GoalTopicStatus } from "@prisma/client";

import prisma from "../db/prisma";
import { ASSESSMENT_QUESTION_COUNT } from "../config";
import { requireAuth } from "../middleware/requireAuth";
import { generateAssessmentQuestions, generateGoalProgram } from "../libs/openai";
import {
  AssessmentQuestion,
  normalizeGeneratedQuestions,
  toAssessmentQuestions,
} from "../services/assessment";
import {
  addWeeks,
  completeTopicIfReady,
  normalizeProgramTopics,
} from "../services/goalService";
import { createChatWithPrompt } from "../services/chatService";

const router = Router();

router.use(requireAuth);

const normalizeSubtopics = (value: unknown) =>
  Array.isArray(value)
    ? (value as string[]).map((item) => String(item).trim()).filter(Boolean)
    : [];

router.get("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { topics: { orderBy: { order: "asc" } } },
    });

    res.status(200).json({ goals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const {
      title,
      description,
      currentLevel,
      targetLevel,
      minutesPerDay,
      notes,
    } = req.body as {
      title?: string;
      description?: string;
      currentLevel?: string;
      targetLevel?: string;
      minutesPerDay?: number;
      notes?: string;
    };

    const trimmedTitle = (title || "").trim();
    const trimmedDescription = (description || "").trim();
    const trimmedCurrentLevel = currentLevel?.trim();
    const trimmedTargetLevel = targetLevel?.trim();
    const trimmedNotes = notes?.trim();
    const normalizedMinutes = Math.floor(Number(minutesPerDay) || 0);

    if (!trimmedTitle) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const programDescription =
      trimmedDescription || trimmedNotes || trimmedTitle;

    if (!normalizedMinutes || normalizedMinutes < 5) {
      res.status(400).json({ error: "Minutes per day is required" });
      return;
    }

    const generatedTopics = await generateGoalProgram({
      discipline: trimmedTitle,
      description: programDescription,
      currentLevel: trimmedCurrentLevel || null,
      targetLevel: trimmedTargetLevel || null,
      minutesPerDay: normalizedMinutes,
      notes: trimmedNotes || null,
    });

    const programTopics = normalizeProgramTopics(generatedTopics);

    if (programTopics.length === 0) {
      res.status(400).json({ error: "Generated program is invalid" });
      return;
    }

    const goal = await prisma.goal.create({
      data: {
        title: trimmedTitle,
        description: trimmedDescription || trimmedNotes || null,
        currentLevel: trimmedCurrentLevel || null,
        targetLevel: trimmedTargetLevel || null,
        minutesPerDay: normalizedMinutes,
        notes: trimmedNotes || null,
        status: GoalStatus.todo,
        userId,
        topics: {
          create: programTopics.map((topic, index) => ({
            order: index + 1,
            title: topic.title,
            summary: topic.summary,
            subtopics: topic.subtopics,
            durationWeeks: topic.durationWeeks,
            status:
              index === 0
                ? GoalTopicStatus.in_progress
                : GoalTopicStatus.locked,
            startAt: null,
            dueAt: null,
          })),
        },
      },
      include: { topics: { orderBy: { order: "asc" } } },
    });

    res.status(201).json({ goal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:goalId", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { goalId } = req.params;

    const existing = await prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    await prisma.goal.delete({ where: { id: goalId } });
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/:goalId/topics/:topicId/lesson",
  async (req: JWTRequest, res) => {
    try {
      const userId = req.auth!.sub!;
      const { goalId, topicId } = req.params;
      const { regenerate } = (req.body ?? {}) as { regenerate?: boolean };

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
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      const allowRegenerate =
        Boolean(regenerate) && topic.status === GoalTopicStatus.done;
      if (topic.status !== GoalTopicStatus.in_progress && !allowRegenerate) {
        res.status(403).json({ error: "Topic is not available" });
        return;
      }

      if (topic.lessonChatId) {
        if (!allowRegenerate) {
          const existingChat = await prisma.chat.findFirst({
            where: { id: topic.lessonChatId, userId },
            select: { id: true },
          });
          if (existingChat) {
            res.status(200).json({ chatId: topic.lessonChatId });
            return;
          }
        }

        await prisma.goalTopic.update({
          where: { id: topic.id },
          data: { lessonChatId: null },
        });
      }

      const subtopics = normalizeSubtopics(topic.subtopics);
      const subtopicsLine =
        subtopics.length > 0
          ? `Подтемы: ${subtopics.join(", ")}.`
          : "Подтемы не указаны.";

      const prompt = [
        `### Наставник по дисциплине: ${topic.goal.title}`,
        `**Цель:** ${topic.goal.description || "не указана"}`,
        topic.goal.currentLevel
          ? `**Текущий уровень:** ${topic.goal.currentLevel}`
          : null,
        topic.goal.targetLevel
          ? `**Целевой уровень:** ${topic.goal.targetLevel}`
          : null,
        topic.goal.minutesPerDay
          ? `**Доступное время:** ${topic.goal.minutesPerDay} минут в день`
          : null,
        null,
        `**Текущая тема:** ${topic.title}`,
        topic.summary ? `**Кратко о теме:** ${topic.summary}` : null,
        subtopicsLine,
        null,
        "**Задача:** проведи урок, объясни ключевые идеи, дай 2-3 контрольных вопроса и короткое домашнее задание.",
      ]
        .filter(Boolean)
        .join("\n");

      const chat = await createChatWithPrompt(
        userId,
        prompt,
        `Урок: ${topic.title}`
      );

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

      res.status(201).json({ chatId: chat.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/:goalId/topics/:topicId/assessment",
  async (req: JWTRequest, res) => {
    try {
      const userId = req.auth!.sub!;
      const { goalId, topicId } = req.params;
      const { regenerate } = (req.body ?? {}) as { regenerate?: boolean };

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
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      if (topic.status !== GoalTopicStatus.in_progress) {
        res.status(403).json({ error: "Topic is not available" });
        return;
      }

      const existingAssessment = await prisma.assessment.findFirst({
        where: { goalTopicId: topic.id, isActive: true },
      });

      if (existingAssessment && !regenerate) {
        const questions = toAssessmentQuestions(existingAssessment.questions);
        res.status(200).json({
          assessment: {
            id: existingAssessment.id,
            title: existingAssessment.title,
            description: existingAssessment.description,
            topic: existingAssessment.topic,
            level: existingAssessment.level,
            questionCount: questions.length,
          },
        });
        return;
      }

      const subtopics = normalizeSubtopics(topic.subtopics);
      const goalContext = [
        `Дисциплина: ${topic.goal.title}.`,
        `Текущая тема: ${topic.title}.`,
        subtopics.length > 0
          ? `Подтемы: ${subtopics.join(", ")}.`
          : "Подтемы: не указаны.",
      ].join("\n");

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
          const recent = lessonChat.messages.slice(-8);
          lessonContext = recent
            .map((message) => {
              const roleLabel =
                message.role === "assistant" ? "Тьютор" : "Ученик";
              const text = message.outputText
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 280);
              return `${roleLabel}: ${text}`;
            })
            .filter((line) => line.length > 0)
            .join("\n");
        }
      }

      const questionCount = ASSESSMENT_QUESTION_COUNT;
      let normalizedQuestions: AssessmentQuestion[] = [];
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const generated = await generateAssessmentQuestions({
            topic: topic.title,
            questionCount,
            level: topic.goal.currentLevel ?? null,
            goalContext,
            lessonContext,
            extraInstructions:
              attempt > 0
                ? "Предыдущий ответ был некорректным: варианты были пустыми или состояли из букв A/B/C/D. Верни содержательные варианты."
                : null,
          });

          normalizedQuestions = normalizeGeneratedQuestions(
            generated,
            questionCount
          );

          if (normalizedQuestions.length >= questionCount) {
            break;
          }
          console.warn("Assessment questions normalized count too low", {
            attempt,
            normalized: normalizedQuestions.length,
            expected: questionCount,
          });
        } catch (err) {
          lastError = err;
        }
      }

      if (normalizedQuestions.length < questionCount) {
        console.error("Generated assessment invalid", lastError);
        res.status(400).json({ error: "Generated assessment is invalid" });
        return;
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

      res.status(201).json({
        assessment: {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          topic: assessment.topic,
          level: assessment.level,
          questionCount: normalizedQuestions.length,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
