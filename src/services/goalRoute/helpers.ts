import { ASSESSMENT_QUESTION_COUNT } from "../../config";
import { generateAssessmentQuestions } from "../../libs/openai";
import {
  AssessmentQuestion,
  normalizeGeneratedQuestions,
} from "../assessment";

export const normalizeSubtopics = (value: unknown) =>
  Array.isArray(value)
    ? (value as string[]).map((item) => String(item).trim()).filter(Boolean)
    : [];

export const buildLessonPrompt = (topic: {
  title: string;
  summary: string | null;
  subtopics: unknown;
  goal: {
    title: string;
    description: string | null;
    currentLevel: string | null;
    targetLevel: string | null;
    minutesPerDay: number | null;
  };
}) => {
  const subtopics = normalizeSubtopics(topic.subtopics);
  const subtopicsLine =
    subtopics.length > 0
      ? `Подтемы: ${subtopics.join(", ")}.`
      : "Подтемы не указаны.";

  return [
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
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

export const buildGoalContext = (topic: {
  title: string;
  subtopics: unknown;
  goal: { title: string };
}) => {
  const subtopics = normalizeSubtopics(topic.subtopics);
  return [
    `Дисциплина: ${topic.goal.title}.`,
    `Текущая тема: ${topic.title}.`,
    subtopics.length > 0
      ? `Подтемы: ${subtopics.join(", ")}.`
      : "Подтемы: не указаны.",
  ].join("\n");
};

export const buildLessonContext = (
  messages: Array<{ role: string; outputText: string }>
) => {
  if (!messages.length) return null;

  const recent = messages.slice(-8);
  const text = recent
    .map((message) => {
      const roleLabel = message.role === "assistant" ? "Тьютор" : "Ученик";
      const normalized = message.outputText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
      return `${roleLabel}: ${normalized}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");

  return text || null;
};

export const generateTopicAssessmentQuestions = async (params: {
  topicTitle: string;
  currentLevel: string | null;
  goalContext: string;
  lessonContext: string | null;
}) => {
  const { topicTitle, currentLevel, goalContext, lessonContext } = params;
  const questionCount = ASSESSMENT_QUESTION_COUNT;

  let normalizedQuestions: AssessmentQuestion[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const generated = await generateAssessmentQuestions({
        topic: topicTitle,
        questionCount,
        level: currentLevel,
        goalContext,
        lessonContext,
        extraInstructions:
          attempt > 0
            ? "Предыдущий ответ был некорректным: варианты были пустыми или состояли из букв A/B/C/D. Верни содержательные варианты."
            : null,
      });

      normalizedQuestions = normalizeGeneratedQuestions(generated, questionCount);

      if (normalizedQuestions.length >= questionCount) {
        return normalizedQuestions;
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

  console.error("Generated assessment invalid", lastError);
  return null;
};

export const toAssessmentSummary = (
  assessment: {
    id: string;
    title: string;
    description: string | null;
    topic: string | null;
    level: string | null;
  },
  questionCount: number
) => ({
  id: assessment.id,
  title: assessment.title,
  description: assessment.description,
  topic: assessment.topic,
  level: assessment.level,
  questionCount,
});

export const toCreateGoalPayload = (body: unknown) => {
  const value = (body ?? {}) as {
    title?: string;
    description?: string;
    currentLevel?: string;
    targetLevel?: string;
    minutesPerDay?: number;
    notes?: string;
  };

  const trimmedTitle = (value.title || "").trim();
  const trimmedDescription = (value.description || "").trim();
  const trimmedCurrentLevel = value.currentLevel?.trim();
  const trimmedTargetLevel = value.targetLevel?.trim();
  const trimmedNotes = value.notes?.trim();
  const normalizedMinutes = Math.floor(Number(value.minutesPerDay) || 0);

  return {
    trimmedTitle,
    trimmedDescription,
    trimmedCurrentLevel,
    trimmedTargetLevel,
    trimmedNotes,
    normalizedMinutes,
    programDescription: trimmedDescription || trimmedNotes || trimmedTitle,
  };
};
