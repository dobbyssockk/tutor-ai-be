import {
  ChartInteractiveSpec,
  LinearExplorerSpec,
  TrigExplorerSpec,
} from "../types";
import {
  DEFAULT_RANGES,
  DEFAULT_TRIG_RANGES,
  MAX_ABS_COEFF,
} from "./constants";
import {
  clamp,
  isRecord,
  normalizeTrigFunction,
  parseRange,
  round,
  sanitizeTitle,
  toFiniteNumber,
} from "./shared";

export const normalizeLinearSpec = (
  raw: Record<string, unknown>
): LinearExplorerSpec | null => {
  const params = isRecord(raw.params) ? raw.params : raw;
  const slope = toFiniteNumber(params.slope ?? params.m ?? params.b);
  const intercept = toFiniteNumber(params.intercept ?? params.k ?? params.c);
  if (slope === null || intercept === null) return null;

  const ranges = isRecord(raw.ranges) ? raw.ranges : {};

  return {
    type: "linear_explorer",
    title: sanitizeTitle(raw.title, "Интерактивная линейная функция"),
    params: {
      slope: round(clamp(slope, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
      intercept: round(clamp(intercept, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
    },
    ranges: {
      slope: parseRange(ranges.slope ?? ranges.m ?? ranges.b, DEFAULT_RANGES.b),
      intercept: parseRange(
        ranges.intercept ?? ranges.k ?? ranges.c,
        DEFAULT_RANGES.c
      ),
    },
  };
};

export const normalizeQuadraticSpec = (
  raw: Record<string, unknown>
): ChartInteractiveSpec | null => {
  const params = isRecord(raw.params) ? raw.params : raw;
  const a = toFiniteNumber(params.a);
  const b = toFiniteNumber(params.b);
  const c = toFiniteNumber(params.c);
  if (a === null || b === null || c === null) return null;

  const ranges = isRecord(raw.ranges) ? raw.ranges : {};
  const normalizedA = round(clamp(a, -MAX_ABS_COEFF, MAX_ABS_COEFF));
  if (Math.abs(normalizedA) < 1e-9) {
    return normalizeLinearSpec({
      ...raw,
      params: {
        slope: b,
        intercept: c,
      },
      ranges: {
        ...(isRecord(raw.ranges) ? raw.ranges : {}),
        slope: isRecord(raw.ranges) ? raw.ranges.b : undefined,
        intercept: isRecord(raw.ranges) ? raw.ranges.c : undefined,
      },
    });
  }

  return {
    type: "quadratic_explorer",
    title: sanitizeTitle(raw.title, "Интерактивная квадратичная функция"),
    params: {
      a: normalizedA,
      b: round(clamp(b, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
      c: round(clamp(c, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
    },
    ranges: {
      a: parseRange(ranges.a, DEFAULT_RANGES.a),
      b: parseRange(ranges.b, DEFAULT_RANGES.b),
      c: parseRange(ranges.c, DEFAULT_RANGES.c),
    },
  };
};

export const normalizeTrigSpec = (
  raw: Record<string, unknown>
): TrigExplorerSpec | null => {
  const params = isRecord(raw.params) ? raw.params : raw;
  const fn =
    normalizeTrigFunction(raw.function) ??
    normalizeTrigFunction(raw.fn) ??
    normalizeTrigFunction(params.function) ??
    normalizeTrigFunction(params.fn);
  const amplitude = toFiniteNumber(params.amplitude ?? params.a);
  const frequency = toFiniteNumber(params.frequency ?? params.b);
  const phase = toFiniteNumber(params.phase ?? params.c);
  const offset = toFiniteNumber(params.offset ?? params.d);
  if (
    !fn ||
    amplitude === null ||
    frequency === null ||
    phase === null ||
    offset === null
  ) {
    return null;
  }

  const ranges = isRecord(raw.ranges) ? raw.ranges : {};

  return {
    type: "trig_explorer",
    title: sanitizeTitle(raw.title, "Интерактивная тригонометрическая функция"),
    function: fn,
    params: {
      amplitude: round(clamp(amplitude, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
      frequency: round(clamp(frequency, -20, 20)),
      phase: round(clamp(phase, -20, 20)),
      offset: round(clamp(offset, -MAX_ABS_COEFF, MAX_ABS_COEFF)),
    },
    ranges: {
      amplitude: parseRange(ranges.amplitude, DEFAULT_TRIG_RANGES.amplitude),
      frequency: parseRange(ranges.frequency, DEFAULT_TRIG_RANGES.frequency),
      phase: parseRange(ranges.phase, DEFAULT_TRIG_RANGES.phase),
      offset: parseRange(ranges.offset, DEFAULT_TRIG_RANGES.offset),
    },
  };
};
