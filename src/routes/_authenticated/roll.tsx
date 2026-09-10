import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
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
  Section,
  StatusPill,
  Td,
  Th,
  TutorDot,
  toneForStatus,
} from "@/components/vision/ui";
import { Segmented } from "@/components/vision/segmented";
import {
  addDays,
  formatDay,
  formatHours,
  formatTime,
  instantToSydneyLocal,
  sydToday,
  weekStart,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import { listTrialRoll, setTrialStatus } from "@/lib/vision/leads.functions";
import { meQueryOptions } from "@/lib/vision/me";
import {
  lessonPermissions,
  mayMarkRoll,
  type LessonPermissions,
  type Viewer,
} from "@/lib/vision/tutor-access";
import { LABELS, type Row } from "@/lib/vision/types";
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
    value: "tomorrow",
    label: "Tomorrow",
    hint: "Every roll entry for a lesson dated tomorrow in Sydney.",
  },
  { value: "this_week", label: "This week", hint: "Monday to Sunday, Sydney." },
  {
    value: "unmarked",
    label: "Unmarked",
    hint: "Lessons that have run and still have blank entries.",
  },
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
  const [makingUp, setMakingUp] = useState<Row[] | null>(null);

  // Which way the panel enters: the direction the selection travelled.
  const previousIndex = useRef(0);
  const index = FILTERS.findIndex((f) => f.value === filter);
  const direction = index >= previousIndex.current ? "right" : "left";

  const { data: rows = [], isFetching } = useQuery(rollQueryOptions(filter, today));
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);
  const bulk = useServerFn(markRollBulk);

  // Marking is a tutor's job; reassigning a lesson's tutor and booking a
  // make-up onto a new day are scheduling, and the API refuses those now. The
  // screen stops offering them rather than letting the refusal be the answer.
  const { data: me } = useQuery(meQueryOptions());
  const may = lessonPermissions(me?.staff?.role);

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
    // Flip the row the instant it is tapped, before the server answers, so the
    // button colour confirms the press with no wait. If the save fails the row
    // is rolled back to what it was and the error shown.
    const key = ["roll", filter, today];
    const previous = queryClient.getQueryData<Row[]>(key);
    queryClient.setQueryData<Row[]>(key, (old) =>
      (old ?? []).map((r) => (r.id === id ? { ...r, status, effective_status: status } : r)),
    );
    try {
      await mark({ data: { id, status } });
      await refresh();
    } catch (error) {
      if (previous) queryClient.setQueryData(key, previous);
      toast.error((error as Error).message);
    }
  }

  // A roll is read one class at a time, not one student at a time: the whole
  // group turns up together, is away together, and is made up together. Rows
  // are grouped by the lesson they belong to so the sheet matches the room.
  const groups = groupByLesson(visible);

  const unmarkedIds = visible.filter((r: Row) => r.status === "not_marked").map((r: Row) => r.id);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Attendance Roll"
        description="The full attendance record - corrections, history and make-ups."
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
          className="w-full sm:w-64"
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
            <div className="space-y-4">
              {groups.map((group, i) => (
                <LessonGroup
                  key={group.sessionId}
                  group={group}
                  showColumns={i === 0}
                  tutors={catalogue?.tutors ?? []}
                  onSetStatus={setStatus}
                  may={may}
                  onMakeUp={setMakingUp}
                  onBulk={async (ids, status) => {
                    try {
                      await bulk({ data: { ids, status } });
                      await refresh();
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TrialRollSection filter={filter} today={today} staff={me?.staff ?? null} />

      <p className="text-xs text-muted-foreground">
        Un-marking a student refunds their hours automatically - the balance is a view, not a stored
        number. A PAYG entry with no package is normal and is never flagged.
      </p>

      {makingUp && (
        <MakeUpDialog
          may={may}
          rows={makingUp}
          tutors={catalogue?.tutors ?? []}
          onClose={() => setMakingUp(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

/**
 * Trial students overlaid on the roll. They have no student or attendance record
 * until conversion, so they are read straight from the trials table and shown as
 * a clearly-labelled block. Marking one updates the trial's own status, not a
 * real attendance row.
 */
const TRIAL_ROLL_FILTERS: RollFilter[] = ["today", "tomorrow", "this_week", "trials", "all"];

function TrialRollSection({
  filter,
  today,
  staff,
}: {
  filter: RollFilter;
  today: string;
  staff: Viewer;
}) {
  const queryClient = useQueryClient();
  // Marking a trial student is only ever a change of status, so it goes through
  // the endpoint that changes only that. The fuller save also writes the lead,
  // which is the office's record and none of a tutor's business.
  const save = useServerFn(setTrialStatus);
  const enabled = TRIAL_ROLL_FILTERS.includes(filter);

  const queryKey = ["trial-roll", filter, today];
  const { data: trials = [] } = useQuery({
    queryKey,
    queryFn: () => listTrialRoll({ data: { filter, today, week_start: weekStart(today) } }),
    enabled,
  });

  if (!enabled || trials.length === 0) return null;

  async function mark(trial: Row, status: "scheduled" | "attended" | "no_show") {
    queryClient.setQueryData(queryKey, (old: Row[] | undefined) =>
      (old ?? []).map((t) => (t.id === trial.id ? { ...t, status } : t)),
    );
    try {
      await save({ data: { id: trial.id, status } });
    } catch (error) {
      toast.error((error as Error).message);
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  return (
    <Section
      title="Trial students"
      count={trials.length}
      description="Prospects sitting in on a lesson. They become a real student only when their lead is converted."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Trial student</Th>
              <Th>Class</Th>
              <Th>When</Th>
              <Th>Tutor</Th>
              <Th className="text-right">Mark</Th>
            </tr>
          </thead>
          <tbody>
            {(trials as Row[]).map((t) => (
              <tr key={t.id}>
                <Td>
                  <div className="flex items-center gap-2 font-medium">
                    {t.leads?.student_name ?? "Trial"}
                    <StatusPill tone="info">Trial</StatusPill>
                  </div>
                  {t.leads?.code ?? t.code ? (
                    <Link
                      to="/leads"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {t.leads?.code ?? t.code}
                    </Link>
                  ) : t.leads?.year_level ? (
                    <span className="text-xs text-muted-foreground">{t.leads.year_level}</span>
                  ) : null}
                </Td>
                <Td>{t.class_offerings?.programs?.name ?? t.class_offerings?.code ?? "-"}</Td>
                <Td className="whitespace-nowrap">
                  {t.sessions?.starts_at ? (
                    <>
                      {formatDay(t.sessions.starts_at)} · {formatTime(t.sessions.starts_at)}
                    </>
                  ) : (
                    "-"
                  )}
                </Td>
                <Td>
                  <TutorDot
                    colour={t.sessions?.tutors?.colour}
                    name={t.sessions?.tutors?.full_name}
                  />
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1.5">
                    {mayMarkRoll(staff ?? { role: null }, {
                      tutor_id: t.sessions?.tutor_id ?? null,
                    }) && (
                    <>
                    <button
                      type="button"
                      title="Attended"
                      onClick={() => mark(t, "attended")}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                        t.status === "attended"
                          ? "border-success/40 bg-success/20 text-success"
                          : "border-[var(--edge)] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Check className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title="No-show"
                      onClick={() => mark(t, "no_show")}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                        t.status === "no_show"
                          ? "border-warning/40 bg-warning/20 text-warning"
                          : "border-[var(--edge)] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                    </>
                    )}
                    <StatusPill tone={toneForStatus("trial", t.status)}>
                      {LABELS.trialStatus[t.status as keyof typeof LABELS.trialStatus]}
                    </StatusPill>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

type LessonGrouping = {
  sessionId: string;
  lesson: Row;
  rows: Row[];
};

/**
 * One block per lesson, newest first, students alphabetical inside it.
 *
 * The order is taken from the rows as they arrive - already sorted by lesson
 * time - so the groups stay in the order the day actually runs rather than
 * being re-sorted into something unfamiliar.
 */
function groupByLesson(rows: Row[]): LessonGrouping[] {
  const groups = new Map<string, LessonGrouping>();
  for (const row of rows) {
    const key = row.session_id ?? row.id;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { sessionId: key, lesson: row, rows: [row] });
    }
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) =>
      (a.enrolments?.students?.full_name ?? "").localeCompare(
        b.enrolments?.students?.full_name ?? "",
      ),
    );
  }
  return [...groups.values()];
}

/**
 * The one set of column widths every class section shares, so Type, Billing,
 * Hours, Status and Mark line up down the whole page. Student takes whatever is
 * left. Used with table-fixed on every section's table (and the header).
 */
function RollCols() {
  return (
    <colgroup>
      <col />
      <col className="w-[132px]" />
      <col className="w-[172px]" />
      <col className="w-[84px]" />
      <col className="w-[128px]" />
      <col className="w-[236px]" />
    </colgroup>
  );
}

/**
 * A class, and everyone on its roll.
 *
 * The header carries what belongs to the lesson rather than to a student - the
 * class, the time, the tutor - so it is stated once instead of repeated down
 * every row, and it is where the whole-class actions live. Marking a class
 * present is one press, not eight.
 */
function LessonGroup({
  group,
  showColumns,
  tutors,
  onSetStatus,
  may,
  onMakeUp,
  onBulk,
  onChanged,
}: {
  group: LessonGrouping;
  /** Column names are stated once at the top, not above every class. */
  showColumns: boolean;
  tutors: Row[];
  onSetStatus: (id: string, status: "present" | "absent" | "not_marked") => Promise<void>;
  may: LessonPermissions;
  onMakeUp: (rows: Row[]) => void;
  onBulk: (ids: string[], status: "present" | "absent" | "not_marked") => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { lesson, rows } = group;
  const marked = rows.filter((r: Row) => r.status !== "not_marked").length;
  const unmarkedIds = rows.filter((r: Row) => r.status === "not_marked").map((r: Row) => r.id);
  const makeUpable = rows.filter((r: Row) => r.att_type !== "make_up");
  const complete = marked === rows.length;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--edge)]">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--edge)] bg-[var(--mat-thin)] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {lesson.sessions?.class_offerings?.programs?.name ?? "Lesson"}
            </span>
            <Code>{lesson.sessions?.code}</Code>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatDay(lesson.lesson_starts_at)} · {formatTime(lesson.lesson_starts_at)} ·{" "}
            {rows.length} {rows.length === 1 ? "student" : "students"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TutorCell row={lesson} tutors={tutors} may={may} onChanged={onChanged} />
        </div>

        <StatusPill tone={complete ? "success" : marked > 0 ? "warning" : "neutral"}>
          {marked}/{rows.length} marked
        </StatusPill>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={unmarkedIds.length === 0}
            onClick={() => onBulk(unmarkedIds, "present")}
          >
            All present
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={makeUpable.length === 0}
            title="The whole class was away - book one make-up lesson for all of them"
            onClick={() => onMakeUp(makeUpable)}
          >
            Make up the class
          </Button>
        </div>
      </header>

      {/* The roll sits flush under the header - no card-within-a-card. The one
          rounding is the section's, clipped at the bottom by overflow-hidden.
          Every section uses the same fixed column widths (RollCols) so the
          columns line up down the whole page, not just within one class. */}
      <div className="overflow-x-auto bg-[var(--mat-solid)]">
        <table className="table-zebra w-full min-w-[820px] table-fixed text-sm">
          <RollCols />
          {showColumns && (
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Type</Th>
                <Th>Billing</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
                <Th className="text-right">Mark</Th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row: Row) => (
              <tr key={row.id}>
                <Td>
                  <Link
                    to="/students/$id"
                    params={{ id: row.student_id }}
                    className="font-medium hover:underline"
                  >
                    {row.enrolments?.students?.full_name ?? "-"}
                  </Link>
                  <div>
                    <Code>{row.enrolments?.students?.code}</Code>
                  </div>
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
                      aria-label="Present"
                      onClick={() => onSetStatus(row.id, "present")}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={row.status === "absent" ? "destructive" : "outline"}
                      title="Away"
                      aria-label="Away"
                      onClick={() => onSetStatus(row.id, "absent")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Away, and owed a make-up"
                      disabled={row.att_type === "make_up"}
                      onClick={() => onMakeUp([row])}
                    >
                      Make up
                    </Button>
                    {row.status !== "not_marked" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSetStatus(row.id, "not_marked")}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The tutor, and a way to set it. A make-up lesson is usually booked before
 * anyone knows who is teaching it, so an empty tutor is a normal state here
 * rather than a fault - but it should be fixable without leaving the roll.
 */
function TutorCell({
  row,
  tutors,
  may,
  onChanged,
}: {
  row: Row;
  tutors: Row[];
  may: LessonPermissions;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const setTutor = useServerFn(setLessonTutor);

  // Who teaches a lesson decides who is paid for it, so it is the office's to
  // set. A tutor sees the name and cannot pick at it.
  if (!may.manage) {
    return row.sessions?.tutors?.full_name ? (
      <TutorDot colour={row.sessions?.tutors?.colour} name={row.sessions.tutors.full_name} />
    ) : (
      <span className="text-muted-foreground">Unassigned</span>
    );
  }

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
 * this moment: a day has been picked, or it has not. Everything else - who
 * teaches it, which package pays - can be filled in later and should not block
 * recording that the student was away.
 */
function MakeUpDialog({
  may,
  rows,
  tutors,
  onClose,
  onDone,
}: {
  rows: Row[];
  tutors: Row[];
  may: LessonPermissions;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const hold = useServerFn(holdMakeUp);
  const book = useServerFn(bookMakeUp);

  const lead = rows[0]!;
  const many = rows.length > 1;

  const [mode, setMode] = useState<"hold" | "day">("hold");
  const [date, setDate] = useState(() => addDays(sydToday(), 7));
  const [startTime, setStartTime] = useState(
    () => instantToSydneyLocal(lead.lesson_starts_at).split("T")[1] ?? "16:00",
  );
  const [duration, setDuration] = useState(() => {
    const start = lead.sessions?.starts_at;
    const end = lead.sessions?.ends_at;
    if (!start || !end) return "1";
    const hours = (Date.parse(end) - Date.parse(start)) / 3_600_000;
    return hours > 0 ? String(Math.round(hours * 2) / 2) : "1";
  });
  const [tutorId, setTutorId] = useState<string>(() => lead.lesson_tutor_id ?? "none");
  const [existingId, setExistingId] = useState<string>("new");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: onDate } = useQuery({
    queryKey: ["lessons-on", date, lead.id],
    queryFn: () => listLessonsOnDate({ data: { date, attendance_id: lead.id } }),
    enabled: mode === "day",
  });

  const who = many
    ? `${rows.length} students`
    : (lead.enrolments?.students?.full_name ?? "This student");
  const lessons = (onDate?.lessons ?? []).filter((l: Row) => l.id !== lead.session_id);
  const ids = rows.map((r) => r.id);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "hold") {
        await hold({ data: { ids, note } });
        toast.success(
          many ? `${rows.length} students owed a make-up.` : `${who} is away and owed a make-up.`,
        );
      } else if (existingId !== "new") {
        await book({ data: { source_attendance_ids: ids, session_id: existingId } });
        toast.success("Make-up booked onto that lesson.");
      } else {
        await book({
          data: {
            source_attendance_ids: ids,
            session_id: null,
            date,
            start_time: startTime,
            duration_hours: Number(duration) || 1,
            tutor_id: tutorId === "none" ? null : tutorId,
          },
        });
        toast.success(
          many
            ? `One make-up lesson booked for all ${rows.length}.`
            : `Make-up booked for ${formatDay(`${date}T00:00:00Z`)}.`,
        );
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
          <DialogTitle>
            {many
              ? `${lead.sessions?.class_offerings?.programs?.name ?? "Class"} - make up the class`
              : `${who} - make-up`}
          </DialogTitle>
          <DialogDescription>
            Marks {many ? `all ${rows.length}` : "them"} away for{" "}
            {lead.sessions?.class_offerings?.programs?.name ?? "this lesson"} on{" "}
            {formatDay(lead.lesson_starts_at)}
            {many ? ", and settles them together on one lesson" : ""}. Pick a day now if you have
            one; otherwise hold it and decide later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {many && (
            <div className="rounded-md border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-xs text-muted-foreground">
              {rows
                .map((r: Row) => r.enrolments?.students?.full_name)
                .filter(Boolean)
                .join(", ")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === "hold"}
              onClick={() => setMode("hold")}
              title="Hold for now"
              hint="No day or tutor decided. It stays on the Make-ups list until you book it."
            />
            {may.reschedule && (
              <ModeCard
                active={mode === "day"}
                onClick={() => setMode("day")}
                title="Pick a day"
                hint={
                  many
                    ? "Creates one lesson and puts the whole class on it. A tutor is optional."
                    : "Books the make-up. A tutor is optional - decide that later if you need to."
                }
              />
            )}
          </div>

          {mode === "hold" ? (
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                placeholder={
                  many ? "Tutor sick, class did not run…" : "Family away until the 12th…"
                }
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
                      <SelectItem value="new">
                        {many
                          ? "A new lesson for the whole class"
                          : "A new lesson just for this make-up"}
                      </SelectItem>
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            {mode === "hold"
              ? many
                ? "Mark all away, hold the make-up"
                : "Mark away, hold the make-up"
              : many
                ? "Book one make-up for the class"
                : "Book the make-up"}
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
