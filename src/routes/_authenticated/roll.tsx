import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  TableShell,
  Td,
  Th,
  TutorDot,
  toneForStatus,
} from "@/components/vision/ui";
import { Segmented } from "@/components/vision/segmented";
import { addDays, formatDay, formatHours, formatTime, sydToday, weekStart } from "@/lib/format";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import type { Row } from "@/lib/vision/types";
import {
  bookMakeUp,
  holdMakeUp,
  listLessonsOnDate,
  listRoll,
  markAttendance,
  markRollBulk,
  setLessonTutor,
  type RollFilter,
} from "@/lib/vision/roll.functions";

const FILTERS: { value: RollFilter; label: string; hint: string }[] = [
  { value: "today", label: "Today", hint: "Every roll entry for a lesson dated today in Sydney." },
  {
    value: "unmarked",
    label: "Unmarked",
    hint: "Lessons that have run and still have blank entries.",
  },
  { value: "this_week", label: "This week", hint: "Monday to Sunday, Sydney." },
  {
    value: "make_ups",
    label: "Make-ups",
    hint: "Absences owed a make-up, and the make-ups already booked.",
  },
  {
    value: "trials",
    label: "Trials",
    hint: "Trial students. They are marked, but never consume hours.",
  },
  { value: "all", label: "All", hint: "The last four months of roll history." },
];

const rollQueryOptions = (filter: RollFilter, today: string) =>
  queryOptions({
    queryKey: ["roll", filter, today],
    queryFn: () => listRoll({ data: { filter, today, week_start: weekStart(today) } }),
    // The rows on screen stay there while the next filter loads, so switching
    // filters moves the page instead of blanking and rebuilding it.
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/_authenticated/roll")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(rollQueryOptions("today", sydToday())),
  component: RollPage,
});

function RollPage() {
  const today = sydToday();
  const [filter, setFilter] = useState<RollFilter>("today");
  const [search, setSearch] = useState("");
  const [makingUp, setMakingUp] = useState<Row | null>(null);

  // Which way the panel enters: the direction the selection travelled.
  const previousIndex = useRef(0);
  const index = FILTERS.findIndex((f) => f.value === filter);
  const direction = index >= previousIndex.current ? "right" : "left";

  const { data: rows = [], isFetching } = useQuery(rollQueryOptions(filter, today));
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);
  const bulk = useServerFn(markRollBulk);

  const active = FILTERS[index]!;
  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter((r: Row) =>
        `${r.enrolments?.students?.full_name ?? ""} ${r.enrolments?.students?.code ?? ""} ${r.code}`
          .toLowerCase()
          .includes(term),
      )
    : rows;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["roll"] });
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
  }

  async function setStatus(id: string, status: "present" | "absent" | "not_marked") {
    try {
      await mark({ data: { id, status } });
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const unmarkedIds = visible.filter((r: Row) => r.status === "not_marked").map((r: Row) => r.id);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Roll"
        description="The full attendance record — corrections, history and make-ups."
        actions={
          unmarkedIds.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await bulk({ data: { ids: unmarkedIds, status: "present" } });
                  toast.success(`Marked ${unmarkedIds.length} present.`);
                  await refresh();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Mark all {unmarkedIds.length} present
            </Button>
          ) : undefined
        }
      />

      <Segmented
        value={filter}
        onValueChange={(next) => {
          previousIndex.current = index;
          setFilter(next);
        }}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        className="flex-wrap"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{active.hint}</p>
        <Input
          className="w-64"
          placeholder="Search student or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stable wrapper so the page stagger does not replay; the keyed child is
          what slides when the filter changes. */}
      <div className={isFetching ? "opacity-80 transition-opacity" : "transition-opacity"}>
        <div key={filter} className={direction === "right" ? "panel-in-right" : "panel-in-left"}>
          {visible.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={filter === "unmarked" ? "Nothing left to mark" : "No roll entries here"}
              hint={
                filter === "unmarked"
                  ? "Every lesson that has run has a complete roll."
                  : "Try another filter, or seed the roll from a lesson on the Timetable."
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Lesson</Th>
                  <Th>Date</Th>
                  <Th>Tutor</Th>
                  <Th>Type</Th>
                  <Th>Billing</Th>
                  <Th>Hours</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Mark</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row: Row) => (
                  <tr key={row.id}>
                    <Td>
                      <Link
                        to="/students/$id"
                        params={{ id: row.student_id }}
                        className="font-medium hover:underline"
                      >
                        {row.enrolments?.students?.full_name ?? "—"}
                      </Link>
                      <div>
                        <Code>{row.enrolments?.students?.code}</Code>
                      </div>
                    </Td>
                    <Td>
                      <div className="max-w-48 truncate">
                        {row.sessions?.class_offerings?.programs?.name ?? "—"}
                      </div>
                      <Code>{row.sessions?.code}</Code>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {formatDay(row.lesson_starts_at)}
                      <div className="text-xs text-muted-foreground">
                        {formatTime(row.lesson_starts_at)}
                      </div>
                    </Td>
                    <Td>
                      <TutorCell row={row} tutors={catalogue?.tutors ?? []} onChanged={refresh} />
                    </Td>
                    <Td>
                      <StatusPill
                        tone={
                          row.att_type === "trial"
                            ? "info"
                            : row.att_type === "make_up"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {row.att_type === "make_up"
                          ? "Make-up"
                          : row.att_type === "trial"
                            ? "Trial"
                            : "Regular"}
                      </StatusPill>
                      {row.make_up_state && (
                        <div className="mt-1">
                          <StatusPill tone={toneForStatus("makeup", row.make_up_state)}>
                            {row.make_up_state === "outstanding" ? "owed" : row.make_up_state}
                          </StatusPill>
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.billing_method === "hours"
                        ? row.package_id
                          ? "Hours"
                          : "Hours · no package"
                        : row.billing_method === "payg"
                          ? "PAYG"
                          : "Trial"}
                    </Td>
                    <Td className="tabular-nums">{formatHours(row.hours_consumed)}</Td>
                    <Td>
                      <StatusPill tone={toneForStatus("attendance", row.effective_status)}>
                        {row.effective_status.replace("_", " ")}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={row.status === "present" ? "default" : "outline"}
                          title="Present"
                          onClick={() => setStatus(row.id, "present")}
                        >
                          P
                        </Button>
                        <Button
                          size="sm"
                          variant={row.status === "absent" ? "destructive" : "outline"}
                          title="Away"
                          onClick={() => setStatus(row.id, "absent")}
                        >
                          A
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Away, and owed a make-up"
                          disabled={row.att_type === "make_up"}
                          onClick={() => setMakingUp(row)}
                        >
                          M
                        </Button>
                        {row.status !== "not_marked" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus(row.id, "not_marked")}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Un-marking a student refunds their hours automatically — the balance is a view, not a stored
        number. A PAYG entry with no package is normal and is never flagged.
      </p>

      {makingUp && (
        <MakeUpDialog
          row={makingUp}
          tutors={catalogue?.tutors ?? []}
          onClose={() => setMakingUp(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

/**
 * The tutor, and a way to set it. A make-up lesson is usually booked before
 * anyone knows who is teaching it, so an empty tutor is a normal state here
 * rather than a fault — but it should be fixable without leaving the roll.
 */
function TutorCell({
  row,
  tutors,
  onChanged,
}: {
  row: Row;
  tutors: Row[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const setTutor = useServerFn(setLessonTutor);

  if (!open) {
    return row.sessions?.tutors?.full_name ? (
      <button
        type="button"
        className="text-left hover:underline"
        onClick={() => setOpen(true)}
        title="Change the tutor on this lesson"
      >
        <TutorDot colour={row.sessions?.tutors?.colour} name={row.sessions.tutors.full_name} />
      </button>
    ) : (
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        onClick={() => setOpen(true)}
      >
        + Set tutor
      </button>
    );
  }

  return (
    <Select
      open
      value={row.lesson_tutor_id ?? "none"}
      onValueChange={async (v) => {
        setOpen(false);
        try {
          await setTutor({
            data: { session_id: row.session_id, tutor_id: v === "none" ? null : v },
          });
          await onChanged();
        } catch (error) {
          toast.error((error as Error).message);
        }
      }}
      onOpenChange={(o) => !o && setOpen(false)}
    >
      <SelectTrigger className="h-8 w-36">
        <SelectValue placeholder="Tutor" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No tutor yet</SelectItem>
        {tutors.map((t: Row) => (
          <SelectItem key={t.id} value={t.id}>
            {t.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Away, and owed a make-up.
 *
 * Two outcomes, because there are only two things that are actually true at
 * this moment: a day has been picked, or it has not. Everything else — who
 * teaches it, which package pays — can be filled in later and should not block
 * recording that the student was away.
 */
function MakeUpDialog({
  row,
  tutors,
  onClose,
  onDone,
}: {
  row: Row;
  tutors: Row[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const hold = useServerFn(holdMakeUp);
  const book = useServerFn(bookMakeUp);

  const [mode, setMode] = useState<"hold" | "day">("hold");
  const [date, setDate] = useState(() => addDays(sydToday(), 7));
  const [startTime, setStartTime] = useState("16:00");
  const [duration, setDuration] = useState(() => {
    const start = row.sessions?.starts_at;
    const end = row.sessions?.ends_at;
    if (!start || !end) return "1";
    const hours = (Date.parse(end) - Date.parse(start)) / 3_600_000;
    return hours > 0 ? String(Math.round(hours * 2) / 2) : "1";
  });
  const [tutorId, setTutorId] = useState<string>("none");
  const [existingId, setExistingId] = useState<string>("new");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: onDate } = useQuery({
    queryKey: ["lessons-on", date, row.id],
    queryFn: () => listLessonsOnDate({ data: { date, attendance_id: row.id } }),
    enabled: mode === "day",
  });

  const student = row.enrolments?.students?.full_name ?? "This student";
  const lessons = (onDate?.lessons ?? []).filter((l: Row) => l.id !== row.session_id);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "hold") {
        await hold({ data: { id: row.id, note } });
        toast.success(`${student} is away and owed a make-up.`);
      } else if (existingId !== "new") {
        await book({ data: { source_attendance_id: row.id, session_id: existingId } });
        toast.success("Make-up booked onto that lesson.");
      } else {
        await book({
          data: {
            source_attendance_id: row.id,
            session_id: null,
            date,
            start_time: startTime,
            duration_hours: Number(duration) || 1,
            tutor_id: tutorId === "none" ? null : tutorId,
          },
        });
        toast.success(`Make-up booked for ${formatDay(`${date}T00:00:00Z`)}.`);
      }
      await onDone();
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
          <DialogTitle>{student} — make-up</DialogTitle>
          <DialogDescription>
            Marks them away for {row.sessions?.class_offerings?.programs?.name ?? "this lesson"} on{" "}
            {formatDay(row.lesson_starts_at)}. Pick a day now if you have one; otherwise hold it and
            decide later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <ModeCard
              active={mode === "hold"}
              onClick={() => setMode("hold")}
              title="Hold for now"
              hint="No day or tutor decided. It stays on the Make-ups list until you book it."
            />
            <ModeCard
              active={mode === "day"}
              onClick={() => setMode("day")}
              title="Pick a day"
              hint="Books the make-up. A tutor is optional — decide that later if you need to."
            />
          </div>

          {mode === "hold" ? (
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                placeholder="Family away until the 12th…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Day</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              {lessons.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Put them on</Label>
                  <Select value={existingId} onValueChange={setExistingId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">A new lesson just for this make-up</SelectItem>
                      {lessons.map((l: Row) => (
                        <SelectItem key={l.id} value={l.id}>
                          {formatTime(l.starts_at)} · {l.code}
                          {l.tutors?.full_name ? ` · ${l.tutors.full_name}` : " · no tutor"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {existingId === "new" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Starts</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Hours</Label>
                      <Input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                      />
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
                        {tutors.map((t: Row) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {mode === "hold" ? "Mark away, hold the make-up" : "Book the make-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-lg border p-3 text-left transition-colors " +
        (active ? "border-primary bg-primary/10" : "hover:bg-accent")
      }
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}
