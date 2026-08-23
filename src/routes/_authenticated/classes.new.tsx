import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, CircleDashed, Info } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, PageHeader, StatusPill, TableShell, Td, Th } from "@/components/vision/ui";
import { cn } from "@/lib/utils";
import { formatDate, formatHours, sydToday } from "@/lib/format";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import {
  generateSessions,
  getClassOffering,
  saveClassOffering,
  seedRollForOffering,
} from "@/lib/vision/classes.functions";
import { listCommerce, saveEnrolment } from "@/lib/vision/commerce.functions";
import { LABELS, Row } from "@/lib/vision/types";

export const Route = createFileRoute("/_authenticated/classes/new")({
  component: ClassBuilderPage,
});

function ClassBuilderPage() {
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });
  const { data: built, refetch } = useQuery({
    queryKey: ["class-offering", offeringId],
    queryFn: () => getClassOffering({ data: { id: offeringId! } }),
    enabled: !!offeringId,
  });

  const enrolmentCount = built?.enrolments.length ?? 0;
  const lessonCount = built?.sessions.length ?? 0;

  return (
    <div className="stagger space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/classes">
          <ArrowLeft className="mr-1 h-4 w-4" /> All classes
        </Link>
      </Button>

      <PageHeader
        title="Class Builder"
        description="Four steps. Each one clears itself when it is done."
      />

      <div className="flex items-start gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          <strong>Steps 2 and 3 are order-independent.</strong> Enrol students before or after
          generating lessons — it makes no difference. Seeding the roll is a function you can run at
          any time, so the old "generate first or the roll stays empty forever" trap is gone.
        </p>
      </div>

      <StepCard
        step={1}
        title="Create the class"
        done={!!offeringId}
        summary={
          built?.offering
            ? `${built.offering.programs?.name} · ${built.offering.operating_periods?.code} · ${built.offering.code}`
            : undefined
        }
      >
        <StepOne catalogue={catalogue} onCreated={(id) => setOfferingId(id)} />
      </StepCard>

      <StepCard
        step={2}
        title="Add enrolments"
        done={enrolmentCount > 0}
        locked={!offeringId}
        summary={enrolmentCount > 0 ? `${enrolmentCount} student(s) enrolled` : undefined}
      >
        {offeringId && built?.offering && (
          <StepTwo
            offering={built.offering}
            enrolments={built.enrolments}
            onSaved={() => refetch()}
          />
        )}
      </StepCard>

      <StepCard
        step={3}
        title="Generate lessons"
        done={lessonCount > 0}
        locked={!offeringId}
        summary={lessonCount > 0 ? `${lessonCount} lesson(s) on the timetable` : undefined}
      >
        {offeringId && (
          <StepThree
            offeringId={offeringId}
            sessions={built?.sessions ?? []}
            onGenerated={async () => {
              setGenerated(true);
              await refetch();
            }}
          />
        )}
      </StepCard>

      <StepCard
        step={4}
        title="Seed the roll"
        done={generated && lessonCount > 0 && enrolmentCount > 0}
        locked={!offeringId}
        summary="Runs automatically after steps 2 and 3 — re-run it any time."
      >
        {offeringId && <StepFour offeringId={offeringId} onSeeded={() => refetch()} />}
      </StepCard>

      {offeringId && (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/classes">Done — back to classes</Link>
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
  summary,
  children,
}: {
  step: number;
  title: string;
  done: boolean;
  locked?: boolean | undefined;
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
        </CardTitle>
        {summary && <CardDescription>{summary}</CardDescription>}
      </CardHeader>
      <CardContent>
        {locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDashed className="h-4 w-4" /> Create the class first.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function StepOne({ catalogue, onCreated }: { catalogue: Row; onCreated: (id: string) => void }) {
  const save = useServerFn(saveClassOffering);
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
    recurrence: "weekly" as const,
    recurrence_start_local: "",
    session_duration_hours: 1.5,
    room: "",
  });

  const program = (catalogue?.programs ?? []).find((p: Row) => p.id === form.program_id);
  const isPrivate = form.offering_type === "private_tuition";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Program</Label>
        <Select
          value={form.program_id}
          onValueChange={(v) => {
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
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
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
        <Label>Default tutor</Label>
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
        {isPrivate && (
          <p className="text-xs text-muted-foreground">Private tuition is always capacity 1.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Lesson length (hours)</Label>
        <Input
          type="number"
          step="0.25"
          min={0.25}
          value={form.session_duration_hours}
          onChange={(e) => setForm({ ...form, session_duration_hours: Number(e.target.value) })}
        />
        {program && (
          <p className="text-xs text-muted-foreground">
            Program standard is {formatHours(program.standard_duration_hours)}.
          </p>
        )}
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
        <Label>Recurrence</Label>
        <Select
          value={form.recurrence}
          onValueChange={(v: Row) => setForm({ ...form, recurrence: v })}
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
      </div>

      <div className="space-y-1.5">
        <Label>First lesson (Sydney)</Label>
        <Input
          type="datetime-local"
          value={form.recurrence_start_local}
          onChange={(e) => setForm({ ...form, recurrence_start_local: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Fixes both the weekday and the time of day. A 5:30pm class stays 5:30pm across the
          daylight-saving change.
        </p>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Room</Label>
        <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
      </div>

      <div className="sm:col-span-2">
        <Button
          disabled={!form.program_id || !form.operating_period_id || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const row: Row = await save({ data: { ...form, status: "active" } });
              await queryClient.invalidateQueries({ queryKey: ["classes"] });
              toast.success(`Class ${row.code} created.`);
              onCreated(row.id);
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create class
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
        <TableShell>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Method</Th>
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
                <Td>{e.method ? LABELS.billingMethod[e.method as "hours" | "payg"] : "—"}</Td>
                <Td>
                  <StatusPill tone={e.status === "trial" ? "info" : "success"}>
                    {e.status}
                  </StatusPill>
                </Td>
                <Td className="text-right tabular-nums">
                  {e.final_agreed_price != null
                    ? `$${Number(e.final_agreed_price).toFixed(2)}`
                    : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Who is enrolling…" />
            </SelectTrigger>
            <SelectContent>
              {(commerce?.students ?? []).map((s: Row) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name} · {s.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Enrolment status</Label>
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
            <p className="text-xs text-muted-foreground">
              A trial needs no billing method and consumes no hours.
            </p>
          )}
        </div>

        {status !== "trial" && (
          <>
            <div className="space-y-1.5">
              <Label>Billing method</Label>
              <Select value={method} onValueChange={(v: "hours" | "payg") => setMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours — buy a block, draw it down</SelectItem>
                  <SelectItem value="payg">Pay as you go — one charge per lesson</SelectItem>
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
                  This is a per-hour price, so it carries a catalogue quantity of one hour. Without
                  a figure here the system would sell them a single hour for the whole term.
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
            toast.success("Enrolled. The roll has been seeded for every lesson.");
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
        Add enrolment
      </Button>
    </div>
  );
}

function StepThree({
  offeringId,
  sessions,
  onGenerated,
}: {
  offeringId: string;
  sessions: Row[];
  onGenerated: () => Promise<void>;
}) {
  const generate = useServerFn(generateSessions);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await generate({ data: { offering_id: offeringId } });
            toast.success(
              `${result.lessons_created} lesson(s) created, ${result.roll_entries_created} roll entries seeded.`,
            );
            await onGenerated();
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Generate lessons
      </Button>

      <p className="text-xs text-muted-foreground">
        Safe to press twice. Duplicate lessons are impossible — the database refuses two lessons for
        the same class at the same instant.
      </p>

      {sessions.length > 0 && (
        <TableShell>
          <thead>
            <tr>
              <Th>Lesson</Th>
              <Th>Date</Th>
              <Th className="text-right">Length</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {sessions.slice(0, 8).map((s: Row) => (
              <tr key={s.id}>
                <Td>
                  <Code>{s.code}</Code>
                </Td>
                <Td>{formatDate(s.session_date)}</Td>
                <Td className="text-right">{formatHours(s.duration_hours)}</Td>
                <Td>
                  <StatusPill tone="info">{s.status}</StatusPill>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {sessions.length > 8 && (
        <p className="text-xs text-muted-foreground">…and {sessions.length - 8} more.</p>
      )}
    </div>
  );
}

function StepFour({ offeringId, onSeeded }: { offeringId: string; onSeeded: () => void }) {
  const seed = useServerFn(seedRollForOffering);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The roll is seeded automatically whenever you enrol someone or generate lessons. Run it by
        hand any time — it only ever adds what is missing.
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await seed({ data: { offering_id: offeringId } });
            toast.success(
              result.roll_entries_created === 0
                ? "Already complete — nothing to add."
                : `${result.roll_entries_created} roll entries added.`,
            );
            onSeeded();
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Re-run roll seeding
      </Button>
    </div>
  );
}
