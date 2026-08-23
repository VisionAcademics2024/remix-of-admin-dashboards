import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarPlus, Repeat } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Section,
  StatusPill,
  TableShell,
  Td,
  Th,
  toneForStatus,
} from "@/components/vision/ui";
import { formatDay, formatTime, sydToday } from "@/lib/format";
import type { Row } from "@/lib/vision/types";
import {
  createMakeUp,
  listMakeUps,
  listMakeUpCandidates,
  markAttendance,
} from "@/lib/vision/roll.functions";

const makeUpsQueryOptions = () =>
  queryOptions({ queryKey: ["make-ups"], queryFn: () => listMakeUps() });

export const Route = createFileRoute("/_authenticated/make-ups")({
  loader: ({ context }) => context.queryClient.ensureQueryData(makeUpsQueryOptions()),
  component: MakeUpsPage,
});

function MakeUpsPage() {
  const { data } = useSuspenseQuery(makeUpsQueryOptions());
  const [booking, setBooking] = useState<Row | null>(null);
  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["make-ups"] });
    await queryClient.invalidateQueries({ queryKey: ["roll"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
  }

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="Make-Ups"
        description="A student who missed a lesson is owed a make-up. Tutor swaps and rescheduled classes are edits to the lesson itself, not make-ups."
      />

      <Section
        title="Outstanding absences"
        count={data.outstanding.length}
        description="Marked absent, with no make-up booked yet."
        tone={data.outstanding.length ? "warning" : "success"}
      >
        {data.outstanding.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nothing outstanding"
            hint="Every absence has a make-up attached."
          />
        ) : (
          <AbsenceTable rows={data.outstanding} onBook={setBooking} />
        )}
      </Section>

      <Section
        title="Make-ups booked"
        count={data.scheduled.length}
        description="A make-up exists but has not happened yet."
      >
        {data.scheduled.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="None booked"
            hint="Book one from the outstanding list above."
          />
        ) : (
          <AbsenceTable rows={data.scheduled} />
        )}
      </Section>

      <Section
        title="Make-ups to mark"
        count={data.toMark.length}
        description="The make-up lesson has a roll entry waiting. Marking it present consumes hours exactly like any other lesson."
      >
        {data.toMark.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nothing to mark"
            hint="Booked make-ups appear here once their lesson exists."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Make-up lesson</Th>
                <Th>When</Th>
                <Th className="text-right">Mark</Th>
              </tr>
            </thead>
            <tbody>
              {data.toMark.map((row: Row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      to="/students/$id"
                      params={{ id: row.student_id }}
                      className="font-medium hover:underline"
                    >
                      {row.enrolments?.students?.full_name}
                    </Link>
                  </Td>
                  <Td>
                    {row.sessions?.class_offerings?.programs?.name ?? "—"}{" "}
                    <Code>{row.sessions?.code}</Code>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDay(row.lesson_starts_at)}
                    <div className="text-xs text-muted-foreground">
                      {formatTime(row.lesson_starts_at)}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await mark({ data: { id: row.id, status: "present" } });
                          toast.success("Make-up marked present.");
                          await refresh();
                        }}
                      >
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await mark({ data: { id: row.id, status: "absent" } });
                          await refresh();
                        }}
                      >
                        Absent
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section
        title="Completed"
        count={data.completed.length}
        description="An absence whose linked make-up was attended."
      >
        {data.completed.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="None yet"
            hint="Completed make-ups collect here as they are marked."
          />
        ) : (
          <AbsenceTable rows={data.completed.slice(0, 20)} />
        )}
      </Section>

      {booking && (
        <BookMakeUpDialog absence={booking} onClose={() => setBooking(null)} onDone={refresh} />
      )}
    </div>
  );
}

function AbsenceTable({ rows, onBook }: { rows: Row[]; onBook?: (row: Row) => void }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Student</Th>
          <Th>Missed lesson</Th>
          <Th>Date</Th>
          <Th>State</Th>
          {onBook && <Th className="text-right">Action</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row: Row) => (
          <tr key={row.id}>
            <Td>
              <Link
                to="/students/$id"
                params={{ id: row.student_id }}
                className="font-medium hover:underline"
              >
                {row.enrolments?.students?.full_name}
              </Link>
              <div>
                <Code>{row.enrolments?.students?.code}</Code>
              </div>
            </Td>
            <Td>
              {row.sessions?.class_offerings?.programs?.name ?? "—"}{" "}
              <Code>{row.sessions?.code}</Code>
            </Td>
            <Td className="whitespace-nowrap">{formatDay(row.lesson_starts_at)}</Td>
            <Td>
              <StatusPill tone={toneForStatus("makeup", row.make_up_state)}>
                {row.make_up_state}
              </StatusPill>
            </Td>
            {onBook && (
              <Td className="text-right">
                <Button size="sm" variant="outline" onClick={() => onBook(row)}>
                  <CalendarPlus className="mr-1 h-4 w-4" /> Book make-up
                </Button>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function BookMakeUpDialog({
  absence,
  onClose,
  onDone,
}: {
  absence: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const create = useServerFn(createMakeUp);
  const [sessionId, setSessionId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: candidates } = useQuery({
    queryKey: ["make-up-candidates"],
    queryFn: () => listMakeUpCandidates({ data: { from: sydToday() } }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a make-up</DialogTitle>
          <DialogDescription>
            For {absence.enrolments?.students?.full_name}, who missed{" "}
            {formatDay(absence.lesson_starts_at)}. The make-up becomes a new roll entry on a
            different lesson, linked back to this absence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Lesson to attend</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a lesson…" />
            </SelectTrigger>
            <SelectContent>
              {(candidates ?? [])
                .filter((c: Row) => c.id !== absence.session_id)
                .map((c: Row) => (
                  <SelectItem key={c.id} value={c.id}>
                    {formatDay(c.starts_at)} {formatTime(c.starts_at)} ·{" "}
                    {c.class_offerings?.programs?.name ?? c.code}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!sessionId || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await create({ data: { source_attendance_id: absence.id, session_id: sessionId } });
                toast.success("Make-up booked.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Book it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
