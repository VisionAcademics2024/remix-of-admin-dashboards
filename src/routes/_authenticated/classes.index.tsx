import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LayoutGrid, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  WarningNote,
  toneForStatus,
} from "@/components/vision/ui";
import { formatDate, formatHours } from "@/lib/format";
import {
  closeClassOffering,
  deleteClassOffering,
  generateSessions,
  getClassOfferingRemoval,
  listClassOfferings,
  seedRollForOffering,
} from "@/lib/vision/classes.functions";
import { LABELS, type OfferingStatus, type Row } from "@/lib/vision/types";

const classesQueryOptions = () =>
  queryOptions({ queryKey: ["classes"], queryFn: () => listClassOfferings() });

export const Route = createFileRoute("/_authenticated/classes/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(classesQueryOptions()),
  component: ClassesPage,
});

function ClassesPage() {
  const { data: classes } = useSuspenseQuery(classesQueryOptions());
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const generate = useServerFn(generateSessions);
  const seed = useServerFn(seedRollForOffering);
  const setStatus = useServerFn(closeClassOffering);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const term = search.trim().toLowerCase();
  const visible = term
    ? classes.filter((c: Row) =>
        `${c.code} ${c.programs?.name ?? ""} ${c.sole_student_name ?? ""} ${c.operating_periods?.code ?? ""} ${c.tutors?.full_name ?? ""}`
          .toLowerCase()
          .includes(term),
      )
    : classes;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["classes"] });
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
  }

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Classes"
        description="Capacity against enrolled, per term. Classes are closed or cancelled, not deleted."
        actions={
          <Button asChild size="sm">
            <Link to="/classes/new">
              <Plus className="mr-1 h-4 w-4" /> Class Builder
            </Link>
          </Button>
        }
      />

      <Input
        className="max-w-sm"
        placeholder="Search classes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No classes yet"
          hint="Class Builder walks you through creating a class, enrolling students and generating lessons."
          action={
            <Button asChild size="sm">
              <Link to="/classes/new">Open Class Builder</Link>
            </Button>
          }
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Class</Th>
              <Th>Term</Th>
              <Th>Tutor</Th>
              <Th>Runs</Th>
              <Th className="text-right">Enrolled</Th>
              <Th className="text-right">Lessons</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c: Row) => {
              const full = c.enrolled >= c.capacity;
              const solo = c.enrolled === 1 && Boolean(c.sole_student_name);
              return (
                <tr key={c.id}>
                  <Td>
                    {/* A one-person class reads by who is in it: the student's
                        name leads, with the class kind (e.g. "Year 6 Private")
                        beneath. The moment a second student enrols, it goes back
                        to the class name. */}
                    {solo ? (
                      <>
                        <div className="font-medium">{c.sole_student_name}</div>
                        <div className="flex items-center gap-2">
                          <Code>{c.code}</Code>
                          <span className="text-xs text-muted-foreground">
                            {c.programs?.name ?? "-"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">{c.programs?.name ?? "-"}</div>
                        <div className="flex items-center gap-2">
                          <Code>{c.code}</Code>
                          <span className="text-xs text-muted-foreground">
                            {
                              LABELS.offeringType[
                                c.offering_type as "group_class" | "private_tuition"
                              ]
                            }
                          </span>
                        </div>
                      </>
                    )}
                  </Td>
                  <Td>{c.operating_periods?.code ?? "-"}</Td>
                  <Td>
                    <TutorDot colour={c.tutors?.colour} name={c.tutors?.full_name} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {formatDate(c.starts_on)} – {formatDate(c.ends_on)}
                    <div className="text-muted-foreground">
                      {LABELS.recurrence[c.recurrence as keyof typeof LABELS.recurrence]} ·{" "}
                      {formatHours(c.session_duration_hours)}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <StatusPill tone={full ? "warning" : "neutral"}>
                      {c.enrolled} / {c.capacity}
                    </StatusPill>
                  </Td>
                  <Td className="text-right tabular-nums">{c.lesson_count}</Td>
                  <Td>
                    <StatusPill tone={toneForStatus("offering", c.status)}>{c.status}</StatusPill>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === c.id}
                        onClick={async () => {
                          setBusyId(c.id);
                          try {
                            const result = await generate({ data: { offering_id: c.id } });
                            toast.success(
                              `${result.lessons_created} lesson(s) and ${result.roll_entries_created} roll entries added. Re-running is always safe.`,
                            );
                            await refresh();
                          } catch (error) {
                            toast.error((error as Error).message);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Generate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === c.id}
                        onClick={async () => {
                          setBusyId(c.id);
                          try {
                            const result = await seed({ data: { offering_id: c.id } });
                            toast.success(`${result.roll_entries_created} roll entries added.`);
                            await refresh();
                          } catch (error) {
                            toast.error((error as Error).message);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Seed roll
                      </Button>
                      <Select
                        value={c.status}
                        onValueChange={async (v) => {
                          const result = await setStatus({
                            data: { id: c.id, status: v as OfferingStatus },
                          });
                          const cancelled = result?.lessons_cancelled ?? 0;
                          toast.success(
                            cancelled > 0
                              ? `Class cancelled, and ${cancelled} lesson${cancelled === 1 ? "" : "s"} still to come came off the timetable.`
                              : "Class status updated.",
                          );
                          await refresh();
                        }}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Cancelling is for a class that ran and stopped;
                          this is for one built by mistake. It refuses where
                          anything real has happened, which is why both are
                          offered rather than one pretending to be the other. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete this class and everything the builder made with it"
                        aria-label={`Delete ${c.programs?.name ?? "this class"}`}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {deleting && <DeleteClassDialog offering={deleting} onClose={() => setDeleting(null)} />}

      <p className="text-xs text-muted-foreground">
        Generating lessons is idempotent - the unique index on (class, start time) means re-running
        never creates duplicates. Changing a lesson's time is an edit on the Timetable, never a
        delete and regenerate.
      </p>
    </div>
  );
}

/**
 * Confirming the deletion of a whole class.
 *
 * It asks the server what this particular class costs rather than reciting a
 * generic warning: a term of lessons with a student on them is a different
 * thing to agree to than an empty shell, and the two refusals - charged, or
 * already taught - only apply to some classes. A warning that is the same
 * every time is one nobody reads by the third go.
 */
function DeleteClassDialog({ offering, onClose }: { offering: Row; onClose: () => void }) {
  const queryClient = useQueryClient();
  const remove = useServerFn(deleteClassOffering);
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["class-removal", offering.id],
    queryFn: () => getClassOfferingRemoval({ data: { id: offering.id } }),
  });

  const name = offering.programs?.name ?? offering.code ?? "this class";

  async function confirm() {
    setBusy(true);
    try {
      await remove({ data: { id: offering.id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["classes"] }),
        queryClient.invalidateQueries({ queryKey: ["timetable"] }),
        queryClient.invalidateQueries({ queryKey: ["today"] }),
        queryClient.invalidateQueries({ queryKey: ["roll"] }),
        queryClient.invalidateQueries({ queryKey: ["enrolments"] }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] }),
      ]);
      toast.success(`${name} is gone, with its lessons and enrolments.`);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            <Code>{offering.code}</Code> · {offering.operating_periods?.code ?? "no term"}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Checking what this class carries…</p>
        ) : data?.refusal ? (
          <WarningNote>{data.refusal}</WarningNote>
        ) : (
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {(data?.consequences ?? []).map((line: string) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {data?.refusal ? "Close" : "Keep it"}
          </Button>
          {!data?.refusal && (
            <Button variant="destructive" disabled={busy || isPending} onClick={confirm}>
              {busy ? "Deleting…" : "Delete this class"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
