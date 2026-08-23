/**
 * One clock for mock mode, so fixtures and assertions agree on "today".
 *
 * Everything the mock adapter dates is expressed relative to this Sydney
 * calendar date. Tests set it explicitly; the preview leaves it at the real
 * Sydney date.
 */
const SYDNEY = "Australia/Sydney";

let override: string | null = null;

/** Formats a moment as a Sydney calendar date, `YYYY-MM-DD`. */
export function sydneyDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function mockToday(): string {
  return override ?? sydneyDate();
}

export function setMockToday(date: string | null) {
  override = date;
}

/** Shifts a `YYYY-MM-DD` date by whole days without touching time zones. */
export function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  return shifted.toISOString().slice(0, 10);
}
