import { InteractiveRange } from "../types";

export const INTERACTIVE_BLOCK_RE = /```interactive\s*([\s\S]*?)```/i;
export const INTERACTIVE_BLOCK_STRIP_RE = /```interactive\s*[\s\S]*?```/gi;
export const GEOMETRY_BLOCK_STRIP_RE = /```geometry\s*[\s\S]*?```/gi;

export const VIS_REQUEST_RE =
  /(построй|нарисуй|визуализ|график|функц|plot|graph|draw|visual)/i;
export const MEDIA_REQUEST_RE =
  /(покажи|показать|показ|найди|подбери|show|display|find).*(изображ|картин|фото|video|видео|gallery|галере)|((изображ|картин|фото|video|видео|gallery|галере).*(покажи|показать|show|display))/i;
export const GRAPH_CONTEXT_RE =
  /(график|диаграм|функц|уравнен|парабол|линейн|plot|graph|equation|function|chart|quadratic|linear)/i;
export const TRIG_CONTEXT_RE =
  /(тригоном|sin|cos|tan|sine|cosine|tangent|синус|косинус|тангенс)/i;
export const NON_MATH_VIS_CONTEXT_RE =
  /(биолог|литератур|истор|таймлайн|timeline|этап|стад|процесс|цикл|фото|изображ|картин|иллюстрац|галере|media|image|video|видео)/i;
export const COMPARE_CONTEXT_RE =
  /(сравн|сопостав|налож|на одном|вместе|одновременно|compare|comparison|overlay|superimpos|both|vs)/i;
export const TIMELINE_REQUEST_RE =
  /(таймлайн|timeline|этап|по этапам|стад|фаз|разбери|разбор|сюжет|главн(ые|ых)\s+событ|ключев(ые|ых)\s+событ)/i;
export const LITERATURE_CONTEXT_RE =
  /(литератур|книг|роман|повест|рассказ|поэм|произведен|сюжет|персонаж|геро|автор)/i;
export const SUPPORTED_GRAPH_KIND_RE =
  /(y\s*=|парабол|линейн|квадрат|тригоном|sin|cos|tan|linear|quadratic|trig|function|функц)/i;
export const SUPPORTED_VIS_KIND_RE = new RegExp(
  `${SUPPORTED_GRAPH_KIND_RE.source}|${NON_MATH_VIS_CONTEXT_RE.source}`,
  "i"
);
export const UNSUPPORTED_VIS_RE =
  /(геометр|фигур|треуголь|прямоуголь|круг|окружност|многоуголь|отрезок|конус|цилиндр|сфер|пирамид|куб|призм|3d|three[- ]?d|solid|shape|triangle|rectangle|circle|polygon|segment|cone|cylinder|sphere|pyramid|cube|prism)/i;
export const CANT_SHOW_MEDIA_RE =
  /(не могу|не умею|не способен|cannot|can't).*(показ|изображ|картин|фото|video|видео|image)/i;

export const MAX_ABS_COEFF = 100;

export const DEFAULT_RANGES: Record<"a" | "b" | "c", InteractiveRange> = {
  a: { min: -5, max: 5, step: 0.1 },
  b: { min: -10, max: 10, step: 0.1 },
  c: { min: -10, max: 10, step: 0.1 },
};

export const DEFAULT_TRIG_RANGES: Record<
  "amplitude" | "frequency" | "phase" | "offset",
  InteractiveRange
> = {
  amplitude: { min: -5, max: 5, step: 0.1 },
  frequency: { min: -5, max: 5, step: 0.1 },
  phase: { min: -6.2832, max: 6.2832, step: 0.1 },
  offset: { min: -10, max: 10, step: 0.1 },
};

export const INTERACTIVE_GUARDRAIL_TEXT =
  "Я могу показать интерактивные материалы: графики функций (линейные, квадратичные, тригонометрические), сравнение двух функций, таймлайны по теме и медиа-галерею (фото/видео из открытых источников).";
