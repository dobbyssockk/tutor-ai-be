import OpenAI from "openai";
import INSTRUCTIONS from "./instructions/chatbotInstructions";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

type Message = {
  role: "user" | "assistant";
  outputText: string;
};

export const generateGPT = async (context: Message[]) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: INSTRUCTIONS,
        },
        ...context.map((m) => ({
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
