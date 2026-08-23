import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDay, formatHours, formatTime, sydToday, weekStart } from "@/lib/format";
import type { Row } from "@/lib/vision/types";
import {
  listRoll,
  markAttendance,
  markRollBulk,
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
    value: "absences_owed",
    label: "Owed a make-up",
    hint: "Absences with no make-up attached yet.",
  },
  {
    value: "makeups_booked",
    label: "Make-ups booked",
    hint: "Absences whose make-up exists but has not happened.",
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
  const { data: rows } = useSuspenseQuery(rollQueryOptions(filter, today));

  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);
  const bulk = useServerFn(markRollBulk);

  const active = FILTERS.find((f) => f.value === filter)!;
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
        description="The full attendance record — corrections, history and make-up links."
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

      <Tabs value={filter} onValueChange={(v) => setFilter(v as RollFilter)}>
        <TabsList className="flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{active.hint}</p>
        <Input
          className="w-64"
          placeholder="Search student or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
                  <TutorDot
                    colour={row.sessions?.tutors?.colour}
                    name={row.sessions?.tutors?.full_name}
                  />
                </Td>
                <Td>
                  <StatusPill tone={row.att_type === "trial" ? "info" : "neutral"}>
                    {row.att_type === "make_up"
                      ? "Make-up"
                      : row.att_type === "trial"
                        ? "Trial"
                        : "Regular"}
                  </StatusPill>
                  {row.make_up_state && (
                    <div className="mt-1">
                      <StatusPill tone={toneForStatus("makeup", row.make_up_state)}>
                        {row.make_up_state}
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
                      onClick={() => setStatus(row.id, "present")}
                    >
                      P
                    </Button>
                    <Button
                      size="sm"
                      variant={row.status === "absent" ? "destructive" : "outline"}
                      onClick={() => setStatus(row.id, "absent")}
                    >
                      A
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

      <p className="text-xs text-muted-foreground">
        Un-marking a student refunds their hours automatically — the balance is a view, not a stored
        number. A PAYG entry with no package is normal and is never flagged.
      </p>
    </div>
  );
}
