import { MediaGalleryExplorerSpec } from "../types";
import { MEDIA_REQUEST_RE } from "./constants";
import { clamp, sanitizeTitle, toFiniteNumber } from "./shared";
import { normalizeSubject } from "./timeline";

const normalizeMediaType = (
  value: unknown
): MediaGalleryExplorerSpec["mediaType"] => {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (raw === "video" || raw === "videos" || raw === "видео") return "video";
  if (raw === "image" || raw === "images" || raw === "photo" || raw === "фото") {
    return "image";
  }
  return undefined;
};

export const sanitizeMediaSearchQuery = (value: string) =>
  value
    .replace(
      /\b(пожалуйста|пж|please|покажи|показать|показ|найди|подбери|show|display|find|give|мне|по|теме|тема|про|about|for|изображени[ея]?|изображение|картин(?:ка|ки|ку|а)?|фото|видео|video|image|images|gallery|галере(?:я|ю|и))\b/gi,
      " "
    )
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

export const normalizeMediaGallerySpec = (
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

export const inferMediaGallerySpec = (
  source: string
): MediaGalleryExplorerSpec | null => {
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
