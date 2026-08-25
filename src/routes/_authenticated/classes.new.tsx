import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown, CircleDashed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, PageHeader, StatusPill, Td, Th } from "@/components/vision/ui";
import { cn } from "@/lib/utils";
import { formatHours, sydneyLocalToInstant, sydToday } from "@/lib/format";
import { getCatalogue, saveProgram } from "@/lib/vision/catalogue.functions";
import {
  generateSessions,
  getClassOffering,
  saveClassOffering,
} from "@/lib/vision/classes.functions";
import { createSession } from "@/lib/vision/schedule.functions";
import { listCommerce, saveEnrolment } from "@/lib/vision/commerce.functions";
import { LABELS, Row } from "@/lib/vision/types";

type Recurrence = "weekly" | "fortnightly" | "daily" | "one_off" | "ad_hoc";

/** A dropdown that is also free-typeable, for a number of hours. */
const LENGTH_PRESETS = ["0.5", "1", "1.5", "2", "2.5", "3"];

/**
 * Type-to-search picker for a student, so you find someone by name instead of
 * scrolling a long list.
 */
function StudentCombobox({
  students,
  value,
  onChange,
  placeholder = "Type a student's name…",
}: {
  students: Row[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = students.find((s: Row) => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.full_name} · ${selected.code}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search students…" />
          <CommandList>
            <CommandEmpty>No student found.</CommandEmpty>
            <CommandGroup>
              {students.map((s: Row) => (
                <CommandItem
                  key={s.id}
                  value={`${s.full_name} ${s.code}`}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")}
                  />
                  {s.full_name} · {s.code}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const Route = createFileRoute("/_authenticated/classes/new")({
  component: ClassBuilderPage,
});

function ClassBuilderPage() {
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [lessonCount, setLessonCount] = useState(0);

  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });
  const { data: built, refetch } = useQuery({
    queryKey: ["class-offering", offeringId],
    queryFn: () => getClassOffering({ data: { id: offeringId! } }),
    enabled: !!offeringId,
  });

  const enrolmentCount = built?.enrolments.length ?? 0;

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/classes">
          <ArrowLeft className="mr-1 h-4 w-4" /> All classes
        </Link>
      </Button>

      <PageHeader
        title="Class Builder"
        description="Make a class - it generates its lessons and lands on the timetable. Add students and how they pay after, or leave that for later."
      />

      <StepCard
        step={1}
        title="The class"
        done={!!offeringId}
        summary={
          built?.offering
            ? `${built.offering.programs?.name} · ${built.offering.code}${
                lessonCount > 0 ? ` · ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}` : ""
              }`
            : undefined
        }
      >
        <StepOne
          catalogue={catalogue}
          onCreated={(id, lessons) => {
            setOfferingId(id);
            setLessonCount(lessons);
          }}
        />
      </StepCard>

      <StepCard
        step={2}
        title="Students & payment"
        optional
        done={enrolmentCount > 0}
        locked={!offeringId}
        summary={
          enrolmentCount > 0
            ? `${enrolmentCount} student${enrolmentCount === 1 ? "" : "s"}`
            : undefined
        }
      >
        {offeringId && built?.offering && (
          <StepTwo
            offering={built.offering}
            enrolments={built.enrolments}
            onSaved={() => refetch()}
          />
        )}
      </StepCard>

      {offeringId && (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/classes">Done - back to classes</Link>
          </Button>
          <Button asChild>
            <Link to="/timetable">See it on the timetable</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  title,
  done,
  locked,
  optional,
  summary,
  children,
}: {
  step: number;
  title: string;
  done: boolean;
  locked?: boolean | undefined;
  optional?: boolean | undefined;
  summary?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(locked && "opacity-60", done && "border-success/40")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
              done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : step}
          </span>
          {title}
          {optional && (
            <span className="rounded-full bg-[var(--mat-thin)] px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
              optional
            </span>
          )}
          {summary && (
            <span className="ml-auto truncate text-xs font-normal text-muted-foreground">
              {summary}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDashed className="h-4 w-4" /> Make the class first.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function StepOne({
  catalogue,
  onCreated,
}: {
  catalogue: Row;
  onCreated: (id: string, lessons: number) => void;
}) {
  const save = useServerFn(saveClassOffering);
  const generate = useServerFn(generateSessions);
  const addSession = useServerFn(createSession);
  const saveProg = useServerFn(saveProgram);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    program_id: "",
    operating_period_id: "",
    primary_tutor_id: "",
    offering_type: "group_class" as "group_class" | "private_tuition",
    capacity: 8,
    starts_on: sydToday(),
    ends_on: sydToday(),
    recurrence: "weekly" as Recurrence,
    recurrence_start_local: "",
    session_duration_hours: 1.5,
    room: "",
  });
  // A program can be made right here when the one you want is not in the list.
  const [newProg, setNewProg] = useState({
    name: "",
    code: "",
    duration: "1.5",
    type: "group_class" as "group_class" | "private_tuition",
  });

  const creatingProgram = form.program_id === "__new__";
  const program = (catalogue?.programs ?? []).find((p: Row) => p.id === form.program_id);
  const isPrivate = form.offering_type === "private_tuition";
  // A one-off (or ad hoc) is a single lesson, not a repeating class, so it makes
  // exactly one session instead of filling a whole term.
  const isOneOff = form.recurrence === "one_off" || form.recurrence === "ad_hoc";

  async function createClass() {
    if (creatingProgram && (!newProg.name.trim() || !newProg.code.trim())) {
      toast.error("A new program needs a name and a short code.");
      return;
    }
    setBusy(true);
    try {
      let programId = form.program_id;
      if (creatingProgram) {
        const made = await saveProg({
          data: {
            name: newProg.name.trim(),
            code: newProg.code.trim(),
            standard_duration_hours: Number(newProg.duration) || 1.5,
            default_offering_type: newProg.type,
            is_active: true,
          },
        });
        programId = made.id;
        await queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      }

      // A one-off has no "runs until" - the single lesson's own date is the end.
      const endsOn = isOneOff
        ? form.recurrence_start_local
          ? form.recurrence_start_local.slice(0, 10)
          : form.starts_on
        : form.ends_on;

      const row: Row = await save({
        data: { ...form, program_id: programId, ends_on: endsOn, status: "active" },
      });
      await queryClient.invalidateQueries({ queryKey: ["classes"] });

      // Put the lesson(s) on the timetable straight away. A repeating class fills
      // its term via generate_sessions; a one-off makes exactly one lesson at the
      // first-lesson time (generate_sessions makes none for one-off on purpose).
      let lessons = 0;
      if (isOneOff) {
        if (form.recurrence_start_local) {
          try {
            const startsAt = sydneyLocalToInstant(form.recurrence_start_local);
            const endsAt = new Date(
              Date.parse(startsAt) + form.session_duration_hours * 3_600_000,
            ).toISOString();
            await addSession({
              data: {
                class_offering_id: row.id,
                tutor_id: form.primary_tutor_id || null,
                starts_at: startsAt,
                ends_at: endsAt,
                room: form.room || "",
                session_type: "regular",
              },
            });
            lessons = 1;
          } catch {
            /* leave lessons at 0; the class was still created */
          }
        }
      } else {
        try {
          const gen = await generate({ data: { offering_id: row.id } });
          lessons = gen.lessons_created;
        } catch {
          /* leave lessons at 0; the class was still created */
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });

      toast.success(
        lessons > 0
          ? isOneOff
            ? `One-off lesson created for ${row.code} - it is on the timetable.`
            : `Class ${row.code} created - ${lessons} lesson${lessons === 1 ? "" : "s"} on the timetable.`
          : isOneOff
            ? `Created ${row.code}. Set a first lesson time to place its lesson on the timetable.`
            : `Class ${row.code} created. Set a first lesson and recurrence to generate its lessons.`,
      );
      onCreated(row.id, lessons);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Program</Label>
        <Select
          value={form.program_id}
          onValueChange={(v) => {
            if (v === "__new__") {
              setForm({ ...form, program_id: v });
              return;
            }
            const p = (catalogue?.programs ?? []).find((x: Row) => x.id === v);
            setForm({
              ...form,
              program_id: v,
              session_duration_hours: p
                ? Number(p.standard_duration_hours)
                : form.session_duration_hours,
              offering_type: p?.default_offering_type ?? form.offering_type,
              capacity: p?.default_offering_type === "private_tuition" ? 1 : form.capacity,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="What is taught…" />
          </SelectTrigger>
          <SelectContent>
            {(catalogue?.programs ?? []).map((p: Row) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.code}
              </SelectItem>
            ))}
            <SelectItem value="__new__">+ New program…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {creatingProgram && (
        <div className="grid gap-2.5 rounded-lg border border-dashed border-[var(--edge)] p-3 sm:col-span-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>New program name</Label>
            <Input
              placeholder="e.g. Year 7 English"
              value={newProg.name}
              onChange={(e) => setNewProg({ ...newProg, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Short code</Label>
            <Input
              placeholder="e.g. Y7ENG"
              value={newProg.code}
              onChange={(e) => setNewProg({ ...newProg, code: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Usual length (hours)</Label>
            <Input
              type="number"
              step="0.25"
              min={0.25}
              value={newProg.duration}
              onChange={(e) => setNewProg({ ...newProg, duration: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Usually taught as</Label>
            <Select
              value={newProg.type}
              onValueChange={(v: "group_class" | "private_tuition") =>
                setNewProg({ ...newProg, type: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group_class">Group class</SelectItem>
                <SelectItem value="private_tuition">Private tuition</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            The program is created with the class, then chosen automatically.
          </p>
        </div>
      )}

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Term</Label>
        <Select
          value={form.operating_period_id}
          onValueChange={(v) => {
            const period = (catalogue?.periods ?? []).find((x: Row) => x.id === v);
            setForm({
              ...form,
              operating_period_id: v,
              starts_on: period?.starts_on ?? form.starts_on,
              ends_on: period?.ends_on ?? form.ends_on,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Which term…" />
          </SelectTrigger>
          <SelectContent>
            {(catalogue?.periods ?? []).map((p: Row) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select
          value={form.offering_type}
          onValueChange={(v: "group_class" | "private_tuition") =>
            setForm({
              ...form,
              offering_type: v,
              capacity: v === "private_tuition" ? 1 : form.capacity,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="group_class">Group class</SelectItem>
            <SelectItem value="private_tuition">Private tuition</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Capacity</Label>
        <Input
          type="number"
          min={1}
          disabled={isPrivate}
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
        />
        {isPrivate && <p className="text-xs text-muted-foreground">Private is always 1.</p>}
      </div>

      <div className="space-y-1.5">
        <Label>First lesson (Sydney)</Label>
        <Input
          type="datetime-local"
          value={form.recurrence_start_local}
          onChange={(e) => setForm({ ...form, recurrence_start_local: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Repeats</Label>
        <Select
          value={form.recurrence}
          onValueChange={(v: Recurrence) => setForm({ ...form, recurrence: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LABELS.recurrence).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {isOneOff
            ? "A single lesson - use this for a one-off with an existing student, not a whole term."
            : "A repeating class that fills the term with lessons."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{isOneOff ? "Lesson date" : "Runs from"}</Label>
        <Input
          type="date"
          value={form.starts_on}
          onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
        />
      </div>

      {!isOneOff && (
        <div className="space-y-1.5">
          <Label>Runs until</Label>
          <Input
            type="date"
            value={form.ends_on}
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Lesson length (hours)</Label>
        <Input
          type="number"
          step="0.25"
          min={0.25}
          list="lesson-length-presets"
          value={form.session_duration_hours}
          onChange={(e) => setForm({ ...form, session_duration_hours: Number(e.target.value) })}
        />
        <datalist id="lesson-length-presets">
          {LENGTH_PRESETS.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        {program && (
          <p className="text-xs text-muted-foreground">
            Program standard {formatHours(program.standard_duration_hours)}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Tutor</Label>
        <Select
          value={form.primary_tutor_id || "none"}
          onValueChange={(v) => setForm({ ...form, primary_tutor_id: v === "none" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {(catalogue?.tutors ?? []).map((t: Row) => (
              <SelectItem key={t.id} value={t.id}>
                {t.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Room (optional)</Label>
        <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
      </div>

      <div className="sm:col-span-2">
        <Button
          className="w-full sm:w-auto"
          disabled={
            !form.program_id ||
            !form.operating_period_id ||
            (creatingProgram && (!newProg.name.trim() || !newProg.code.trim())) ||
            busy
          }
          onClick={createClass}
        >
          {isOneOff ? "Create one-off lesson" : "Create class & generate lessons"}
        </Button>
      </div>
    </div>
  );
}

function StepTwo({
  offering,
  enrolments,
  onSaved,
}: {
  offering: Row;
  enrolments: Row[];
  onSaved: () => void;
}) {
  const save = useServerFn(saveEnrolment);
  const { data: commerce } = useQuery({ queryKey: ["commerce"], queryFn: () => listCommerce() });
  const [studentId, setStudentId] = useState("");
  const [method, setMethod] = useState<"hours" | "payg">("hours");
  const [status, setStatus] = useState<"active" | "trial">("active");
  const [priceId, setPriceId] = useState("");
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);

  const price = (commerce?.prices ?? []).find((p: Row) => p.id === priceId);
  const needsHours = price?.basis === "per_hour";

  return (
    <div className="space-y-4">
      {enrolments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-zebra w-full text-sm">
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Pays by</Th>
                <Th>Status</Th>
                <Th className="text-right">Agreed price</Th>
              </tr>
            </thead>
            <tbody>
              {enrolments.map((e: Row) => (
                <tr key={e.id}>
                  <Td>
                    {e.students?.full_name} <Code>{e.code}</Code>
                  </Td>
                  <Td>{e.method ? LABELS.billingMethod[e.method as "hours" | "payg"] : "-"}</Td>
                  <Td>
                    <StatusPill tone={e.status === "trial" ? "info" : "success"}>
                      {e.status}
                    </StatusPill>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.final_agreed_price != null
                      ? `$${Number(e.final_agreed_price).toFixed(2)}`
                      : "-"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Student</Label>
          <StudentCombobox
            students={commerce?.students ?? []}
            value={studentId}
            onChange={setStudentId}
            placeholder="Who is enrolling…"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Enrolment</Label>
          <Select value={status} onValueChange={(v: "active" | "trial") => setStatus(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
            </SelectContent>
          </Select>
          {status === "trial" && (
            <p className="text-xs text-muted-foreground">A trial needs no payment and no hours.</p>
          )}
        </div>

        {status !== "trial" && (
          <>
            <div className="space-y-1.5">
              <Label>Pays by</Label>
              <Select value={method} onValueChange={(v: "hours" | "payg") => setMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours - buy a block, draw it down</SelectItem>
                  <SelectItem value="payg">Pay as you go - a charge per lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Agreed price</Label>
              <Select value={priceId} onValueChange={setPriceId}>
                <SelectTrigger>
                  <SelectValue placeholder="From the price list…" />
                </SelectTrigger>
                <SelectContent>
                  {(commerce?.prices ?? []).map((p: Row) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {LABELS.pricingBasis[p.basis as keyof typeof LABELS.pricingBasis]}{" "}
                      · ${Number(p.unit_rate).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsHours && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Hours being bought</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g. 15"
                />
                <p className="text-xs text-warning-foreground">
                  A per-hour price sells a single hour unless you set the block bought here.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <Button
        disabled={!studentId || busy || (needsHours && !hours)}
        onClick={async () => {
          setBusy(true);
          try {
            await save({
              data: {
                student_id: studentId,
                class_offering_id: offering.id,
                status,
                starts_on: offering.starts_on,
                method: status === "trial" ? null : method,
                standard_price_id: priceId || null,
                hours_override: hours ? Number(hours) : null,
                adjustment: "none",
                adjustment_value: 0,
              },
            });
            toast.success("Enrolled, and added to every lesson's roll.");
            setStudentId("");
            setHours("");
            onSaved();
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Add student
      </Button>
    </div>
  );
}
