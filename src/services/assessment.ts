export type AssessmentQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
};

export type AssessmentAnswerPayload = {
  questionId: string;
  answer: string;
};

export const sanitizeQuestions = (questions: AssessmentQuestion[]) =>
  questions.map(({ id, prompt, options }) => ({ id, prompt, options }));

export const buildAssessmentPrompt = (
  mistakes: Array<{
    prompt: string;
    answer: string;
    correctAnswer: string;
    explanation?: string;
  }>
) => {
  if (mistakes.length === 0) {
    return [
      "### Итоги теста",
      "**Результат:** все ответы верные.",
      "",
      "**Попросить тьютора:**",
      "- Дай короткое резюме того, что получилось хорошо.",
      "- Предложи один следующий шаг для дальнейшего обучения.",
    ].join("\n");
  }

  const details = mistakes
    .map((mistake, index) => {
      const explanation = mistake.explanation
        ? mistake.explanation
        : "Пояснение не указано.";
      return [
        `#### Ошибка ${index + 1}`,
        `- **Вопрос:** ${mistake.prompt}`,
        `- **Мой ответ:** ${mistake.answer || "Нет ответа"}`,
        `- **Правильный ответ:** ${mistake.correctAnswer}`,
        `- **Пояснение:** ${explanation}`,
      ].join("\n");
    })
    .join("\n");

  return [
    "### Разбор ошибок",
    "Пожалуйста, объясни эти ошибки пошагово в дружелюбной форме.",
    "",
    details,
    "",
    "**Попросить тьютора:** Дай один короткий совет в конце.",
  ].join("\n");
};

const normalizeOption = (option: string) =>
  option.replace(/^[A-Da-d][\).\-\:]\s+/, "").trim();

export const buildAttemptResults = (
  questions: AssessmentQuestion[],
  answers: AssessmentAnswerPayload[]
) => {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionId, answer.answer])
  );

  const results = questions.map((question) => {
    const answer = answerMap.get(question.id) ?? "";
    const isCorrect = answer === question.correctAnswer;
    return {
      question,
      answer,
      isCorrect,
    };
  });

  const mistakes = results
    .filter((result) => !result.isCorrect)
    .map((result) => ({
      prompt: result.question.prompt,
      answer: result.answer,
      correctAnswer: result.question.correctAnswer,
      explanation: result.question.explanation,
    }));

  const correctCount = results.filter((result) => result.isCorrect).length;
  const totalCount = questions.length;
  const score = totalCount
    ? Math.round((correctCount / totalCount) * 100)
    : 0;

  return {
    mistakes,
    correctCount,
    totalCount,
    score,
  };
};

const isQuestionValid = (question: AssessmentQuestion) => {
  const options = Array.isArray(question.options) ? question.options : [];
  return (
    Boolean(question.prompt?.trim()) &&
    options.length === 4 &&
    options.every((option) => Boolean(option?.trim())) &&
    options.includes(question.correctAnswer)
  );
};

export const normalizeGeneratedQuestions = (
  questions: Array<{
    prompt?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
  }>,
  count: number
) => {
  const normalized: AssessmentQuestion[] = [];

  for (const question of questions) {
    const prompt = question.prompt?.trim();
    if (!prompt) continue;

    let options = Array.isArray(question.options)
      ? question.options.map((option) => normalizeOption(option || ""))
      : [];
    options = options.filter(
      (option) => option.length > 0 && !/^[A-D]$/i.test(option)
    );

    if (options.length < 4) {
      continue;
    }
    if (options.length > 4) {
      options = options.slice(0, 4);
    }

    let correctAnswer = question.correctAnswer?.trim() || "";
    if (!correctAnswer) continue;

    const letterMatch = correctAnswer.match(/^[A-D]$/i);
    if (letterMatch) {
      const index = correctAnswer.toUpperCase().charCodeAt(0) - 65;
      if (!options[index]) continue;
      correctAnswer = options[index];
    } else {
      const normalizedAnswer = normalizeOption(correctAnswer);
      const directMatch = options.find(
        (option) => option.toLowerCase() === normalizedAnswer.toLowerCase()
      );
      if (directMatch) {
        correctAnswer = directMatch;
      } else {
        const partialMatch = options.find((option) =>
          option.toLowerCase().includes(normalizedAnswer.toLowerCase())
        );
        if (!partialMatch) continue;
        correctAnswer = partialMatch;
      }
    }

    const explanation = question.explanation?.trim();

    const normalizedQuestion: AssessmentQuestion = {
      id: `q${normalized.length + 1}`,
      prompt,
      options,
      correctAnswer,
      explanation,
    };

    if (!isQuestionValid(normalizedQuestion)) continue;

    normalized.push(normalizedQuestion);
    if (normalized.length >= count) break;
  }

  return normalized;
};
