import OpenAI from "openai";
import INSTRUCTIONS from "./instructions/chatbotInstructions";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

type Message = {
  role: "user" | "assistant";
  outputText: string;
};

export const generateGPT = async (
  context: Message[],
  tutorInstructions?: string | null,
  userName?: string | null
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

    if (userName?.trim()) {
      systemMessages.push({
        role: "system",
        content: `User's name: ${userName.trim()}. Use this name when appropriate.`,
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
    throw new Error();
  }
};
