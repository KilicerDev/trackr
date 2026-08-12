import { getLocale } from "$lib/paraglide/runtime";

/**
 * Date helpers for the mobile app.
 *
 * DB dates (`YYYY-MM-DD`) and times (`HH:MM:SS+00`) are treated as literal
 * strings — never round-trip them through `Date`, and never derive a date
 * string via `toISOString()` (off-by-one before 01:00 CET).
 */

const INTL_LOCALES: Record<string, string> = {
  en: "en-GB",
  de: "de-DE",
  pl: "pl-PL",
};

/** BCP-47 locale for Intl formatters, derived from the active UI locale. */
export function intlLocale(): string {
  return INTL_LOCALES[getLocale()] ?? "en-GB";
}

/** Convert a Date to a local YYYY-MM-DD string (no timezone shift). */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today as a local YYYY-MM-DD string. */
export function todayString(): string {
  return toLocalDateString(new Date());
}

/** Parse YYYY-MM-DD into a Date at local midnight. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a YYYY-MM-DD string by n days. */
export function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

/** Inclusive list of YYYY-MM-DD strings between start and end (capped). */
export function expandRangeToDays(start: string, end: string, cap = 366): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end && days.length < cap) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** ISO-8601 week number (German "KW"). */
export function isoWeek(dateStr: string): number {
  const date = parseLocalDate(dateStr);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

/** "HH:MM" from a timetz literal like "07:00:00+00" (or null → ""). */
export function clipTime(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

/** "Mon, 14 July" / "Mo., 14. Juli" — weekday + day + month. */
export function formatDay(dateStr: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(parseLocalDate(dateStr));
}

/** "14.07.2026" — compact numeric date. */
export function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseLocalDate(dateStr));
}

/** "14.–18. Juli" — localized date range for two YYYY-MM-DD strings. */
export function formatDateRange(start: string, end: string): string {
  const fmt = new Intl.DateTimeFormat(intlLocale(), {
    day: "numeric",
    month: "long",
    year: undefined,
  });
  if (start === end) return fmt.format(parseLocalDate(start));
  return fmt.formatRange(parseLocalDate(start), parseLocalDate(end));
}

/** Monday of the ISO week containing the given date. */
export function startOfWeek(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const shift = (date.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(dateStr, -shift);
}

/** Narrow localized weekday label ("M", "D", …) for the week strip. */
export function weekdayNarrow(dateStr: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: "narrow" }).format(
    parseLocalDate(dateStr),
  );
}

/** Relative time for an ISO timestamp: "5 min ago" / "vor 3 Std." */
export function timeAgo(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" });
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
