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
import { formatDate, formatHours, formatMoney, formatTime, formatWeekday, sydToday } from "@/lib/format";
import {
  listCommerce,
  saveEnrolment,
  savePackage,
  setEnrolmentPackage,
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
  const [newEnrol, setNewEnrol] = useState(false);
  const [editingEligibility, setEditingEligibility] = useState<Row | null>(null);
  const [pkgFor, setPkgFor] = useState<Row | null>(null);

  const packagesById = new Map(data.packages.map((p: Row) => [p.id, p]));

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
    <div className="stagger space-y-5">
      <PageHeader
        title="Enrolments & Hours"
        description="The commercial view: every enrolment with its agreed price, every package with its balance."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setNewEnrol(true)}>
              <Plus className="mr-1 h-4 w-4" /> New enrolment
            </Button>
            <Button size="sm" onClick={() => setNewPackage(true)}>
              <Plus className="mr-1 h-4 w-4" /> New hours package
            </Button>
          </div>
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
              hint="An enrolment is a student in one class, carrying the agreed price. Add one here, or build a whole class in Class Builder."
              action={
                <Button size="sm" onClick={() => setNewEnrol(true)}>
                  New enrolment
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
                  <Th>Package</Th>
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
                    <Td>
                      {e.method === "hours" ? (
                        <Button
                          size="sm"
                          variant={e.default_package_id ? "outline" : "destructive"}
                          onClick={() => setPkgFor(e)}
                        >
                          {e.default_package_id
                            ? (packagesById.get(e.default_package_id)?.code ?? "Package")
                            : "Add package"}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
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

      {pkgFor && (
        <EnrolmentPackageDialog
          enrolment={pkgFor}
          packages={data.packages}
          onClose={() => setPkgFor(null)}
        />
      )}
      {newEnrol && (
        <EnrolDialog
          students={data.students}
          offerings={data.offerings}
          prices={data.prices}
          packages={data.packages}
          eligibility={data.eligibility}
          onClose={() => setNewEnrol(false)}
        />
      )}
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

/**
 * Attach (or change, or clear) the package an existing hours enrolment draws
 * from. This is the fix for a roll reading "Hours · no package": it points the
 * enrolment at the package, marks it eligible, and re-points the roll already on
 * the books, all in one step.
 */
function EnrolmentPackageDialog({
  enrolment,
  packages,
  onClose,
}: {
  enrolment: Row;
  packages: Row[];
  onClose: () => void;
}) {
  const save = useServerFn(setEnrolmentPackage);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(enrolment.default_package_id ?? "");
  const [busy, setBusy] = useState(false);

  const candidates = packages.filter(
    (p: Row) => p.student_id === enrolment.student_id && p.status === "active",
  );

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { enrolment_id: enrolment.id, package_id: selected || null } });
      await queryClient.invalidateQueries({ queryKey: ["commerce"] });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
      toast.success(selected ? "Package attached, and the roll now draws from it." : "Package cleared.");
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
          <DialogTitle>Package for {enrolment.code}</DialogTitle>
          <DialogDescription>
            {enrolment.students?.full_name}'s hours in {enrolment.class_offerings?.programs?.name ??
              "this class"}
            {" "}come out of this package. Setting it fixes lessons already on the roll, not just
            future ones.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            This student has no active package yet. Create one with “New hours package”, then set it
            here.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Draws from package</Label>
            <Select value={selected || "none"} onValueChange={(v) => setSelected(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a package…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No package</SelectItem>
                {candidates.map((p: Row) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} · {formatHours(p.hours_remaining)} left
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || candidates.length === 0} onClick={submit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A recurring class's fixed day and time, e.g. "Wed 4:00 pm–5:30 pm", derived
 * from recurrence_start (which fixes both) and the session length. This is what
 * tells two classes with the same program name apart.
 */
function scheduleLabel(o: Row): string {
  if (!o.recurrence_start) return "";
  const dur = Number(o.session_duration_hours ?? 0);
  const end =
    dur > 0 ? new Date(Date.parse(o.recurrence_start) + dur * 3_600_000).toISOString() : null;
  const time = end ? `${formatTime(o.recurrence_start)}–${formatTime(end)}` : formatTime(o.recurrence_start);
  return `${formatWeekday(o.recurrence_start)} ${time}`.trim();
}

/**
 * Enrol one student into one or more classes, from a start date.
 *
 * This is the answer to "someone joined mid-term": an enrolment carries a
 * starts_on, and the roll is seeded only for lessons on or after that date — so
 * you never touch the timetable lesson by lesson. Ticking several classes makes
 * several enrolments at once, all sharing the date and terms. For an hours
 * student you can point the enrolment at the package it draws from here too, and
 * that package is marked eligible for the new enrolments in the same step, so
 * the roll validates straight away.
 */
function EnrolDialog({
  students,
  offerings,
  prices,
  packages,
  eligibility,
  onClose,
}: {
  students: Row[];
  offerings: Row[];
  prices: Row[];
  packages: Row[];
  eligibility: Row[];
  onClose: () => void;
}) {
  const enrol = useServerFn(saveEnrolment);
  const setEligibility = useServerFn(setPackageEligibility);
  const queryClient = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [offeringIds, setOfferingIds] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState(() => sydToday());
  const [billing, setBilling] = useState<"hours" | "payg" | "trial">("hours");
  const [priceId, setPriceId] = useState("");
  const [hoursOverride, setHoursOverride] = useState("");
  const [packageId, setPackageId] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedPrice = prices.find((p: Row) => p.id === priceId);
  const needHours = selectedPrice?.basis === "per_hour";

  // Only this student's active packages can be drawn from.
  const studentPackages = packages.filter(
    (p: Row) => p.student_id === studentId && p.status === "active",
  );

  const term = classSearch.trim().toLowerCase();
  const visibleOfferings = (offerings ?? [])
    .filter((o: Row) => o.status !== "archived")
    .filter((o: Row) =>
      term
        ? `${o.programs?.name ?? ""} ${o.code} ${o.operating_periods?.code ?? ""} ${scheduleLabel(o)}`
            .toLowerCase()
            .includes(term)
        : true,
    );

  const canSubmit =
    !!studentId &&
    offeringIds.length > 0 &&
    !!startsOn &&
    (!needHours || Number(hoursOverride) > 0) &&
    !busy;

  async function submit() {
    setBusy(true);
    try {
      const createdIds: string[] = [];
      for (const class_offering_id of offeringIds) {
        const row = await enrol({
          data: {
            student_id: studentId,
            class_offering_id,
            status: billing === "trial" ? "trial" : "active",
            starts_on: startsOn,
            method: billing === "trial" ? null : billing,
            standard_price_id: priceId || null,
            hours_override: needHours ? Number(hoursOverride) : null,
            default_package_id: billing === "hours" ? packageId || null : null,
            notes: "",
          },
        });
        if (row?.id) createdIds.push(row.id);
      }

      // A package only pays a roll it is eligible for, so tick the new
      // enrolments onto the chosen package in the same step (merged with
      // whatever it already covered).
      if (billing === "hours" && packageId && createdIds.length) {
        const already = eligibility
          .filter((e: Row) => e.package_id === packageId)
          .map((e: Row) => e.enrolment_id);
        await setEligibility({
          data: {
            package_id: packageId,
            enrolment_ids: Array.from(new Set([...already, ...createdIds])),
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["commerce"] });
      await queryClient.invalidateQueries({ queryKey: ["roll"] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
      toast.success(
        createdIds.length === 1
          ? "Enrolled, and the roll is seeded from the start date."
          : `Enrolled in ${createdIds.length} classes, rolls seeded from the start date.`,
      );
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New enrolment</DialogTitle>
          <DialogDescription>
            Enrol a student into one or more classes from a start date. The roll fills in only from
            that date on, so this is how you add someone who joined mid-term.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select
              value={studentId}
              onValueChange={(v) => {
                setStudentId(v);
                setPackageId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Who is enrolling…" />
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

          <div className="space-y-1.5">
            <Label>Classes</Label>
            <Input
              placeholder="Search classes…"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
            />
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-primary/30 bg-primary/5 p-3">
              {visibleOfferings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes match.</p>
              ) : (
                visibleOfferings.map((o: Row) => {
                  const when = scheduleLabel(o);
                  return (
                    <label
                      key={o.id}
                      htmlFor={`enrol-${o.id}`}
                      className="flex cursor-pointer items-start gap-2"
                    >
                      <Checkbox
                        id={`enrol-${o.id}`}
                        className="mt-0.5"
                        checked={offeringIds.includes(o.id)}
                        onCheckedChange={(checked) =>
                          setOfferingIds(
                            checked
                              ? [...offeringIds, o.id]
                              : offeringIds.filter((x) => x !== o.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {o.programs?.name ?? "Class"}
                          {when ? <span className="font-medium"> · {when}</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <Code>{o.code}</Code>
                          {o.operating_periods?.code ? ` · ${o.operating_periods.code}` : ""}
                          {o.room ? ` · ${o.room}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            {offeringIds.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {offeringIds.length} classes — one enrolment each, all from the same start date.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Starts on</Label>
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing</Label>
              <Select
                value={billing}
                onValueChange={(v: "hours" | "payg" | "trial") => {
                  setBilling(v);
                  if (v !== "hours") setPackageId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours package</SelectItem>
                  <SelectItem value="payg">Pay as you go</SelectItem>
                  <SelectItem value="trial">Trial (no charge)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {billing === "hours" && (
            <div className="space-y-1.5">
              <Label>Draws from package</Label>
              <Select
                value={packageId || "none"}
                onValueChange={(v) => setPackageId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a package…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Set later</SelectItem>
                  {studentPackages.map((p: Row) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} · {formatHours(p.hours_remaining)} left
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick the package these hours come out of and it is marked eligible automatically.
                {studentId && studentPackages.length === 0
                  ? " This student has no active package yet — create one after enrolling."
                  : ""}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (optional)</Label>
              <Select value={priceId || "none"} onValueChange={(v) => setPriceId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Standard price…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {prices.map((p: Row) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needHours && (
              <div className="space-y-1.5">
                <Label>Hours bought</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  placeholder="e.g. 14"
                  value={hoursOverride}
                  onChange={(e) => setHoursOverride(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {offeringIds.length > 1 ? `Enrol in ${offeringIds.length} classes` : "Enrol"}
          </Button>
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
