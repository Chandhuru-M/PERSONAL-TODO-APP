import { formatTime } from './dates';

export const TIME_META_PREFIX = '@time';
export const MINUTES_IN_DAY = 24 * 60;

export interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

const TIME_LINE_REGEX = /^@time\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/i;

const isTimeMetadataLine = (line: string): boolean => {
  const lower = line.trim().toLowerCase();
  return lower.startsWith(TIME_META_PREFIX) || lower.startsWith('time:');
};

export const normalizeRange = (range: TimeRange): TimeRange => {
  const start = range.startMinutes;
  let end = range.endMinutes;
  while (end <= start) {
    end += MINUTES_IN_DAY;
  }
  return { startMinutes: start, endMinutes: end };
};

export const minutesToTimeKey = (minutes: number): string => {
  const normalized = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mins = (normalized % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
};

export const timeKeyToMinutes = (key: string): number | null => {
  const match = key.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

export const dateToMinutes = (date: Date): number => date.getHours() * 60 + date.getMinutes();

export const minutesToDate = (minutes: number, reference: Date = new Date()): Date => {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const daysOffset = Math.floor(minutes / MINUTES_IN_DAY);
  const minuteWithinDay = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  date.setDate(date.getDate() + daysOffset);
  date.setMinutes(minuteWithinDay);
  return date;
};

export const datesToTimeRange = (start: Date, end: Date): TimeRange => {
  const startMinutes = dateToMinutes(start);
  let endMinutes = dateToMinutes(end);
  if (endMinutes <= startMinutes) {
    endMinutes += MINUTES_IN_DAY;
  }
  return { startMinutes, endMinutes };
};

export const parseTimeRange = (description: string | null): TimeRange | null => {
  if (!description) return null;
  const lines = description.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith(TIME_META_PREFIX)) {
      continue;
    }
    const match = line.match(TIME_LINE_REGEX);
    if (!match) continue;
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    let endMinutes = Number(match[3]) * 60 + Number(match[4]);
    while (endMinutes <= startMinutes) {
      endMinutes += MINUTES_IN_DAY;
    }
    return { startMinutes, endMinutes };
  }
  return null;
};

export const stripTimeMetadata = (description: string | null): string => {
  if (!description) return '';
  const lines = description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isTimeMetadataLine(line));
  return lines.join('\n');
};

export const timeRangeToFriendly = (range: TimeRange): string => {
  const normalized = normalizeRange(range);
  const start = minutesToDate(normalized.startMinutes);
  const end = minutesToDate(normalized.endMinutes);
  return `${formatTime(start)} – ${formatTime(end)}`;
};

export const injectTimeMetadata = (content: string | null, range: TimeRange): string => {
  const baseLines = (content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isTimeMetadataLine(line));
  const normalized = normalizeRange(range);
  const metaLine = `${TIME_META_PREFIX} ${minutesToTimeKey(normalized.startMinutes)}-${minutesToTimeKey(
    normalized.endMinutes,
  )}`;
  const friendlyLine = `Time: ${timeRangeToFriendly(normalized)}`;
  return [...baseLines, metaLine, friendlyLine].join('\n');
};

export const rangesOverlap = (a: TimeRange, b: TimeRange): boolean => {
  const rangeA = normalizeRange(a);
  const rangeB = normalizeRange(b);
  return rangeA.startMinutes < rangeB.endMinutes && rangeB.startMinutes < rangeA.endMinutes;
};

export const clampRangeToBounds = (range: TimeRange, bounds: TimeRange): TimeRange | null => {
  const normalizedRange = normalizeRange(range);
  const normalizedBounds = normalizeRange(bounds);
  const start = Math.max(normalizedRange.startMinutes, normalizedBounds.startMinutes);
  const end = Math.min(normalizedRange.endMinutes, normalizedBounds.endMinutes);
  if (end <= start) {
    return null;
  }
  return { startMinutes: start, endMinutes: end };
};

export const rangeDuration = (range: TimeRange): number => {
  const normalized = normalizeRange(range);
  return normalized.endMinutes - normalized.startMinutes;
};
