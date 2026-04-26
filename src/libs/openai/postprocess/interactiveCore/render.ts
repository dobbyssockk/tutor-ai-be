import { InteractiveSpec } from "../types";
import {
  CANT_SHOW_MEDIA_RE,
  GRAPH_CONTEXT_RE,
  INTERACTIVE_BLOCK_STRIP_RE,
  INTERACTIVE_GUARDRAIL_TEXT,
  MEDIA_REQUEST_RE,
  NON_MATH_VIS_CONTEXT_RE,
  SUPPORTED_VIS_KIND_RE,
  TRIG_CONTEXT_RE,
  UNSUPPORTED_VIS_RE,
  VIS_REQUEST_RE,
} from "./constants";
import { inferComparisonSpec, inferSingleSpec } from "./inference";
import { inferMediaGallerySpec } from "./media";
import {
  parseInteractiveBlock,
  parseLooseInteractiveJson,
  removeSlice,
  stripInteractiveArtifacts,
  stripNonGraphArtifacts,
} from "./parsing";
import { toCodeBlock } from "./shared";
import { inferTimelineSpec } from "./timeline";

const buildInteractiveBlock = (spec: InteractiveSpec) =>
  toCodeBlock("interactive", spec as unknown as Record<string, unknown>);

const shouldRenderInteractive = (userInput?: string) => {
  if (!userInput?.trim()) return true;
  const source = userInput.trim();
  const isVisualRequest =
    VIS_REQUEST_RE.test(source) ||
    MEDIA_REQUEST_RE.test(source) ||
    NON_MATH_VIS_CONTEXT_RE.test(source);
  if (!isVisualRequest) return true;

  const hasUnsupported = UNSUPPORTED_VIS_RE.test(source);
  const hasSupported = SUPPORTED_VIS_KIND_RE.test(source);
  return hasSupported && !hasUnsupported;
};

export const withInteractiveMarkdown = (text: string, userInput?: string) => {
  if (!shouldRenderInteractive(userInput)) {
    const baseText = stripInteractiveArtifacts(text);
    if (!baseText) return INTERACTIVE_GUARDRAIL_TEXT;
    if (baseText.includes("Я могу показать интерактивные материалы:")) {
      return baseText;
    }
    return `${baseText}\n\n${INTERACTIVE_GUARDRAIL_TEXT}`;
  }

  const source = `${text}\n${userInput ?? ""}`;
  const graphContext =
    GRAPH_CONTEXT_RE.test(source) || TRIG_CONTEXT_RE.test(source);
  const mediaContext =
    MEDIA_REQUEST_RE.test(source) || NON_MATH_VIS_CONTEXT_RE.test(source);

  const interactiveSpec = parseInteractiveBlock(text);
  if (interactiveSpec) {
    const cleanText = stripNonGraphArtifacts(
      text.replace(INTERACTIVE_BLOCK_STRIP_RE, "")
    );
    const blocks = [buildInteractiveBlock(interactiveSpec)];
    return cleanText ? `${cleanText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
  }

  if (graphContext) {
    const inferredFunction = inferComparisonSpec(source) ?? inferSingleSpec(source);
    if (inferredFunction) {
      const looseSpec = parseLooseInteractiveJson(text);
      const preparedText = looseSpec
        ? removeSlice(text, looseSpec.start, looseSpec.end)
        : text;
      const baseText = stripNonGraphArtifacts(preparedText);
      const blocks = [buildInteractiveBlock(inferredFunction)];
      return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
    }
  }

  const timelineSpec = inferTimelineSpec(userInput ?? source);
  if (timelineSpec) {
    const looseSpec = parseLooseInteractiveJson(text);
    const preparedText = looseSpec
      ? removeSlice(text, looseSpec.start, looseSpec.end)
      : text;
    const baseText = stripNonGraphArtifacts(preparedText);
    const blocks = [buildInteractiveBlock(timelineSpec)];
    return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
  }

  if (mediaContext) {
    const mediaSpec = inferMediaGallerySpec(userInput ?? source);
    if (mediaSpec) {
      const looseSpec = parseLooseInteractiveJson(text);
      const preparedText = looseSpec
        ? removeSlice(text, looseSpec.start, looseSpec.end)
        : text;
      const baseTextRaw = stripNonGraphArtifacts(preparedText);
      const baseText = CANT_SHOW_MEDIA_RE.test(baseTextRaw) ? "" : baseTextRaw;
      const blocks = [buildInteractiveBlock(mediaSpec)];
      return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
    }
  }

  const looseSpec = parseLooseInteractiveJson(text);
  if (looseSpec) {
    const baseText = stripInteractiveArtifacts(
      removeSlice(text, looseSpec.start, looseSpec.end)
    );
    const blocks = [buildInteractiveBlock(looseSpec.spec)];
    return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
  }

  return stripNonGraphArtifacts(text);
};
