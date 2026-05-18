import INSTRUCTIONS from "../instructions/chatbotInstructions";

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

export type ChatMessage = {
  role: "user" | "assistant";
  outputText: string;
};

export const buildSystemMessages = (
  tutorInstructions?: string | null,
  displayName?: string | null
) => {
  const messages: { role: "system"; content: string }[] = [
    { role: "system", content: INSTRUCTIONS },
    { role: "system", content: VISUALIZATION_SYSTEM_PROMPT },
    { role: "system", content: FOLLOW_UP_SUGGESTIONS_PROMPT },
  ];

  if (tutorInstructions?.trim()) {
    messages.push({
      role: "system",
      content: `User preferences:\n${tutorInstructions.trim()}`,
    });
  }

  if (displayName?.trim()) {
    messages.push({
      role: "system",
      content: `User's name: ${displayName.trim()}. Use this name when appropriate.`,
    });
  }

  return messages;
};
