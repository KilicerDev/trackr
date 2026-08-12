import { intlLocale } from "./date";

/** Compact relative timestamp for list rows ("5m", "3h", "2d", then a date). */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** Full timestamp for detail views. */
export function fullTime(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
