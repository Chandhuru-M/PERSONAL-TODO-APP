export function formatDateTime(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(date);
}

export function formatTime(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(date);
}

export function isPastDate(value: string | Date | null): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime() < Date.now();
}

export function formatDate(
  value: string | Date | null,
  options: { weekday?: 'short' | 'long' } = {},
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  let formatterOptions: Intl.DateTimeFormatOptions;

  if (options.weekday) {
    formatterOptions = {
      weekday: options.weekday,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
  } else {
    formatterOptions = {
      dateStyle: 'medium',
    };
  }

  return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
