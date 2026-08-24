import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";
import {
  addDays,
  formatClock,
  sydDate,
  sydneyLocalToInstant,
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

/** Dragging snaps to this, the way Google's grid clicks to quarter-hours. */
const SNAP = 15;

/** Where the grid scrolls to on open — early enough to see the first lesson. */
const DEFAULT_SCROLL_HOUR = 7;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Today's column, softly filled and outlined so its lessons stand out. */
const TODAY_TINT = "color-mix(in oklab, oklch(0.55 0.19 258) 9%, transparent)";
const TODAY_EDGE = "color-mix(in oklab, oklch(0.62 0.19 258) 55%, transparent)";
const todayEdges = {
  boxShadow: `inset 1px 0 0 ${TODAY_EDGE}, inset -1px 0 0 ${TODAY_EDGE}`,
};

/** Minutes-of-day to a 24h "HH:mm" the Sydney converter accepts. */
function clock24(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
  /** A make-up lesson — moved off its usual slot, or booked as one. */
  makeUp?: boolean | undefined;
  badge?: string | undefined;
  row: Row;
};

/** Turn a lesson row into something the grid can place. */
export function toCalendarEvent(s: Row): CalendarEvent {
  const start = sydneyMinutesOfDay(s.starts_at);
  const end = sydneyMinutesOfDay(s.ends_at);
  const program = s.class_offerings?.programs?.name ?? "Lesson";
  return {
    id: s.id,
    date: s.session_date ?? sydDate(s.starts_at),
    startMinutes: start,
    // A lesson running past midnight would wrap to a smaller number; clamp it
    // to the end of the day rather than drawing a negative-height block.
    endMinutes: end > start ? end : DAY_MINUTES,
    // A one-student class reads by who is in it — their name leads, the class
    // kind follows — exactly as it does on the Classes list.
    title: s.sole_student_name ? `${s.sole_student_name} · ${program}` : program,
    subtitle: s.tutors?.full_name ?? undefined,
    colour: colourFor(s.tutor_id, s.tutors?.colour),
    cancelled: s.status === "cancelled" || s.status === "rescheduled",
    makeUp: s.session_type === "dedicated_make_up",
    badge: s.roll_total > 0 ? `${s.roll_marked}/${s.roll_total}` : undefined,
    row: s,
  };
}

/**
 * A calendar of pastels, one hue per tutor. A calendar that is not
 * colour-coded is just a list with lines on it, and no tutor in the imported
 * base has a colour set yet — so one is derived from the tutor's id. It is
 * stable across sessions and machines, and the moment a real colour is saved
 * on the tutor that takes over.
 *
 * Pastel on purpose: a whole week tiled in saturated blocks is loud, and these
 * lessons sit on a dark surface where a soft fill with dark text reads calmer
 * and still tells the tutors apart at a glance. `readableOn` keeps the text
 * dark against every one of them.
 */
const PALETTE = [
  "#AEC6E8", // periwinkle
  "#B8E0C9", // mint
  "#F6B6B0", // blossom
  "#F7E1A0", // butter
  "#A9DDE6", // sky
  "#D3C1EC", // lilac
  "#F8C9A6", // apricot
  "#CBE0AC", // pear
  "#C4CCF3", // cornflower
  "#F4B8CE", // rose
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

type DragMode = "move" | "resize-start" | "resize-end";

function EventBlock({
  event,
  col,
  cols,
  hourHeight,
  onSelect,
  editable,
  dimmed,
  onDragStart,
}: {
  event: CalendarEvent;
  col: number;
  cols: number;
  hourHeight: number;
  onSelect: (row: Row) => void;
  /** Whether this grid lets you drag lessons around. Month view never does. */
  editable: boolean;
  /** The block being dragged shows where it was, faded, while the ghost leads. */
  dimmed: boolean;
  onDragStart: (e: ReactPointerEvent, event: CalendarEvent, mode: DragMode) => void;
}) {
  const colour = event.colour || PALETTE[0]!;
  const top = (event.startMinutes / 60) * hourHeight;
  const height = Math.max(((event.endMinutes - event.startMinutes) / 60) * hourHeight - 1, 17);
  const compact = height < 44;
  // Resizing needs a block tall enough to carry grips without swallowing the body.
  const resizable = editable && !event.cancelled && height >= 30;

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event.row);
        }
      }}
      // A plain click still opens the lesson; a click that moves becomes a drag.
      // The distinction is made in the grid, which owns the pointer maths.
      onPointerDown={(e) => {
        if (editable && e.button === 0) onDragStart(e, event, "move");
      }}
      onClick={() => {
        if (!editable) onSelect(event.row);
      }}
      title={`${formatClock(event.startMinutes)} – ${formatClock(event.endMinutes)} · ${event.title}${
        event.subtitle ? ` · ${event.subtitle}` : ""
      }`}
      style={{
        top,
        height,
        left: `calc(${(col / cols) * 100}% + 1px)`,
        width: `calc(${100 / cols}% - 2px)`,
        // Soft pastel fill, dark text — a whole week of these stays calm, and
        // `readableOn` keeps the label legible. A cancelled lesson inverts to an
        // outline, the way a declined event does.
        backgroundColor: event.cancelled ? "transparent" : colour,
        borderColor: event.cancelled ? colour : "rgba(0,0,0,0.22)",
        color: event.cancelled ? colour : readableOn(colour),
        opacity: dimmed ? 0.4 : 1,
        touchAction: editable ? "none" : undefined,
      }}
      className={cn(
        "absolute select-none overflow-hidden rounded border px-1.5 py-[3px] text-left",
        "transition-[box-shadow,filter] duration-150",
        "hover:z-20 hover:shadow-lg hover:brightness-95",
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
        <>
          <span className="shrink-0 text-[0.65rem] tabular-nums opacity-85">
            {formatClock(event.startMinutes)}
          </span>
          {event.makeUp && !event.cancelled && (
            <span className="shrink-0 rounded bg-black/15 px-1 text-[0.55rem] font-semibold uppercase tracking-wide">
              MU
            </span>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 text-[0.65rem] tabular-nums opacity-90">
            <span className="truncate">
              {formatClock(event.startMinutes)} – {formatClock(event.endMinutes)}
            </span>
            {event.makeUp && !event.cancelled && (
              <span className="shrink-0 rounded bg-black/15 px-1 text-[0.55rem] font-semibold uppercase not-italic tracking-wide">
                MU
              </span>
            )}
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

      {resizable && (
        <>
          {/* Grip the top edge to change when it starts, the bottom to change
              when it ends — Google's own affordance. */}
          <span
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button === 0) onDragStart(e, event, "resize-start");
            }}
            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
          />
          <span
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button === 0) onDragStart(e, event, "resize-end");
            }}
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
          />
        </>
      )}
    </div>
  );
}

/** The red line, and the dot that anchors it to today's column. */
function NowLine({
  dayCount,
  todayIndex,
  hourHeight,
}: {
  dayCount: number;
  todayIndex: number;
  hourHeight: number;
}) {
  const [minutes, setMinutes] = useState(sydneyMinutesNow);

  useEffect(() => {
    const id = setInterval(() => setMinutes(sydneyMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top: (minutes / 60) * hourHeight }}
    >
      <div className="h-px w-full bg-[oklch(0.62_0.22_25)]" />
      <div
        className="absolute -top-[5px] h-[11px] w-[11px] rounded-full bg-[oklch(0.62_0.22_25)]"
        style={{ left: `calc(${(todayIndex / dayCount) * 100}% - 5px)` }}
      />
    </div>
  );
}

type Draft = {
  row: Row;
  originId: string;
  mode: DragMode;
  date: string;
  startMinutes: number;
  endMinutes: number;
  /** Grab offset for a move: where in the block the pointer took hold. */
  grab: number;
  duration: number;
  originX: number;
  originY: number;
  moved: boolean;
};

export function TimeGrid({
  days,
  events,
  onSelect,
  onMove,
  hourHeight = HOUR_HEIGHT,
}: {
  days: string[];
  events: CalendarEvent[];
  onSelect: (row: Row) => void;
  /** Given a new day and time for a lesson, persist it. Omit for a read-only grid. */
  onMove?: (row: Row, startISO: string, endISO: string) => void;
  /** Pixels per hour. Taller rows spread the day out for fifteen-minute work. */
  hourHeight?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const today = sydToday();
  const todayIndex = days.indexOf(today);
  const editable = Boolean(onMove);

  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDrag = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = DEFAULT_SCROLL_HOUR * hourHeight - 10;
    // Re-anchor when the rows get taller or shorter so the morning stays put.
  }, [hourHeight]);

  /** Pointer position → the minute-of-day and day column it falls on. */
  function locate(clientX: number, clientY: number) {
    const rect = area.current!.getBoundingClientRect();
    const minutes = clamp(
      Math.round((((clientY - rect.top) / hourHeight) * 60) / SNAP) * SNAP,
      0,
      DAY_MINUTES,
    );
    const colWidth = rect.width / days.length;
    const dayIndex = clamp(Math.floor((clientX - rect.left) / colWidth), 0, days.length - 1);
    return { minutes, dayIndex };
  }

  function onPointerMove(e: PointerEvent) {
    const d = draftRef.current;
    if (!d) return;
    const moved = d.moved || Math.abs(e.clientX - d.originX) + Math.abs(e.clientY - d.originY) > 4;
    const { minutes, dayIndex } = locate(e.clientX, e.clientY);

    if (d.mode === "move") {
      const start = clamp(minutes - d.grab, 0, DAY_MINUTES - d.duration);
      setDrag({
        ...d,
        moved,
        startMinutes: start,
        endMinutes: start + d.duration,
        date: days[dayIndex]!,
      });
    } else if (d.mode === "resize-end") {
      setDrag({
        ...d,
        moved,
        endMinutes: clamp(Math.max(minutes, d.startMinutes + SNAP), 0, DAY_MINUTES),
      });
    } else {
      setDrag({
        ...d,
        moved,
        startMinutes: clamp(Math.min(minutes, d.endMinutes - SNAP), 0, DAY_MINUTES),
      });
    }
  }

  function onPointerUp() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    const d = draftRef.current;
    setDrag(null);
    if (!d) return;

    // A press that never travelled is a click: open the lesson.
    if (!d.moved) {
      onSelect(d.row);
      return;
    }
    const same =
      d.date === d.row.session_date &&
      d.startMinutes === sydneyMinutesOfDay(d.row.starts_at) &&
      d.endMinutes === sydneyMinutesOfDay(d.row.ends_at);
    if (same) return;

    onMove?.(
      d.row,
      sydneyLocalToInstant(`${d.date}T${clock24(d.startMinutes)}`),
      sydneyLocalToInstant(`${d.date}T${clock24(d.endMinutes)}`),
    );
  }

  function beginDrag(e: ReactPointerEvent, ev: CalendarEvent, mode: DragMode) {
    if (!editable) return;
    e.preventDefault();
    const { minutes } = locate(e.clientX, e.clientY);
    setDrag({
      row: ev.row,
      originId: ev.id,
      mode,
      date: ev.date,
      startMinutes: ev.startMinutes,
      endMinutes: ev.endMinutes,
      grab: minutes - ev.startMinutes,
      duration: ev.endMinutes - ev.startMinutes,
      originX: e.clientX,
      originY: e.clientY,
      moved: false,
    });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const byDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layout>>();
    for (const day of days) {
      map.set(day, layout(events.filter((e) => e.date === day)));
    }
    return map;
  }, [days, events]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const ghostShown = draft?.moved ? draft : null;
  const ghostDayIndex = ghostShown ? days.indexOf(ghostShown.date) : -1;

  return (
    <div className="glass--solid overflow-hidden rounded-xl border">
      {/* Header and grid share one scroll container, so a scrollbar narrows
          both by the same amount and the day columns never drift out from
          under their headings. The header stays pinned as the hours scroll. */}
      <div ref={scroller} className="relative max-h-[62vh] overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-20 flex border-b bg-[var(--mat-solid)]">
          <div className="w-14 shrink-0 border-r sm:w-16" />
          {days.map((day) => {
            const isToday = day === today;
            const d = new Date(`${day}T00:00:00Z`);
            return (
              <div
                key={day}
                className="min-w-0 flex-1 border-r py-2 text-center last:border-r-0"
                style={isToday ? { backgroundColor: TODAY_TINT, ...todayEdges } : undefined}
              >
                <div
                  className={cn(
                    "text-[0.68rem] font-medium uppercase tracking-wide",
                    isToday ? "text-[oklch(0.72_0.16_255)]" : "text-muted-foreground",
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

        <div className="flex" style={{ height: 24 * hourHeight }}>
          {/* Hour gutter. The midnight label is dropped, as Google's is. */}
          <div className="w-14 shrink-0 border-r sm:w-16">
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: hourHeight }}>
                {h > 0 && (
                  <span className="absolute -top-2 right-2 text-[0.65rem] text-muted-foreground">
                    {formatClock(h * 60)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div ref={area} className="relative flex flex-1">
            {/* Hour rules sit behind every column so they line up exactly. The
                quarter-hour rules only appear once the rows are tall enough to
                read them — that is what the density slider is for. */}
            <div className="pointer-events-none absolute inset-0">
              {hours.map((h) => (
                <div key={h}>
                  <div
                    className="absolute inset-x-0 border-t border-[var(--edge)]"
                    style={{ top: h * hourHeight }}
                  />
                  <div
                    className="absolute inset-x-0 border-t border-[var(--edge)] opacity-40"
                    style={{ top: h * hourHeight + hourHeight / 2 }}
                  />
                  {hourHeight >= 96 && (
                    <>
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-[var(--edge)] opacity-25"
                        style={{ top: h * hourHeight + hourHeight / 4 }}
                      />
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-[var(--edge)] opacity-25"
                        style={{ top: h * hourHeight + (hourHeight * 3) / 4 }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className="relative min-w-0 flex-1 border-r last:border-r-0"
                  style={isToday ? { backgroundColor: TODAY_TINT, ...todayEdges } : undefined}
                >
                  {(byDay.get(day) ?? []).map((e) => (
                    <EventBlock
                      key={e.id}
                      event={e}
                      col={e.col}
                      cols={e.cols}
                      hourHeight={hourHeight}
                      onSelect={onSelect}
                      editable={editable}
                      dimmed={ghostShown?.originId === e.id}
                      onDragStart={beginDrag}
                    />
                  ))}
                </div>
              );
            })}

            {/* The ghost the drag steers: same block, leading the way, snapped to
                the quarter-hour it would land on. */}
            {ghostShown && ghostDayIndex >= 0 && (
              <div
                className="pointer-events-none absolute z-30 overflow-hidden rounded border-2 border-white/70 px-1.5 py-[3px] leading-tight shadow-xl"
                style={{
                  top: (ghostShown.startMinutes / 60) * hourHeight,
                  height: Math.max(
                    ((ghostShown.endMinutes - ghostShown.startMinutes) / 60) * hourHeight - 1,
                    17,
                  ),
                  left: `calc(${(ghostDayIndex / days.length) * 100}% + 2px)`,
                  width: `calc(${100 / days.length}% - 4px)`,
                  backgroundColor: ghostShown.row.tutors?.colour
                    ? colourFor(ghostShown.row.tutor_id, ghostShown.row.tutors.colour)
                    : colourFor(ghostShown.row.tutor_id),
                  color: readableOn(
                    colourFor(ghostShown.row.tutor_id, ghostShown.row.tutors?.colour),
                  ),
                }}
              >
                <div className="truncate text-[0.7rem] font-semibold">
                  {ghostShown.row.class_offerings?.programs?.name ?? "Lesson"}
                </div>
                <div className="text-[0.65rem] tabular-nums opacity-90">
                  {formatClock(ghostShown.startMinutes)} – {formatClock(ghostShown.endMinutes)}
                </div>
              </div>
            )}

            {todayIndex >= 0 && (
              <NowLine dayCount={days.length} todayIndex={todayIndex} hourHeight={hourHeight} />
            )}
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
