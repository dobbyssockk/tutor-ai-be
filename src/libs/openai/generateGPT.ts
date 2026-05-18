import { buildSystemMessages, ChatMessage } from "./chatPrompts";
import { openai, OPENAI_MODEL } from "./client";
import { postprocessAssistantOutput } from "./postprocess";

export const generateGPT = async (
  context: ChatMessage[],
  tutorInstructions?: string | null,
  displayName?: string | null
): Promise<string> => {
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        ...buildSystemMessages(tutorInstructions, displayName),
        ...context.map((m) => ({ role: m.role, content: m.outputText })),
      ],
    });

    const content = completion.choices[0].message.content ?? "";
    const lastUserInput = [...context]
      .reverse()
      .find((m) => m.role === "user")?.outputText;
    return postprocessAssistantOutput(content, lastUserInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI request failed";
    throw new Error(message);
  }
};
