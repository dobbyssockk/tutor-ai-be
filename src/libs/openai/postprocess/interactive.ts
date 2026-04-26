import {
  ComparisonExplorerSeries,
  ComparisonExplorerSpec,
  InteractiveRange,
  InteractiveSpec,
  LinearExplorerSpec,
  SingleInteractiveSpec,
  TrigExplorerSpec,
  TrigFunction,
} from "./types";
import { extractJson } from "./utils";

const INTERACTIVE_BLOCK_RE = /```interactive\s*([\s\S]*?)```/i;
const INTERACTIVE_BLOCK_STRIP_RE = /```interactive\s*[\s\S]*?```/gi;
const GEOMETRY_BLOCK_STRIP_RE = /```geometry\s*[\s\S]*?```/gi;

const VIS_REQUEST_RE =
  /(построй|нарисуй|визуализ|график|функц|plot|graph|draw|visual)/i;
const GRAPH_CONTEXT_RE =
  /(график|диаграм|функц|уравнен|парабол|линейн|plot|graph|equation|function|chart|quadratic|linear)/i;
const TRIG_CONTEXT_RE =
  /(тригоном|sin|cos|tan|sine|cosine|tangent|синус|косинус|тангенс)/i;
const COMPARE_CONTEXT_RE =
  /(сравн|сопостав|налож|на одном|вместе|одновременно|compare|comparison|overlay|superimpos|both|vs)/i;
const SUPPORTED_GRAPH_KIND_RE =
  /(y\s*=|парабол|линейн|квадрат|тригоном|sin|cos|tan|linear|quadratic|trig|function|функц)/i;
const UNSUPPORTED_VIS_RE =
  /(геометр|фигур|треуголь|прямоуголь|круг|окружност|многоуголь|отрезок|конус|цилиндр|сфер|пирамид|куб|призм|3d|three[- ]?d|solid|shape|triangle|rectangle|circle|polygon|segment|cone|cylinder|sphere|pyramid|cube|prism)/i;

const MAX_ABS_COEFF = 100;
const DEFAULT_RANGES: Record<"a" | "b" | "c", InteractiveRange> = {
  a: { min: -5, max: 5, step: 0.1 },
  b: { min: -10, max: 10, step: 0.1 },
  c: { min: -10, max: 10, step: 0.1 },
};
const DEFAULT_TRIG_RANGES: Record<
  "amplitude" | "frequency" | "phase" | "offset",
  InteractiveRange
> = {
  amplitude: { min: -5, max: 5, step: 0.1 },
  frequency: { min: -5, max: 5, step: 0.1 },
  phase: { min: -6.2832, max: 6.2832, step: 0.1 },
  offset: { min: -10, max: 10, step: 0.1 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 4) => Number(value.toFixed(digits));

const normalizeTrigFunction = (value: unknown): TrigFunction | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "sin" || raw === "sine") return "sin";
  if (raw === "cos" || raw === "cosine") return "cos";
  if (raw === "tan" || raw === "tg" || raw === "tangent") return "tan";
  return null;
};

const parseRange = (raw: unknown, fallback: InteractiveRange): InteractiveRange => {
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

const toCodeBlock = (lang: string, payload: Record<string, unknown>) =>
  `\`\`\`${lang}\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

const sanitizeTitle = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : fallback;

const normalizeLinearSpec = (
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

const normalizeQuadraticSpec = (
  raw: Record<string, unknown>
): SingleInteractiveSpec | null => {
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

const normalizeTrigSpec = (raw: Record<string, unknown>): TrigExplorerSpec | null => {
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
  if (!fn || amplitude === null || frequency === null || phase === null || offset === null) {
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

const normalizeSingleInteractiveRaw = (
  raw: Record<string, unknown>
): SingleInteractiveSpec | null => {
  if (raw.type === "linear_explorer") {
    return normalizeLinearSpec(raw);
  }

  if (raw.type === "quadratic_explorer") {
    return normalizeQuadraticSpec(raw);
  }

  if (raw.type === "trig_explorer") {
    return normalizeTrigSpec(raw);
  }

  return normalizeTrigSpec(raw) ?? normalizeQuadraticSpec(raw) ?? normalizeLinearSpec(raw);
};

const sanitizeSeriesColor = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const color = value.trim();
  if (!color) return undefined;
  if (color.length > 40) return undefined;
  return color;
};

const normalizeComparisonSeries = (
  raw: unknown,
  index: number
): ComparisonExplorerSeries | null => {
  if (!isRecord(raw)) return null;

  const innerRaw = isRecord(raw.spec)
    ? raw.spec
    : isRecord(raw.function)
      ? raw.function
      : raw;

  const spec = normalizeSingleInteractiveRaw(innerRaw);
  if (!spec) return null;

  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().slice(0, 40)
      : `f${index + 1}`;
  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim().slice(0, 120)
      : spec.title;

  return {
    id,
    label,
    color: sanitizeSeriesColor(raw.color),
    spec,
  };
};

const normalizeComparisonSpec = (
  raw: Record<string, unknown>
): ComparisonExplorerSpec | null => {
  const sourceSeries = Array.isArray(raw.series)
    ? raw.series
    : Array.isArray(raw.functions)
      ? raw.functions
      : null;
  if (!sourceSeries || sourceSeries.length < 2) return null;

  const first = normalizeComparisonSeries(sourceSeries[0], 0);
  const second = normalizeComparisonSeries(sourceSeries[1], 1);
  if (!first || !second) return null;

  return {
    type: "comparison_explorer",
    title: sanitizeTitle(raw.title, "Сравнение двух функций"),
    mode: "overlay",
    series: [first, second],
  };
};

const parseInteractiveRaw = (raw: Record<string, unknown>): InteractiveSpec | null => {
  if (raw.type === "comparison_explorer") {
    return normalizeComparisonSpec(raw);
  }

  if (Array.isArray(raw.series) || Array.isArray(raw.functions)) {
    const comparison = normalizeComparisonSpec(raw);
    if (comparison) return comparison;
  }

  return normalizeSingleInteractiveRaw(raw);
};

const extractEquationMatches = (source: string) => {
  const matches = Array.from(
    source.matchAll(/y\s*=\s*([^;,\n]+?)(?=(?:\s+y\s*=)|[;,\n]|$)/gi)
  );

  return matches
    .map((match) => {
      const rhs = match[1]
        ?.replace(/\s+(и|and|vs)\s*$/i, "")
        .trim();
      if (!rhs) return null;
      return `y=${rhs}`;
    })
    .filter((value): value is string => Boolean(value));
};

const parseInteractiveBlock = (text: string): InteractiveSpec | null => {
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

type JsonSlice = { raw: string; start: number; end: number };

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

const parseLooseInteractiveJson = (
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

const parseCoeff = (raw: string | undefined, fallback = 0) => {
  if (!raw || raw.trim() === "") return fallback;
  const value = raw.trim();
  if (value === "+") return 1;
  if (value === "-") return -1;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeEquation = (raw: string) =>
  raw
    .replace(/\s+/g, "")
    .replace(/²/g, "^2")
    .replace(/,/g, ".");

const inferPolynomialSpec = (source: string): SingleInteractiveSpec | null => {
  const matches = extractEquationMatches(source);
  if (!matches?.length) return null;

  for (const match of matches) {
    const rhs = normalizeEquation(match.replace(/^[^=]*=/, ""));
    const quadratic = rhs.match(
      /^([+\-]?\d*\.?\d*)x\^2(?:([+\-]\d*\.?\d*)x)?(?:([+\-]\d*\.?\d+))?$/
    );
    if (quadratic) {
      const a = parseCoeff(quadratic[1], 1);
      const b = parseCoeff(quadratic[2], 0);
      const c = parseCoeff(quadratic[3], 0);
      if (![a, b, c].every(Number.isFinite)) continue;

      return normalizeQuadraticSpec({
        type: "quadratic_explorer",
        params: { a, b, c },
      });
    }

    const linear = rhs.match(/^([+\-]?\d*\.?\d*)x(?:([+\-]\d*\.?\d+))?$/);
    if (linear) {
      const b = parseCoeff(linear[1], 1);
      const c = parseCoeff(linear[2], 0);
      if (![b, c].every(Number.isFinite)) continue;

      return normalizeLinearSpec({
        type: "linear_explorer",
        params: { slope: b, intercept: c },
      });
    }

    const constant = rhs.match(/^([+\-]?\d*\.?\d+)$/);
    if (constant) {
      const c = parseCoeff(constant[1], 0);
      if (!Number.isFinite(c)) continue;

      return normalizeLinearSpec({
        type: "linear_explorer",
        params: { slope: 0, intercept: c },
      });
    }
  }

  return null;
};

const inferTrigSpec = (source: string): TrigExplorerSpec | null => {
  const matches = extractEquationMatches(source);
  if (!matches?.length) return null;

  for (const match of matches) {
    const rhs = normalizeEquation(match.replace(/^[^=]*=/, ""))
      .toLowerCase()
      .replace(/[·*]/g, "")
      .replace(/tg\(/g, "tan(");

    const trig = rhs.match(
      /^([+\-]?\d*\.?\d*)?(sin|cos|tan)\(([^)]*)\)([+\-]\d*\.?\d+)?$/
    );
    if (!trig) continue;

    const fn = normalizeTrigFunction(trig[2]);
    if (!fn) continue;

    const amplitude = parseCoeff(trig[1], 1);
    const offset = parseCoeff(trig[4], 0);
    if (![amplitude, offset].every(Number.isFinite)) continue;

    const inside = trig[3];
    if (!inside) continue;
    const normalizedInside = inside.replace(/[·*]/g, "");
    const insideMatch = normalizedInside.match(
      /^([+\-]?\d*\.?\d*)?x(?:([+\-]\d*\.?\d+))?$/
    );
    if (!insideMatch) continue;

    const frequency = parseCoeff(insideMatch[1], 1);
    const phase = parseCoeff(insideMatch[2], 0);
    if (![frequency, phase].every(Number.isFinite)) continue;

    return normalizeTrigSpec({
      type: "trig_explorer",
      function: fn,
      params: { amplitude, frequency, phase, offset },
    });
  }

  return null;
};

const inferSingleSpec = (source: string): SingleInteractiveSpec | null =>
  inferTrigSpec(source) ?? inferPolynomialSpec(source);

const buildComparisonSpec = (
  first: SingleInteractiveSpec,
  second: SingleInteractiveSpec
): ComparisonExplorerSpec => ({
  type: "comparison_explorer",
  title: "Сравнение двух функций",
  mode: "overlay",
  series: [
    {
      id: "f1",
      label: first.title,
      color: "#1d4ed8",
      spec: first,
    },
    {
      id: "f2",
      label: second.title,
      color: "#dc2626",
      spec: second,
    },
  ],
});

const inferComparisonSpec = (source: string): ComparisonExplorerSpec | null => {
  const equationMatches = extractEquationMatches(source);
  const normalizedSource = source.replace(/\n+/g, " ");
  const hasCompareIntent =
    COMPARE_CONTEXT_RE.test(normalizedSource) ||
    /(?:sin|sine|cos|cosine|tan|tangent|tg|синус|косинус|тангенс).*(?:\band\b|\bи\b).*(?:sin|sine|cos|cosine|tan|tangent|tg|синус|косинус|тангенс)/i.test(
      normalizedSource
    );
  if (!hasCompareIntent) return null;

  if (equationMatches.length >= 2) {
    const uniqueSpecs: SingleInteractiveSpec[] = [];

    for (const equation of equationMatches) {
      const parsed = inferSingleSpec(equation);
      if (!parsed) continue;

      const fingerprint = JSON.stringify(parsed);
      const exists = uniqueSpecs.some(
        (spec) => JSON.stringify(spec) === fingerprint
      );
      if (!exists) uniqueSpecs.push(parsed);
      if (uniqueSpecs.length === 2) break;
    }

    if (uniqueSpecs.length >= 2) {
      const [first, second] = uniqueSpecs;
      return buildComparisonSpec(first, second);
    }
  }

  const trigMentions = Array.from(
    normalizedSource.matchAll(
      /\b(sin|sine|cos|cosine|tan|tangent|tg|синус|косинус|тангенс)\b/gi
    )
  )
    .map((match) => normalizeTrigFunction(match[1]))
    .filter((value): value is TrigFunction => Boolean(value));

  const uniqueTrig = Array.from(new Set(trigMentions));
  if (uniqueTrig.length < 2) return null;

  const first = normalizeTrigSpec({
    type: "trig_explorer",
    function: uniqueTrig[0],
    params: { amplitude: 1, frequency: 1, phase: 0, offset: 0 },
  });
  const second = normalizeTrigSpec({
    type: "trig_explorer",
    function: uniqueTrig[1],
    params: { amplitude: 1, frequency: 1, phase: 0, offset: 0 },
  });
  if (!first || !second) return null;

  return buildComparisonSpec(first, second);
};

const buildInteractiveBlock = (spec: InteractiveSpec) =>
  toCodeBlock("interactive", spec as unknown as Record<string, unknown>);

const stripNonGraphArtifacts = (text: string) =>
  text
    .replace(GEOMETRY_BLOCK_STRIP_RE, "")
    .trim();

const removeSlice = (text: string, start: number, end: number) =>
  `${text.slice(0, start)}${text.slice(end)}`;

const stripInteractiveArtifacts = (text: string) => {
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

const shouldRenderInteractive = (userInput?: string) => {
  if (!userInput?.trim()) return true;
  const source = userInput.trim();
  const isVisualRequest = VIS_REQUEST_RE.test(source);
  if (!isVisualRequest) return true;

  const hasUnsupported = UNSUPPORTED_VIS_RE.test(source);
  const hasSupported = SUPPORTED_GRAPH_KIND_RE.test(source);
  return hasSupported && !hasUnsupported;
};

export const withInteractiveMarkdown = (text: string, userInput?: string) => {
  if (!shouldRenderInteractive(userInput)) {
    const baseText = stripInteractiveArtifacts(text);
    const guardrail =
      "Я могу построить для тебя интерактивные графики следующих функций: линейных, квадратичных и тригонометрических (sin, cos, tan). Просто напиши, какую именно функцию нужно показать.";
    if (!baseText) return guardrail;
    if (baseText.includes("интерактивные графики следующих функций: линейных, квадратичных и тригонометрических")) {
      return baseText;
    }
    return `${baseText}\n\n${guardrail}`;
  }

  const source = `${text}\n${userInput ?? ""}`;
  const graphContext =
    GRAPH_CONTEXT_RE.test(source) || TRIG_CONTEXT_RE.test(source);

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
