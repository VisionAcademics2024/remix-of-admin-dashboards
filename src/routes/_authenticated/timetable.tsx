import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import {
  Code,
  EmptyState,
  PageHeader,
  StatusPill,
  TutorDot,
  toneForStatus,
} from "@/components/vision/ui";
import {
  addDays,
  formatDate,
  formatDay,
  formatHours,
  formatTime,
  instantToSydneyLocal as toLocalInput,
  sydneyLocalToInstant as fromLocalInput,
  sydToday,
  weekStart,
} from "@/lib/format";
import {
  cancelSession,
  deleteSession,
  listWeek,
  updateSession,
} from "@/lib/vision/schedule.functions";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import type { Row } from "@/lib/vision/types";

const weekQueryOptions = (week: string, tutorId: string | null) =>
  queryOptions({
    queryKey: ["timetable", week, tutorId],
    queryFn: () => listWeek({ data: { week_start: week, tutor_id: tutorId } }),
  });

export const Route = createFileRoute("/_authenticated/timetable")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(weekQueryOptions(weekStart(sydToday()), null)),
  component: TimetablePage,
});

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TimetablePage() {
  const [week, setWeek] = useState(() => weekStart(sydToday()));
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const { data: sessions } = useSuspenseQuery(weekQueryOptions(week, tutorId));
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byDay = new Map<string, Row[]>();
  for (const s of sessions) {
    const list = byDay.get(s.session_date) ?? [];
    list.push(s);
    byDay.set(s.session_date, list);
  }

  const today = sydToday();

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="Timetable"
        description="The week, coloured by tutor. Times, tutors, rooms and cancellations happen here."
        actions={
          <>
            <Select
              value={tutorId ?? "all"}
              onValueChange={(v) => setTutorId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-48">
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
            <div className="flex items-center gap-1 rounded-md border p-1">
              <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeek(weekStart(sydToday()))}>
                This week
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button asChild size="sm">
              <Link to="/classes/new">
                <Plus className="mr-1 h-4 w-4" /> New class
              </Link>
            </Button>
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        {formatDate(week)} – {formatDate(addDays(week, 6))} · all times Sydney
      </p>

      {sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No lessons this week"
          hint="Build a class and generate its lessons, or step to another week."
          action={
            <Button asChild size="sm">
              <Link to="/classes/new">Open Class Builder</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {days.map((day, i) => {
            const list = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className={`min-w-0 rounded-lg border p-2 ${day === today ? "border-primary/60 bg-primary/5" : "bg-card"}`}
              >
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-sm font-semibold">{DAY_NAMES[i]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDay(day).replace(/^\w+,?\s*/, "")}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.length === 0 && (
                    <p className="px-1 py-3 text-xs text-muted-foreground">—</p>
                  )}
                  {list.map((s: Row) => (
                    <button
                      key={s.id}
                      onClick={() => setEditing(s)}
                      className="w-full rounded-md border-l-4 bg-background p-2 text-left shadow-sm transition hover:shadow"
                      style={{ borderLeftColor: s.tutors?.colour ?? "var(--color-border)" }}
                    >
                      <div className="text-xs font-semibold tabular-nums">
                        {formatTime(s.starts_at)}
                      </div>
                      <div className="truncate text-sm font-medium">
                        {s.class_offerings?.programs?.name ?? "Lesson"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        <TutorDot colour={s.tutors?.colour} name={s.tutors?.full_name} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <StatusPill tone={toneForStatus("session", s.status)}>
                          {s.status}
                        </StatusPill>
                        {s.roll_total > 0 && (
                          <StatusPill tone={s.roll_marked === s.roll_total ? "success" : "warning"}>
                            {s.roll_marked}/{s.roll_total}
                          </StatusPill>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
