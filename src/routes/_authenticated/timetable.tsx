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
import { MonthGrid, TimeGrid, toCalendarEvent } from "@/components/vision/calendar";
import { cn } from "@/lib/utils";
import {
  addDays,
  formatDay,
  formatHours,
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
  seedRoll,
  updateSession,
} from "@/lib/vision/schedule.functions";
import { holdMakeUp, markAttendance, markRollBulk } from "@/lib/vision/roll.functions";
import { saveEnrolment } from "@/lib/vision/commerce.functions";
import { listStudents } from "@/lib/vision/people.functions";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import type { Row } from "@/lib/vision/types";

type View = "day" | "week" | "month";

const rangeQueryOptions = (from: string, to: string, tutorId: string | null) =>
  queryOptions({
    queryKey: ["timetable", from, to, tutorId],
    queryFn: () => listRange({ data: { from, to, tutor_id: tutorId } }),
  });

/** The span a view covers, and the days it draws. */
function spanFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
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

  if (view === "day") {
    return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (view === "month") {
    return fmt(anchor, { month: "long", year: "numeric" });
  }

  const from = weekStart(anchor);
  const to = addDays(from, 6);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth
    ? `${Number(from.slice(8))} – ${fmt(to, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

function step(view: View, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
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
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function TimetablePage() {
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
      await reschedule({ data: { id: row.id, starts_at: startISO, ends_at: endISO } });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      toast.success("Lesson moved. The roll moved with it.");
    } catch (error) {
      queryClient.setQueryData(key, previous);
      toast.error((error as Error).message);
    }
  }

  const gridDays = useMemo(() => {
    if (view === "day") return [anchor];
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
        <h1 className="mr-1 text-2xl font-semibold tracking-tight">Timetable</h1>

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

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
            <SelectTrigger className="w-44">
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

          <div className="flex items-center rounded-full border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  view === v.key
                    ? "bg-[oklch(0.55_0.19_258)] text-white"
                    : "text-muted-foreground hover:text-foreground",
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

      <p className="text-xs text-muted-foreground">
        Coloured by tutor · all times Sydney · drag a lesson to move it, drag its edge to stretch
        it, click it to open
        {sessions.length > 0 &&
          ` · ${sessions.length} ${sessions.length === 1 ? "lesson" : "lessons"}`}
      </p>

      {sessions.length === 0 && view !== "month" ? (
        <EmptyState
          icon={CalendarDays}
          title={view === "day" ? "Nothing on this day" : "No lessons this week"}
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
          onMove={moveLesson}
          hourHeight={hourHeight}
        />
      )}

      {editing && (
        <SessionDialog
          session={editing}
          tutors={catalogue?.tutors ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SessionDialog({
  session,
  tutors,
  onClose,
}: {
  session: Row;
  tutors: Row[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useServerFn(updateSession);
  const reschedule = useServerFn(rescheduleSession);
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
      if (timeChanged) {
        await reschedule({ data: { id: session.id, starts_at: startsAt, ends_at: endsAt } });
      }
      await update({
        data: {
          id: session.id,
          tutor_id: tutor === "none" ? null : tutor,
          room,
          notes,
        },
      });
      toast.success("Lesson updated. The roll is untouched.");
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
            <TabsTrigger value="details">Time, tutor & room</TabsTrigger>
            <TabsTrigger value="roll">Roll & make-up</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <Label htmlFor="room">Room</Label>
              <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="flex-col gap-2 pt-1 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
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
              </div>

              <Button onClick={saveDetails} disabled={busy}>
                Save changes
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="roll" className="pt-3">
            <LessonRollPanel session={session} tutors={tutors} onChanged={invalidate} />
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
  onChanged,
}: {
  session: Row;
  tutors: Row[];
  onChanged: () => Promise<void>;
}) {
  const mark = useServerFn(markAttendance);
  const bulk = useServerFn(markRollBulk);
  const hold = useServerFn(holdMakeUp);
  const seed = useServerFn(seedRoll);

  const { data, isLoading } = useQuery({
    queryKey: ["session-roll", session.id],
    queryFn: () => getSessionRoll({ data: { session_id: session.id } }),
  });
  const roll: Row[] = data?.roll ?? [];
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

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading the roll…</p>;
  }

  if (roll.length === 0) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          This lesson has no roll yet. Seeding adds every enrolled student - it is safe to run more
          than once.
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
        <AddStudentRow session={session} enrolledIds={new Set()} onChanged={onChanged} />
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

      <AddStudentRow
        session={session}
        enrolledIds={new Set(roll.map((r) => r.enrolments?.students?.id).filter(Boolean))}
        onChanged={onChanged}
      />

      <MakeUpClassForm session={session} tutors={tutors} onChanged={onChanged} />
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
 * Reschedule the whole class to another day and time, exactly as a drag would -
 * the same lesson, the same id, the same roll. It stays an ordinary lesson; a
 * make-up is a per-student decision taken on the roll, not a class-wide move.
 */
function MakeUpClassForm({
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
      await reschedule({ data: { id: session.id, starts_at: startsAt, ends_at: endsAt } });
      const nextTutor = tutorId === "none" ? null : tutorId;
      if (nextTutor !== (session.tutor_id ?? null)) {
        await update({ data: { id: session.id, tutor_id: nextTutor } });
      }
      toast.success("Class rescheduled to that day. The roll moved with it.");
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
        Make up the class on another day
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-[var(--edge)] bg-[var(--mat-thin)] p-3">
      <p className="text-xs text-muted-foreground">
        Moves this class to the day and time you set. The same lesson moves, so the roll goes with
        it - no second lesson is made, and it stays an ordinary lesson. A tutor is optional.
      </p>
      <div className="grid grid-cols-3 gap-2">
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
          Move to make-up
        </Button>
      </div>
    </div>
  );
}
