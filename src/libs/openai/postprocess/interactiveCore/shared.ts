import { InteractiveRange, TrigFunction } from "../types";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const round = (value: number, digits = 4) => Number(value.toFixed(digits));

export const normalizeTrigFunction = (value: unknown): TrigFunction | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "sin" || raw === "sine") return "sin";
  if (raw === "cos" || raw === "cosine") return "cos";
  if (raw === "tan" || raw === "tg" || raw === "tangent") return "tan";
  return null;
};

export const parseRange = (
  raw: unknown,
  fallback: InteractiveRange
): InteractiveRange => {
  const value = isRecord(raw) ? raw : {};
  const rawMin = toFiniteNumber(value.min);
  const rawMax = toFiniteNumber(value.max);
  const rawStep = toFiniteNumber(value.step);

  const min = rawMin ?? fallback.min;
  const max = rawMax ?? fallback.max;
  if (min >= max) return fallback;

  const span = max - min;
  const step = rawStep ?? fallback.step;
  if (step <= 0 || step > span) return fallback;

  return {
    min: round(min),
    max: round(max),
    step: round(step),
  };
};

export const toCodeBlock = (lang: string, payload: Record<string, unknown>) =>
  `\`\`\`${lang}\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

export const sanitizeTitle = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : fallback;

export const parseCoeff = (raw: string | undefined, fallback = 0) => {
  if (!raw || raw.trim() === "") return fallback;
  const value = raw.trim();
  if (value === "+") return 1;
  if (value === "-") return -1;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const normalizeEquation = (raw: string) =>
  raw
    .replace(/\s+/g, "")
    .replace(/²/g, "^2")
    .replace(/,/g, ".");
