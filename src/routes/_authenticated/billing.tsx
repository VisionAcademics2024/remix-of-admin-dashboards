import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Receipt } from "lucide-react";
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
import { formatDate, formatDay, formatHours, formatMoney, sydToday } from "@/lib/format";
import {
  cancelCharge,
  createHoursCharge,
  createPaygCharge,
  getBillingBoard,
  markInvoiced,
  markPaid,
} from "@/lib/vision/billing.functions";
import { LABELS, Row } from "@/lib/vision/types";

const billingQueryOptions = () =>
  queryOptions({ queryKey: ["billing"], queryFn: () => getBillingBoard() });

export const Route = createFileRoute("/_authenticated/billing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(billingQueryOptions()),
  component: BillingPage,
});

function BillingPage() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const queryClient = useQueryClient();
  const [charging, setCharging] = useState<Row | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["billing"] });
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
    setSelected([]);
  }

  const total = (rows: Row[]) => rows.reduce((sum, r) => sum + Number(r.final_amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        description="Money in, as a pipeline. One charge per lesson, always — the database will not allow a second."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting to charge"
          value={data.toCharge.length + data.packagesToCharge.length}
          tone="warning"
        />
        <StatCard
          label="To invoice"
          value={formatMoney(total(data.toInvoice))}
          hint={`${data.toInvoice.length} charges`}
        />
        <StatCard
          label="Invoiced, unpaid"
          value={formatMoney(total(data.unpaid))}
          hint={`${data.unpaid.length} charges`}
        />
        <StatCard label="Received" value={formatMoney(total(data.received))} tone="success" />
      </div>

      <Tabs defaultValue="to-charge">
        <TabsList className="flex-wrap">
          <TabsTrigger value="to-charge">
            To charge ({data.toCharge.length + data.packagesToCharge.length})
          </TabsTrigger>
          <TabsTrigger value="to-invoice">To invoice ({data.toInvoice.length})</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid ({data.unpaid.length})</TabsTrigger>
          <TabsTrigger value="received">Received ({data.received.length})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled ({data.cancelled.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="to-charge" className="mt-4 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">PAYG lessons taught but not charged</h3>
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
                        {a.sessions?.class_offerings?.programs?.name ?? "—"}{" "}
                        <Code>{a.sessions?.code}</Code>
                      </Td>
                      <Td className="whitespace-nowrap">{formatDay(a.lesson_starts_at)}</Td>
                      <Td className="text-right tabular-nums">{formatHours(a.hours_consumed)}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCharging({ kind: "payg", row: a })}
                        >
                          Raise charge
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Hours packages with no invoice raised</h3>
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
                      <Td className="text-right tabular-nums">{formatMoney(p.price)}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCharging({ kind: "hours", row: p })}
                        >
                          Raise invoice
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </div>
        </TabsContent>

        <TabsContent value="to-invoice" className="mt-4 space-y-3">
          {data.toInvoice.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={selected.length === 0}
                onClick={() => setInvoiceOpen(true)}
              >
                Bill {selected.length || "these"} together
              </Button>
              <p className="text-xs text-muted-foreground">
                Raises no new charges — stamps one Xero invoice number across the selected ones, so
                the family gets one document and every lesson keeps its own line.
              </p>
            </div>
          )}
          <ChargeTable
            rows={data.toInvoice}
            selectable
            selected={selected}
            onToggle={(id) =>
              setSelected(
                selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
              )
            }
            onCancel={refresh}
            emptyTitle="Nothing waiting to invoice"
            emptyHint="Charges land here as soon as they are raised."
          />
        </TabsContent>

        <TabsContent value="unpaid" className="mt-4 space-y-3">
          {data.unpaid.length > 0 && (
            <Button size="sm" disabled={selected.length === 0} onClick={() => setPayOpen(true)}>
              Record payment for {selected.length || "selected"}
            </Button>
          )}
          <ChargeTable
            rows={data.unpaid}
            selectable
            selected={selected}
            onToggle={(id) =>
              setSelected(
                selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
              )
            }
            onCancel={refresh}
            emptyTitle="Nothing outstanding"
            emptyHint="Everything invoiced has been paid."
          />
        </TabsContent>

        <TabsContent value="received" className="mt-4">
          <ChargeTable
            rows={data.received}
            emptyTitle="No payments recorded yet"
            emptyHint="Paid charges collect here."
          />
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          <ChargeTable
            rows={data.cancelled}
            emptyTitle="Nothing cancelled"
            emptyHint="Charges are cancelled, never deleted."
          />
        </TabsContent>
      </Tabs>

      {charging && (
        <RaiseChargeDialog payload={charging} onClose={() => setCharging(null)} onDone={refresh} />
      )}
      {invoiceOpen && (
        <InvoiceDialog ids={selected} onClose={() => setInvoiceOpen(false)} onDone={refresh} />
      )}
      {payOpen && (
        <PaymentDialog ids={selected} onClose={() => setPayOpen(false)} onDone={refresh} />
      )}
    </div>
  );
}

function ChargeTable({
  rows,
  selectable,
  selected = [],
  onToggle,
  onCancel,
  emptyTitle,
  emptyHint,
}: {
  rows: Row[];
  selectable?: boolean;
  selected?: string[];
  onToggle?: (id: string) => void;
  onCancel?: () => Promise<void>;
  emptyTitle: string;
  emptyHint: string;
}) {
  const cancel = useServerFn(cancelCharge);

  if (rows.length === 0) {
    return <EmptyState icon={Receipt} title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <TableShell>
      <thead>
        <tr>
          {selectable && <Th className="w-10" />}
          <Th>Charge</Th>
          <Th>Student</Th>
          <Th>Payer</Th>
          <Th>Source</Th>
          <Th className="text-right">Standard</Th>
          <Th className="text-right">Adjustment</Th>
          <Th className="text-right">Final</Th>
          <Th>Invoice</Th>
          <Th>Status</Th>
          {onCancel && <Th className="text-right" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((c: Row) => (
          <tr key={c.id}>
            {selectable && (
              <Td>
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={() => onToggle?.(c.id)}
                />
              </Td>
            )}
            <Td>
              <Code>{c.code}</Code>
            </Td>
            <Td>
              <Link to="/students/$id" params={{ id: c.student_id }} className="hover:underline">
                {c.students?.full_name}
              </Link>
            </Td>
            <Td className="text-xs text-muted-foreground">
              {c.guardians?.full_name ?? "Internal"}
            </Td>
            <Td>{c.source === "hours" ? "Hours package" : "PAYG lesson"}</Td>
            <Td className="text-right tabular-nums">{formatMoney(c.standard_amount)}</Td>
            <Td className="text-right tabular-nums">
              {Number(c.adjustment) === 0 ? "—" : formatMoney(c.adjustment)}
            </Td>
            <Td className="text-right font-medium tabular-nums">{formatMoney(c.final_amount)}</Td>
            <Td className="text-xs text-muted-foreground">
              {c.xero_invoice_no ?? "—"}
              {c.invoice_date && <div>{formatDate(c.invoice_date)}</div>}
            </Td>
            <Td>
              <StatusPill tone={toneForStatus("charge", c.status)}>
                {LABELS.chargeStatus[c.status as keyof typeof LABELS.chargeStatus]}
              </StatusPill>
            </Td>
            {onCancel && (
              <Td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={async () => {
                    await cancel({ data: { id: c.id } });
                    toast.success("Charge cancelled.");
                    await onCancel();
                  }}
                >
                  Cancel
                </Button>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </TableShell>
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
              : "One charge, one lesson. Discounts are negative adjustments; the standard amount is the frozen source figure and is never edited."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Standard amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
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
            Final amount:{" "}
            <strong>{formatMoney(Number(amount || 0) + Number(adjustment || 0))}</strong>
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

function InvoiceDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
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
          <DialogTitle>Mark {ids.length} charge(s) invoiced</DialogTitle>
          <DialogDescription>
            Giving several charges the same Xero number bills them on one document while keeping
            per-lesson traceability.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Invoice date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Xero invoice number</Label>
            <Input value={xero} onChange={(e) => setXero(e.target.value)} placeholder="INV-0142" />
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
                await invoice({ data: { ids, invoice_date: date, xero_invoice_no: xero } });
                toast.success("Marked invoiced.");
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
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const pay = useServerFn(markPaid);
  const [date, setDate] = useState(sydToday());
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "other">("bank_transfer");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Marking a charge paid requires both a date and a method — the database rejects it
            otherwise.
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
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
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
                await pay({ data: { ids, paid_date: date, method, payment_ref: ref } });
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
