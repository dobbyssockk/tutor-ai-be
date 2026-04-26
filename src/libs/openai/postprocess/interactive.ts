import {
  ChartInteractiveSpec,
  ComparisonExplorerSeries,
  ComparisonExplorerSpec,
  InteractiveRange,
  InteractiveSpec,
  LinearExplorerSpec,
  MediaGalleryExplorerSpec,
  SingleInteractiveSpec,
  TimelineExplorerSpec,
  TrigExplorerSpec,
  TrigFunction,
} from "./types";
import { extractJson } from "./utils";

const INTERACTIVE_BLOCK_RE = /```interactive\s*([\s\S]*?)```/i;
const INTERACTIVE_BLOCK_STRIP_RE = /```interactive\s*[\s\S]*?```/gi;
const GEOMETRY_BLOCK_STRIP_RE = /```geometry\s*[\s\S]*?```/gi;

const VIS_REQUEST_RE =
  /(построй|нарисуй|визуализ|график|функц|plot|graph|draw|visual)/i;
const MEDIA_REQUEST_RE =
  /(покажи|показать|показ|найди|подбери|show|display|find).*(изображ|картин|фото|video|видео|gallery|галере)|((изображ|картин|фото|video|видео|gallery|галере).*(покажи|показать|show|display))/i;
const GRAPH_CONTEXT_RE =
  /(график|диаграм|функц|уравнен|парабол|линейн|plot|graph|equation|function|chart|quadratic|linear)/i;
const TRIG_CONTEXT_RE =
  /(тригоном|sin|cos|tan|sine|cosine|tangent|синус|косинус|тангенс)/i;
const NON_MATH_VIS_CONTEXT_RE =
  /(биолог|литератур|истор|таймлайн|timeline|этап|стад|процесс|цикл|фото|изображ|картин|иллюстрац|галере|media|image|video|видео)/i;
const COMPARE_CONTEXT_RE =
  /(сравн|сопостав|налож|на одном|вместе|одновременно|compare|comparison|overlay|superimpos|both|vs)/i;
const TIMELINE_REQUEST_RE =
  /(таймлайн|timeline|этап|по этапам|стад|фаз|разбери|разбор|сюжет|главн(ые|ых)\s+событ|ключев(ые|ых)\s+событ)/i;
const LITERATURE_CONTEXT_RE =
  /(литератур|книг|роман|повест|рассказ|поэм|произведен|сюжет|персонаж|геро|автор)/i;
const SUPPORTED_GRAPH_KIND_RE =
  /(y\s*=|парабол|линейн|квадрат|тригоном|sin|cos|tan|linear|quadratic|trig|function|функц)/i;
const SUPPORTED_VIS_KIND_RE = new RegExp(
  `${SUPPORTED_GRAPH_KIND_RE.source}|${NON_MATH_VIS_CONTEXT_RE.source}`,
  "i"
);
const UNSUPPORTED_VIS_RE =
  /(геометр|фигур|треуголь|прямоуголь|круг|окружност|многоуголь|отрезок|конус|цилиндр|сфер|пирамид|куб|призм|3d|three[- ]?d|solid|shape|triangle|rectangle|circle|polygon|segment|cone|cylinder|sphere|pyramid|cube|prism)/i;
const CANT_SHOW_MEDIA_RE =
  /(не могу|не умею|не способен|cannot|can't).*(показ|изображ|картин|фото|video|видео|image)/i;

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

const normalizeSubject = (value: unknown): TimelineExplorerSpec["subject"] => {
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

const normalizeTimelineSpec = (
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

const normalizeMediaType = (
  value: unknown
): MediaGalleryExplorerSpec["mediaType"] => {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (raw === "video" || raw === "videos" || raw === "видео") return "video";
  if (raw === "image" || raw === "images" || raw === "photo" || raw === "фото")
    return "image";
  return undefined;
};

const sanitizeMediaSearchQuery = (value: string) =>
  value
    .replace(
      /\b(пожалуйста|пж|please|покажи|показать|показ|найди|подбери|show|display|find|give|мне|по|теме|тема|про|about|for|изображени[ея]?|изображение|картин(?:ка|ки|ку|а)?|фото|видео|video|image|images|gallery|галере(?:я|ю|и))\b/gi,
      " "
    )
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const normalizeMediaGallerySpec = (
  raw: Record<string, unknown>
): MediaGalleryExplorerSpec | null => {
  const queryRaw =
    typeof raw.query === "string"
      ? raw.query
      : typeof raw.search === "string"
        ? raw.search
        : typeof raw.topic === "string"
          ? raw.topic
          : "";
  const plainQuery = queryRaw.trim().slice(0, 120);
  const cleanedQuery = sanitizeMediaSearchQuery(plainQuery);
  const query = cleanedQuery || plainQuery;
  if (!query) return null;

  const parsedLimit = toFiniteNumber(raw.limit ?? raw.count ?? raw.size);
  const limit = parsedLimit === null ? 6 : Math.round(clamp(parsedLimit, 3, 12));

  return {
    type: "media_gallery_explorer",
    title: sanitizeTitle(raw.title, "Медиа-галерея по теме"),
    subject: normalizeSubject(raw.subject ?? raw.discipline),
    query,
    mediaType: normalizeMediaType(raw.mediaType ?? raw.kind ?? raw.mode) ?? "image",
    limit,
  };
};

const inferMediaGallerySpec = (source: string): MediaGalleryExplorerSpec | null => {
  const normalized = source.replace(/\s+/g, " ").trim();
  const hasMediaIntent =
    MEDIA_REQUEST_RE.test(normalized) ||
    /(изображ|картин|фото|видео|video|image|gallery|галере)/i.test(normalized);
  if (!hasMediaIntent) return null;

  const mediaType: "image" | "video" = /(видео|video)/i.test(normalized)
    ? "video"
    : "image";

  const query = sanitizeMediaSearchQuery(normalized);

  if (!query) return null;

  const subject = normalizeSubject(
    /(биолог|анатом|клетк|organ|body|анатомичес)/i.test(normalized)
      ? "biology"
      : undefined
  );

  return {
    type: "media_gallery_explorer",
    title: "Медиа-галерея по теме",
    subject,
    query,
    mediaType,
    limit: 6,
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

const buildLiteratureTimeline = (title: string): TimelineExplorerSpec => {
  if (/война\s*и\s*мир/i.test(title)) {
    return {
      type: "timeline_explorer",
      title: `Этапы "${title}"`,
      subject: "literature",
      initialStepId: "s1",
      steps: [
        {
          id: "s1",
          title: "Экспозиция и знакомство с героями",
          details:
            "Показаны семьи Болконских, Ростовых и Безуховых, формируется социальный фон и ценностные ориентиры героев.",
          keyPoints: [
            "Светское общество Петербурга и Москвы",
            "Знакомство с Андреем, Пьером и Наташей",
            "Намечаются внутренние конфликты персонажей",
          ],
          outcomes: ["Задаётся масштаб романа и круг главных героев"],
          terms: ["экспозиция", "сюжетная линия", "характер"],
          checkQuestion: "Какую роль играет светское общество в начале романа?",
          checkAnswer:
            "Оно задаёт социальный контекст и показывает ценностные противоречия героев.",
        },
        {
          id: "s2",
          title: "Война и исторические потрясения",
          details:
            "Сюжетные линии героев переплетаются с военными событиями 1805-1812 годов и историческими испытаниями страны.",
          keyPoints: [
            "Военные эпизоды меняют судьбы героев",
            "Показана связь частной жизни и истории",
            "Подчёркивается цена войны",
          ],
          outcomes: ["Личные конфликты обостряются на фоне истории"],
          terms: ["исторический роман", "патриотизм", "эпопея"],
          checkQuestion: "Почему военные события важны для личных линий героев?",
          checkAnswer:
            "Они становятся точкой внутреннего перелома и переоценки жизненных ценностей.",
        },
        {
          id: "s3",
          title: "Внутренние переломы и переосмысление",
          details:
            "Герои проходят этап личных кризисов, разочарований и духовного поиска, что меняет их взгляды на жизнь.",
          keyPoints: [
            "Пьер ищет смысл жизни",
            "Андрей переживает разочарование и обновление",
            "Наташа взрослеет через ошибки и испытания",
          ],
          outcomes: ["Герои приходят к более зрелому пониманию себя"],
          terms: ["внутренний конфликт", "духовный поиск", "нравственный выбор"],
          checkQuestion: "Что объединяет личные пути Пьера, Андрея и Наташи?",
          checkAnswer:
            "Каждый проходит через кризис и приходит к переосмыслению ценностей.",
        },
        {
          id: "s4",
          title: "Развязка и авторская идея",
          details:
            "Финальные события подводят к мысли о ценности семьи, мира и нравственной ответственности человека.",
          keyPoints: [
            "Итоги сюжетных линий героев",
            "Смысл истории раскрывается через судьбы людей",
            "Утверждается ценность мирной жизни",
          ],
          outcomes: ["Формируется целостная философская идея романа"],
          terms: ["развязка", "эпилог", "авторская позиция"],
          checkQuestion: "Какая ключевая идея романа проявляется в финале?",
          checkAnswer:
            "Мысль о приоритете нравственных ценностей, семьи и мирной человеческой жизни.",
        },
      ],
    };
  }

  return {
    type: "timeline_explorer",
    title: `Этапы "${title}"`,
    subject: "literature",
    initialStepId: "s1",
    steps: [
      {
        id: "s1",
        title: "Экспозиция",
        details: `В произведении "${title}" задаются место действия, время и ключевые герои.`,
        keyPoints: [
          "Вводятся персонажи",
          "Обозначается исходная ситуация",
          "Формируется общий тон произведения",
        ],
        outcomes: ["Читатель получает базовый контекст для дальнейших событий"],
      },
      {
        id: "s2",
        title: "Завязка конфликта",
        details:
          "Появляется главный конфликт, который запускает развитие сюжетных линий.",
        keyPoints: [
          "Герои сталкиваются с противоречием",
          "Определяются цели и препятствия",
          "Напряжение постепенно нарастает",
        ],
        outcomes: ["Сюжет получает направление и динамику"],
      },
      {
        id: "s3",
        title: "Кульминация",
        details:
          "События достигают максимальной напряжённости, герои делают ключевой выбор.",
        keyPoints: [
          "Резкое обострение конфликта",
          "Определяющие решения героев",
          "Переломный момент сюжета",
        ],
        outcomes: ["Определяется дальнейший исход произведения"],
      },
      {
        id: "s4",
        title: "Развязка и смысл",
        details:
          "Конфликт получает итог, раскрывается основная авторская идея произведения.",
        keyPoints: [
          "Финальные последствия для героев",
          "Закрытие сюжетных линий",
          "Формулируется главный смысл",
        ],
        outcomes: ["Читатель получает целостное понимание произведения"],
      },
    ],
  };
};

const inferTimelineSpec = (source: string): TimelineExplorerSpec | null => {
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

const normalizeSingleInteractiveRaw = (
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

const normalizeChartInteractiveRaw = (
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

const inferSingleSpec = (source: string): ChartInteractiveSpec | null =>
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
    const guardrail =
      "Я могу показать интерактивные материалы: графики функций (линейные, квадратичные, тригонометрические), сравнение двух функций, таймлайны по теме и медиа-галерею (фото/видео из открытых источников).";
    if (!baseText) return guardrail;
    if (baseText.includes("Я могу показать интерактивные материалы:")) {
      return baseText;
    }
    return `${baseText}\n\n${guardrail}`;
  }

  const source = `${text}\n${userInput ?? ""}`;
  const graphContext =
    GRAPH_CONTEXT_RE.test(source) || TRIG_CONTEXT_RE.test(source);
  const mediaContext =
    MEDIA_REQUEST_RE.test(source) ||
    NON_MATH_VIS_CONTEXT_RE.test(source);

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
