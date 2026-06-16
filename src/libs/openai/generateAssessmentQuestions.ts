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
    "Три обязательные характеристики конструирования теста (соблюдай все):",
    "1) Надёжность: формулировка вопроса и вариантов недвусмысленна; ровно один вариант объективно верен; дистракторы правдоподобны, но при верном понимании темы заведомо неверны; разные читатели приходят к одному ключу.",
    "2) Валидность: вопросы проверяют именно смысл темы и цели обучения из контекста (дисциплина, подтемы, фрагменты урока), а не общие фразы, угадывание формулировки или навыки, к теме не относящиеся.",
    "3) Детерминированность оценивания: correctAnswer должен быть дословно равен одной из четырёх строк в options (тот же текст, те же символы и пробелы); не используй варианты, различающиеся только регистром или лишними пробелами — приложение сравнивает ответ ученика с ключом в нижнем регистре.",
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
    "Достоверность и опора на материал:",
    lessonContext?.trim()
      ? "Если есть фрагменты урока выше — не придумывай конкретные факты (даты, имена, цифры, определения, цитаты), которых нет в этом тексте; формулируй вопросы так, чтобы верный ответ следовал из переданного урока или общезначимых определений по теме."
      : "Без фрагментов урока опирайся на общепринятые учебные сведения по теме; избегай спорных узкоспециальных утверждений и «фактов», которые нельзя проверить из текста вопроса.",
    "Не ссылайся на вымышленные источники, URL, номера страниц или учебники, которых нет в контексте.",
    "Поле explanation: 1–3 предложения — почему выбранный вариант верен и как это вытекает из условия вопроса или из контекста урока/цели (без фальшивых ссылок на литературу).",
    extraInstructions?.trim() ? extraInstructions.trim() : null,
    "Верни только JSON со следующей структурой:",
    "Если дисциплина связана с изучением языка, то вопросы/ответы должны быть на языке, который изучается.",
    '{ "questions": [ { "prompt": "...", "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"], "correctAnswer": "Вариант 2", "explanation": "..." } ] }',
  ].filter((line): line is string => Boolean(line));

  return requestJsonPayload(
    "You generate strict single-choice assessment questions. Optimize for: (1) reliability — unambiguous stems and distractors, exactly one defensible correct option; (2) validity — alignment with provided goal/lesson context, not trivia; (3) deterministic scoring — correctAnswer must be an exact string copy of one entry in options. Do not invent lesson-specific facts absent from lessonContext. No fake citations or URLs. Valid JSON only.",
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
