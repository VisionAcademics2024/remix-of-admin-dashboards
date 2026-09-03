import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Receipt, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Code,
  EmptyState,
  PageHeader,
  Section,
  StatCard,
  StatusPill,
  TableShell,
  Td,
  Th,
  WarningNote,
} from "@/components/vision/ui";
import { Segmented } from "@/components/vision/segmented";
import { formatDate, formatDay, formatHours, formatMoney, sydToday } from "@/lib/format";
import { groupUnbilled, type UnbilledFinding } from "@/lib/vision/billing-audit";
import { listStudents } from "@/lib/vision/people.functions";
import {
  adjustCharge,
  attributeUnbilledHours,
  cancelCharge,
  createHoursCharge,
  createManualCharge,
  createPaygCharge,
  firmEnrolmentPlan,
  getBillingAudit,
  getBillingBoard,
  markInvoiced,
  markPaid,
  restoreCharge,
  setChargeMethod,
} from "@/lib/vision/billing.functions";
import { chargeSourceLabel, LABELS, Row } from "@/lib/vision/types";

const billingQueryOptions = () =>
  queryOptions({ queryKey: ["billing"], queryFn: () => getBillingBoard() });

/** The audit is a heavier read, so it loads alongside rather than blocking. */
const auditQueryOptions = () =>
  queryOptions({ queryKey: ["billing-audit"], queryFn: () => getBillingAudit() });

export const Route = createFileRoute("/_authenticated/billing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(billingQueryOptions()),
  component: BillingPage,
});

type ChargePayload =
  | { kind: "payg"; row: Row }
  | { kind: "hours"; row: Row }
  | { kind: "firm"; row: Row };

function BillingPage() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const { data: audit } = useQuery(auditQueryOptions());
  const [newBill, setNewBill] = useState(false);
  const queryClient = useQueryClient();

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["billing"] });
    await queryClient.invalidateQueries({ queryKey: ["billing-audit"] });
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
  }

  const total = (rows: Row[]) => rows.reduce((sum, r) => sum + Number(r.final_amount ?? 0), 0);
  const toChargeCount =
    data.newEnrolments.length + data.toCharge.length + data.packagesToCharge.length;

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Billing"
        description="Money as a pipeline — from a lesson taught to a payment received. Every figure is adjustable until it's committed, and cash and card invoice as two separate runs."
        actions={
          <Button onClick={() => setNewBill(true)}>
            <Plus /> New bill
          </Button>
        }
      />

      {(data.truncated?.uncharged || data.truncated?.charges) && (
        <WarningNote>
          This account has more billing history than one screen can hold, so the lists below are
          capped. Nothing has been lost — the oldest unbilled lessons are shown first, and the
          record of what has already been charged is read in full, so nothing can be billed twice.
        </WarningNote>
      )}

      {/* The audit sits above the pipeline on purpose. Everything below is work
          the app already knows about; this is the work it did not. */}
      <UnbilledSection
        audit={audit}
        onRefresh={refresh}
        onNewBill={() => setNewBill(true)}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="To set up" value={data.newEnrolments.length} tone="warning" icon={Sparkles} />
        <StatCard label="Waiting to charge" value={data.toCharge.length + data.packagesToCharge.length} />
        <StatCard
          label="To invoice"
          value={formatMoney(total(data.toInvoice))}
          hint={`${data.toInvoice.length} charges`}
        />
        <StatCard
          label="Invoiced, unpaid"
          value={formatMoney(total(data.unpaid))}
          hint={`${data.unpaid.length} charges`}
          tone={data.unpaid.length ? "warning" : "default"}
        />
        <StatCard label="Received" value={formatMoney(total(data.received))} tone="success" />
      </div>

      {/* 1. What we need to charge */}
      <Section
        title="What we need to charge"
        count={toChargeCount}
        description="New enrolments to firm up, plus lessons and packages taught but not yet billed."
        tone={toChargeCount ? "warning" : "default"}
      >
        <ToChargeBody data={data} onRefresh={refresh} />
      </Section>

      {/* 2. To invoice — cash / card split */}
      <Section
        title="To invoice"
        count={data.toInvoice.length}
        description="Charges raised, ready to send. Cash and card go out as two separate runs."
      >
        <ToInvoiceBody rows={data.toInvoice} onRefresh={refresh} />
      </Section>

      {/* 3. Invoiced, unpaid */}
      <Section
        title="Invoiced · unpaid"
        count={data.unpaid.length}
        description="Sent, waiting on the money. Record a payment when it lands and it moves to Received."
        tone={data.unpaid.length ? "warning" : "default"}
      >
        <UnpaidBody rows={data.unpaid} onRefresh={refresh} />
      </Section>

      {/* 4. Received */}
      <Section
        title="Payment received"
        count={data.received.length}
        description="Settled. Kept as the paid record."
      >
        <ReceivedTable rows={data.received} />
      </Section>

      {/* 5. Cancelled */}
      <Section
        title="Cancelled"
        count={data.cancelled.length}
        description="Written off, never deleted. Restore one if it was a mistake."
      >
        <CancelledTable rows={data.cancelled} onRefresh={refresh} />
      </Section>

      {newBill && <NewBillDialog onClose={() => setNewBill(false)} onRefresh={refresh} />}
    </div>
  );
}

/* ------------------------------------------------------ 0. Not reaching billing */

/**
 * The students the pipeline below cannot see.
 *
 * Every queue on this page starts from a row - a lesson taught, a package
 * bought, an enrolment with a blank price. A student on hours whose package was
 * never created has none of those, so they are taught, marked present, and
 * never billed, and no screen says so. This is that list.
 *
 * It never raises anything by itself. Money is not a thing to guess at: the
 * screen names what is wrong and where to go and fix it, and a person decides.
 */
function UnbilledSection({
  audit,
  onRefresh,
  onNewBill,
}: {
  audit: { findings: UnbilledFinding[] } | undefined;
  onRefresh: () => Promise<void>;
  onNewBill: () => void;
}) {
  const groups = useMemo(() => groupUnbilled(audit?.findings ?? []), [audit]);
  const attribute = useServerFn(attributeUnbilledHours);
  const [fixing, setFixing] = useState(false);

  /**
   * Put these hours back on the package they were always meant to come out of.
   *
   * Safe to press: it only touches roll entries that point at nothing, so an
   * entry moved to a different package on purpose is left alone, and pressing
   * it twice does nothing the second time.
   */
  async function attributeAll(ids: string[]) {
    setFixing(true);
    try {
      const result = await attribute({ data: { enrolment_ids: ids } });
      await onRefresh();
      if (result.attributed === 0) {
        toast.warning(
          "Nothing could be attributed - these enrolments have no single eligible package. Attach one from Enrolments & Hours.",
        );
      } else {
        toast.success(
          `${result.attributed} roll ${result.attributed === 1 ? "entry" : "entries"} now draw from the class package.` +
            (result.skipped > 0
              ? ` ${result.skipped} left alone - no single eligible package.`
              : ""),
        );
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setFixing(false);
    }
  }

  if (!audit) {
    return (
      <Section title="Not reaching billing" description="Checking every enrolment and package…">
        <div className="h-16 rounded-2xl bg-[var(--mat-thin)]" />
      </Section>
    );
  }

  if (groups.length === 0) {
    return (
      <Section
        title="Not reaching billing"
        count={0}
        description="Every student being taught can be billed."
        tone="success"
      >
        <EmptyState
          title="Nothing is falling through"
          hint="Each active enrolment is either pay-as-you-go, or on hours with a package behind it that its lessons draw from."
        />
      </Section>
    );
  }

  const totalHours = groups.reduce((sum, g) => sum + g.hours, 0);

  return (
    <Section
      title="Not reaching billing"
      count={audit.findings.length}
      description="Students being taught who none of the queues below can see. Each one is time already given away."
      tone="warning"
      actions={
        <Button size="sm" variant="outline" onClick={onNewBill}>
          <Plus /> Bill one manually
        </Button>
      }
    >
      {totalHours > 0 && (
        <p className="mb-4 text-[0.85rem] text-muted-foreground">
          <span className="font-semibold text-warning">{formatHours(totalHours)}</span> taught with
          nothing to invoice against.
        </p>
      )}

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.reason}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold">
                <AlertTriangle
                  className={cn(
                    "h-4 w-4 shrink-0",
                    group.severity === "high" ? "text-destructive" : "text-warning",
                  )}
                  strokeWidth={2}
                />
                {group.title}
              </h3>
              <span className="rounded-full bg-[var(--mat-thick)] px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {group.items.length}
              </span>
              {/* Only this reason has an answer that is not a judgement call:
                  the package is already known, the roll simply is not pointed
                  at it. Everything else needs a person. */}
              {group.reason === "hours_unattributed" && (
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={fixing}
                  onClick={() => attributeAll(group.items.map((i) => i.id))}
                >
                  {fixing ? "Attributing…" : `Attribute all ${group.items.length}`}
                </Button>
              )}
            </div>
            <p className="mb-3 max-w-3xl text-[0.82rem] leading-relaxed text-muted-foreground">
              {group.explain}
            </p>

            <TableShell>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Class</Th>
                  <Th>Enrolment</Th>
                  <Th className="text-right">Hours taught</Th>
                  <Th className="text-right">Lessons</Th>
                  <Th className="text-right">Fix</Th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={`${item.reason}-${item.id}`}>
                    <Td>
                      {item.studentId ? (
                        <Link
                          to="/students/$id"
                          params={{ id: item.studentId }}
                          className="font-medium hover:underline"
                        >
                          {item.studentName}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.studentName}</span>
                      )}
                    </Td>
                    <Td className="max-w-56">
                      <span className="block truncate">{item.className ?? "-"}</span>
                    </Td>
                    <Td>
                      <Code>{item.code}</Code>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {item.hours > 0 ? formatHours(item.hours) : "-"}
                    </Td>
                    <Td className="text-right tabular-nums">{item.lessons || "-"}</Td>
                    <Td className="text-right">
                      {/* Where the fix lives, not a button that guesses at it.
                          Hours and prices are agreed with a family, never
                          inferred from a roll. */}
                      {item.reason === "hours_unattributed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={fixing}
                          onClick={() => attributeAll([item.id])}
                        >
                          Attribute
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/enrolments">
                            {item.reason === "hours_no_package"
                              ? "Add a package"
                              : "Open enrolments"}
                          </Link>
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Nothing here is charged automatically. Fix the enrolment or package and the student rejoins
        the queues below, or raise a one-off bill with <strong>New bill</strong>.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------ 0b. A bill of your own */

/**
 * A bill with nothing behind it.
 *
 * Every other charge on this page is raised from something the system already
 * holds - a lesson that was taught, a package that was bought. This one starts
 * from a student and an amount, for everything that has no row to hang off: a
 * resource fee, a catch-up arranged off the timetable, a deposit taken before
 * the class exists, a figure agreed on the phone.
 *
 * The database refuses to let it carry a package or an attendance, so it can
 * never become a second charge against something already billed.
 */
function NewBillDialog({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const create = useServerFn(createManualCharge);
  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: () => listStudents(),
  });

  const [studentId, setStudentId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [route, setRoute] = useState<"parent" | "internal">("parent");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const student = (students as Row[]).find((s) => s.id === studentId);
  const payer = student?.guardians?.find?.((g: Row) => g.id === student?.default_payer_id);
  const hasPayer = Boolean(student?.default_payer_id);
  const total = Number(amount || 0) + Number(adjustment || 0);

  // The one thing standing between this form and a raised bill, said plainly.
  // Checked in the order a person fills the form in, so the message moves down
  // the dialog rather than jumping about.
  const problem = !studentId
    ? "Choose a student."
    : !description.trim()
      ? "Say what the bill is for."
      : !amount || Number(amount) < 0
        ? "Enter an amount."
        : total < 0
          ? "The discount is larger than the bill itself."
          : route === "parent" && !hasPayer
            ? `${student?.full_name ?? "This student"} has no default payer. Set one on the student, or bill this internally.`
            : null;

  async function save() {
    setSaving(true);
    try {
      await create({
        data: {
          student_id: studentId,
          standard_amount: Number(amount),
          adjustment: Number(adjustment || 0),
          route,
          description: description.trim(),
          notes,
        },
      });
      await onRefresh();
      toast.success("Bill raised. It is in the to-invoice queue.");
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New bill</DialogTitle>
          <DialogDescription>
            A one-off charge for anything that is not a lesson or an hours package. It lands in the
            to-invoice queue with everything else.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bill-student">Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="bill-student">
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {(students as Row[]).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {student && (
              <p className="text-xs text-muted-foreground">
                {hasPayer
                  ? `Billed to ${payer?.full_name ?? "the default payer"}.`
                  : "No default payer set for this student."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-description">What is it for</Label>
            <Input
              id="bill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catch-up lesson, resource fee, deposit…"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-adjustment">Adjustment</Label>
              <Input
                id="bill-adjustment"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Negative for a discount.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-route">Route</Label>
            <Select value={route} onValueChange={(v: "parent" | "internal") => setRoute(v)}>
              <SelectTrigger id="bill-route">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">Parent — billed to the default payer</SelectItem>
                <SelectItem value="internal">Internal (cash/bank)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea
              id="bill-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the invoice should carry."
            />
          </div>

          <div className="flex items-baseline justify-between rounded-2xl border border-[var(--edge)] bg-[var(--mat-thin)] px-4 py-3">
            <span className="text-[0.8rem] text-muted-foreground">Total</span>
            <span className="text-[1.4rem] font-semibold tabular-nums tracking-[-0.02em]">
              {formatMoney(total)}
            </span>
          </div>

          {problem && <p className="text-[0.8rem] text-warning">{problem}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={Boolean(problem) || saving}>
            {saving ? "Raising…" : "Raise the bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------ 1. What we need to charge */

function ToChargeBody({ data, onRefresh }: { data: Row; onRefresh: () => Promise<void> }) {
  const [payload, setPayload] = useState<ChargePayload | null>(null);

  return (
    <div className="space-y-6">
      {/* New enrolments — plan not set */}
      <div>
        <GroupLabel
          title="New enrolments — plan not set"
          hint="Pick Hours or PAYG, then set what they pay. New students land here the moment they join a class."
        />
        {data.newEnrolments.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Every enrolment has a plan"
            hint="A new student with no agreed price shows here until you firm it."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Current plan</Th>
                <Th>Started</Th>
                <Th className="text-right">Set up</Th>
              </tr>
            </thead>
            <tbody>
              {data.newEnrolments.map((e: Row) => (
                <tr key={e.id}>
                  <Td>
                    <Link
                      to="/students/$id"
                      params={{ id: e.students?.id }}
                      className="font-medium hover:underline"
                    >
                      {e.students?.full_name}
                    </Link>
                    <div>
                      <Code>{e.students?.code}</Code>
                    </div>
                  </Td>
                  <Td>
                    {e.class_offerings?.programs?.name ?? "-"} <Code>{e.class_offerings?.code}</Code>
                  </Td>
                  <Td className="text-muted-foreground">
                    {e.method
                      ? LABELS.billingMethod[e.method as keyof typeof LABELS.billingMethod]
                      : "Not set"}
                  </Td>
                  <Td className="whitespace-nowrap">{e.starts_on ? formatDate(e.starts_on) : "-"}</Td>
                  <Td className="text-right">
                    <Button size="sm" onClick={() => setPayload({ kind: "firm", row: e })}>
                      Set plan &amp; price
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      {/* PAYG lessons taught, not charged */}
      <div>
        <GroupLabel
          title="PAYG lessons taught, not charged"
          hint="One charge per lesson. Adjust the price or add a discount before charging."
        />
        {data.toCharge.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Every attended PAYG lesson is billed"
            hint="Lessons appear here the moment a PAYG student is marked present."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Lesson</Th>
                <Th>Date</Th>
                <Th className="text-right">Hours</Th>
                <Th className="text-right">Raise</Th>
              </tr>
            </thead>
            <tbody>
              {data.toCharge.map((a: Row) => (
                <tr key={a.id}>
                  <Td>
                    <Link
                      to="/students/$id"
                      params={{ id: a.student_id }}
                      className="font-medium hover:underline"
                    >
                      {a.enrolments?.students?.full_name}
                    </Link>
                    <div>
                      <Code>{a.enrolments?.students?.code}</Code>
                    </div>
                  </Td>
                  <Td>
                    {a.sessions?.class_offerings?.programs?.name ?? "-"}{" "}
                    <Code>{a.sessions?.code}</Code>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDay(a.lesson_starts_at)}</Td>
                  <Td className="text-right tabular-nums">{formatHours(a.hours_consumed)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setPayload({ kind: "payg", row: a })}>
                      Raise charge
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      {/* Hours packages — no invoice raised */}
      <div>
        <GroupLabel
          title="Hours packages — no invoice raised"
          hint="A bought block of hours. One charge per package — that is the invoice."
        />
        {data.packagesToCharge.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Every package has been invoiced"
            hint="One charge per package — that is the invoice."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Package</Th>
                <Th>Student</Th>
                <Th className="text-right">Hours</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Raise</Th>
              </tr>
            </thead>
            <tbody>
              {data.packagesToCharge.map((p: Row) => (
                <tr key={p.id}>
                  <Td>
                    <Code>{p.code}</Code>
                  </Td>
                  <Td>
                    <Link
                      to="/students/$id"
                      params={{ id: p.student_id }}
                      className="font-medium hover:underline"
                    >
                      {p.students?.full_name}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{formatHours(p.hours_purchased)}</Td>
                  <Td className="text-right tabular-nums">
                    {Number(p.price) > 0 ? (
                      formatMoney(p.price)
                    ) : (
                      <StatusPill tone="warning">Set price</StatusPill>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setPayload({ kind: "hours", row: p })}>
                      {Number(p.price) > 0 ? "Raise invoice" : "Price & invoice"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      {payload?.kind === "firm" && (
        <FirmPlanDialog enrolment={payload.row} onClose={() => setPayload(null)} onDone={onRefresh} />
      )}
      {(payload?.kind === "payg" || payload?.kind === "hours") && (
        <RaiseChargeDialog
          payload={payload as { kind: "payg" | "hours"; row: Row }}
          onClose={() => setPayload(null)}
          onDone={onRefresh}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- 2. To invoice (split) */

function ToInvoiceBody({ rows, onRefresh }: { rows: Row[]; onRefresh: () => Promise<void> }) {
  const setMethod = useServerFn(setChargeMethod);
  const [tab, setTab] = useState<"cash" | "card" | "unassigned">("cash");
  const [selected, setSelected] = useState<string[]>([]);
  const [invoicing, setInvoicing] = useState<"cash" | "card" | null>(null);
  const [adjusting, setAdjusting] = useState<Row | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState icon={Receipt} title="Nothing waiting to invoice" hint="Charges land here as soon as they're raised." />
    );
  }

  const bucket = (c: Row): "cash" | "card" | "unassigned" =>
    c.method === "cash" ? "cash" : c.method === "card" ? "card" : "unassigned";
  const groups = {
    cash: rows.filter((c) => bucket(c) === "cash"),
    card: rows.filter((c) => bucket(c) === "card"),
    unassigned: rows.filter((c) => bucket(c) === "unassigned"),
  };
  const visible = groups[tab];
  const visibleIds = visible.map((c) => c.id);
  const chosen = selected.filter((id) => visibleIds.includes(id));
  const runTotal = visible
    .filter((c) => chosen.includes(c.id))
    .reduce((s, c) => s + Number(c.final_amount ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function assign(id: string, method: string) {
    try {
      await setMethod({ data: { id, method: method as "cash" | "card" } });
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setSelected([]);
          }}
          options={[
            { value: "cash", label: "Cash", count: groups.cash.length },
            { value: "card", label: "Card", count: groups.card.length },
            { value: "unassigned", label: "Unassigned", count: groups.unassigned.length },
          ]}
        />
        {tab !== "unassigned" && (
          <div className="flex items-center gap-2">
            {chosen.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {formatMoney(runTotal)} selected
              </span>
            )}
            <Button size="sm" disabled={chosen.length === 0} onClick={() => setInvoicing(tab)}>
              Invoice {chosen.length || ""} {tab} {chosen.length === 1 ? "charge" : "charges"}
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {tab === "unassigned"
          ? "Set each charge to Cash or Card to line it up for a run. Auto-sending to Xero isn't wired in yet — you invoice manually here."
          : "Tick the charges going out on this run, then invoice them together. Everything stays adjustable until it's marked invoiced."}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={`No ${tab} charges`}
          hint={tab === "unassigned" ? "Every charge has a method set." : "Assign charges to this method from Unassigned."}
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th className="w-10" />
              <Th>Charge</Th>
              <Th>Student</Th>
              <Th>Payer</Th>
              <Th>Method</Th>
              <Th className="text-right">Standard</Th>
              <Th className="text-right">Adjustment</Th>
              <Th className="text-right">Final</Th>
              <Th className="text-right" />
            </tr>
          </thead>
          <tbody>
            {visible.map((c: Row) => (
              <tr key={c.id}>
                <Td>
                  <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                </Td>
                <Td>
                  <Code>{c.code}</Code>
                  <div className="text-xs text-muted-foreground">{chargeSourceLabel(c.source)}</div>
                </Td>
                <Td>
                  <Link to="/students/$id" params={{ id: c.student_id }} className="hover:underline">
                    {c.students?.full_name}
                  </Link>
                </Td>
                <Td className="text-xs text-muted-foreground">{c.guardians?.full_name ?? "Internal"}</Td>
                <Td>
                  <Select value={c.method ?? "none"} onValueChange={(v) => assign(c.id, v)}>
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue placeholder="Set method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </Td>
                <Td className="text-right tabular-nums">{formatMoney(c.standard_amount)}</Td>
                <Td className="text-right tabular-nums">
                  {Number(c.adjustment) === 0 ? "-" : formatMoney(c.adjustment)}
                </Td>
                <Td className="text-right font-medium tabular-nums">{formatMoney(c.final_amount)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setAdjusting(c)}>
                      Adjust
                    </Button>
                    <CancelButton id={c.id} onDone={onRefresh} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {invoicing && (
        <InvoiceDialog
          ids={chosen}
          method={invoicing}
          onClose={() => setInvoicing(null)}
          onDone={async () => {
            setSelected([]);
            await onRefresh();
          }}
        />
      )}
      {adjusting && (
        <AdjustDialog charge={adjusting} onClose={() => setAdjusting(null)} onDone={onRefresh} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- 3. Invoiced, unpaid */

function UnpaidBody({ rows, onRefresh }: { rows: Row[]; onRefresh: () => Promise<void> }) {
  const [paying, setPaying] = useState<Row | null>(null);
  const [adjusting, setAdjusting] = useState<Row | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="Nothing outstanding" hint="Everything invoiced has been paid." />;
  }

  return (
    <>
      <TableShell>
        <thead>
          <tr>
            <Th>Charge</Th>
            <Th>Student</Th>
            <Th>Invoice</Th>
            <Th>Method</Th>
            <Th className="text-right">Final</Th>
            <Th className="text-right">Paid?</Th>
            <Th className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c: Row) => (
            <tr key={c.id}>
              <Td>
                <Code>{c.code}</Code>
              </Td>
              <Td>
                <Link to="/students/$id" params={{ id: c.student_id }} className="hover:underline">
                  {c.students?.full_name}
                </Link>
              </Td>
              <Td className="text-xs text-muted-foreground">
                {c.xero_invoice_no ?? "-"}
                {c.invoice_date && <div>{formatDate(c.invoice_date)}</div>}
              </Td>
              <Td>
                <MethodPill method={c.method} />
              </Td>
              <Td className="text-right font-medium tabular-nums">{formatMoney(c.final_amount)}</Td>
              <Td className="text-right">
                <Button size="sm" onClick={() => setPaying(c)}>
                  Mark paid
                </Button>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setAdjusting(c)}>
                    Adjust
                  </Button>
                  <CancelButton id={c.id} onDone={onRefresh} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      {paying && <PaymentDialog charge={paying} onClose={() => setPaying(null)} onDone={onRefresh} />}
      {adjusting && (
        <AdjustDialog charge={adjusting} onClose={() => setAdjusting(null)} onDone={onRefresh} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------- 4. Received */

function ReceivedTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="No payments recorded yet" hint="Paid charges collect here." />;
  }
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Charge</Th>
          <Th>Student</Th>
          <Th>Invoice</Th>
          <Th>Method</Th>
          <Th className="text-right">Final</Th>
          <Th>Paid on</Th>
          <Th>Reference</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c: Row) => (
          <tr key={c.id}>
            <Td>
              <Code>{c.code}</Code>
            </Td>
            <Td>
              <Link to="/students/$id" params={{ id: c.student_id }} className="hover:underline">
                {c.students?.full_name}
              </Link>
            </Td>
            <Td className="text-xs text-muted-foreground">{c.xero_invoice_no ?? "-"}</Td>
            <Td>
              <MethodPill method={c.method} />
            </Td>
            <Td className="text-right font-medium tabular-nums">{formatMoney(c.final_amount)}</Td>
            <Td className="whitespace-nowrap">{c.paid_date ? formatDate(c.paid_date) : "-"}</Td>
            <Td className="text-xs text-muted-foreground">{c.payment_ref ?? "-"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

/* ------------------------------------------------------------------ 5. Cancelled */

function CancelledTable({ rows, onRefresh }: { rows: Row[]; onRefresh: () => Promise<void> }) {
  const restore = useServerFn(restoreCharge);
  if (rows.length === 0) {
    return <EmptyState icon={Receipt} title="Nothing cancelled" hint="Charges are cancelled, never deleted." />;
  }
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Charge</Th>
          <Th>Student</Th>
          <Th>Source</Th>
          <Th className="text-right">Final</Th>
          <Th className="text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((c: Row) => (
          <tr key={c.id}>
            <Td>
              <Code>{c.code}</Code>
            </Td>
            <Td>
              <Link to="/students/$id" params={{ id: c.student_id }} className="hover:underline">
                {c.students?.full_name}
              </Link>
            </Td>
            <Td>{chargeSourceLabel(c.source)}</Td>
            <Td className="text-right tabular-nums text-muted-foreground line-through">
              {formatMoney(c.final_amount)}
            </Td>
            <Td className="text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await restore({ data: { id: c.id } });
                    toast.success("Charge restored to the invoice queue.");
                    await onRefresh();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Restore
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

/* --------------------------------------------------------------------- Bits */

function GroupLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MethodPill({ method }: { method: string | null }) {
  if (!method) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = method === "cash" ? "success" : method === "card" ? "info" : "neutral";
  return (
    <StatusPill tone={tone}>
      {LABELS.paymentMethod[method as keyof typeof LABELS.paymentMethod] ?? method}
    </StatusPill>
  );
}

function CancelButton({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const cancel = useServerFn(cancelCharge);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      onClick={async () => {
        try {
          await cancel({ data: { id } });
          toast.success("Charge cancelled.");
          await onDone();
        } catch (error) {
          toast.error((error as Error).message);
        }
      }}
    >
      Cancel
    </Button>
  );
}

/* ------------------------------------------------------------------- Dialogs */

function FirmPlanDialog({
  enrolment,
  onClose,
  onDone,
}: {
  enrolment: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const firm = useServerFn(firmEnrolmentPlan);
  const [method, setMethod] = useState<"hours" | "payg">(enrolment.method ?? "hours");
  const [rate, setRate] = useState(String(enrolment.base_price ?? ""));
  const [hours, setHours] = useState("10");
  const [adjustment, setAdjustment] = useState("0");
  const [busy, setBusy] = useState(false);

  const isHours = method === "hours";
  const total = isHours
    ? Number(rate || 0) * Number(hours || 0) + Number(adjustment || 0)
    : Number(rate || 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up {enrolment.students?.full_name}</DialogTitle>
          <DialogDescription>
            {enrolment.class_offerings?.programs?.name ?? "This class"} — choose how they pay and what
            they pay. PAYG prices each lesson as it's taught; Hours opens a paid block ready to invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={method} onValueChange={(v: "hours" | "payg") => setMethod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours — a prepaid block</SelectItem>
                <SelectItem value="payg">PAYG — pay per lesson</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{isHours ? "Price per hour" : "Price per lesson"}</Label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            {isHours && (
              <div className="space-y-1.5">
                <Label>Hours paid for</Label>
                <Input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
            )}
          </div>
          {isHours && (
            <div className="space-y-1.5">
              <Label>Adjustment (negative for a discount)</Label>
              <Input
                type="number"
                step="0.01"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
            </div>
          )}
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            {isHours ? (
              <>
                Opens a <strong>{formatHours(Number(hours || 0))}</strong> package priced at{" "}
                <strong>{formatMoney(total)}</strong>.
              </>
            ) : (
              <>
                Each lesson will bill at <strong>{formatMoney(total)}</strong>.
              </>
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || rate === "" || (isHours && Number(hours) <= 0)}
            onClick={async () => {
              setBusy(true);
              try {
                await firm({
                  data: {
                    enrolment_id: enrolment.id,
                    method,
                    rate: Number(rate),
                    hours: isHours ? Number(hours) : 0,
                    adjustment: isHours ? Number(adjustment || 0) : 0,
                  },
                });
                toast.success("Plan set.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Set plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RaiseChargeDialog({
  payload,
  onClose,
  onDone,
}: {
  payload: { kind: "payg" | "hours"; row: Row };
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const payg = useServerFn(createPaygCharge);
  const hours = useServerFn(createHoursCharge);
  const isHours = payload.kind === "hours";

  const [amount, setAmount] = useState(
    isHours ? String(payload.row.price ?? "") : String(payload.row.enrolments?.base_price ?? ""),
  );
  const [adjustment, setAdjustment] = useState("0");
  const [route, setRoute] = useState<"parent" | "internal">("parent");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isHours ? "Invoice this package" : "Charge this lesson"}</DialogTitle>
          <DialogDescription>
            {isHours
              ? "One charge per package — that is the invoice. Nothing further is billed until they buy more hours."
              : "One charge, one lesson. Discounts are negative adjustments; the standard amount is the frozen source figure."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Standard amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Adjustment (negative for a discount)</Label>
            <Input
              type="number"
              step="0.01"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Route</Label>
            <Select value={route} onValueChange={(v: "parent" | "internal") => setRoute(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">Parent — billed to the default payer</SelectItem>
                <SelectItem value="internal">Internal (cash/bank)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Final amount: <strong>{formatMoney(Number(amount || 0) + Number(adjustment || 0))}</strong>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || amount === ""}
            onClick={async () => {
              setBusy(true);
              try {
                const body = {
                  standard_amount: Number(amount),
                  adjustment: Number(adjustment || 0),
                  route,
                  notes: "",
                };
                if (isHours) {
                  await hours({ data: { ...body, package_id: payload.row.id } });
                } else {
                  await payg({ data: { ...body, attendance_id: payload.row.id } });
                }
                toast.success("Charge raised.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Raise charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({
  charge,
  onClose,
  onDone,
}: {
  charge: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const adjust = useServerFn(adjustCharge);
  const [adjustment, setAdjustment] = useState(String(charge.adjustment ?? "0"));
  const [notes, setNotes] = useState(charge.notes ?? "");
  const [busy, setBusy] = useState(false);
  const final = Number(charge.standard_amount ?? 0) + Number(adjustment || 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust {charge.code}</DialogTitle>
          <DialogDescription>
            The standard amount ({formatMoney(charge.standard_amount)}) is frozen. A discount is a
            negative adjustment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Adjustment</Label>
            <Input
              type="number"
              step="0.01"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sibling discount…" />
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Final amount: <strong>{formatMoney(final)}</strong>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await adjust({ data: { id: charge.id, adjustment: Number(adjustment || 0), notes } });
                toast.success("Charge adjusted.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({
  ids,
  method,
  onClose,
  onDone,
}: {
  ids: string[];
  method: "cash" | "card";
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const invoice = useServerFn(markInvoiced);
  const [date, setDate] = useState(sydToday());
  const [xero, setXero] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Invoice {ids.length} {method} {ids.length === 1 ? "charge" : "charges"}
          </DialogTitle>
          <DialogDescription>
            Marks the selected {method} charges invoiced on one run. Giving them the same invoice
            number bills them on one document while keeping each line traceable.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Invoice date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice number (optional)</Label>
            <Input value={xero} onChange={(e) => setXero(e.target.value)} placeholder="INV-0142" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || ids.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await invoice({ data: { ids, invoice_date: date, xero_invoice_no: xero, method } });
                toast.success(`Invoiced ${ids.length} ${method} ${ids.length === 1 ? "charge" : "charges"}.`);
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark invoiced
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  charge,
  onClose,
  onDone,
}: {
  charge: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const pay = useServerFn(markPaid);
  const [date, setDate] = useState(sydToday());
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer" | "other">(
    charge.method ?? "cash",
  );
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment · {charge.code}</DialogTitle>
          <DialogDescription>
            {formatMoney(charge.final_amount)} for {charge.students?.full_name}. A payment needs both a
            date and a method.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Paid on</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v: Row) => setMethod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABELS.paymentMethod).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Receipt no, cash tin…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await pay({ data: { ids: [charge.id], paid_date: date, method, payment_ref: ref } });
                toast.success("Payment recorded.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
