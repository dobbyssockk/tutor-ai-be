import prisma from "../db/prisma";
import { generateGPT } from "../libs/openai";

export type ChatContextMessage = {
  role: "user" | "assistant";
  outputText: string;
};

const DEFAULT_ASSISTANT_FALLBACK =
  "Извините, сейчас не удалось сгенерировать ответ. Попробуйте позже.";

export const generateAssistantTextForUser = async (
  userId: string,
  context: ChatContextMessage[],
  fallbackText = DEFAULT_ASSISTANT_FALLBACK,
  errorLabel = "Generate GPT failed"
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tutorInstructions: true, displayName: true },
  });

  try {
    return await generateGPT(
      context,
      user?.tutorInstructions,
      user?.displayName
    );
  } catch (err) {
    console.error(errorLabel, err);
    return fallbackText;
  }
};

export const createChatWithPrompt = async (
  userId: string,
  input: string,
  title?: string
) => {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    throw new Error("Content is required");
  }

  const assistantOutputText = await generateAssistantTextForUser(
    userId,
    [{ role: "user", outputText: normalizedInput }],
    DEFAULT_ASSISTANT_FALLBACK
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
