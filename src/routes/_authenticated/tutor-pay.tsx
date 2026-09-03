import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgeDollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Code,
  EmptyState,
  PageHeader,
  StatCard,
  StatusPill,
  TableShell,
  Td,
  Th,
  toneForStatus,
} from "@/components/vision/ui";
import { cn } from "@/lib/utils";
import {
  addDays,
  formatDate,
  formatHours,
  formatMoney,
  fortnightStart,
  sydToday,
} from "@/lib/format";
import {
  addPayRate,
  addSessionPayAdjustment,
  getFortnightPay,
  payoutTotal,
  savePayout,
} from "@/lib/vision/pay.functions";
import { meQueryOptions } from "./route";
import { LABELS, Row } from "@/lib/vision/types";

const payQueryOptions = (fortnight: string) =>
  queryOptions({
    queryKey: ["tutor-pay", fortnight],
    queryFn: () => getFortnightPay({ data: { fortnight_start: fortnight } }),
  });

export const Route = createFileRoute("/_authenticated/tutor-pay")({
  beforeLoad: async ({ context }) => {
    // UI gating is cosmetic; RLS and the API guard are the real boundary. This
    // just avoids showing an owner-only screen that would refuse to load.
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    // An owner sees everyone's pay; a tutor sees their own. An admin sees none,
    // which is how it already was.
    if (me.staff?.role !== "owner" && me.staff?.role !== "tutor") {
      throw redirect({ to: "/today" });
    }
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(payQueryOptions(fortnightStart(sydToday()))),
  component: TutorPayPage,
});

function TutorPayPage() {
  const { data: me } = useSuspenseQuery(meQueryOptions());
  // A tutor reads their pay; they do not set rates, adjust lessons or mark a
  // payout as made. The database refuses all three anyway - this keeps the page
  // from offering buttons that could only fail.
  const canEdit = me.staff?.role === "owner";
  const [fortnight, setFortnight] = useState(() => fortnightStart(sydToday()));
  const { data } = useSuspenseQuery(payQueryOptions(fortnight));
  const queryClient = useQueryClient();

  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [rateFor, setRateFor] = useState<Row | null>(null);
  const [payingOut, setPayingOut] = useState<Row | null>(null);

  const current = fortnightStart(sydToday());
  const label =
    fortnight === current
      ? "This fortnight"
      : fortnight === addDays(current, -14)
        ? "Last fortnight"
        : fortnight === addDays(current, 14)
          ? "Next fortnight"
          : "Fortnight";

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["tutor-pay"] });
  }

  const grandTotal = data.totals.reduce((sum: number, t: Row) => sum + Number(t.total_pay ?? 0), 0);
  const grandHours = data.totals.reduce((sum: number, t: Row) => sum + Number(t.hours ?? 0), 0);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Tutor Pay"
        description={
          canEdit
            ? "Pay is computed from lessons, not enrolments - a lesson pays its own tutor at the rate in force on its own date."
            : "Your pay, computed from the lessons you taught at the rate in force on each lesson's own date."
        }
      />

      {/* The fortnight, stated plainly. Two are always one tap away; the arrows
          reach any other. */}
      <div className="glass glass--solid flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous fortnight"
            onClick={() => setFortnight(addDays(fortnight, -14))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 text-center">
            <div className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="text-xl font-semibold tracking-tight">
              {formatDate(fortnight).replace(/ \d{4}$/, "")} – {formatDate(addDays(fortnight, 13))}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next fortnight"
            onClick={() => setFortnight(addDays(fortnight, 14))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[current, addDays(current, 14)].map((start, i) => {
            const active = fortnight === start;
            return (
              <button
                key={start}
                type="button"
                onClick={() => setFortnight(start)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  active ? "border-primary bg-primary/10" : "border-[var(--edge)] hover:bg-accent",
                )}
              >
                <div className="text-xs font-medium">
                  {i === 0 ? "This fortnight" : "Next fortnight"}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {formatDate(start).replace(/ \d{4}$/, "")} –{" "}
                  {formatDate(addDays(start, 13)).replace(/ \d{4}$/, "")}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Tutors with lessons"
          value={data.totals.filter((t: Row) => t.tutor_id).length}
        />
        <StatCard label="Payable hours" value={formatHours(grandHours)} />
        <StatCard label="Total pay" value={formatMoney(grandTotal)} icon={BadgeDollarSign} />
      </div>

      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">Hours and pay</TabsTrigger>
          <TabsTrigger value="rates">Rates</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="mt-4 space-y-4">
          {data.totals.length === 0 ? (
            <EmptyState
              icon={BadgeDollarSign}
              title="No lessons in this fortnight"
              hint="Pay comes from lessons on the timetable. Cancelled and rescheduled lessons pay nothing."
            />
          ) : (
            data.totals.map((t: Row) => {
              const lessons = data.lessons.filter((l: Row) => l.tutor_id === t.tutor_id);
              const payout = t.tutor_id
                ? data.payouts.find((p: Row) => p.tutor_id === t.tutor_id)
                : undefined;
              const unassigned = !t.tutor_id;
              return (
                <div
                  key={t.tutor_id ?? "unassigned"}
                  className={cn("rounded-lg border", unassigned && "border-warning/50")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                    <div>
                      <p className="font-semibold">{t.tutor_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.lessons} {Number(t.lessons) === 1 ? "lesson" : "lessons"} ·{" "}
                        {formatHours(t.hours)} taught
                        {Number(t.adjustments) !== 0 &&
                          ` · adjustments ${formatMoney(t.adjustments)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                          Fortnight pay
                        </div>
                        <div className="text-lg font-semibold tabular-nums">
                          {formatMoney(t.total_pay)}
                        </div>
                      </div>
                      {unassigned ? (
                        <StatusPill tone="warning">Assign a tutor</StatusPill>
                      ) : (
                        <div className="flex items-center gap-2">
                          {payout && (
                            <StatusPill tone={toneForStatus("payout", payout.status)}>
                              {
                                LABELS.payoutStatus[
                                  payout.status as keyof typeof LABELS.payoutStatus
                                ]
                              }
                            </StatusPill>
                          )}
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPayingOut({
                                  tutor: t,
                                  payout,
                                  rate: lessons.find((l: Row) => l.hourly_rate)?.hourly_rate ?? 0,
                                })
                              }
                            >
                              {payout ? "Edit payout" : "Create payout"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {unassigned && (
                    <p className="border-b bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
                      These lessons have no tutor assigned yet, so no one is paid for them. Open a
                      lesson on the timetable to set its tutor and it will move to that tutor here.
                    </p>
                  )}

                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Lesson</Th>
                        <Th>Date</Th>
                        <Th className="text-right">Payable hours</Th>
                        <Th className="text-right">Rate</Th>
                        <Th className="text-right">Base</Th>
                        <Th className="text-right">Adjustment</Th>
                        <Th className="text-right">Pay</Th>
                        <Th className="text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.map((l: Row) => (
                        <tr key={l.session_id}>
                          <Td>
                            {l.session?.class_offerings?.programs?.name ?? "-"}{" "}
                            <Code>{l.code}</Code>
                          </Td>
                          <Td className="whitespace-nowrap">{formatDate(l.session_date)}</Td>
                          <Td className="text-right tabular-nums">
                            {formatHours(l.payable_hours)}
                          </Td>
                          <Td className="text-right tabular-nums">{formatMoney(l.hourly_rate)}</Td>
                          <Td className="text-right tabular-nums">{formatMoney(l.base_pay)}</Td>
                          <Td className="text-right tabular-nums">
                            {Number(l.adjustment) === 0 ? "-" : formatMoney(l.adjustment)}
                          </Td>
                          <Td className="text-right font-medium tabular-nums">
                            {formatMoney(l.pay)}
                          </Td>
                          <Td className="text-right">
                            {canEdit && (
                              <Button size="sm" variant="ghost" onClick={() => setAdjusting(l)}>
                                Adjust
                              </Button>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="rates" className="mt-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Tutor</Th>
                <Th className="text-right">Current rate</Th>
                <Th>Effective from</Th>
                <Th>History</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {data.tutors.map((t: Row) => {
                const rates = data.rates.filter((r: Row) => r.tutor_id === t.id);
                const current = rates[0];
                return (
                  <tr key={t.id}>
                    <Td className="font-medium">{t.full_name}</Td>
                    <Td className="text-right tabular-nums">
                      {current ? (
                        formatMoney(current.hourly_rate)
                      ) : (
                        <StatusPill tone="warning">None set</StatusPill>
                      )}
                    </Td>
                    <Td>{current ? formatDate(current.effective_from) : "-"}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {rates.length > 1
                        ? rates
                            .slice(1, 4)
                            .map(
                              (r: Row) =>
                                `${formatMoney(r.hourly_rate)} from ${formatDate(r.effective_from)}`,
                            )
                            .join(" · ")
                        : "-"}
                    </Td>
                    <Td className="text-right">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setRateFor(t)}>
                          New rate
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
          <p className="mt-3 text-xs text-muted-foreground">
            A rate change is a new row, never an edit. Past fortnights keep the rate that was in
            force at the time - repricing history because someone got a raise is a bug, not a
            feature.
          </p>
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          {data.payouts.length === 0 ? (
            <EmptyState
              icon={BadgeDollarSign}
              title="No payouts for this fortnight"
              hint="Create one from the Hours and pay tab - it copies the computed total across and freezes it."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Payout</Th>
                  <Th>Tutor</Th>
                  <Th className="text-right">Hours</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Adjustments</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th>Paid</Th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p: Row) => {
                  const tutor = data.tutors.find((t: Row) => t.id === p.tutor_id);
                  return (
                    <tr key={p.id}>
                      <Td>
                        <Code>{p.code}</Code>
                      </Td>
                      <Td>{tutor?.full_name ?? "-"}</Td>
                      <Td className="text-right tabular-nums">
                        {formatHours(Number(p.hours_worked) + Number(p.hours_adjustment))}
                      </Td>
                      <Td className="text-right tabular-nums">{formatMoney(p.rate_at_payout)}</Td>
                      <Td className="text-right text-xs">{p.adjustment_reason ?? "-"}</Td>
                      <Td className="text-right font-medium tabular-nums">
                        {formatMoney(payoutTotal(p))}
                      </Td>
                      <Td>
                        <StatusPill tone={toneForStatus("payout", p.status)}>
                          {LABELS.payoutStatus[p.status as keyof typeof LABELS.payoutStatus]}
                        </StatusPill>
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {p.paid_date ? formatDate(p.paid_date) : "-"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </TabsContent>
      </Tabs>

      {adjusting && (
        <AdjustmentDialog lesson={adjusting} onClose={() => setAdjusting(null)} onDone={refresh} />
      )}
      {rateFor && <RateDialog tutor={rateFor} onClose={() => setRateFor(null)} onDone={refresh} />}
      {payingOut && (
        <PayoutDialog
          payload={payingOut}
          fortnight={fortnight}
          onClose={() => setPayingOut(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function AdjustmentDialog({
  lesson,
  onClose,
  onDone,
}: {
  lesson: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const add = useServerFn(addSessionPayAdjustment);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust pay for {lesson.code}</DialogTitle>
          <DialogDescription>
            For a class that ran long, or a bonus being carried. May be negative. Every adjustment
            requires a written reason - this is enforced by the database, not just asked for.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !amount || !note.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await add({
                  data: { session_id: lesson.session_id, amount: Number(amount), note },
                });
                toast.success("Adjustment recorded.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RateDialog({
  tutor,
  onClose,
  onDone,
}: {
  tutor: Row;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const add = useServerFn(addPayRate);
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(sydToday());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New rate for {tutor.full_name}</DialogTitle>
          <DialogDescription>
            Adds a row rather than overwriting. Lessons before this date keep the old rate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Hourly rate</Label>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Effective from</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !rate}
            onClick={async () => {
              setBusy(true);
              try {
                await add({
                  data: {
                    tutor_id: tutor.id,
                    hourly_rate: Number(rate),
                    effective_from: from,
                    note,
                  },
                });
                toast.success("Rate recorded.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({
  payload,
  fortnight,
  onClose,
  onDone,
}: {
  payload: Row;
  fortnight: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const save = useServerFn(savePayout);
  const existing = payload.payout;

  const [form, setForm] = useState({
    hours_worked: String(existing?.hours_worked ?? payload.tutor.hours ?? 0),
    rate_at_payout: String(existing?.rate_at_payout ?? payload.rate ?? 0),
    hours_adjustment: String(existing?.hours_adjustment ?? 0),
    amount_adjustment: String(existing?.amount_adjustment ?? 0),
    adjustment_reason: existing?.adjustment_reason ?? "",
    status: (existing?.status ?? "draft") as "draft" | "approved" | "paid",
    paid_date: existing?.paid_date ?? sydToday(),
    method: (existing?.method ?? "bank_transfer") as "cash" | "bank_transfer" | "other",
    payment_ref: existing?.payment_ref ?? "",
  });
  const [busy, setBusy] = useState(false);

  const total = payoutTotal({
    hours_worked: Number(form.hours_worked || 0),
    hours_adjustment: Number(form.hours_adjustment || 0),
    rate_at_payout: Number(form.rate_at_payout || 0),
    amount_adjustment: Number(form.amount_adjustment || 0),
  });
  const hasAdjustment =
    Number(form.hours_adjustment || 0) !== 0 || Number(form.amount_adjustment || 0) !== 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payout - {payload.tutor.tutor_name}</DialogTitle>
          <DialogDescription>
            Hours and rate are frozen onto the payout at the moment of payment, so a later rate
            change cannot reprice history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <NumField
            label="Hours worked"
            value={form.hours_worked}
            onChange={(v) => setForm({ ...form, hours_worked: v })}
          />
          <NumField
            label="Rate at payout"
            value={form.rate_at_payout}
            onChange={(v) => setForm({ ...form, rate_at_payout: v })}
          />
          <NumField
            label="Hours adjustment"
            value={form.hours_adjustment}
            onChange={(v) => setForm({ ...form, hours_adjustment: v })}
          />
          <NumField
            label="Amount adjustment"
            value={form.amount_adjustment}
            onChange={(v) => setForm({ ...form, amount_adjustment: v })}
          />

          {hasAdjustment && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Reason for the adjustment (required)</Label>
              <Textarea
                rows={2}
                value={form.adjustment_reason}
                onChange={(e) => setForm({ ...form, adjustment_reason: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: Row) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.status === "paid" && (
            <>
              <div className="space-y-1.5">
                <Label>Paid on</Label>
                <Input
                  type="date"
                  value={form.paid_date}
                  onChange={(e) => setForm({ ...form, paid_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select
                  value={form.method}
                  onValueChange={(v: Row) => setForm({ ...form, method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LABELS.paymentMethod).map(([value, l]) => (
                      <SelectItem key={value} value={value}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input
                  value={form.payment_ref}
                  onChange={(e) => setForm({ ...form, payment_ref: e.target.value })}
                />
              </div>
            </>
          )}
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          Total: <strong>{formatMoney(total)}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            (hours + adjustment) × rate + amount adjustment
          </span>
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (hasAdjustment && !form.adjustment_reason.trim())}
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  data: {
                    tutor_id: payload.tutor.tutor_id,
                    fortnight_start: fortnight,
                    hours_worked: Number(form.hours_worked),
                    rate_at_payout: Number(form.rate_at_payout),
                    hours_adjustment: Number(form.hours_adjustment),
                    amount_adjustment: Number(form.amount_adjustment),
                    adjustment_reason: form.adjustment_reason,
                    status: form.status,
                    paid_date: form.status === "paid" ? form.paid_date : "",
                    method: form.status === "paid" ? form.method : null,
                    payment_ref: form.payment_ref,
                    notes: "",
                  },
                });
                toast.success("Payout saved.");
                await onDone();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
