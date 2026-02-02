import "../env";

import OpenAI from "openai";
import INSTRUCTIONS from "./instructions/chatbotInstructions";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

type Message = {
  role: "user" | "assistant";
  outputText: string;
};

type AssessmentGenerationInput = {
  topic: string;
  level?: string | null;
  goalContext?: string | null;
  lessonContext?: string | null;
  extraInstructions?: string | null;
};

type GoalProgramInput = {
  discipline: string;
  description: string;
  currentLevel?: string | null;
  targetLevel?: string | null;
  minutesPerDay: number;
  notes?: string | null;
};

const extractJson = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
  }
  return trimmed;
};

export const generateGPT = async (
  context: Message[],
  tutorInstructions?: string | null,
  displayName?: string | null
) => {
  try {
    const systemMessages = [
      {
        role: "system" as const,
        content: INSTRUCTIONS,
      },
    ];

    if (tutorInstructions?.trim()) {
      systemMessages.push({
        role: "system",
        content: `User preferences:\n${tutorInstructions.trim()}`,
      });
    }

    if (displayName?.trim()) {
      systemMessages.push({
        role: "system",
        content: `User's name: ${displayName.trim()}. Use this name when appropriate.`,
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        ...systemMessages,
        ...context.map(m => ({
          role: m.role,
          content: m.outputText,
        })),
      ],
    });

    return completion.choices[0].message.content ?? "";
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OpenAI request failed";
    throw new Error(message);
  }
};

export const generateAssessmentQuestions = async ({
  topic,
  level,
  goalContext,
  lessonContext,
  extraInstructions,
}: AssessmentGenerationInput) => {
  const promptLines = [
    `Создай 3 развернутых вопросов с вариантами ответов по теме "${topic}".`,
    level ? `Уровень сложности: ${level}.` : "Уровень сложности: смешанный.",
    "Каждый вопрос должен быть конкретным и по сути темы (без общих фраз).",
    "Формулируй вопросы не слишком коротко: 1-2 предложения, с контекстом.",
    "Каждый вопрос должен иметь 4 варианта и ровно 1 правильный ответ.",
    "Варианты ответов должны быть содержательными (не буквы A/B/C/D), по 2-6 слов.",
    "Случайным образом распределяй правильные ответы по вариантам (без шаблона).",
    "Не используй паттерны вроде 'всегда вариант A'.",
    "Если указан контекст дисциплины/подтем — делай вопросы строго в рамках этих рамок.",
    goalContext?.trim() ? "Контекст дисциплины и темы:" : null,
    goalContext?.trim() ? goalContext.trim() : null,
    goalContext?.trim()
      ? "Все вопросы и варианты должны опираться на этот контекст."
      : null,
    lessonContext?.trim()
      ? "Фрагменты урока (используй формулировки и детали отсюда):"
      : null,
    lessonContext?.trim() ? lessonContext.trim() : null,
    extraInstructions?.trim() ? extraInstructions.trim() : null,
    "Верни только JSON со следующей структурой:",
    "Если дисциплина связана с изучением языка, то вопросы/ответы должны быть на языке, который изучается.",
    '{ "questions": [ { "prompt": "...", "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"], "correctAnswer": "Вариант 2", "explanation": "..." } ] }',
  ].filter(Boolean);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You generate assessment questions. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: promptLines.join("\n"),
      },
    ],
  });

  const content = completion.choices[0].message.content ?? "";
  const parsed = JSON.parse(extractJson(content));

  if (!parsed?.questions || !Array.isArray(parsed.questions)) {
    throw new Error("Invalid assessment response");
  }

  return parsed.questions as Array<{
    prompt: string;
    options: string[];
    correctAnswer: string;
    explanation?: string;
  }>;
};

export const generateGoalProgram = async ({
  discipline,
  description,
  currentLevel,
  targetLevel,
  minutesPerDay,
  notes,
}: GoalProgramInput) => {
  const promptLines = [
    `Create a learning program for "${discipline}".`,
    `Learner description: ${description}.`,
    currentLevel ? `Current level: ${currentLevel}.` : "Current level: unknown.",
    targetLevel ? `Target level: ${targetLevel}.` : "Target level: not specified.",
    `Available time: ${minutesPerDay} minutes per day.`,
    notes ? `Additional context: ${notes}.` : "Additional context: none.",
    "If this discipline/class exists on Yaklass, mirror Yaklass section titles 1:1 and keep the same structure.",
    "Return a structured program with topics, subtopics, and duration in weeks.",
    "Keep durations realistic for the available time.",
    "Return JSON only with this shape:",
    '{ "topics": [ { "title": "...", "summary": "...", "durationWeeks": 2, "subtopics": ["..."] } ] }',
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You generate learning programs. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: promptLines.join("\n"),
      },
    ],
  });

  const content = completion.choices[0].message.content ?? "";
  const parsed = JSON.parse(extractJson(content));

  if (!parsed?.topics || !Array.isArray(parsed.topics)) {
    throw new Error("Invalid program response");
  }

  return parsed.topics as Array<{
    title: string;
    summary?: string;
    durationWeeks?: number;
    subtopics?: string[];
  }>;
};
