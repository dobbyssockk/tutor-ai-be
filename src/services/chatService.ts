import prisma from "../db/prisma";
import { generateGPT, type LessonFocusContext } from "../libs/openai";

export type ChatContextMessage = {
  role: "user" | "assistant";
  outputText: string;
};

export type { LessonFocusContext };

export const DEFAULT_ASSISTANT_FALLBACK =
  "Извините, сейчас не удалось сгенерировать ответ. Попробуйте позже.";

export const generateAssistantTextForUser = async (
  userId: string,
  context: ChatContextMessage[],
  fallbackText = DEFAULT_ASSISTANT_FALLBACK,
  errorLabel = "Ошибка генерации ответа GPT",
  lessonFocus?: LessonFocusContext | null
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tutorInstructions: true, displayName: true },
  });

  try {
    return await generateGPT(
      context,
      user?.tutorInstructions,
      user?.displayName,
      lessonFocus ?? null
    );
  } catch (err) {
    console.error(errorLabel, err);
    return fallbackText;
  }
};

export const createChatWithPrompt = async (
  userId: string,
  input: string,
  title?: string,
  lessonFocus?: LessonFocusContext | null
) => {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    throw new Error("Content is required");
  }

  const assistantOutputText = await generateAssistantTextForUser(
    userId,
    [{ role: "user", outputText: normalizedInput }],
    DEFAULT_ASSISTANT_FALLBACK,
    "Ошибка генерации ответа GPT",
    lessonFocus ?? null
  );

  return prisma.chat.create({
    data: {
      title: title?.trim() || normalizedInput.slice(0, 30),
      userId,
      messages: {
        create: [
          { role: "user", outputText: normalizedInput },
          { role: "assistant", outputText: assistantOutputText },
        ],
      },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
};
