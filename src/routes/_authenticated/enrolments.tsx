import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  StatusPill,
  TableShell,
  Td,
  Th,
  WarningNote,
  toneForStatus,
} from "@/components/vision/ui";
import { formatDate, formatHours, formatMoney, sydToday } from "@/lib/format";
import {
  listCommerce,
  savePackage,
  setPackageEligibility,
  updatePackageStatus,
} from "@/lib/vision/commerce.functions";
import { LABELS, type PackageStatus, type Row } from "@/lib/vision/types";

const commerceQueryOptions = () =>
  queryOptions({ queryKey: ["commerce"], queryFn: () => listCommerce() });

export const Route = createFileRoute("/_authenticated/enrolments")({
  loader: ({ context }) => context.queryClient.ensureQueryData(commerceQueryOptions()),
  component: EnrolmentsPage,
});

function EnrolmentsPage() {
  const { data } = useSuspenseQuery(commerceQueryOptions());
  const [newPackage, setNewPackage] = useState(false);
  const [editingEligibility, setEditingEligibility] = useState<Row | null>(null);

  const eligibilityByPackage = new Map<string, string[]>();
  for (const row of data.eligibility) {
    const list = eligibilityByPackage.get(row.package_id) ?? [];
    list.push(row.enrolment_id);
    eligibilityByPackage.set(row.package_id, list);
  }

  const packagesWithoutEligibility = data.packages.filter(
    (p: Row) => p.status === "active" && (eligibilityByPackage.get(p.id)?.length ?? 0) === 0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enrolments & Hours"
        description="The commercial view: every enrolment with its agreed price, every package with its balance."
        actions={
          <Button size="sm" onClick={() => setNewPackage(true)}>
            <Plus className="mr-1 h-4 w-4" /> New hours package
          </Button>
        }
      />

      {packagesWithoutEligibility.length > 0 && (
        <WarningNote>
          {packagesWithoutEligibility.length} active{" "}
          {packagesWithoutEligibility.length === 1 ? "package has" : "packages have"} no eligible
          enrolments ticked. A package can only be spent on an enrolment it is eligible for, so
          those rolls will not validate until this is set.
        </WarningNote>
      )}

      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages">Hours packages ({data.packages.length})</TabsTrigger>
          <TabsTrigger value="enrolments">Enrolments ({data.enrolments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="mt-4 space-y-4">
          {data.packages.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No hours packages"
              hint="A package is a block of hours a family has bought. Students paying as they go do not need one."
              action={
                <Button size="sm" onClick={() => setNewPackage(true)}>
                  Create a package
                </Button>
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Package</Th>
                  <Th>Student</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Purchased</Th>
                  <Th className="text-right">Used</Th>
                  <Th className="text-right">Remaining</Th>
                  <Th className="text-right">Price</Th>
                  <Th>Eligible on</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.packages.map((p: Row) => {
                  const eligible = eligibilityByPackage.get(p.id) ?? [];
                  return (
                    <tr key={p.id}>
                      <Td>
                        <Code>{p.code}</Code>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(p.approved_on)}
                        </div>
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
                      <Td>{LABELS.packageType[p.package_type as "purchased" | "courtesy"]}</Td>
                      <Td className="text-right tabular-nums">{formatHours(p.hours_purchased)}</Td>
                      <Td className="text-right tabular-nums">{formatHours(p.hours_used)}</Td>
                      <Td className="text-right">
                        <StatusPill
                          tone={p.is_overdrawn ? "danger" : p.is_low ? "warning" : "success"}
                        >
                          {formatHours(p.hours_remaining)}
                        </StatusPill>
                      </Td>
                      <Td className="text-right tabular-nums">{formatMoney(p.price)}</Td>
                      <Td>
                        <Button
                          size="sm"
                          variant={eligible.length === 0 ? "destructive" : "outline"}
                          onClick={() => setEditingEligibility({ pkg: p, eligible })}
                        >
                          {eligible.length === 0 ? "Not set" : `${eligible.length} enrolment(s)`}
                        </Button>
                      </Td>
                      <Td>
                        <StatusPill tone={toneForStatus("package", p.status)}>
                          {p.status}
                        </StatusPill>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}

          <p className="text-xs text-muted-foreground">
            Balance is purchased minus hours consumed by present, non-trial attendance on lessons
            that ran. It is computed on read, so un-marking a student or cancelling a lesson refunds
            automatically.
          </p>
        </TabsContent>

        <TabsContent value="enrolments" className="mt-4">
          {data.enrolments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No enrolments"
              hint="Enrol students from Class Builder — an enrolment is a student in one class, carrying the agreed price."
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
                  <Th>Enrolment</Th>
                  <Th>Student</Th>
                  <Th>Class</Th>
                  <Th>Term</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Base</Th>
                  <Th>Adjustment</Th>
                  <Th className="text-right">Agreed</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.enrolments.map((e: Row) => (
                  <tr key={e.id}>
                    <Td>
                      <Code>{e.code}</Code>
                      <div className="text-xs text-muted-foreground">{formatDate(e.starts_on)}</div>
                    </Td>
                    <Td>
                      <Link
                        to="/students/$id"
                        params={{ id: e.student_id }}
                        className="font-medium hover:underline"
                      >
                        {e.students?.full_name}
                      </Link>
                    </Td>
                    <Td className="max-w-40 truncate">
                      {e.class_offerings?.programs?.name ?? "—"}
                    </Td>
                    <Td>{e.class_offerings?.operating_periods?.code ?? "—"}</Td>
                    <Td>
                      {e.method ? (
                        LABELS.billingMethod[e.method as "hours" | "payg"]
                      ) : (
                        <span className="text-muted-foreground">Trial</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(e.base_price)}</Td>
                    <Td className="text-xs">
                      {e.adjustment === "none"
                        ? "—"
                        : `${LABELS.adjustmentType[e.adjustment as keyof typeof LABELS.adjustmentType]}: ${e.adjustment_value}`}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatMoney(e.final_agreed_price)}
                    </Td>
                    <Td>
                      <StatusPill tone={toneForStatus("enrolment", e.status)}>
                        {e.status}
                      </StatusPill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </TabsContent>
      </Tabs>

      {newPackage && (
        <PackageDialog
          students={data.students}
          enrolments={data.enrolments}
          onClose={() => setNewPackage(false)}
        />
      )}
      {editingEligibility && (
        <EligibilityDialog
          pkg={editingEligibility.pkg}
          eligible={editingEligibility.eligible}
          enrolments={data.enrolments}
          onClose={() => setEditingEligibility(null)}
        />
      )}
    </div>
  );
}

/**
 * package_eligibility gets a first-class dialog, not a buried checkbox. It is
 * the single most misunderstood relationship in the system.
 */
function EligibilityDialog({
  pkg,
  eligible,
  enrolments,
  onClose,
}: {
  pkg: Row;
  eligible: string[];
  enrolments: Row[];
  onClose: () => void;
}) {
  const save = useServerFn(setPackageEligibility);
  const setStatus = useServerFn(updatePackageStatus);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(eligible);
  const [busy, setBusy] = useState(false);

  // A package belongs to one student, so only their enrolments can be ticked.
  const candidates = enrolments.filter((e: Row) => e.student_id === pkg.student_id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What can {pkg.code} be spent on?</DialogTitle>
          <DialogDescription>
            {pkg.students?.full_name}'s package. A student in two classes needs both enrolments
            ticked, or their roll will not validate — the database refuses to draw hours from a
            package that is not eligible.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            This student has no enrolments yet. Enrol them first, then come back.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((e: Row) => (
              <li key={e.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id={e.id}
                  checked={selected.includes(e.id)}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))
                  }
                />
                <label htmlFor={e.id} className="min-w-0 flex-1 cursor-pointer">
                  <div className="text-sm font-medium">
                    {e.class_offerings?.programs?.name ?? "Class"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Code>{e.code}</Code> · {e.class_offerings?.operating_periods?.code} ·{" "}
                    {e.method ? LABELS.billingMethod[e.method as "hours" | "payg"] : "Trial"}
                  </div>
                </label>
                <StatusPill tone={toneForStatus("enrolment", e.status)}>{e.status}</StatusPill>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:justify-between">
          <Select
            value={pkg.status}
            onValueChange={async (v) => {
              await setStatus({ data: { id: pkg.id, status: v as PackageStatus } });
              await queryClient.invalidateQueries({ queryKey: ["commerce"] });
              toast.success("Package status updated.");
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await save({ data: { package_id: pkg.id, enrolment_ids: selected } });
                  await queryClient.invalidateQueries({ queryKey: ["commerce"] });
                  await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
                  toast.success("Eligibility saved.");
                  onClose();
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save eligibility
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageDialog({
  students,
  enrolments,
  onClose,
}: {
  students: Row[];
  enrolments: Row[];
  onClose: () => void;
}) {
  const save = useServerFn(savePackage);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    student_id: "",
    package_type: "purchased" as "purchased" | "courtesy",
    hours_purchased: "10",
    price: "",
    approved_on: sydToday(),
    low_balance_threshold: "2",
    courtesy_reason: "",
    admin_note: "",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const candidates = enrolments.filter((e: Row) => e.student_id === form.student_id);
  const isCourtesy = form.package_type === "courtesy";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New hours package</DialogTitle>
          <DialogDescription>
            A block of hours belonging to one student. Tick which enrolments it may be spent on —
            one package can cover several classes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select
              value={form.student_id}
              onValueChange={(v) => {
                setForm({ ...form, student_id: v });
                setSelected([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Whose package…" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s: Row) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} · {s.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.package_type}
                onValueChange={(v: "purchased" | "courtesy") =>
                  setForm({ ...form, package_type: v, price: v === "courtesy" ? "0" : form.price })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchased">Purchased</SelectItem>
                  <SelectItem value="courtesy">Courtesy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hours purchased</Label>
              <Input
                type="number"
                step="0.25"
                value={form.hours_purchased}
                onChange={(e) => setForm({ ...form, hours_purchased: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price</Label>
              <Input
                type="number"
                step="0.01"
                disabled={isCourtesy}
                value={isCourtesy ? "0" : form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              {isCourtesy && (
                <p className="text-xs text-muted-foreground">Courtesy hours are free.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Low-balance warning at</Label>
              <Input
                type="number"
                step="0.5"
                value={form.low_balance_threshold}
                onChange={(e) => setForm({ ...form, low_balance_threshold: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Approved on</Label>
            <Input
              type="date"
              value={form.approved_on}
              onChange={(e) => setForm({ ...form, approved_on: e.target.value })}
            />
          </div>

          {isCourtesy && (
            <div className="space-y-1.5">
              <Label>Why is this courtesy? (required)</Label>
              <Textarea
                rows={2}
                value={form.courtesy_reason}
                onChange={(e) => setForm({ ...form, courtesy_reason: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <Label>Eligible enrolments</Label>
            {!form.student_id ? (
              <p className="text-sm text-muted-foreground">Choose a student first.</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This student has no enrolments yet. You can create the package now and tick
                enrolments later.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {candidates.map((e: Row) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`new-${e.id}`}
                      checked={selected.includes(e.id)}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked ? [...selected, e.id] : selected.filter((x) => x !== e.id),
                        )
                      }
                    />
                    <label htmlFor={`new-${e.id}`} className="cursor-pointer text-sm">
                      {e.class_offerings?.programs?.name ?? "Class"} · <Code>{e.code}</Code>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!form.student_id || busy || (isCourtesy && !form.courtesy_reason.trim())}
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  data: {
                    ...form,
                    price: isCourtesy ? 0 : Number(form.price || 0),
                    hours_purchased: Number(form.hours_purchased),
                    low_balance_threshold: Number(form.low_balance_threshold),
                    status: "active",
                    enrolment_ids: selected,
                  },
                });
                await queryClient.invalidateQueries({ queryKey: ["commerce"] });
                await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
                toast.success("Package created.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
