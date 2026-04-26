import {
  ChartInteractiveSpec,
  ComparisonExplorerSeries,
  ComparisonExplorerSpec,
  InteractiveSpec,
  SingleInteractiveSpec,
} from "../types";
import {
  normalizeLinearSpec,
  normalizeQuadraticSpec,
  normalizeTrigSpec,
} from "./chart";
import { normalizeMediaGallerySpec } from "./media";
import { isRecord, sanitizeTitle } from "./shared";
import { normalizeTimelineSpec } from "./timeline";

export const normalizeSingleInteractiveRaw = (
  raw: Record<string, unknown>
): SingleInteractiveSpec | null => {
  if (raw.type === "timeline_explorer") {
    return normalizeTimelineSpec(raw);
  }

  if (raw.type === "media_gallery_explorer") {
    return normalizeMediaGallerySpec(raw);
  }

  if (raw.type === "linear_explorer") {
    return normalizeLinearSpec(raw);
  }

  if (raw.type === "quadratic_explorer") {
    return normalizeQuadraticSpec(raw);
  }

  if (raw.type === "trig_explorer") {
    return normalizeTrigSpec(raw);
  }

  return (
    normalizeTimelineSpec(raw) ??
    normalizeMediaGallerySpec(raw) ??
    normalizeTrigSpec(raw) ??
    normalizeQuadraticSpec(raw) ??
    normalizeLinearSpec(raw)
  );
};

export const normalizeChartInteractiveRaw = (
  raw: Record<string, unknown>
): ChartInteractiveSpec | null => {
  const spec = normalizeSingleInteractiveRaw(raw);
  if (!spec) return null;
  if (spec.type === "quadratic_explorer") return spec;
  if (spec.type === "linear_explorer") return spec;
  if (spec.type === "trig_explorer") return spec;
  return null;
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

  const spec = normalizeChartInteractiveRaw(innerRaw);
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

export const normalizeComparisonSpec = (
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

export const parseInteractiveRaw = (
  raw: Record<string, unknown>
): InteractiveSpec | null => {
  if (raw.type === "comparison_explorer") {
    return normalizeComparisonSpec(raw);
  }

  if (Array.isArray(raw.series) || Array.isArray(raw.functions)) {
    const comparison = normalizeComparisonSpec(raw);
    if (comparison) return comparison;
  }

  return normalizeSingleInteractiveRaw(raw);
};
