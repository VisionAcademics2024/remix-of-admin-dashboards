/**
 * Sydney-first formatting.
 *
 * 04-business-logic.md §9: store every instant as UTC, reason about every
 * calendar question in Australia/Sydney. The old system showed tomorrow's 8am
 * lessons on the Today screen because a rollup defaulted to GMT. Every helper
 * here converts explicitly — never call toLocaleDateString() directly.
 */

export const TIMEZONE = "Australia/Sydney";
export const CURRENCY = "AUD";

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dayDateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const isoPartsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Sydney, as YYYY-MM-DD. */
export function sydToday(): string {
  return isoPartsFmt.format(new Date());
}

/** The Sydney calendar date of an instant, as YYYY-MM-DD. */
export function sydDate(ts: string | Date | null | undefined): string {
  if (!ts) return "";
  return isoPartsFmt.format(typeof ts === "string" ? new Date(ts) : ts);
}

/** "12 Aug 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseLoose(value) : value;
  if (!d) return "—";
  return dateFmt.format(d);
}

/** "Wed 12 Aug" */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseLoose(value) : value;
  if (!d) return "—";
  return dayFmt.format(d);
}

/** "Thu, 23 April 2026" — weekday first, then the full date. */
export function formatDayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseLoose(value) : value;
  if (!d) return "—";
  return dayDateFmt.format(d);
}

/** "5:30 pm" — always Sydney wall clock. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseLoose(value) : value;
  if (!d) return "—";
  return timeFmt.format(d).replace(/\s?([ap])m/i, (_m, p) => ` ${p.toLowerCase()}m`);
}

/** "Wed 12 Aug, 5:30 pm – 7:00 pm" */
export function formatSessionWindow(startsAt: string, endsAt: string): string {
  return `${formatDay(startsAt)}, ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

/**
 * A plain date column (starts_on, paid_date) is already a Sydney calendar date.
 * Parsing "2026-08-12" as a Date yields UTC midnight, which formats as the day
 * before in some zones — so pin it to midday to stay on the intended day.
 */
function parseLoose(value: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Money always shows cents. 04-business-logic.md §10: formatting is a front-end
 * concern, and never rounds in a way that hides a value.
 */
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** A 1.5 hour lesson is "1.5 h", never "2 h". */
export function formatHours(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  const trimmed = Number(n.toFixed(2));
  return `${trimmed} h`;
}

/** Monday-to-Sunday, two weeks, anchored so the boundaries never drift. */
export const FORTNIGHT_ANCHOR = "2026-08-03";

export function fortnightStart(date: string, anchor = FORTNIGHT_ANCHOR): string {
  const d = Date.parse(`${date}T00:00:00Z`);
  const a = Date.parse(`${anchor}T00:00:00Z`);
  const days = Math.floor((d - a) / 86_400_000);
  const offset = Math.floor(days / 14) * 14;
  return addDays(anchor, offset);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday opening the week containing a Sydney date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export function formatRange(startISO: string, endISO: string): string {
  return `${formatDate(startISO)} – ${formatDate(endISO)}`;
}

/** The Australia/Sydney UTC offset in force at a given instant, in ms. */
function sydneyOffsetMs(ts: number): number {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const hour = p["hour"] === "24" ? "00" : p["hour"];
  return (
    Date.parse(`${p["year"]}-${p["month"]}-${p["day"]}T${hour}:${p["minute"]}:${p["second"]}Z`) - ts
  );
}

/**
 * A Sydney wall-clock string ("2026-10-07T17:30", as a datetime-local input
 * produces) becomes a real instant, using the offset actually in force on that
 * date. Two passes so a time sitting on the daylight-saving boundary resolves
 * against the correct offset.
 */
export function sydneyLocalToInstant(local: string): string {
  const [datePart, timePart = "00:00"] = local.split("T");
  const naive = Date.parse(`${datePart}T${timePart}:00Z`);
  let instant = naive - sydneyOffsetMs(naive);
  instant = naive - sydneyOffsetMs(instant);
  return new Date(instant).toISOString();
}

/** The inverse: an instant rendered as a Sydney wall-clock datetime-local value. */
export function instantToSydneyLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p["hour"] === "24" ? "00" : p["hour"];
  return `${p["year"]}-${p["month"]}-${p["day"]}T${hour}:${p["minute"]}`;
}

/**
 * Minutes since Sydney midnight, which is what positions a lesson on a time
 * grid. Derived from the wall-clock string rather than from the raw instant so
 * a lesson sits where the tutor thinks it does, whatever the viewer's own
 * timezone or the daylight-saving offset on the day.
 */
export function sydneyMinutesOfDay(iso: string): number {
  const [, timePart = "00:00"] = instantToSydneyLocal(iso).split("T");
  const [h = "0", m = "0"] = timePart.split(":");
  return Number(h) * 60 + Number(m);
}

/** The same, for right now. Drives the current-time line. */
export function sydneyMinutesNow(): number {
  return sydneyMinutesOfDay(new Date().toISOString());
}

/** "9 am", "2:30 pm" — the time-gutter and chip label form. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
