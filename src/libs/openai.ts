import OpenAI from "openai";

import { OPENAI_API_KEY } from "../config";
import INSTRUCTIONS from "./instructions/chatbotInstructions";
import { postprocessAssistantOutput } from "./openai/postprocess";
import { extractJson } from "./openai/postprocess/utils";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type Message = {
  role: "user" | "assistant";
  outputText: string;
};

type AssessmentGenerationInput = {
  topic: string;
  questionCount: number;
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

type GeneratedAssessmentQuestion = {
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
};

type GeneratedGoalTopic = {
  title: string;
  summary?: string;
  durationWeeks?: number;
  subtopics?: string[];
};

const VISUALIZATION_SYSTEM_PROMPT = [
  "Если пользователь просит интерактивный график, добавляй в конце блок ```interactive с JSON (без HTML/JS/CSS).",
  "Для параболы используй interactive type=quadratic_explorer: {\"type\":\"quadratic_explorer\",\"params\":{\"a\":1,\"b\":-4,\"c\":3},\"ranges\":{\"a\":{\"min\":-5,\"max\":5,\"step\":0.1},\"b\":{\"min\":-10,\"max\":10,\"step\":0.1},\"c\":{\"min\":-10,\"max\":10,\"step\":0.1}}}.",
  "Для линейной функции используй interactive type=linear_explorer и НЕ добавляй параметр a: {\"type\":\"linear_explorer\",\"params\":{\"slope\":2,\"intercept\":1},\"ranges\":{\"slope\":{\"min\":-10,\"max\":10,\"step\":0.1},\"intercept\":{\"min\":-10,\"max\":10,\"step\":0.1}}}.",
  "Для тригонометрии используй interactive type=trig_explorer: {\"type\":\"trig_explorer\",\"function\":\"sin|cos|tan\",\"params\":{\"amplitude\":1,\"frequency\":1,\"phase\":0,\"offset\":0},\"ranges\":{\"amplitude\":{\"min\":-5,\"max\":5,\"step\":0.1},\"frequency\":{\"min\":-5,\"max\":5,\"step\":0.1},\"phase\":{\"min\":-6.2832,\"max\":6.2832,\"step\":0.1},\"offset\":{\"min\":-10,\"max\":10,\"step\":0.1}}}.",
  "Если пользователь просит сравнить две функции на одном графике (например sin и cos), используй interactive type=comparison_explorer в режиме overlay: {\"type\":\"comparison_explorer\",\"mode\":\"overlay\",\"series\":[{\"id\":\"f1\",\"label\":\"sin\",\"color\":\"#1d4ed8\",\"spec\":{\"type\":\"trig_explorer\",\"function\":\"sin\",\"params\":{\"amplitude\":1,\"frequency\":1,\"phase\":0,\"offset\":0},\"ranges\":{\"amplitude\":{\"min\":-5,\"max\":5,\"step\":0.1},\"frequency\":{\"min\":-5,\"max\":5,\"step\":0.1},\"phase\":{\"min\":-6.2832,\"max\":6.2832,\"step\":0.1},\"offset\":{\"min\":-10,\"max\":10,\"step\":0.1}}}},{\"id\":\"f2\",\"label\":\"cos\",\"color\":\"#dc2626\",\"spec\":{\"type\":\"trig_explorer\",\"function\":\"cos\",\"params\":{\"amplitude\":1,\"frequency\":1,\"phase\":0,\"offset\":0},\"ranges\":{\"amplitude\":{\"min\":-5,\"max\":5,\"step\":0.1},\"frequency\":{\"min\":-5,\"max\":5,\"step\":0.1},\"phase\":{\"min\":-6.2832,\"max\":6.2832,\"step\":0.1},\"offset\":{\"min\":-10,\"max\":10,\"step\":0.1}}}}]}.",
  "Для последовательностей этапов/сюжетов/процессов (биология, литература, история) используй interactive type=timeline_explorer и делай каждый шаг содержательным: details + keyPoints (3-5) + outcomes (1-3) + terms (2-6) + checkQuestion + checkAnswer + commonMistake. Пример: {\"type\":\"timeline_explorer\",\"title\":\"Этапы митоза\",\"subject\":\"biology\",\"steps\":[{\"id\":\"s1\",\"title\":\"Профаза\",\"details\":\"...\",\"keyPoints\":[\"...\",\"...\",\"...\"],\"outcomes\":[\"...\"],\"terms\":[\"хроматин\",\"веретено деления\"],\"checkQuestion\":\"Что происходит с хромосомами в профазе?\",\"checkAnswer\":\"Они конденсируются и становятся видимыми.\",\"commonMistake\":\"Путать профазу и метафазу.\"},{\"id\":\"s2\",\"title\":\"Метафаза\",\"details\":\"...\",\"keyPoints\":[\"...\",\"...\",\"...\"],\"outcomes\":[\"...\"],\"terms\":[\"экватор клетки\"],\"checkQuestion\":\"...\",\"checkAnswer\":\"...\"}],\"initialStepId\":\"s1\"}.",
  "Для фото/видео-материалов по теме (биология, литература и т.п.) используй interactive type=media_gallery_explorer: {\"type\":\"media_gallery_explorer\",\"title\":\"Галерея по теме\",\"subject\":\"biology\",\"query\":\"animal cell\",\"mediaType\":\"image\",\"limit\":6}.",
  "Если запрос про неподдерживаемую визуализацию (геометрические фигуры, 3D-тела, конус и т.п.), не создавай interactive JSON и прямо сообщай, что это не поддерживается.",
  "Если пользователь обсуждает функцию или уравнение, указывай уравнение в явном виде (например y=2x+1 или y=x^2-3x+2), даже если добавляешь interactive-блок.",
  "Возвращай интерактив в формате visual block ```interactive (без HTML/JS/CSS).",
  "Никогда не генерируй и не предлагай выполнять произвольный JavaScript внутри ответа.",
  "Если не хватает данных для корректной визуализации, явно скажи об этом.",
].join(" ");

const FOLLOW_UP_SUGGESTIONS_PROMPT = [
  "Когда после ответа есть очевидные полезные следующие шаги для ученика, добавь в самый конец ответа блок ```suggestions с JSON-массивом из 2-4 строк.",
  "Каждая строка должна быть готовым коротким сообщением от лица пользователя, которое можно отправить следующим: например [\"Объясни проще\", \"Дай пример\", \"Проверь меня вопросом\"].",
  "Не добавляй suggestions, если ответ является коротким финальным подтверждением, ошибкой, техническим сообщением или если полезных следующих шагов нет.",
  "Не повторяй в suggestions сам ответ и не добавляй пояснение к блоку. Только JSON-массив строк внутри ```suggestions.",
].join(" ");
const OPENAI_MODEL = "gpt-4o-mini";

const buildSystemMessages = (
  tutorInstructions?: string | null,
  displayName?: string | null
) => {
  const systemMessages = [
    {
      role: "system" as const,
      content: INSTRUCTIONS,
    },
    {
      role: "system" as const,
      content: VISUALIZATION_SYSTEM_PROMPT,
    },
    {
      role: "system" as const,
      content: FOLLOW_UP_SUGGESTIONS_PROMPT,
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

  return systemMessages;
};

const requestJsonPayload = async <T>(
  systemPrompt: string,
  promptLines: string[],
  errorMessage: string,
  parsePayload: (value: unknown) => T | null
) => {
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: promptLines.join("\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw new Error(errorMessage);
  }

  const payload = parsePayload(parsed);
  if (!payload) {
    throw new Error(errorMessage);
  }

  return payload;
};

export const generateGPT = async (
  context: Message[],
  tutorInstructions?: string | null,
  displayName?: string | null
) => {
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        ...buildSystemMessages(tutorInstructions, displayName),
        ...context.map((m) => ({
          role: m.role,
          content: m.outputText,
        })),
      ],
    });

    const content = completion.choices[0].message.content ?? "";
    const lastUserInput = [...context]
      .reverse()
      .find((message) => message.role === "user")?.outputText;
    return postprocessAssistantOutput(content, lastUserInput);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OpenAI request failed";
    throw new Error(message);
  }
};

export const generateAssessmentQuestions = async ({
  topic,
  questionCount,
  level,
  goalContext,
  lessonContext,
  extraInstructions,
}: AssessmentGenerationInput): Promise<GeneratedAssessmentQuestion[]> => {
  const promptLines = [
    `Создай ${questionCount} развернутых вопросов с вариантами ответов по теме "${topic}".`,
    `Нужно вернуть ровно ${questionCount} вопросов.`,
    level ? `Уровень сложности: ${level}.` : "Уровень сложности: смешанный.",
    "Каждый вопрос должен быть конкретным и по сути темы (без общих фраз).",
    "Формулируй вопросы не слишком коротко: 1-2 предложения, с контекстом.",
    "Каждый вопрос должен иметь 4 варианта и ровно 1 правильный ответ.",
    "Это single-choice тест: у ученика только один выбор.",
    "Варианты ответов должны быть содержательными (не буквы A/B/C/D), по 2-6 слов.",
    "Варианты ответа должны быть взаимоисключающими: не допускай эквивалентных вариантов (например, 6/4 и 3/2).",
    "Запрещено добавлять синонимы или перефразировки одного и того же ответа среди 4 вариантов.",
    "Для чисел/дробей/процентов запрещены математически равные варианты (например 0.5, 1/2, 50%).",
    "Перед финальным ответом выполни самопроверку: у каждого вопроса ровно один истинный вариант, остальные 3 точно ложные.",
    "Если самопроверка не проходит хотя бы для одного вопроса, полностью пересоздай набор вопросов и верни только исправленный JSON.",
    "Случайным образом распределяй правильные ответы по вариантам (без шаблона).",
    "Не используй паттерны вроде 'всегда вариант A'.",
    "Не создавай вопросы, требующие внешней визуализации: нельзя ссылаться на график/диаграмму/рисунок/схему/таблицу, которых нет в тексте вопроса.",
    "Каждый вопрос должен быть полностью решаем только по тексту вопроса и вариантам ответа.",
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
  ].filter((line): line is string => Boolean(line));

  return requestJsonPayload(
    "You generate strict single-choice assessment questions. Exactly one option must be correct in each question, and no equivalent answers are allowed. Respond with valid JSON only.",
    promptLines,
    "Invalid assessment response",
    (value) => {
      if (
        value &&
        typeof value === "object" &&
        "questions" in value &&
        Array.isArray((value as { questions?: unknown }).questions)
      ) {
        return (value as { questions: GeneratedAssessmentQuestion[] }).questions;
      }
      return null;
    }
  );
};

export const generateGoalProgram = async ({
  discipline,
  description,
  currentLevel,
  targetLevel,
  minutesPerDay,
  notes,
}: GoalProgramInput): Promise<GeneratedGoalTopic[]> => {
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

  return requestJsonPayload(
    "You generate learning programs. Respond with valid JSON only.",
    promptLines,
    "Invalid program response",
    (value) => {
      if (
        value &&
        typeof value === "object" &&
        "topics" in value &&
        Array.isArray((value as { topics?: unknown }).topics)
      ) {
        return (value as { topics: GeneratedGoalTopic[] }).topics;
      }
      return null;
    }
  );
};
