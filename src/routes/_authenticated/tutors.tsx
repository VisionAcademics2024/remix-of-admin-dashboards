import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgeDollarSign, Plus, UserCog } from "lucide-react";
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
import {
  Code,
  EmptyState,
  PageHeader,
  StatusPill,
  TableShell,
  Td,
  Th,
  TutorDot,
} from "@/components/vision/ui";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, sydToday } from "@/lib/format";
import { listTutors, saveTutor } from "@/lib/vision/catalogue.functions";
import { addPayRate } from "@/lib/vision/pay.functions";
import { DEFAULT_TUTOR_COLOUR, type Row } from "@/lib/vision/types";
import { TutorColourPicker } from "@/components/vision/colour-picker";

const tutorsQueryOptions = () =>
  queryOptions({ queryKey: ["tutors"], queryFn: () => listTutors() });

export const Route = createFileRoute("/_authenticated/tutors")({
  loader: ({ context }) => context.queryClient.ensureQueryData(tutorsQueryOptions()),
  component: TutorsPage,
});

function TutorsPage() {
  const { data: tutors } = useSuspenseQuery(tutorsQueryOptions());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [rating, setRating] = useState<Row | null>(null);

  const term = search.trim().toLowerCase();
  const visible = term
    ? tutors.filter((t: Row) =>
        `${t.full_name} ${t.code} ${t.email ?? ""} ${t.mobile ?? ""}`.toLowerCase().includes(term),
      )
    : tutors;

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Tutors"
        description="The tutor database - contact details, timetable colour, and hourly pay rates."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> New tutor
          </Button>
        }
      />

      <Input
        className="max-w-sm"
        placeholder="Search tutors…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No tutors yet"
          hint="Add a tutor - their colour makes the timetable readable, and their rate feeds tutor pay."
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              Add a tutor
            </Button>
          }
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Tutor</Th>
              <Th>Contact</Th>
              <Th>Status</Th>
              <Th className="text-right">Hourly rate</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t: Row) => (
              <tr key={t.id}>
                <Td>
                  <TutorDot colour={t.colour} name={t.full_name} />
                  <div>
                    <Code>{t.code}</Code>
                  </div>
                </Td>
                <Td className="text-sm">
                  <div>{t.email || <span className="text-muted-foreground">-</span>}</div>
                  <div className="text-muted-foreground">{t.mobile || ""}</div>
                </Td>
                <Td>
                  <StatusPill tone={t.status === "active" ? "success" : "neutral"}>
                    {t.status}
                  </StatusPill>
                </Td>
                <Td className="text-right">
                  {t.current_rate != null ? (
                    <div>
                      <span className="tabular-nums">{formatMoney(t.current_rate)}/h</span>
                      {t.current_rate_from && (
                        <div className="text-xs text-muted-foreground">
                          since {formatDate(t.current_rate_from)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No rate set</span>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRating(t)}>
                      <BadgeDollarSign className="mr-1 h-3.5 w-3.5" /> Rates
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <p className="text-xs text-muted-foreground">
        A rate is history, not a single number: adding one with a start date keeps the old rate for
        the days it applied, so past pay never changes. Tutor pay reads the rate in force on each
        lesson's date.
      </p>

      {editing !== null && (
        <TutorDialog
          row={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {rating && <RatesDialog tutor={rating} onClose={() => setRating(null)} />}
    </div>
  );
}

function TutorDialog({ row, onClose }: { row?: Row; onClose: () => void }) {
  const save = useServerFn(saveTutor);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: row?.full_name ?? "",
    email: row?.email ?? "",
    mobile: row?.mobile ?? "",
    colour: row?.colour ?? DEFAULT_TUTOR_COLOUR,
    status: (row?.status ?? "active") as "active" | "inactive",
    notes: row?.notes ?? "",
  });

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { ...form, id: row?.id } });
      await queryClient.invalidateQueries({ queryKey: ["tutors"] });
      await queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success("Tutor saved.");
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit tutor" : "New tutor"}</DialogTitle>
          <DialogDescription>
            Contact details and a timetable colour. Set pay from the Rates button.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Timetable colour</Label>
            <TutorColourPicker
              value={form.colour}
              onChange={(colour) => setForm({ ...form, colour })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v: "active" | "inactive") => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !form.full_name} onClick={submit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RatesDialog({ tutor, onClose }: { tutor: Row; onClose: () => void }) {
  const add = useServerFn(addPayRate);
  const queryClient = useQueryClient();
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(() => sydToday());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const history: Row[] = tutor.rates ?? [];

  async function submit() {
    if (!rate) {
      toast.error("Enter an hourly rate.");
      return;
    }
    setBusy(true);
    try {
      await add({
        data: { tutor_id: tutor.id, hourly_rate: Number(rate), effective_from: from, note },
      });
      await queryClient.invalidateQueries({ queryKey: ["tutors"] });
      toast.success("Rate added.");
      setRate("");
      setNote("");
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay rates - {tutor.full_name}</DialogTitle>
          <DialogDescription>
            Add a rate with the date it starts. Older rates stay for the days they applied, so past
            pay is never rewritten.
          </DialogDescription>
        </DialogHeader>

        {history.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-[var(--edge)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r: Row) => (
                  <tr key={r.id} className="border-t border-[var(--edge)]">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.effective_from)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.hourly_rate)}/h
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-3 rounded-md border border-dashed border-[var(--edge)] p-3">
          <Label className="text-xs text-muted-foreground">Add a new rate</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hourly rate ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 45"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Starts from</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              placeholder="e.g. senior rate"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy || !rate} onClick={submit}>
            Add rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
