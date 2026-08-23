import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  addDays,
  formatClock,
  sydDate,
  sydneyMinutesNow,
  sydneyMinutesOfDay,
  sydToday,
} from "@/lib/format";
import type { Row } from "@/lib/vision/types";

/**
 * A Google Calendar–shaped time grid.
 *
 * The layout follows Google's conventions closely on purpose — a fixed hour
 * gutter, day columns with events positioned by their real start and duration,
 * overlapping lessons splitting the column between them, and a red line at the
 * current time. Anyone who has used Google Calendar can already read it, and
 * when the real Google Calendar is connected the shape will not change under
 * them.
 *
 * It is not a Google skin: the surface stays in the app's own palette, because
 * a grid this dense needs flat, calm contrast rather than translucency.
 */

/** Height of one hour, in pixels. Everything on the grid derives from this. */
export const HOUR_HEIGHT = 48;
const DAY_MINUTES = 24 * 60;

/** Where the grid scrolls to on open — early enough to see the first lesson. */
const DEFAULT_SCROLL_HOUR = 7;

export type CalendarEvent = {
  id: string;
  /** Sydney calendar date, YYYY-MM-DD. */
  date: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string | undefined;
  colour?: string | undefined;
  /** Draws as struck through and faded, the way a cancelled event does. */
  cancelled?: boolean | undefined;
  badge?: string | undefined;
  row: Row;
};

/** Turn a lesson row into something the grid can place. */
export function toCalendarEvent(s: Row): CalendarEvent {
  const start = sydneyMinutesOfDay(s.starts_at);
  const end = sydneyMinutesOfDay(s.ends_at);
  return {
    id: s.id,
    date: s.session_date ?? sydDate(s.starts_at),
    startMinutes: start,
    // A lesson running past midnight would wrap to a smaller number; clamp it
    // to the end of the day rather than drawing a negative-height block.
    endMinutes: end > start ? end : DAY_MINUTES,
    title: s.class_offerings?.programs?.name ?? "Lesson",
    subtitle: s.tutors?.full_name ?? undefined,
    colour: colourFor(s.tutor_id, s.tutors?.colour),
    cancelled: s.status === "cancelled" || s.status === "rescheduled",
    badge: s.roll_total > 0 ? `${s.roll_marked}/${s.roll_total}` : undefined,
    row: s,
  };
}

/**
 * Google Calendar's own palette, near enough. A calendar that is not
 * colour-coded is just a list with lines on it, and no tutor in the imported
 * base has a colour set yet — so one is derived from the tutor's id. It is
 * stable across sessions and machines, and the moment a real colour is saved
 * on the tutor that takes over.
 */
const PALETTE = [
  "#7986CB", // blueberry
  "#33B679", // basil
  "#E67C73", // flamingo
  "#F6BF26", // banana
  "#039BE5", // peacock
  "#8E24AA", // grape
  "#F4511E", // tangerine
  "#0B8043", // sage
  "#3F51B5", // lavender
  "#D50000", // tomato
];

/**
 * Black or white text, whichever the fill can actually carry. Google picks per
 * colour for the same reason: white on banana or tangerine is unreadable, and
 * a timetable nobody can read at a glance is worse than no colour at all.
 */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1]!, 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return luminance > 0.42 ? "#202124" : "#fff";
}

export function colourFor(id: string | null | undefined, explicit?: string | null): string {
  if (explicit) return explicit;
  if (!id) return PALETTE[0]!;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/**
 * Side-by-side placement for lessons that clash.
 *
 * Events are swept in start order into clusters that transitively overlap, and
 * each cluster is packed into as few columns as it needs. Two lessons at the
 * same time therefore take half the width each rather than hiding one another.
 */
function layout(events: CalendarEvent[]): Array<CalendarEvent & { col: number; cols: number }> {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
  );

  const placed: Array<CalendarEvent & { col: number; cols: number }> = [];
  let cluster: Array<CalendarEvent & { col: number; cols: number }> = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const closeCluster = () => {
    const cols = columnEnds.length || 1;
    for (const e of cluster) e.cols = cols;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const event of sorted) {
    if (cluster.length && event.startMinutes >= clusterEnd) closeCluster();

    let col = columnEnds.findIndex((end) => event.startMinutes >= end);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(event.endMinutes);
    } else {
      columnEnds[col] = event.endMinutes;
    }

    cluster.push({ ...event, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, event.endMinutes);
  }
  if (cluster.length) closeCluster();

  return placed;
}

function EventBlock({
  event,
  col,
  cols,
  onSelect,
}: {
  event: CalendarEvent;
  col: number;
  cols: number;
  onSelect: (row: Row) => void;
}) {
  const colour = event.colour || PALETTE[0]!;
  const top = (event.startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(((event.endMinutes - event.startMinutes) / 60) * HOUR_HEIGHT - 1, 17);
  const compact = height < 44;

  return (
    <button
      type="button"
      onClick={() => onSelect(event.row)}
      title={`${formatClock(event.startMinutes)} – ${formatClock(event.endMinutes)} · ${event.title}${
        event.subtitle ? ` · ${event.subtitle}` : ""
      }`}
      style={{
        top,
        height,
        left: `calc(${(col / cols) * 100}% + 1px)`,
        width: `calc(${100 / cols}% - 3px)`,
        // Solid fill, white text — Google's own treatment, and the only one
        // that stays legible at 18px tall on a dark surface. A cancelled
        // lesson inverts to an outline, the way a declined event does.
        backgroundColor: event.cancelled ? "transparent" : colour,
        borderColor: event.cancelled ? colour : "rgba(0,0,0,0.22)",
        color: event.cancelled ? colour : readableOn(colour),
      }}
      className={cn(
        "absolute overflow-hidden rounded border px-1.5 py-[3px] text-left",
        "transition-[filter,box-shadow] duration-150",
        "hover:z-20 hover:shadow-lg hover:brightness-110",
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        event.cancelled && "border-dashed",
        compact ? "flex items-baseline gap-1.5 leading-none" : "leading-tight",
      )}
    >
      <span
        className={cn(
          "truncate text-[0.7rem] font-semibold",
          event.cancelled && "line-through decoration-1",
        )}
      >
        {event.title}
      </span>
      {compact ? (
        <span className="shrink-0 text-[0.65rem] tabular-nums opacity-85">
          {formatClock(event.startMinutes)}
        </span>
      ) : (
        <>
          <div className="truncate text-[0.65rem] tabular-nums opacity-90">
            {formatClock(event.startMinutes)} – {formatClock(event.endMinutes)}
          </div>
          {/* An hour-tall block cannot carry a third line without clipping it. */}
          {height >= 62 && event.subtitle && (
            <div className="truncate text-[0.65rem] opacity-80">{event.subtitle}</div>
          )}
          {height >= 84 && event.badge && (
            <div className="mt-0.5 inline-flex rounded bg-black/20 px-1 text-[0.6rem] tabular-nums ring-1 ring-current/25">
              {event.badge}
            </div>
          )}
        </>
      )}
    </button>
  );
}

/** The red line, and the dot that anchors it to today's column. */
function NowLine({ dayCount, todayIndex }: { dayCount: number; todayIndex: number }) {
  const [minutes, setMinutes] = useState(sydneyMinutesNow);

  useEffect(() => {
    const id = setInterval(() => setMinutes(sydneyMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top: (minutes / 60) * HOUR_HEIGHT }}
    >
      <div className="h-px w-full bg-[oklch(0.62_0.22_25)]" />
      <div
        className="absolute -top-[5px] h-[11px] w-[11px] rounded-full bg-[oklch(0.62_0.22_25)]"
        style={{ left: `calc(${(todayIndex / dayCount) * 100}% - 5px)` }}
      />
    </div>
  );
}

export function TimeGrid({
  days,
  events,
  onSelect,
}: {
  days: string[];
  events: CalendarEvent[];
  onSelect: (row: Row) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = sydToday();
  const todayIndex = days.indexOf(today);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT - 10;
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layout>>();
    for (const day of days) {
      map.set(day, layout(events.filter((e) => e.date === day)));
    }
    return map;
  }, [days, events]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="glass--solid overflow-hidden rounded-xl border">
      {/* Day headers stay put while the hours scroll beneath them. */}
      <div className="flex border-b bg-[var(--mat-thin)]">
        <div className="w-14 shrink-0 border-r sm:w-16" />
        {days.map((day) => {
          const isToday = day === today;
          const d = new Date(`${day}T00:00:00Z`);
          return (
            <div key={day} className="min-w-0 flex-1 border-r py-2 text-center last:border-r-0">
              <div
                className={cn(
                  "text-[0.68rem] font-medium uppercase tracking-wide",
                  isToday ? "text-[oklch(0.68_0.16_255)]" : "text-muted-foreground",
                )}
              >
                {d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg",
                  isToday
                    ? "bg-[oklch(0.55_0.19_258)] font-semibold text-white"
                    : "font-normal text-foreground",
                )}
              >
                {d.getUTCDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="relative max-h-[62vh] overflow-y-auto overscroll-contain">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour gutter. The midnight label is dropped, as Google's is. */}
          <div className="w-14 shrink-0 border-r sm:w-16">
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_HEIGHT }}>
                {h > 0 && (
                  <span className="absolute -top-2 right-2 text-[0.65rem] text-muted-foreground">
                    {formatClock(h * 60)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="relative flex flex-1">
            {/* Hour rules sit behind every column so they line up exactly. */}
            <div className="pointer-events-none absolute inset-0">
              {hours.map((h) => (
                <div key={h}>
                  <div
                    className="absolute inset-x-0 border-t border-[var(--edge)]"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                  <div
                    className="absolute inset-x-0 border-t border-[var(--edge)] opacity-40"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                </div>
              ))}
            </div>

            {days.map((day) => (
              <div key={day} className="relative min-w-0 flex-1 border-r last:border-r-0">
                {(byDay.get(day) ?? []).map((e) => (
                  <EventBlock key={e.id} event={e} col={e.col} cols={e.cols} onSelect={onSelect} />
                ))}
              </div>
            ))}

            {todayIndex >= 0 && <NowLine dayCount={days.length} todayIndex={todayIndex} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** How many events fit in a month cell before the rest collapse into "+N more". */
const MONTH_VISIBLE = 3;

export function MonthGrid({
  monthStart,
  events,
  onSelect,
  onOpenDay,
}: {
  /** The first of the month, YYYY-MM-DD. */
  monthStart: string;
  events: CalendarEvent[];
  onSelect: (row: Row) => void;
  onOpenDay: (day: string) => void;
}) {
  const today = sydToday();
  const month = monthStart.slice(0, 7);

  // Six full weeks, Monday-first, so the grid never changes height mid-year.
  const first = new Date(`${monthStart}T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = addDays(monthStart, -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.date) ?? [];
    list.push(e);
    byDay.set(e.date, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="glass--solid overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-[var(--mat-thin)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="border-r py-1.5 text-center text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          const outside = day.slice(0, 7) !== month;
          const shown = list.slice(0, MONTH_VISIBLE);
          const hidden = list.length - shown.length;

          return (
            <div
              key={day}
              className={cn(
                "min-h-[104px] border-b border-r p-1 last:border-r-0",
                outside && "bg-black/10 text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                className={cn(
                  "mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-accent",
                  isToday &&
                    "bg-[oklch(0.55_0.19_258)] font-semibold text-white hover:brightness-110",
                )}
              >
                {Number(day.slice(8))}
              </button>

              <div className="space-y-0.5">
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelect(e.row)}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[0.65rem] hover:bg-accent"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: e.colour || PALETTE[0] }}
                    />
                    <span className="shrink-0 tabular-nums opacity-70">
                      {formatClock(e.startMinutes)}
                    </span>
                    <span className={cn("truncate", e.cancelled && "line-through opacity-60")}>
                      {e.title}
                    </span>
                  </button>
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="w-full rounded px-1 text-left text-[0.65rem] text-muted-foreground hover:bg-accent"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
