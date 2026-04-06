import { withInteractiveMarkdown } from "./postprocess/interactive";
import { repairBrokenMath } from "./postprocess/math";

export const postprocessAssistantOutput = (content: string, userInput?: string) =>
  withInteractiveMarkdown(repairBrokenMath(content), userInput);
