import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronsUpDown,
  CircleDashed,
  Layers,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  formatDayDate,
  formatHours,
  formatTime,
  formatWeekday,
  sydneyLocalToInstant,
  sydToday,
} from "@/lib/format";
import { getCatalogue, saveProgram } from "@/lib/vision/catalogue.functions";
import {
  generateSessions,
  getClassOffering,
  listClassOfferings,
  saveClassOffering,
} from "@/lib/vision/classes.functions";
import { createSession } from "@/lib/vision/schedule.functions";
import { addMidTermStudent, listCommerce, saveEnrolment } from "@/lib/vision/commerce.functions";
import { listTrialSessions } from "@/lib/vision/leads.functions";
import { listStudents } from "@/lib/vision/people.functions";
import { LABELS, Row } from "@/lib/vision/types";

// The class builder makes repeating classes; single lessons are the session
// builder's job, so one-off patterns are left out of "Repeats" here.
type Recurrence = "weekly" | "fortnightly" | "daily";

/** A dropdown that is also free-typeable, for a number of hours. */
const LENGTH_PRESETS = ["0.5", "1", "1.5", "2", "2.5", "3"];

/** A class's fixed weekly slot, e.g. "Wed 4:00 pm–5:30 pm", to tell same-named classes apart. */
function classWhen(o: Row): string {
  if (!o.recurrence_start) return "";
  const dur = Number(o.session_duration_hours ?? 0);
  const end =
    dur > 0 ? new Date(Date.parse(o.recurrence_start) + dur * 3_600_000).toISOString() : null;
  const time = end
    ? `${formatTime(o.recurrence_start)}–${formatTime(end)}`
    : formatTime(o.recurrence_start);
  return `${formatWeekday(o.recurrence_start)} ${time}`.trim();
}

export const Route = createFileRoute("/_authenticated/classes/new")({
  component: ClassBuilderPage,
});

function ClassBuilderPage() {
  const [mode, setMode] = useState<"class" | "session" | "student">("class");
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/classes">
          <ArrowLeft className="mr-1 h-4 w-4" /> All classes
        </Link>
      </Button>

      <PageHeader
        title="Builder"
        description="Make a repeating class, add a single one-off session, or drop a mid-term student onto the exact lessons they'll attend. Pick which below."
      />

      {/* The choice, side by side. What you pick decides the steps underneath. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ModeCard
          icon={Layers}
          title="Class builder"
          description="A repeating class that generates a term of lessons."
          active={mode === "class"}
          onClick={() => setMode("class")}
        />
        <ModeCard
          icon={CalendarPlus}
          title="Session builder"
          description="One extra lesson for a class that already exists."
          active={mode === "session"}
          onClick={() => setMode("session")}
        />
        <ModeCard
          icon={UserPlus}
          title="Add a student"
          description="Attach a mid-term joiner to specific lessons — no full term."
          active={mode === "student"}
          onClick={() => setMode("student")}
        />
      </div>

      {mode === "class" ? (
        <ClassFlow catalogue={catalogue} />
      ) : mode === "session" ? (
        <SessionFlow catalogue={catalogue} />
      ) : (
        <MidTermFlow />
      )}
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: typeof Layers;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active
          ? // Selected: the solid, accented surface - the active choice, matching the form below.
            "glass border-2 border-primary shadow-[0_12px_30px_-16px_var(--color-primary)]"
          : // Unselected: light and recessed, clearly the option not taken.
            "border border-[var(--edge)] bg-transparent opacity-65 hover:opacity-100 hover:bg-[var(--mat-thin)]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_var(--edge-top)]"
            : "bg-[var(--mat-thin)] text-foreground/50",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold",
            active ? "text-foreground" : "text-foreground/70",
          )}
        >
          {title}
        </span>
        <span
          className={cn("block text-xs", active ? "text-muted-foreground" : "text-foreground/50")}
        >
          {description}
        </span>
      </span>
      {active && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/* ============================================================ Class flow */

function ClassFlow({ catalogue }: { catalogue: Row }) {
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [lessonCount, setLessonCount] = useState(0);

  const { data: built, refetch } = useQuery({
    queryKey: ["class-offering", offeringId],
    queryFn: () => getClassOffering({ data: { id: offeringId! } }),
    enabled: !!offeringId,
  });

  const enrolmentCount = built?.enrolments.length ?? 0;

  return (
    <>
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
    </>
  );
}

/* ========================================================== Session flow */

function SessionFlow({ catalogue }: { catalogue: Row }) {
  const [created, setCreated] = useState(false);

  return (
    <>
      <StepCard step={1} title="The session" done={created}>
        <SessionBuilder catalogue={catalogue} onCreated={() => setCreated(true)} />
      </StepCard>

      {created && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCreated(false)}>
            Add another session
          </Button>
          <Button asChild>
            <Link to="/timetable">See it on the timetable</Link>
          </Button>
        </div>
      )}
    </>
  );
}

function SessionBuilder({
  catalogue,
  onCreated,
}: {
  catalogue: Row;
  onCreated: () => void;
}) {
  const addSession = useServerFn(createSession);
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => listClassOfferings(),
  });

  const [classId, setClassId] = useState("");
  const [whenLocal, setWhenLocal] = useState("");
  const [length, setLength] = useState("1.5");
  const [tutorId, setTutorId] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = (classes ?? []).find((c: Row) => c.id === classId);

  function pickClass(id: string) {
    setClassId(id);
    const c = (classes ?? []).find((x: Row) => x.id === id);
    if (c) {
      setLength(String(c.session_duration_hours ?? 1.5));
      setTutorId(c.primary_tutor_id ?? "");
      setRoom(c.room ?? "");
    }
  }

  async function create() {
    if (!classId || !whenLocal) return;
    setBusy(true);
    try {
      const startsAt = sydneyLocalToInstant(whenLocal);
      const endsAt = new Date(
        Date.parse(startsAt) + (Number(length) || 1.5) * 3_600_000,
      ).toISOString();
      await addSession({
        data: {
          class_offering_id: classId,
          tutor_id: tutorId || null,
          starts_at: startsAt,
          ends_at: endsAt,
          room: room || "",
          session_type: "regular",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      toast.success("One-off session created - it is on the timetable.");
      setWhenLocal("");
      onCreated();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Class</Label>
        <ClassCombobox classes={classes ?? []} value={classId} onChange={pickClass} />
        <p className="text-xs text-muted-foreground">
          The lesson is added to this class, and its enrolled students appear on the roll
          automatically.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>When (Sydney)</Label>
        <Input
          type="datetime-local"
          value={whenLocal}
          onChange={(e) => setWhenLocal(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Lesson length (hours)</Label>
        <Input
          type="number"
          step="0.25"
          min={0.25}
          list="session-length-presets"
          value={length}
          onChange={(e) => setLength(e.target.value)}
        />
        <datalist id="session-length-presets">
          {LENGTH_PRESETS.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <Label>Tutor</Label>
        <Select
          value={tutorId || "none"}
          onValueChange={(v) => setTutorId(v === "none" ? "" : v)}
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

      <div className="space-y-1.5">
        <Label>Room (optional)</Label>
        <Input value={room} onChange={(e) => setRoom(e.target.value)} />
      </div>

      <div className="sm:col-span-2">
        <Button
          className="w-full sm:w-auto"
          disabled={!classId || !whenLocal || busy}
          onClick={create}
        >
          Create one-off session
        </Button>
        {!chosen && (
          <p className="mt-2 text-xs text-muted-foreground">Choose the class this lesson belongs to.</p>
        )}
      </div>
    </div>
  );
}

/** Type-to-search picker for an existing class, disambiguated by its weekly slot. */
function ClassCombobox({
  classes,
  value,
  onChange,
}: {
  classes: Row[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = classes.find((c: Row) => c.id === value);
  const label = (c: Row) => {
    const when = classWhen(c);
    return `${c.programs?.name ?? "Class"} · ${c.code}${when ? ` · ${when}` : ""}`;
  };
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
            {selected ? label(selected) : "Type a class name…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search classes…" />
          <CommandList>
            <CommandEmpty>No class found.</CommandEmpty>
            <CommandGroup>
              {classes.map((c: Row) => (
                <CommandItem
                  key={c.id}
                  value={`${c.programs?.name ?? ""} ${c.code} ${classWhen(c)}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {c.programs?.name ?? "Class"} <Code>{c.code}</Code>
                    </span>
                    {classWhen(c) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {classWhen(c)}
                        {c.operating_periods?.code ? ` · ${c.operating_periods.code}` : ""}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ================================================================ Shared */

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

      const row: Row = await save({ data: { ...form, program_id: programId, status: "active" } });
      await queryClient.invalidateQueries({ queryKey: ["classes"] });

      // Generate its lessons straight away so the class is on the timetable the
      // moment it exists. If there is nothing to generate from yet, the class is
      // still made - the lessons can come once a first lesson and recurrence are
      // set.
      let lessons = 0;
      try {
        const gen = await generate({ data: { offering_id: row.id } });
        lessons = gen.lessons_created;
      } catch {
        /* leave lessons at 0; the class was still created */
      }
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });

      toast.success(
        lessons > 0
          ? `Class ${row.code} created - ${lessons} lesson${lessons === 1 ? "" : "s"} on the timetable.`
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
            {(["weekly", "fortnightly", "daily"] as Recurrence[]).map((value) => (
              <SelectItem key={value} value={value}>
                {LABELS.recurrence[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          For a single lesson, use the session builder instead.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Runs from</Label>
        <Input
          type="date"
          value={form.starts_on}
          onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Runs until</Label>
        <Input
          type="date"
          value={form.ends_on}
          onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
        />
      </div>

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
          Create class &amp; generate lessons
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

/**
 * Add a mid-term student onto the exact lessons they'll attend, across one or
 * more classes, without generating a whole term. They land on those rolls and
 * in Billing (active but unpriced) for the admin to firm the price.
 */
function MidTermFlow() {
  const add = useServerFn(addMidTermStudent);
  const queryClient = useQueryClient();
  const { data: students } = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => listClassOfferings() });
  const { data: sessions = [] } = useQuery({
    queryKey: ["trial-sessions"],
    queryFn: () => listTrialSessions(),
  });

  const [studentId, setStudentId] = useState("");
  const [plan, setPlan] = useState<"hours" | "payg">("hours");
  const [hours, setHours] = useState("10");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<
    Record<string, Array<{ tempId: string; starts_at: string; ends_at: string; label: string }>>
  >({});
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const classById = (id: string) => (classes ?? []).find((c: Row) => c.id === id);
  const upcomingFor = (id: string) =>
    (sessions as Row[]).filter((s) => s.class_offering_id === id);
  const notAdded = (classes ?? []).filter((c: Row) => !addedIds.includes(c.id));

  const totalFor = (id: string) => (picks[id]?.length ?? 0) + (custom[id]?.length ?? 0);
  const total = addedIds.reduce((n, id) => n + totalFor(id), 0);
  const classesWithPicks = addedIds.filter((id) => totalFor(id) > 0).length;
  const student = (students ?? []).find((s: Row) => s.id === studentId);

  function addClass(id: string) {
    if (!id || addedIds.includes(id)) return;
    setAddedIds((a) => [...a, id]);
  }
  function removeClass(id: string) {
    setAddedIds((a) => a.filter((x) => x !== id));
    setPicks((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setCustom((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }
  function toggle(id: string, sid: string) {
    setPicks((p) => {
      const cur = p[id] ?? [];
      return { ...p, [id]: cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid] };
    });
  }
  function addDate(id: string, local: string, length: number) {
    if (!local) return;
    const starts_at = sydneyLocalToInstant(local);
    const ends_at = new Date(Date.parse(starts_at) + (length || 1.5) * 3_600_000).toISOString();
    const tempId = `c-${id}-${Date.now()}`;
    setCustom((c) => ({
      ...c,
      [id]: [...(c[id] ?? []), { tempId, starts_at, ends_at, label: formatDayDate(starts_at) }],
    }));
  }
  function removeCustom(id: string, tempId: string) {
    setCustom((c) => ({ ...c, [id]: (c[id] ?? []).filter((x) => x.tempId !== tempId) }));
  }

  async function submit() {
    setBusy(true);
    try {
      const payload = addedIds
        .filter((id) => totalFor(id) > 0)
        .map((id) => ({
          class_offering_id: id,
          session_ids: picks[id] ?? [],
          new_sessions: (custom[id] ?? []).map((c) => ({
            starts_at: c.starts_at,
            ends_at: c.ends_at,
          })),
        }));
      const res = await add({
        data: {
          student_id: studentId,
          method: plan,
          hours: plan === "hours" ? Number(hours) || 0 : 0,
          classes: payload,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setDoneCount(res.lessons ?? total);
      toast.success(`${student?.full_name ?? "Student"} added to ${res.lessons} lessons.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (doneCount !== null) {
    return (
      <Card className="border-success/40">
        <CardContent className="space-y-3 py-6 text-center">
          <p className="text-sm">
            <span className="font-semibold">{student?.full_name}</span> is now on {doneCount}{" "}
            {doneCount === 1 ? "lesson" : "lessons"}. Their name shows on those rolls, and they're in
            Billing to price.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/roll">Open the roll</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/billing">Open Billing</Link>
            </Button>
            <Button
              onClick={() => {
                setDoneCount(null);
                setStudentId("");
                setAddedIds([]);
                setPicks({});
                setCustom({});
              }}
            >
              Add another student
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Student */}
      <StepCard step={1} title="The student" done={!!studentId}>
        <div className="space-y-1.5">
          <Label>Who's joining</Label>
          <Select value={studentId || "none"} onValueChange={(v) => setStudentId(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a student…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose a student…</SelectItem>
              {(students ?? []).map((s: Row) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                  {s.year_level ? ` · ${s.year_level}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Not a student yet? Add them on Students &amp; Families first. Pricing is set later in Billing.
          </p>
        </div>
      </StepCard>

      {/* 2. Classes & dates */}
      <StepCard
        step={2}
        title="Classes & the dates they'll come"
        done={total > 0}
        summary={total > 0 ? `${total} lessons` : undefined}
      >
        <div className="space-y-3">
          <Select value="none" onValueChange={(v) => v !== "none" && addClass(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Add a class they've joined…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Add a class they've joined…</SelectItem>
              {notAdded.map((c: Row) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} · {c.programs?.name ?? "Class"}
                  {classWhen(c) ? ` · ${classWhen(c)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {addedIds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No classes yet. Pick one above to choose the lessons they'll sit in on.
            </p>
          )}

          {addedIds.map((id) => {
            const c = classById(id);
            const lessons = upcomingFor(id);
            const chosen = picks[id] ?? [];
            return (
              <div key={id} className="overflow-hidden rounded-lg border border-[var(--edge)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2">
                  <span className="font-medium">{c?.programs?.name ?? "Class"}</span>
                  <Code>{c?.code}</Code>
                  <span className="text-xs text-muted-foreground">{c ? classWhen(c) : ""}</span>
                  <span className="ml-auto text-xs font-medium text-primary">{totalFor(id)} selected</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => removeClass(id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-56 space-y-0.5 overflow-y-auto p-2">
                  {lessons.length === 0 && (custom[id]?.length ?? 0) === 0 && (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No upcoming lessons on the timetable. Add a specific date below.
                    </p>
                  )}
                  {lessons.map((s: Row) => {
                    const on = chosen.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--mat-thin)]"
                      >
                        <Checkbox checked={on} onCheckedChange={() => toggle(id, s.id)} />
                        <span className="font-medium">{formatDayDate(s.starts_at)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(s.starts_at)}
                          {s.tutors?.full_name ? ` · ${s.tutors.full_name}` : ""}
                        </span>
                      </label>
                    );
                  })}
                  {(custom[id] ?? []).map((cl) => (
                    <div
                      key={cl.tempId}
                      className="flex items-center gap-2.5 rounded-md bg-primary/10 px-2 py-1.5 text-sm"
                    >
                      <Check className="h-4 w-4 text-primary" />
                      <span className="font-medium">{cl.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(cl.starts_at)} · added date
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-1.5"
                        onClick={() => removeCustom(id, cl.tempId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <AddDateRow
                  defaultLength={Number(c?.session_duration_hours ?? 1.5)}
                  onAdd={(local, length) => addDate(id, local, length)}
                />
              </div>
            );
          })}
        </div>
      </StepCard>

      {/* 3. Billing */}
      <StepCard step={3} title="How they're billed" done={plan === "payg" || Number(hours) > 0}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={(v: "hours" | "payg") => setPlan(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours — a prepaid block</SelectItem>
                <SelectItem value="payg">PAYG — pay per lesson</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {plan === "hours" && (
            <div className="space-y-1.5">
              <Label>Hours they're paying for</Label>
              <Input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          )}
        </div>
        <p className="mt-3 rounded-md bg-[var(--mat-thin)] px-3 py-2 text-sm text-muted-foreground">
          {plan === "hours" ? (
            <>
              Shows in Billing as <span className="font-medium text-foreground">{student?.full_name ?? "the student"} · {hours || 0} hours</span> with the price left empty for you to set.
            </>
          ) : (
            <>Each attended lesson lands in Billing to charge, with no price set until you firm it.</>
          )}
        </p>
      </StepCard>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{total}</span> lessons across{" "}
          <span className="font-medium text-foreground">{classesWithPicks}</span> classes · they'll
          appear on those rolls.
        </p>
        <Button
          disabled={busy || !studentId || total === 0 || (plan === "hours" && Number(hours) <= 0)}
          onClick={submit}
        >
          Add to {total} {total === 1 ? "lesson" : "lessons"}
        </Button>
      </div>
    </div>
  );
}

/** A date-and-length row for attaching an off-timetable lesson to a class. */
function AddDateRow({
  defaultLength,
  onAdd,
}: {
  defaultLength: number;
  onAdd: (local: string, length: number) => void;
}) {
  const [local, setLocal] = useState("");
  const [length, setLength] = useState(String(defaultLength));
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--edge)] px-3 py-2">
      <span className="text-xs text-muted-foreground">Not on the timetable yet?</span>
      <Input
        type="datetime-local"
        className="h-8 w-auto"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      <Input
        type="number"
        step="0.25"
        min={0.25}
        className="h-8 w-20"
        value={length}
        onChange={(e) => setLength(e.target.value)}
        title="Lesson length (hours)"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={!local}
        onClick={() => {
          onAdd(local, Number(length) || defaultLength);
          setLocal("");
        }}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add date
      </Button>
    </div>
  );
}
