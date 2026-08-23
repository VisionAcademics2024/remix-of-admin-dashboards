import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { Code, EmptyState } from "@/components/vision/ui";
import { MonthGrid, TimeGrid, toCalendarEvent } from "@/components/vision/calendar";
import { cn } from "@/lib/utils";
import {
  addDays,
  formatDay,
  formatHours,
  instantToSydneyLocal as toLocalInput,
  sydneyLocalToInstant as fromLocalInput,
  sydToday,
  weekStart,
} from "@/lib/format";
import {
  cancelSession,
  deleteSession,
  listRange,
  updateSession,
} from "@/lib/vision/schedule.functions";
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

  const { from, to } = spanFor(view, anchor);
  const { data: sessions } = useSuspenseQuery(rangeQueryOptions(from, to, tutorId));
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  const events = useMemo(() => sessions.map(toCalendarEvent), [sessions]);

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
        Coloured by tutor · all times Sydney
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
        <TimeGrid days={gridDays} events={events} onSelect={setEditing} />
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
  const cancel = useServerFn(cancelSession);
  const remove = useServerFn(deleteSession);

  const [tutor, setTutor] = useState<string>(session.tutor_id ?? "none");
  const [room, setRoom] = useState(session.room ?? "");
  const [start, setStart] = useState(toLocalInput(session.starts_at));
  const [end, setEnd] = useState(toLocalInput(session.ends_at));
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    onClose();
  }

  async function save() {
    setBusy(true);
    try {
      await update({
        data: {
          id: session.id,
          tutor_id: tutor === "none" ? null : tutor,
          room,
          notes,
          starts_at: fromLocalInput(start),
          ends_at: fromLocalInput(end),
        },
      });
      toast.success("Lesson updated. The roll is untouched.");
      await refresh();
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

        <div className="grid gap-3">
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
              A lesson's tutor is its own — changing it here is how cover works, and it is what
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
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
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
                    Cancelling keeps the roll and the history. Nobody is paid for it and nobody's
                    hours are consumed. This is almost always what you want.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await cancel({ data: { id: session.id, notes } });
                      toast.success("Lesson cancelled.");
                      await refresh();
                    }}
                  >
                    Cancel lesson
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {session.roll_total === 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this lesson permanently?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Only possible because it has no roll. Anything with attendance must be
                      cancelled instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await remove({ data: { id: session.id } });
                          toast.success("Lesson deleted.");
                          await refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <Button onClick={save} disabled={busy}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
