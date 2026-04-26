import {
  AssessmentAnswerPayload,
  AssessmentQuestion,
  buildAssessmentPrompt,
  buildAttemptResults,
} from "../assessment";

export const buildReviewPromptData = (
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
    prompt,
    fallbackReviewText,
  };
};

export const buildReviewChatTitle = ({
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
