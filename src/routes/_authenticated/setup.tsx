import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  Code,
  EmptyState,
  PageHeader,
  StatusPill,
  TableShell,
  Td,
  Th,
  toneForStatus,
} from "@/components/vision/ui";
import { formatDate, formatHours, formatMoney, sydToday } from "@/lib/format";
import {
  createPrice,
  getCatalogue,
  savePeriod,
  saveProgram,
  saveTutor,
  supersedePrice,
} from "@/lib/vision/catalogue.functions";
import { LABELS, TUTOR_COLOURS, Row } from "@/lib/vision/types";

const catalogueQueryOptions = () =>
  queryOptions({ queryKey: ["catalogue"], queryFn: () => getCatalogue() });

export const Route = createFileRoute("/_authenticated/setup")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogueQueryOptions()),
  component: SetupPage,
});

function SetupPage() {
  const { data } = useSuspenseQuery(catalogueQueryOptions());
  const [dialog, setDialog] = useState<
    | { kind: "period"; row?: Row }
    | { kind: "program"; row?: Row }
    | { kind: "price"; row?: Row; supersede?: boolean }
    | { kind: "tutor"; row?: Row }
    | null
  >(null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Setup"
        description="Terms, programs, prices and tutors. Slow-changing, high-consequence."
      />

      <Tabs defaultValue="periods">
        <TabsList>
          <TabsTrigger value="periods">Terms ({data.periods.length})</TabsTrigger>
          <TabsTrigger value="programs">Programs ({data.programs.length})</TabsTrigger>
          <TabsTrigger value="prices">Prices ({data.prices.length})</TabsTrigger>
          <TabsTrigger value="tutors">Tutors ({data.tutors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="periods" className="mt-4 space-y-3">
          <Button size="sm" onClick={() => setDialog({ kind: "period" })}>
            <Plus className="mr-1 h-4 w-4" /> New term
          </Button>
          {data.periods.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No terms yet"
              hint="Every class belongs to a term. This is what makes 'Term 3' something you can filter by."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Term</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Runs</Th>
                  <Th>Status</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p: Row) => (
                  <tr key={p.id}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td>
                      <Code>{p.code}</Code>
                    </Td>
                    <Td>{LABELS.periodType[p.period_type as keyof typeof LABELS.periodType]}</Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(p.starts_on)} – {formatDate(p.ends_on)}
                    </Td>
                    <Td>
                      <StatusPill
                        tone={
                          p.status === "active"
                            ? "success"
                            : p.status === "planned"
                              ? "info"
                              : "muted"
                        }
                      >
                        {p.status}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "period", row: p })}
                      >
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </TabsContent>

        <TabsContent value="programs" className="mt-4 space-y-3">
          <Button size="sm" onClick={() => setDialog({ kind: "program" })}>
            <Plus className="mr-1 h-4 w-4" /> New program
          </Button>
          {data.programs.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No programs yet"
              hint="A program is what is taught — no dates, no tutor. 'Year 5 Private' is a program."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Program</Th>
                  <Th>Code</Th>
                  <Th>Year</Th>
                  <Th>Subject</Th>
                  <Th className="text-right">Standard length</Th>
                  <Th>Active</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {data.programs.map((p: Row) => (
                  <tr key={p.id}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td>
                      <Code>{p.code}</Code>
                    </Td>
                    <Td>{p.year_level ?? "—"}</Td>
                    <Td>{p.subject ?? "—"}</Td>
                    <Td className="text-right">{formatHours(p.standard_duration_hours)}</Td>
                    <Td>
                      <StatusPill tone={p.is_active ? "success" : "muted"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "program", row: p })}
                      >
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </TabsContent>

        <TabsContent value="prices" className="mt-4 space-y-3">
          <Button size="sm" onClick={() => setDialog({ kind: "price" })}>
            <Plus className="mr-1 h-4 w-4" /> New price
          </Button>
          {data.prices.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No prices yet"
              hint="The price list is versioned by effective dates. Enrolments copy the figure at the moment of agreeing it."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Price</Th>
                  <Th>Basis</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th className="text-right">Unit rate</Th>
                  <Th>Effective</Th>
                  <Th>Status</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {data.prices.map((p: Row) => (
                  <tr key={p.id}>
                    <Td>
                      <div className="font-medium">{p.name}</div>
                      <Code>{p.code}</Code>
                    </Td>
                    <Td>
                      {LABELS.pricingBasis[p.basis as keyof typeof LABELS.pricingBasis]}
                      {p.basis === "per_hour" && (
                        <div className="text-xs text-warning-foreground">
                          Enrolment must set hours
                        </div>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.basis === "per_hour" ? "—" : Number(p.quantity)}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.unit_rate)}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {formatDate(p.effective_from)}
                      {p.effective_to && ` – ${formatDate(p.effective_to)}`}
                    </Td>
                    <Td>
                      <StatusPill tone={p.status === "active" ? "success" : "muted"}>
                        {p.status}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      {p.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDialog({ kind: "price", row: p, supersede: true })}
                        >
                          Supersede
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
          <p className="text-xs text-muted-foreground">
            Never edit an old price. "Supersede" opens a new row and closes the old one, so anything
            that froze the old figure keeps pointing at it.
          </p>
        </TabsContent>

        <TabsContent value="tutors" className="mt-4 space-y-3">
          <Button size="sm" onClick={() => setDialog({ kind: "tutor" })}>
            <Plus className="mr-1 h-4 w-4" /> New tutor
          </Button>
          {data.tutors.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No tutors yet"
              hint="Tutors need a colour for the timetable to be readable."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Tutor</Th>
                  <Th>Code</Th>
                  <Th>Email</Th>
                  <Th>Mobile</Th>
                  <Th>Colour</Th>
                  <Th>Status</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {data.tutors.map((t: Row) => (
                  <tr key={t.id}>
                    <Td className="font-medium">{t.full_name}</Td>
                    <Td>
                      <Code>{t.code}</Code>
                    </Td>
                    <Td>{t.email ?? "—"}</Td>
                    <Td>{t.mobile ?? "—"}</Td>
                    <Td>
                      <span
                        className="inline-block h-4 w-8 rounded border"
                        style={{ backgroundColor: t.colour ?? "transparent" }}
                      />
                    </Td>
                    <Td>
                      <StatusPill tone={toneForStatus("person", t.status)}>{t.status}</StatusPill>
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "tutor", row: t })}
                      >
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
          <p className="text-xs text-muted-foreground">
            Pay rates are not here — they live in their own table so they can be hidden from
            non-owners at the row level. Set them on the Tutor Pay screen.
          </p>
        </TabsContent>
      </Tabs>

      {dialog?.kind === "period" && (
        <PeriodDialog row={dialog.row} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "program" && (
        <ProgramDialog row={dialog.row} prices={data.prices} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "price" && (
        <PriceDialog
          row={dialog.row}
          supersede={dialog.supersede}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "tutor" && <TutorDialog row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

function useSaved(onClose: () => void) {
  const queryClient = useQueryClient();
  return async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ["catalogue"] });
    toast.success(message);
    onClose();
  };
}

function PeriodDialog({ row, onClose }: { row?: Row; onClose: () => void }) {
  const save = useServerFn(savePeriod);
  const done = useSaved(onClose);
  const [form, setForm] = useState({
    name: row?.name ?? "",
    code: row?.code ?? "",
    period_type: row?.period_type ?? "standard_term",
    starts_on: row?.starts_on ?? sydToday(),
    ends_on: row?.ends_on ?? sydToday(),
    status: row?.status ?? "planned",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit term" : "New term"}</DialogTitle>
          <DialogDescription>
            A term or holiday intensive. Every class belongs to one.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Term 4 2026"
          />
          <TextField
            label="Code"
            value={form.code}
            onChange={(v) => setForm({ ...form, code: v })}
            placeholder="2026-T4"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Starts"
              type="date"
              value={form.starts_on}
              onChange={(v) => setForm({ ...form, starts_on: v })}
            />
            <TextField
              label="Ends"
              type="date"
              value={form.ends_on}
              onChange={(v) => setForm({ ...form, ends_on: v })}
            />
          </div>
          <SelectField
            label="Type"
            value={form.period_type}
            options={LABELS.periodType}
            onChange={(v) => setForm({ ...form, period_type: v })}
          />
          <SelectField
            label="Status"
            value={form.status}
            options={LABELS.periodStatus}
            onChange={(v) => setForm({ ...form, status: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.name || !form.code}
            onClick={async () => {
              setBusy(true);
              try {
                await save({ data: { ...form, id: row?.id } });
                await done("Term saved.");
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

function ProgramDialog({
  row,
  prices,
  onClose,
}: {
  row?: Row;
  prices: Row[];
  onClose: () => void;
}) {
  const save = useServerFn(saveProgram);
  const done = useSaved(onClose);
  const [form, setForm] = useState({
    name: row?.name ?? "",
    code: row?.code ?? "",
    year_level: row?.year_level ?? "",
    subject: row?.subject ?? "",
    exam_focus: row?.exam_focus ?? "",
    default_offering_type: row?.default_offering_type ?? "group_class",
    standard_duration_hours: String(row?.standard_duration_hours ?? 1.5),
    default_price_id: row?.default_price_id ?? "",
    is_active: row?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit program" : "New program"}</DialogTitle>
          <DialogDescription>
            What is taught, at what year level, for how long. No dates, no tutor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Year 5 Private"
          />
          <TextField
            label="Code"
            value={form.code}
            onChange={(v) => setForm({ ...form, code: v })}
            placeholder="Y5-PRIV"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Year level"
              value={form.year_level}
              onChange={(v) => setForm({ ...form, year_level: v })}
            />
            <TextField
              label="Subject"
              value={form.subject}
              onChange={(v) => setForm({ ...form, subject: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Standard length (hours)"
              type="number"
              value={form.standard_duration_hours}
              onChange={(v) => setForm({ ...form, standard_duration_hours: v })}
            />
            <SelectField
              label="Usually"
              value={form.default_offering_type}
              options={LABELS.offeringType}
              onChange={(v) => setForm({ ...form, default_offering_type: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default price</Label>
            <Select
              value={form.default_price_id || "none"}
              onValueChange={(v) => setForm({ ...form, default_price_id: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {prices
                  .filter((p: Row) => p.status === "active")
                  .map((p: Row) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatMoney(p.unit_rate)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.name || !form.code}
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  data: {
                    ...form,
                    id: row?.id,
                    standard_duration_hours: Number(form.standard_duration_hours),
                    default_price_id: form.default_price_id || null,
                  },
                });
                await done("Program saved.");
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

function PriceDialog({
  row,
  supersede,
  onClose,
}: {
  row?: Row;
  supersede?: boolean | undefined;
  onClose: () => void;
}) {
  const create = useServerFn(createPrice);
  const replace = useServerFn(supersedePrice);
  const done = useSaved(onClose);
  const [form, setForm] = useState({
    name: row?.name ?? "",
    code: supersede ? `${row?.code ?? ""}-v2` : (row?.code ?? ""),
    year_group: row?.year_group ?? "",
    scope: row?.scope ?? "",
    basis: row?.basis ?? "per_session",
    quantity: String(row?.quantity ?? 1),
    unit_rate: String(row?.unit_rate ?? ""),
    effective_from: sydToday(),
    effective_to: "",
    notes: row?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  const quantityHint: Record<string, string> = {
    per_hour:
      "Meaningless for a per-hour price — the buyer chooses how many hours, on the enrolment.",
    per_session: "Number of sessions in the standard block.",
    fixed_hours_price: "Number of hours in the block. The unit rate is the whole block's price.",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supersede ? `Supersede ${row.code}` : "New price"}</DialogTitle>
          <DialogDescription>
            {supersede
              ? "Creates a new row and closes the old one the day before this takes effect."
              : "The price list is versioned. Enrolments copy the figure at the moment of agreement."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <TextField
            label="Code"
            value={form.code}
            onChange={(v) => setForm({ ...form, code: v })}
          />
          <SelectField
            label="Basis"
            value={form.basis}
            options={LABELS.pricingBasis}
            onChange={(v) => setForm({ ...form, basis: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Quantity"
              type="number"
              value={form.quantity}
              onChange={(v) => setForm({ ...form, quantity: v })}
            />
            <TextField
              label="Unit rate"
              type="number"
              value={form.unit_rate}
              onChange={(v) => setForm({ ...form, unit_rate: v })}
            />
          </div>
          <p
            className={cn(
              "text-xs",
              form.basis === "per_hour" ? "text-warning-foreground" : "text-muted-foreground",
            )}
          >
            {quantityHint[form.basis]}
          </p>
          <TextField
            label="Effective from"
            type="date"
            value={form.effective_from}
            onChange={(v) => setForm({ ...form, effective_from: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.name || !form.code || !form.unit_rate}
            onClick={async () => {
              setBusy(true);
              try {
                const payload = {
                  ...form,
                  quantity: Number(form.quantity),
                  unit_rate: Number(form.unit_rate),
                };
                if (supersede) {
                  await replace({ data: { ...payload, supersedes_id: row.id } });
                } else {
                  await create({ data: payload });
                }
                await done("Price saved.");
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

function TutorDialog({ row, onClose }: { row?: Row; onClose: () => void }) {
  const save = useServerFn(saveTutor);
  const done = useSaved(onClose);
  const [form, setForm] = useState({
    full_name: row?.full_name ?? "",
    email: row?.email ?? "",
    mobile: row?.mobile ?? "",
    colour: row?.colour ?? TUTOR_COLOURS[0],
    status: row?.status ?? "active",
    notes: row?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit tutor" : "New tutor"}</DialogTitle>
          <DialogDescription>
            Contact details and a timetable colour. Pay rates live on the Tutor Pay screen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
          />
          <TextField
            label="Email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <TextField
            label="Mobile"
            value={form.mobile}
            onChange={(v) => setForm({ ...form, mobile: v })}
          />
          <div className="space-y-1.5">
            <Label>Timetable colour</Label>
            <div className="flex flex-wrap gap-2">
              {TUTOR_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, colour: c })}
                  className={cn(
                    "h-8 w-8 rounded-md border-2",
                    form.colour === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <SelectField
            label="Status"
            value={form.status}
            options={{ active: "Active", inactive: "Inactive" }}
            onChange={(v) => setForm({ ...form, status: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.full_name}
            onClick={async () => {
              setBusy(true);
              try {
                await save({ data: { ...form, id: row?.id } });
                await done("Tutor saved.");
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

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
