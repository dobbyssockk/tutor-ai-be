import { buildLiteratureTimeline } from "../literatureTimeline";
import { TimelineExplorerSpec } from "../types";
import { LITERATURE_CONTEXT_RE, TIMELINE_REQUEST_RE } from "./constants";
import { isRecord, sanitizeTitle } from "./shared";

export const normalizeSubject = (
  value: unknown
): TimelineExplorerSpec["subject"] => {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  if (/(биолог|biology|bio)/i.test(raw)) return "biology";
  if (/(литерат|literature|book|poem|author)/i.test(raw))
    return "literature";
  if (/(истор|history)/i.test(raw)) return "history";
  return "general";
};

const sanitizeStepTitle = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : null;

const sanitizeStepDetails = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 600)
    : undefined;

const sanitizeStepPeriod = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : undefined;

const sanitizeMediaQuery = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : undefined;

const sanitizeStringList = (
  value: unknown,
  maxItems: number,
  maxItemLength: number
) => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .map((item) =>
      typeof item === "string" && item.trim()
        ? item.trim().slice(0, maxItemLength)
        : null
    )
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);

  return normalized.length ? normalized : undefined;
};

const derivePointsFromDetails = (details?: string) => {
  if (!details) return undefined;

  const points = details
    .split(/[.!?;]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8)
    .slice(0, 5);

  if (points.length) return points;
  return [details];
};

export const normalizeTimelineSpec = (
  raw: Record<string, unknown>
): TimelineExplorerSpec | null => {
  const rawSteps = Array.isArray(raw.steps)
    ? raw.steps
    : Array.isArray(raw.events)
      ? raw.events
      : Array.isArray(raw.stages)
        ? raw.stages
        : null;

  if (!rawSteps || rawSteps.length < 2) return null;

  const steps: TimelineExplorerSpec["steps"] = [];
  for (let index = 0; index < rawSteps.length && steps.length < 12; index += 1) {
    const item = rawSteps[index];
    if (!isRecord(item)) continue;

    const title =
      sanitizeStepTitle(item.title) ??
      sanitizeStepTitle(item.name) ??
      sanitizeStepTitle(item.label);
    if (!title) continue;

    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim().slice(0, 40)
        : `step_${index + 1}`;

    const details = sanitizeStepDetails(item.details ?? item.description ?? item.text);
    const rawKeyPoints = sanitizeStringList(
      item.keyPoints ?? item.points ?? item.highlights ?? item.facts,
      8,
      180
    );
    const fallbackPoints = derivePointsFromDetails(details);
    const keyPoints = rawKeyPoints ?? fallbackPoints;
    const outcomes =
      sanitizeStringList(
        item.outcomes ?? item.results ?? item.effects ?? item.conclusion,
        6,
        180
      ) ??
      (keyPoints?.length ? [keyPoints[keyPoints.length - 1] as string] : undefined);

    const checkQuestion =
      sanitizeStepDetails(item.checkQuestion ?? item.question ?? item.quizQuestion) ??
      `Что важно запомнить про этап «${title}»?`;
    const checkAnswer =
      sanitizeStepDetails(item.checkAnswer ?? item.answer ?? item.quizAnswer) ??
      keyPoints?.[0] ??
      details;

    steps.push({
      id,
      title,
      details,
      period: sanitizeStepPeriod(item.period ?? item.year ?? item.era),
      imageQuery: sanitizeMediaQuery(
        item.imageQuery ?? item.mediaQuery ?? item.searchQuery
      ),
      imageCaption: sanitizeStepDetails(
        item.imageCaption ?? item.caption ?? item.imageNote
      ),
      keyPoints,
      outcomes,
      terms: sanitizeStringList(
        item.terms ?? item.keywords ?? item.glossary,
        10,
        60
      ),
      commonMistake: sanitizeStepDetails(
        item.commonMistake ?? item.mistake ?? item.warning
      ),
      checkQuestion,
      checkAnswer,
    });
  }

  if (steps.length < 2) return null;

  const initialStepId =
    typeof raw.initialStepId === "string" &&
    steps.some((step) => step.id === raw.initialStepId)
      ? raw.initialStepId
      : steps[0]?.id;

  return {
    type: "timeline_explorer",
    title: sanitizeTitle(raw.title, "Интерактивный таймлайн"),
    subject: normalizeSubject(raw.subject ?? raw.discipline),
    steps,
    initialStepId,
  };
};

const extractQuotedTitle = (source: string) => {
  const quoted =
    source.match(/[«"]([^"»]{2,120})[»"]/i)?.[1]?.trim() ??
    source.match(/'([^']{2,120})'/i)?.[1]?.trim();
  if (quoted) return quoted;

  const byContext = source.match(
    /(?:книг[аи]|роман[ае]|произведени[ея])\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9\s\-]{2,120})/i
  )?.[1];
  return byContext?.trim() ?? "";
};

export const inferTimelineSpec = (source: string): TimelineExplorerSpec | null => {
  const normalized = source.replace(/\n+/g, " ").trim();
  if (!TIMELINE_REQUEST_RE.test(normalized)) return null;

  const isLiterature = LITERATURE_CONTEXT_RE.test(normalized);
  const title = extractQuotedTitle(normalized) || "произведения";

  if (isLiterature) {
    return buildLiteratureTimeline(title);
  }

  return {
    type: "timeline_explorer",
    title: "Интерактивный таймлайн по теме",
    subject: normalizeSubject(normalized),
    initialStepId: "s1",
    steps: [
      {
        id: "s1",
        title: "Введение в тему",
        details: "Определяются ключевые понятия и исходный контекст.",
      },
      {
        id: "s2",
        title: "Основные этапы",
        details: "Показываются ключевые события или стадии развития темы.",
      },
      {
        id: "s3",
        title: "Ключевой поворот",
        details: "Разбирается главный переломный момент или центральный вывод.",
      },
      {
        id: "s4",
        title: "Итог",
        details: "Формулируются основные результаты и смысловые выводы.",
      },
    ],
  };
};
