import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  StretchVertical,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, EmptyState, StatusPill } from "@/components/vision/ui";
import {
  MonthGrid,
  ROLL_DONE,
  ROLL_OVERDUE,
  TimeGrid,
  toCalendarEvent,
} from "@/components/vision/calendar";
import { cn } from "@/lib/utils";
import { meQueryOptions } from "@/lib/vision/me";
import { lessonPermissions, type LessonPermissions } from "@/lib/vision/tutor-access";
import {
  addDays,
  formatDay,
  formatDayDate,
  formatHours,
  formatTime,
  instantToSydneyLocal as toLocalInput,
  sydDate,
  sydneyLocalToInstant as fromLocalInput,
  sydToday,
  weekStart,
} from "@/lib/format";
import {
  cancelSession,
  deleteSession,
  getSessionRoll,
  listRange,
  rescheduleSession,
  saveSessionNotes,
  seedRoll,
  updateSession,
} from "@/lib/vision/schedule.functions";
import { holdMakeUp, markAttendance, markRollBulk } from "@/lib/vision/roll.functions";
import { syncSessionToGoogle } from "@/lib/vision/calendar.functions";
import {
  nextSyncView,
  syncAfterReschedule,
  syncTone,
  syncViewFromSession,
  type SyncView,
} from "@/lib/vision/calendar-sync";
import { isMappedSession } from "@/lib/vision/gcal";
import { setTrialStatus } from "@/lib/vision/leads.functions";
import { saveEnrolment } from "@/lib/vision/commerce.functions";
import { listStudents } from "@/lib/vision/people.functions";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import type { Row } from "@/lib/vision/types";

/**
 * Day, three days, week, month.
 *
 * Three days is the working middle: a week is a lot of columns on a laptop, and
 * a day is too narrow to see what is coming - so "today and the next two" is
 * the view you actually plan from. Google calls its own version "4 days"; the
 * shape is the same, only the span differs.
 */
type View = "day" | "3day" | "week" | "month";

/** How many days each grid view draws, starting at the anchor. */
const GRID_DAYS: Partial<Record<View, number>> = { day: 1, "3day": 3 };

const rangeQueryOptions = (from: string, to: string, tutorId: string | null) =>
  queryOptions({
    queryKey: ["timetable", from, to, tutorId],
    queryFn: () => listRange({ data: { from, to, tutor_id: tutorId } }),
  });

/** The span a view covers, and the days it draws. */
function spanFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "3day") return { from: anchor, to: addDays(anchor, 2) };
  if (view === "week") {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6) };
  }
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const lead = (new Date(`${monthStart}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(monthStart, -lead);
  return { from: gridStart, to: addDays(gridStart, 41) };
}

function titleFor(view: View, anchor: string) {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    d(iso).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

  /** "31 Aug – 6 Sept 2026", collapsing the month when both ends share one. */
  const span = (from: string, to: string) =>
    from.slice(0, 7) === to.slice(0, 7)
      ? `${Number(from.slice(8))} – ${fmt(to, { day: "numeric", month: "long", year: "numeric" })}`
      : `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;

  if (view === "day") {
    return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (view === "month") {
    return fmt(anchor, { month: "long", year: "numeric" });
  }
  if (view === "3day") {
    return span(anchor, addDays(anchor, 2));
  }

  const from = weekStart(anchor);
  return span(from, addDays(from, 6));
}

function step(view: View, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "3day") return addDays(anchor, 3 * direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/_authenticated/timetable")({
  loader: ({ context }) => {
    const { from, to } = spanFor("week", sydToday());
    return context.queryClient.ensureQueryData(rangeQueryOptions(from, to, null));
  },
  component: TimetablePage,
});

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "day", label: "Day" },
  { key: "3day", label: "3 days" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function TimetablePage() {
  // Who is looking decides what this page offers. A tutor reads the calendar
  // and marks their own roll; moving a class is the office's job, and the
  // database refuses it anyway - so the grid is handed no onMove at all rather
  // than letting a drag travel to the server and quietly change nothing.
  const { data: me } = useQuery(meQueryOptions());
  const may = lessonPermissions(me?.staff?.role);

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => sydToday());
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  // How tall an hour is drawn. Remembered per browser so the density you like
  // is there next time - quarter-hour lines appear once the rows are tall
  // enough to read them.
  const [hourHeight, setHourHeight] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem("tt-hour-height"));
      if (stored >= 40 && stored <= 160) return stored;
    } catch {
      /* private mode, or storage blocked - the default is fine. */
    }
    return 48;
  });
  useEffect(() => {
    try {
      localStorage.setItem("tt-hour-height", String(hourHeight));
    } catch {
      /* ignore - remembering it is a convenience, not a requirement. */
    }
  }, [hourHeight]);

  const { from, to } = spanFor(view, anchor);
  const { data: sessions } = useSuspenseQuery(rangeQueryOptions(from, to, tutorId));
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  const queryClient = useQueryClient();
  const reschedule = useServerFn(rescheduleSession);
  const sync = useServerFn(syncSessionToGoogle);

  const events = useMemo(() => sessions.map(toCalendarEvent), [sessions]);

  // Dragging or stretching a lesson goes through the one canonical reschedule
  // operation - the same one the edit dialog uses - so the same protections
  // apply either way: future lessons only, an unmarked roll only, and the same
  // session row (so the roll, hours and pay follow it). A move is just a move:
  // it never turns a lesson into a make-up. The grid is patched in place first
  // so the block does not jump back before the save returns.
  async function moveLesson(row: Row, startISO: string, endISO: string) {
    const key = ["timetable", from, to, tutorId] as const;
    const previous = queryClient.getQueryData<Row[]>(key);
    queryClient.setQueryData<Row[]>(key, (rows) =>
      (rows ?? []).map((s) =>
        s.id === row.id
          ? { ...s, starts_at: startISO, ends_at: endISO, session_date: sydDate(startISO) }
          : s,
      ),
    );
    try {
      const saved = await reschedule({
        data: { id: row.id, starts_at: startISO, ends_at: endISO },
      });
      // The move is saved. Google is a follow-on for the linked lessons only, and
      // its failure never puts the block back.
      const google = await syncAfterReschedule(
        saved,
        (id) => sync({ data: { session_id: id } }),
        row.id,
      );
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      if (google.ok) toast.success("Lesson moved. The roll moved with it.");
      else
        toast.warning(
          `Lesson moved. ${google.message ?? ""} Retry the Google sync from the lesson.`,
        );
    } catch (error) {
      queryClient.setQueryData(key, previous);
      toast.error((error as Error).message);
    }
  }

  const gridDays = useMemo(() => {
    const count = GRID_DAYS[view];
    if (count) return Array.from({ length: count }, (_, i) => addDays(anchor, i));
    if (view === "week") {
      const start = weekStart(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return [];
  }, [view, anchor]);

  const openDay = (day: string) => {
    setAnchor(day);
    setView("day");
  };

  return (
    <div className="stagger space-y-4">
      {/* Google's toolbar order: navigation first, then where you are, then how
          you are looking at it. */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-xl font-semibold tracking-tight sm:text-2xl">Timetable</h1>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnchor(sydToday())}
          className="rounded-full"
        >
          Today
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous"
            onClick={() => setAnchor(step(view, anchor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next"
            onClick={() => setAnchor(step(view, anchor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-w-0 text-base font-medium">{titleFor(view, anchor)}</div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {view !== "month" && (
            <div
              className="hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex"
              title="Row height - taller rows show the quarter-hours"
            >
              <StretchVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Slider
                className="w-24"
                min={40}
                max={160}
                step={4}
                value={[hourHeight]}
                onValueChange={([v]) => setHourHeight(v ?? 48)}
                aria-label="Row height"
              />
            </div>
          )}

          <Select
            value={tutorId ?? "all"}
            onValueChange={(v) => setTutorId(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-full min-w-32 sm:w-44">
              <SelectValue placeholder="All tutors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {(catalogue?.tutors ?? []).map((t: Row) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="scroll-x flex max-w-full items-center rounded-full border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  view === v.key
                    ? "bg-[oklch(0.55_0.19_258)] text-white"
                    : "text-foreground/75 hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <Button asChild size="sm" className="rounded-full">
            <Link to="/classes/new">
              <Plus className="mr-1 h-4 w-4" /> New class
            </Link>
          </Button>
        </div>
      </div>

      {/* The line under the title carries the only instructions this page gives,
          so it is set at body size and near-full contrast - muted grey at
          `text-xs` all but disappeared against the backdrop. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.8rem] leading-relaxed text-foreground/80">
        <span>
          Coloured by tutor · all times Sydney ·{" "}
          {may.reschedule
            ? "drag a lesson to move it, drag its edge to stretch it, click it to open · on a phone, hold a lesson for two seconds to start rearranging"
            : "tap a lesson to open it, mark the roll and write up what happened"}
          {sessions.length > 0 &&
            ` · ${sessions.length} ${sessions.length === 1 ? "lesson" : "lessons"}`}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="h-2 w-2 rounded-full ring-1 ring-black/25"
            style={{ backgroundColor: ROLL_DONE }}
          />
          roll marked
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="h-2.5 w-2.5 rounded-[3px] border-2"
            style={{ borderColor: ROLL_OVERDUE }}
          />
          roll still to mark
        </span>
      </div>

      {sessions.length === 0 && view !== "month" ? (
        <EmptyState
          icon={CalendarDays}
          title={
            view === "day"
              ? "Nothing on this day"
              : view === "3day"
                ? "Nothing in these three days"
                : "No lessons this week"
          }
          hint="Build a class and generate its lessons, or step to another date."
          action={
            <Button asChild size="sm">
              <Link to="/classes/new">Open Class Builder</Link>
            </Button>
          }
        />
      ) : view === "month" ? (
        <MonthGrid
          monthStart={`${anchor.slice(0, 7)}-01`}
          events={events}
          onSelect={setEditing}
          onOpenDay={openDay}
        />
      ) : (
        <TimeGrid
          days={gridDays}
          events={events}
          onSelect={setEditing}
          {...(may.reschedule ? { onMove: moveLesson } : {})}
          hourHeight={hourHeight}
        />
      )}

      {editing && (
        <SessionDialog
          session={editing}
          tutors={catalogue?.tutors ?? []}
          may={may}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SessionDialog({
  session,
  tutors,
  may,
  onClose,
}: {
  session: Row;
  tutors: Row[];
  /** What this viewer's role lets them do to a lesson. */
  may: LessonPermissions;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useServerFn(updateSession);
  const saveNotes = useServerFn(saveSessionNotes);
  const reschedule = useServerFn(rescheduleSession);
  const sync = useServerFn(syncSessionToGoogle);
  const cancel = useServerFn(cancelSession);
  const remove = useServerFn(deleteSession);

  const [tab, setTab] = useState<"details" | "roll">("details");
  const [tutor, setTutor] = useState<string>(session.tutor_id ?? "none");
  const [room, setRoom] = useState(session.room ?? "");
  const [start, setStart] = useState(toLocalInput(session.starts_at));
  const [end, setEnd] = useState(toLocalInput(session.ends_at));
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);

  // The lesson touches the roll, attendance and today at once, so everything
  // that shows it is refreshed together. Marking a student does not close the
  // panel - you are usually mid-roll - so `close` is a separate choice.
  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["timetable"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
      queryClient.invalidateQueries({ queryKey: ["roll"] }),
      queryClient.invalidateQueries({ queryKey: ["session-roll", session.id] }),
      queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] }),
    ]);
  }

  /**
   * The write a tutor is allowed to make: what happened in the lesson.
   *
   * Its own path, not a narrowed saveDetails, because it goes somewhere else -
   * a function that checks the tutor teaches this lesson - and because sharing
   * the handler is how a "just hide the fields" version of this ends up
   * sending a tutor_id of null the moment the form is edited.
   */
  async function saveNotesOnly() {
    setBusy(true);
    try {
      await saveNotes({ data: { id: session.id, notes } });
      toast.success("Notes saved.");
      await invalidate();
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    setBusy(true);
    try {
      // Times go through the one reschedule operation, metadata through the
      // update - so editing here gets exactly the same rules as a drag.
      const startsAt = fromLocalInput(start);
      const endsAt = fromLocalInput(end);
      const timeChanged =
        Date.parse(startsAt) !== Date.parse(session.starts_at) ||
        Date.parse(endsAt) !== Date.parse(session.ends_at);
      let saved: unknown = null;
      if (timeChanged) {
        saved = await reschedule({
          data: { id: session.id, starts_at: startsAt, ends_at: endsAt },
        });
      }
      await update({
        data: {
          id: session.id,
          tutor_id: tutor === "none" ? null : tutor,
          room,
          notes,
        },
      });
      // Google is updated after the tutor and room have been saved, so the event
      // carries the latest values.
      const google = timeChanged
        ? await syncAfterReschedule(
            saved as Row,
            (id) => sync({ data: { session_id: id } }),
            session.id,
          )
        : { ok: true, attempted: false };
      if (google.ok) toast.success("Lesson updated. The roll is untouched.");
      else
        toast.warning(
          `Lesson updated. ${google.message ?? ""} Retry the Google sync from this lesson.`,
        );
      await invalidate();
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {session.class_offerings?.programs?.name ?? "Lesson"} <Code>{session.code}</Code>
          </DialogTitle>
          <DialogDescription>
            {formatDay(session.starts_at)} · {formatHours(session.duration_hours)} ·{" "}
            {session.roll_total > 0
              ? `${session.roll_marked} of ${session.roll_total} marked`
              : "No roll seeded yet"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "details" | "roll")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">
              {may.manage ? "Time, tutor & room" : "Lesson & notes"}
            </TabsTrigger>
            <TabsTrigger value="roll">Roll & make-up</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-3">
            {/* A tutor sees the lesson's facts and cannot change them. Read-only
                text rather than disabled inputs: a greyed-out field still reads
                as "you could edit this if something were different", and none
                of these will ever be editable from this account. */}
            {!may.reschedule && (
              <div className="grid gap-2 rounded-lg border border-[var(--edge)] bg-[var(--mat-thin)] p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">When</p>
                  <p className="font-medium">
                    {formatDay(session.starts_at)} · {formatTime(session.starts_at)}–
                    {formatTime(session.ends_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tutor &amp; room</p>
                  <p className="font-medium">
                    {tutors.find((t) => t.id === session.tutor_id)?.full_name ?? "Unassigned"}
                    {session.room ? ` · ${session.room}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Times, tutor and room are set by the office. Mark the roll on the next tab, and
                  write up the lesson below.
                </p>
              </div>
            )}

            {may.reschedule && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Starts (Sydney)</Label>
                  <Input
                    id="start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">Ends (Sydney)</Label>
                  <Input
                    id="end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}

            {may.manage && (
              <div className="space-y-1.5">
                <Label>Tutor for this lesson</Label>
                <Select value={tutor} onValueChange={setTutor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {tutors.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A lesson's tutor is its own - changing it here is how cover works, and it is what
                  tutor pay counts.
                </p>
              </div>
            )}

            {may.manage && (
              <div className="space-y-1.5">
                <Label htmlFor="room">Room</Label>
                <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {may.manage && <GoogleSyncRow session={session} onSynced={invalidate} />}

            <DialogFooter className="flex-col gap-2 pt-1 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
                {may.manage && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="text-destructive">
                        Cancel lesson
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cancelling keeps the roll and the history. Nobody is paid for it and
                          nobody's hours are consumed. This is almost always what you want.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            await cancel({ data: { id: session.id, notes } });
                            toast.success("Lesson cancelled.");
                            await invalidate();
                            onClose();
                          }}
                        >
                          Cancel lesson
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {may.manage && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        disabled={session.roll_total > 0}
                        title={
                          session.roll_total > 0
                            ? "This lesson has a roll - cancel it instead, which keeps the record."
                            : undefined
                        }
                      >
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this lesson permanently?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The lesson is removed for good. It has no roll, so no attendance record is
                          affected. A lesson with a roll can only be cancelled.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            try {
                              await remove({ data: { id: session.id } });
                              toast.success("Lesson deleted.");
                              await invalidate();
                              onClose();
                            } catch (error) {
                              toast.error((error as Error).message);
                            }
                          }}
                        >
                          Delete lesson
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              <Button onClick={may.manage ? saveDetails : saveNotesOnly} disabled={busy}>
                {may.manage ? "Save changes" : "Save notes"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="roll" className="pt-3">
            <LessonRollPanel session={session} tutors={tutors} may={may} onChanged={invalidate} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The regular jobs on a lesson, gathered where you are looking at it: marking
 * the roll, adding a student, and making the class up. Each writes to the same
 * places the Roll and Class Builder do, so the timetable is not a separate copy
 * of the data - it is another door onto it.
 */
function LessonRollPanel({
  session,
  tutors,
  may,
  onChanged,
}: {
  session: Row;
  tutors: Row[];
  may: LessonPermissions;
  onChanged: () => Promise<void>;
}) {
  const mark = useServerFn(markAttendance);
  const bulk = useServerFn(markRollBulk);
  const hold = useServerFn(holdMakeUp);
  const seed = useServerFn(seedRoll);
  const setTrial = useServerFn(setTrialStatus);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["session-roll", session.id],
    queryFn: () => getSessionRoll({ data: { session_id: session.id } }),
  });
  const roll: Row[] = data?.roll ?? [];
  const trials: Row[] = data?.trials ?? [];
  const marked = roll.filter((r) => r.status !== "not_marked").length;
  const notMarkedIds = roll.filter((r) => r.status === "not_marked").map((r) => r.id);

  async function set(id: string, status: "present" | "absent" | "not_marked") {
    try {
      await mark({ data: { id, status } });
      await onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function markTrial(id: string, status: "attended" | "no_show" | "scheduled") {
    try {
      await setTrial({ data: { id, status } });
      await onChanged();
      await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  // Trial students booked onto this lesson, shown as their own small block with
  // the same Present / Away controls - but marking one moves the trial's status,
  // not an attendance row, so it never touches hours.
  const trialBlock = trials.length > 0 && (
    <div className="space-y-1">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Trial students ({trials.length})
      </p>
      {trials.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-2 rounded-md border border-[var(--edge)] px-2.5 py-1.5"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium">
              {t.leads?.student_name ?? "Trial"}
              <StatusPill tone="info">Trial</StatusPill>
            </div>
            <div className="text-[0.7rem] text-muted-foreground">
              <Code>{t.leads?.code ?? t.code}</Code> · lead
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant={t.status === "attended" ? "default" : "outline"}
              title="Attended"
              aria-label="Attended"
              onClick={() => markTrial(t.id, "attended")}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={t.status === "no_show" ? "destructive" : "outline"}
              title="No-show"
              aria-label="No-show"
              onClick={() => markTrial(t.id, "no_show")}
            >
              <X className="h-4 w-4" />
            </Button>
            {(t.status === "attended" || t.status === "no_show") && (
              <Button size="sm" variant="ghost" onClick={() => markTrial(t.id, "scheduled")}>
                Clear
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading the roll…</p>;
  }

  if (roll.length === 0) {
    return (
      <div className="space-y-3 py-2">
        {trialBlock}
        <p className="text-sm text-muted-foreground">
          {trials.length > 0
            ? "No enrolled students on the roll yet. Seeding adds every enrolled student - it is safe to run more than once."
            : "This lesson has no roll yet. Seeding adds every enrolled student - it is safe to run more than once."}
        </p>
        <Button
          size="sm"
          onClick={async () => {
            try {
              const { created } = await seed({ data: { session_id: session.id } });
              toast.success(`${created} student${created === 1 ? "" : "s"} added to the roll.`);
              await onChanged();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          Seed the roll
        </Button>
        {may.manage && (
          <AddStudentRow session={session} enrolledIds={new Set()} onChanged={onChanged} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <StatusPill tone={marked === roll.length ? "success" : marked > 0 ? "warning" : "neutral"}>
          {marked}/{roll.length} marked
        </StatusPill>
        <Button
          size="sm"
          variant="outline"
          disabled={notMarkedIds.length === 0}
          onClick={async () => {
            try {
              await bulk({ data: { ids: notMarkedIds, status: "present" } });
              toast.success("Whole class marked present.");
              await onChanged();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          All present
        </Button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {roll.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-md border border-[var(--edge)] px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {r.enrolments?.students?.full_name ?? "-"}
              </div>
              <div className="text-[0.7rem] text-muted-foreground">
                <Code>{r.enrolments?.students?.code}</Code>
                {r.att_type === "make_up" ? " · make-up" : r.att_type === "trial" ? " · trial" : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant={r.status === "present" ? "default" : "outline"}
                title="Present"
                aria-label="Present"
                onClick={() => set(r.id, "present")}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={r.status === "absent" ? "destructive" : "outline"}
                title="Away"
                aria-label="Away"
                onClick={() => set(r.id, "absent")}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                title="Away, and owed a make-up"
                disabled={r.att_type === "make_up"}
                onClick={async () => {
                  try {
                    await hold({ data: { ids: [r.id] } });
                    toast.success("Marked away and owed a make-up.");
                    await onChanged();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Make up
              </Button>
              {r.status !== "not_marked" && (
                <Button size="sm" variant="ghost" onClick={() => set(r.id, "not_marked")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {trialBlock}

      {may.manage && (
        <AddStudentRow
          session={session}
          enrolledIds={new Set(roll.map((r) => r.enrolments?.students?.id).filter(Boolean))}
          onChanged={onChanged}
        />
      )}

      {may.reschedule && (
        <RescheduleClassForm session={session} tutors={tutors} onChanged={onChanged} />
      )}
    </div>
  );
}

/** Enrol a student straight onto this lesson's class, without leaving the day. */
function AddStudentRow({
  session,
  enrolledIds,
  onChanged,
}: {
  session: Row;
  enrolledIds: Set<string>;
  onChanged: () => Promise<void>;
}) {
  const enrol = useServerFn(saveEnrolment);
  const { data: students } = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const [studentId, setStudentId] = useState("");
  const [method, setMethod] = useState<"hours" | "payg" | "trial">("hours");
  const [busy, setBusy] = useState(false);

  const candidates = (students ?? []).filter((s: Row) => !enrolledIds.has(s.id));

  async function add() {
    if (!studentId) return;
    setBusy(true);
    try {
      await enrol({
        data: {
          student_id: studentId,
          class_offering_id: session.class_offering_id,
          status: method === "trial" ? "trial" : "active",
          starts_on: sydToday(),
          method: method === "trial" ? null : method,
        },
      });
      toast.success("Student enrolled and added to the roll.");
      setStudentId("");
      await onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-[var(--edge)] p-2.5">
      <Label className="text-xs text-muted-foreground">Add a student to this class</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="h-8 min-w-44 flex-1">
            <SelectValue placeholder="Choose a student…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((s: Row) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={(v) => setMethod(v as "hours" | "payg" | "trial")}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="payg">PAYG</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" disabled={busy || !studentId} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * The compact Google Calendar row.
 *
 * Shown only for a lesson already linked to the sync test calendar - Stage 3A
 * never creates events, so an unlinked lesson gets no control at all. A failed
 * retry keeps the dialog open and stays visibly failed.
 */
function GoogleSyncRow({ session, onSynced }: { session: Row; onSynced: () => Promise<void> }) {
  const sync = useServerFn(syncSessionToGoogle);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<SyncView>(() =>
    syncViewFromSession(session.calendar_sync_status, session.calendar_last_synced_at),
  );

  // A refreshed Session (a reschedule elsewhere, a timetable refetch) wins over
  // the local copy, so the row never drifts from the record.
  useEffect(() => {
    setView(syncViewFromSession(session.calendar_sync_status, session.calendar_last_synced_at));
  }, [session.id, session.calendar_sync_status, session.calendar_last_synced_at]);

  if (!isMappedSession(session as { google_calendar_id?: string | null })) return null;

  const lastSynced = view.lastSyncedAt
    ? `${formatDayDate(view.lastSyncedAt)}, ${formatTime(view.lastSyncedAt)}`
    : null;

  async function retry() {
    setBusy(true);
    setView((v) => nextSyncView(v, { type: "start" }));
    try {
      await sync({ data: { session_id: session.id } });
      setView((v) => nextSyncView(v, { type: "success", at: new Date().toISOString() }));
      toast.success("Google Calendar updated.");
      await onSynced();
    } catch (error) {
      // The dialog stays open and visibly failed - the timetable move is saved
      // either way, and this is only the Google follow-on.
      setView((v) => nextSyncView(v, { type: "failure" }));
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Google Calendar</span>
          <StatusPill tone={syncTone(view.status)}>
            {view.status === "not_synced" ? "pending" : view.status}
          </StatusPill>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {lastSynced ? `Last synced ${lastSynced} (Sydney)` : "Not synced yet"}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={retry}>
        {busy ? "Syncing..." : view.status === "failed" ? "Retry sync" : "Sync now"}
      </Button>
    </div>
  );
}

/**
 * Reschedule the whole class to another day and time, exactly as a drag would -
 * the same lesson, the same id, the same roll. It stays an ordinary lesson; a
 * make-up is a per-student decision taken on the roll, not a class-wide move.
 */
function RescheduleClassForm({
  session,
  tutors,
  onChanged,
}: {
  session: Row;
  tutors: Row[];
  onChanged: () => Promise<void>;
}) {
  const reschedule = useServerFn(rescheduleSession);
  const update = useServerFn(updateSession);
  const sync = useServerFn(syncSessionToGoogle);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => addDays(sydToday(), 7));
  const [startTime, setStartTime] = useState(() => toLocalInput(session.starts_at).slice(11, 16));
  const [endTime, setEndTime] = useState(() => toLocalInput(session.ends_at).slice(11, 16));
  const [tutorId, setTutorId] = useState<string>(session.tutor_id ?? "none");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const startsAt = fromLocalInput(`${date}T${startTime}`);
      const endsAt = fromLocalInput(`${date}T${endTime}`);
      if (Date.parse(endsAt) <= Date.parse(startsAt)) {
        toast.error("The end time has to be after the start time.");
        return;
      }
      const saved = await reschedule({
        data: { id: session.id, starts_at: startsAt, ends_at: endsAt },
      });
      const nextTutor = tutorId === "none" ? null : tutorId;
      if (nextTutor !== (session.tutor_id ?? null)) {
        await update({ data: { id: session.id, tutor_id: nextTutor } });
      }
      const google = await syncAfterReschedule(
        saved as Row,
        (id) => sync({ data: { session_id: id } }),
        session.id,
      );
      if (google.ok) toast.success("Class rescheduled to that day. The roll moved with it.");
      else
        toast.warning(
          `Class rescheduled. ${google.message ?? ""} Retry the Google sync from this lesson.`,
        );
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        Move the whole class to another day
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-[var(--edge)] bg-[var(--mat-thin)] p-3">
      <p className="text-xs text-muted-foreground">
        Moves this class to the day and time you set. The same lesson moves, so the roll goes with
        it - no second lesson is made, and it stays an ordinary lesson. A tutor is optional.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Day</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Starts</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ends</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tutor</Label>
        <Select value={tutorId} onValueChange={setTutorId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Decide later</SelectItem>
            {tutors.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={submit}>
          Reschedule class
        </Button>
      </div>
    </div>
  );
}
