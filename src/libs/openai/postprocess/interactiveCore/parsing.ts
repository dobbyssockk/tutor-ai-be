import { extractJson } from "../utils";
import { InteractiveSpec } from "../types";
import {
  GEOMETRY_BLOCK_STRIP_RE,
  INTERACTIVE_BLOCK_RE,
  INTERACTIVE_BLOCK_STRIP_RE,
} from "./constants";
import { parseInteractiveRaw } from "./comparisonRaw";
import { isRecord } from "./shared";

type JsonSlice = { raw: string; start: number; end: number };

export const parseInteractiveBlock = (text: string): InteractiveSpec | null => {
  const match = text.match(INTERACTIVE_BLOCK_RE);
  if (!match?.[1]) return null;

  try {
    const raw = JSON.parse(extractJson(match[1])) as Record<string, unknown>;
    if (!isRecord(raw)) return null;
    return parseInteractiveRaw(raw);
  } catch {
    return null;
  }
};

const findJsonSlices = (text: string) => {
  const slices: JsonSlice[] = [];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        continue;
      }

      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          slices.push({ raw: text.slice(i, j + 1), start: i, end: j + 1 });
          i = j;
          break;
        }
      }
    }
  }

  return slices;
};

export const parseLooseInteractiveJson = (
  text: string
): { spec: InteractiveSpec; start: number; end: number } | null => {
  for (const slice of findJsonSlices(text)) {
    try {
      const raw = JSON.parse(slice.raw) as Record<string, unknown>;
      if (!isRecord(raw)) continue;

      const parsed = parseInteractiveRaw(raw);
      if (parsed) {
        return { spec: parsed, start: slice.start, end: slice.end };
      }
    } catch {
      // noop
    }
  }

  return null;
};

export const removeSlice = (text: string, start: number, end: number) =>
  `${text.slice(0, start)}${text.slice(end)}`;

export const stripNonGraphArtifacts = (text: string) =>
  text.replace(GEOMETRY_BLOCK_STRIP_RE, "").trim();

export const stripInteractiveArtifacts = (text: string) => {
  let result = text
    .replace(INTERACTIVE_BLOCK_STRIP_RE, "")
    .replace(GEOMETRY_BLOCK_STRIP_RE, "")
    .trim();

  while (true) {
    const loose = parseLooseInteractiveJson(result);
    if (!loose) break;
    result = removeSlice(result, loose.start, loose.end).trim();
  }

  return result;
};
