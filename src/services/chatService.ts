import prisma from "../db/prisma";
import { generateGPT } from "../libs/openai";

type Message = {
  role: "user" | "assistant";
  outputText: string;
};

export const createChatWithPrompt = async (
  userId: string,
  input: string,
  title?: string
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tutorInstructions: true, displayName: true, email: true },
  });

  let assistantOutputText = "";
  try {
    assistantOutputText = await generateGPT(
      [{ role: "user", outputText: input } as Message],
      user?.tutorInstructions,
      user?.displayName
    );
  } catch (err) {
    console.error("Generate GPT failed", err);
    assistantOutputText =
      "Извините, сейчас не удалось сгенерировать ответ. Попробуйте позже.";
  }

  return prisma.chat.create({
    data: {
      title: title?.trim() || input.slice(0, 30),
      userId,
      messages: {
        create: [
          { role: "user", outputText: input },
          { role: "assistant", outputText: assistantOutputText },
        ],
      },
    },
    include: { messages: true },
  });
};
