import { openai, OPENAI_MODEL } from "./client";
import { extractJson } from "./postprocess/utils";

export const requestJsonPayload = async <T>(
  systemPrompt: string,
  promptLines: string[],
  errorMessage: string,
  parsePayload: (value: unknown) => T | null
): Promise<T> => {
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: promptLines.join("\n") },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw new Error(errorMessage);
  }

  const payload = parsePayload(parsed);
  if (!payload) {
    throw new Error(errorMessage);
  }

  return payload;
};
