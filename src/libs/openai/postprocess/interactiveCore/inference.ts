import {
  ChartInteractiveSpec,
  ComparisonExplorerSpec,
  TrigFunction,
} from "../types";
import { COMPARE_CONTEXT_RE } from "./constants";
import {
  normalizeLinearSpec,
  normalizeQuadraticSpec,
  normalizeTrigSpec,
} from "./chart";
import { normalizeTrigFunction, normalizeEquation, parseCoeff } from "./shared";

const extractEquationMatches = (source: string) => {
  const matches = Array.from(
    source.matchAll(/y\s*=\s*([^;,\n]+?)(?=(?:\s+y\s*=)|[;,\n]|$)/gi)
  );

  return matches
    .map((match) => {
      const rhs = match[1]?.replace(/\s+(и|and|vs)\s*$/i, "").trim();
      if (!rhs) return null;
      return `y=${rhs}`;
    })
    .filter((value): value is string => Boolean(value));
};

const inferPolynomialSpec = (source: string): ChartInteractiveSpec | null => {
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

const inferTrigSpec = (source: string) => {
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

export const inferSingleSpec = (source: string): ChartInteractiveSpec | null =>
  inferTrigSpec(source) ?? inferPolynomialSpec(source);

const buildComparisonSpec = (
  first: ChartInteractiveSpec,
  second: ChartInteractiveSpec
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

export const inferComparisonSpec = (
  source: string
): ComparisonExplorerSpec | null => {
  const equationMatches = extractEquationMatches(source);
  const normalizedSource = source.replace(/\n+/g, " ");
  const hasCompareIntent =
    COMPARE_CONTEXT_RE.test(normalizedSource) ||
    /(?:sin|sine|cos|cosine|tan|tangent|tg|синус|косинус|тангенс).*(?:\band\b|\bи\b).*(?:sin|sine|cos|cosine|tan|tangent|tg|синус|косинус|тангенс)/i.test(
      normalizedSource
    );
  if (!hasCompareIntent) return null;

  if (equationMatches.length >= 2) {
    const uniqueSpecs: ChartInteractiveSpec[] = [];

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
