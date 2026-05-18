import { requestJsonPayload } from "./requestJson";

export type AssessmentGenerationInput = {
  topic: string;
  questionCount: number;
  level?: string | null;
  goalContext?: string | null;
  lessonContext?: string | null;
  extraInstructions?: string | null;
};

export type GeneratedAssessmentQuestion = {
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
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
    goalContext?.trim() ? "Все вопросы и варианты должны опираться на этот контекст." : null,
    lessonContext?.trim() ? "Фрагменты урока (используй формулировки и детали отсюда):" : null,
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
