import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SortableTh,
  StatCard,
  StatusPill,
  TableShell,
  Td,
  Th,
  TutorDot,
  WarningNote,
  toneForStatus,
  useTableSort,
} from "@/components/vision/ui";
import { addDays, formatDay, formatHours, formatTime, sydToday } from "@/lib/format";
import { listSessionHistory } from "@/lib/vision/schedule.functions";
import { LABELS, type Row } from "@/lib/vision/types";

/**
 * Sessions - the history.
 *
 * Attendance marks one class at a time so it can be worked through; this is the
 * same data read the other way, every lesson every student has sat, so a
 * question asked from the office - "how many has she actually had?", "what did
 * we run for that family last term?" - can be answered without opening lessons
 * one by one.
 *
 * Sorting and filtering are done here rather than in the query: the window is
 * already bounded, and re-sorting a table you are reading should not cost a
 * round trip.
 */

/** How far back to read. Kept coarse - the fine filtering happens on the page. */
const WINDOWS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
  { value: "1825", label: "Everything" },
] as const;

type WindowValue = (typeof WINDOWS)[number]["value"];

const historyQueryOptions = (from: string, to: string) =>
  queryOptions({
    queryKey: ["session-history", from, to],
    queryFn: () => listSessionHistory({ data: { from, to } }),
    placeholderData: keepPreviousData,
  });

function spanFor(window: WindowValue, today: string, includeUpcoming: boolean) {
  return {
    from: addDays(today, -Number(window)),
    // "Done" means it has happened. Upcoming lessons are a timetable question,
    // and are only pulled in when asked for.
    to: includeUpcoming ? addDays(today, 365) : today,
  };
}

export const Route = createFileRoute("/_authenticated/sessions")({
  loader: ({ context }) => {
    const { from, to } = spanFor("90", sydToday(), false);
    return context.queryClient.ensureQueryData(historyQueryOptions(from, to));
  },
  component: SessionsPage,
});

function SessionsPage() {
  const today = sydToday();
  const [window, setWindow] = useState<WindowValue>("90");
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [studentId, setStudentId] = useState("all");
  const [offeringId, setOfferingId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { from, to } = spanFor(window, today, includeUpcoming);
  const { data, isFetching } = useQuery(historyQueryOptions(from, to));
  // Memoised so the empty-result fallback is not a fresh array every render -
  // otherwise every derived list below rebuilds on every keystroke.
  const rows = useMemo<Row[]>(() => data?.rows ?? [], [data]);

  // The filter lists are built from what actually came back, so they can never
  // offer a student or a class with nothing in the window.
  const { students, offerings } = useMemo(() => {
    const studentMap = new Map<string, string>();
    const offeringMap = new Map<string, string>();
    for (const r of rows) {
      const student = r.enrolments?.students;
      if (student?.id) studentMap.set(student.id, student.full_name ?? "Unnamed");
      const offering = r.sessions?.class_offerings;
      if (offering?.id) {
        offeringMap.set(offering.id, offering.programs?.name ?? offering.code ?? "Class");
      }
    }
    const byName = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
    return {
      students: [...studentMap.entries()].sort(byName),
      offerings: [...offeringMap.entries()].sort(byName),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r: Row) => {
      if (studentId !== "all" && r.enrolments?.students?.id !== studentId) return false;
      if (offeringId !== "all" && r.sessions?.class_offerings?.id !== offeringId) return false;
      if (status !== "all" && r.effective_status !== status) return false;
      if (!needle) return true;
      const haystack = [
        r.enrolments?.students?.full_name,
        r.enrolments?.students?.code,
        r.sessions?.class_offerings?.programs?.name,
        r.sessions?.class_offerings?.code,
        r.sessions?.code,
        r.sessions?.tutors?.full_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, studentId, offeringId, status, search]);

  // Every column the table offers, and the value it sorts by. Dates sort by
  // their timestamp and hours by their number, never by the rendered text.
  const accessors = {
    date: (r: Row) => r.lesson_starts_at ?? r.session_date,
    student: (r: Row) => r.enrolments?.students?.full_name,
    class: (r: Row) =>
      r.sessions?.class_offerings?.programs?.name ?? r.sessions?.class_offerings?.code,
    term: (r: Row) => r.sessions?.class_offerings?.operating_periods?.code,
    tutor: (r: Row) => r.sessions?.tutors?.full_name,
    type: (r: Row) => r.att_type,
    hours: (r: Row) => Number(r.hours_consumed ?? 0),
    status: (r: Row) => r.effective_status,
  };

  const {
    rows: sorted,
    sort,
    toggle,
  } = useTableSort<Row>(filtered, accessors, { key: "date", direction: "desc" });

  const attended = filtered.filter((r: Row) => r.effective_status === "present").length;
  const unmarked = filtered.filter((r: Row) => r.effective_status === "not_marked").length;
  const hours = filtered.reduce((sum: number, r: Row) => sum + Number(r.hours_consumed ?? 0), 0);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Sessions"
        description="Every lesson every student has sat. Sort by student or by class, narrow it down, and read the history straight."
      />

      {data?.truncated && (
        <WarningNote>
          Only the most recent {data.limit.toLocaleString("en-AU")} entries are shown. Choose a
          shorter window, or filter to one student or class, to be sure you are seeing everything.
        </WarningNote>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entries" value={filtered.length} icon={History} />
        <StatCard label="Attended" value={attended} tone="success" />
        <StatCard
          label="Unmarked"
          value={unmarked}
          tone={unmarked > 0 ? "warning" : "default"}
          hint={unmarked > 0 ? "Lessons that have run and still need a roll" : undefined}
        />
        <StatCard label="Hours drawn" value={formatHours(hours)} />
      </div>

      {/* The filter bar is a grid so it stacks one control per row on a phone
          and lays out across on a desk, rather than wrapping unpredictably. */}
      <div className="glass glass--solid grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="sessions-student">Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id="sessions-student">
              <SelectValue placeholder="All students" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students ({students.length})</SelectItem>
              {students.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sessions-class">Class</Label>
          <Select value={offeringId} onValueChange={setOfferingId}>
            <SelectTrigger id="sessions-class">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes ({offerings.length})</SelectItem>
              {offerings.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sessions-status">Roll</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="sessions-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="not_marked">Not marked</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sessions-window">Period</Label>
          <Select
            value={includeUpcoming ? "upcoming" : window}
            onValueChange={(v) => {
              if (v === "upcoming") {
                setIncludeUpcoming(true);
                return;
              }
              setIncludeUpcoming(false);
              setWindow(v as WindowValue);
            }}
          >
            <SelectTrigger id="sessions-window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
              <SelectItem value="upcoming">Last 12 months + upcoming</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sessions-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="sessions-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Student, class, tutor…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={History}
          title={isFetching ? "Loading sessions…" : "No sessions in this window"}
          hint="Widen the period, clear a filter, or check that lessons have been generated and their rolls seeded."
        />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <SortableTh sortKey="date" sort={sort} onToggle={toggle}>
                  Date
                </SortableTh>
                <SortableTh sortKey="student" sort={sort} onToggle={toggle}>
                  Student
                </SortableTh>
                <SortableTh sortKey="class" sort={sort} onToggle={toggle}>
                  Class
                </SortableTh>
                <SortableTh sortKey="term" sort={sort} onToggle={toggle}>
                  Term
                </SortableTh>
                <SortableTh sortKey="tutor" sort={sort} onToggle={toggle}>
                  Tutor
                </SortableTh>
                <SortableTh sortKey="type" sort={sort} onToggle={toggle}>
                  Type
                </SortableTh>
                <SortableTh sortKey="hours" sort={sort} onToggle={toggle} align="right">
                  Hours
                </SortableTh>
                <SortableTh sortKey="status" sort={sort} onToggle={toggle}>
                  Roll
                </SortableTh>
                <Th>Make-up</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: Row) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">
                    {formatDay(r.lesson_starts_at ?? r.session_date)}
                    <div className="text-xs text-muted-foreground">
                      {formatTime(r.lesson_starts_at)}
                    </div>
                  </Td>
                  <Td>
                    {r.enrolments?.students?.id ? (
                      <Link
                        to="/students/$id"
                        params={{ id: r.enrolments.students.id }}
                        className="font-medium hover:underline"
                      >
                        {r.enrolments.students.full_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </Td>
                  <Td className="max-w-56">
                    <span className="block truncate">
                      {r.sessions?.class_offerings?.programs?.name ?? "-"}
                    </span>
                    <Code>{r.sessions?.code}</Code>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {r.sessions?.class_offerings?.operating_periods?.code ?? "-"}
                  </Td>
                  <Td className="max-w-40">
                    <TutorDot
                      colour={r.sessions?.tutors?.colour}
                      name={r.sessions?.tutors?.full_name}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {LABELS.attendanceType[r.att_type as "regular" | "trial" | "make_up"] ??
                      r.att_type}
                  </Td>
                  <Td className="text-right tabular-nums">{formatHours(r.hours_consumed)}</Td>
                  <Td>
                    <StatusPill tone={toneForStatus("attendance", r.effective_status)}>
                      {String(r.effective_status ?? "").replace("_", " ")}
                    </StatusPill>
                  </Td>
                  <Td>
                    {r.make_up_state ? (
                      <StatusPill tone={toneForStatus("makeup", r.make_up_state)}>
                        {r.make_up_state}
                      </StatusPill>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>

          <p className="text-xs text-muted-foreground">
            Hours are the ones actually drawn - only a present, non-trial mark on a lesson that ran
            spends any. Tap a column heading to sort by it; tap again to reverse, once more to
            clear.
          </p>
        </>
      )}
    </div>
  );
}
