import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  MessageSquarePlus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { formatDate, formatTime, sydToday } from "@/lib/format";
import {
  convertLead,
  deleteLead,
  getLead,
  getLeadsBoard,
  listTrialSessions,
  logContact,
  saveLead,
  saveTrial,
} from "@/lib/vision/leads.functions";
import { LABELS, Row } from "@/lib/vision/types";
import { cn } from "@/lib/utils";

const boardQueryOptions = () =>
  queryOptions({ queryKey: ["leads-board"], queryFn: () => getLeadsBoard() });

export const Route = createFileRoute("/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(boardQueryOptions()),
  component: LeadsPage,
});

const OPEN_STATUSES = ["new", "contacted", "nurturing", "trial_booked"];

function LeadsPage() {
  const { data } = useSuspenseQuery(boardQueryOptions());
  const [dialog, setDialog] = useState<
    { kind: "lead"; row?: Row } | { kind: "detail"; id: string } | null
  >(null);

  const leads = data.leads as Row[];
  const open = leads.filter((l) => OPEN_STATUSES.includes(l.status));
  const converted = leads.filter((l) => l.status === "converted");
  const lost = leads.filter((l) => l.status === "lost");
  const overdue = open.filter((l) => l.is_overdue);
  const trialsBooked = open.reduce((n, l) => n + (Number(l.trial_count) || 0), 0);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Leads & Trials"
        description="The pre-student pipeline: an enquiry, every time we've reached out, and, once won, the trial class or diagnostic that turns them into a student."
        actions={
          <Button size="sm" onClick={() => setDialog({ kind: "lead" })}>
            <Plus className="mr-1 h-4 w-4" /> New lead
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open leads" value={open.length} icon={Sparkles} />
        <StatCard
          label="Follow-ups overdue"
          value={overdue.length}
          tone={overdue.length ? "warning" : "default"}
          hint={overdue.length ? "Past their promised next action" : "All caught up"}
          icon={CalendarClock}
        />
        <StatCard label="Trials booked" value={trialsBooked} icon={FlaskConical} />
        <StatCard
          label="Converted"
          value={converted.length}
          tone={converted.length ? "success" : "default"}
          icon={CheckCircle2}
        />
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="converted">Converted ({converted.length})</TabsTrigger>
          <TabsTrigger value="lost">Lost ({lost.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <LeadTable
            rows={open}
            onOpen={(id) => setDialog({ kind: "detail", id })}
            emptyHint="A lead is an enquiry: a parent who's asked about tutoring but isn't a student yet. Add the first one."
          />
        </TabsContent>
        <TabsContent value="converted" className="mt-4">
          <LeadTable
            rows={converted}
            onOpen={(id) => setDialog({ kind: "detail", id })}
            emptyHint="Won leads land here once you convert them into a student."
          />
        </TabsContent>
        <TabsContent value="lost" className="mt-4">
          <LeadTable
            rows={lost}
            onOpen={(id) => setDialog({ kind: "detail", id })}
            emptyHint="Leads you've marked lost, with the reason recorded."
          />
        </TabsContent>
      </Tabs>

      {dialog?.kind === "lead" && (
        <LeadDialog row={dialog.row} board={data} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "detail" && (
        <LeadDetailDialog
          id={dialog.id}
          board={data}
          onEdit={(row) => setDialog({ kind: "lead", row })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function LeadTable({
  rows,
  onOpen,
  emptyHint,
}: {
  rows: Row[];
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Sparkles} title="Nothing here yet" hint={emptyHint} />;
  }
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Lead</Th>
          <Th>Parent</Th>
          <Th>Interest</Th>
          <Th>Source</Th>
          <Th>Status</Th>
          <Th>Trial dates</Th>
          <Th>Last contact</Th>
          <Th className="text-right">Trials</Th>
          <Th className="text-right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id}>
            <Td>
              <div className="max-w-[16rem] truncate font-medium" title={l.student_name}>
                {l.student_name}
              </div>
              <Code>{l.code}</Code>
            </Td>
            <Td>
              <div>{l.guardian_name}</div>
              <div className="text-xs text-muted-foreground">
                {l.guardian_mobile ?? l.guardian_email ?? "No contact details"}
              </div>
            </Td>
            <Td>
              <div>{l.program_interest_name ?? l.subject_interest ?? "-"}</div>
              {l.year_level && <div className="text-xs text-muted-foreground">{l.year_level}</div>}
            </Td>
            <Td>{LABELS.leadSource[l.source as keyof typeof LABELS.leadSource]}</Td>
            <Td>
              <StatusPill tone={toneForStatus("lead", l.status)}>
                {LABELS.leadStatus[l.status as keyof typeof LABELS.leadStatus]}
              </StatusPill>
            </Td>
            <Td className="whitespace-nowrap text-xs">
              {l.trial_booked_at || l.trial_scheduled_for ? (
                <div className="space-y-0.5">
                  <div className="text-muted-foreground">
                    Booked{" "}
                    <span className="text-foreground">
                      {l.trial_booked_at ? formatDate(l.trial_booked_at) : "-"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Coming in{" "}
                    <span className="text-foreground">
                      {l.trial_scheduled_for ? formatDate(l.trial_scheduled_for) : "TBC"}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </Td>
            <Td className="whitespace-nowrap">
              {l.latest_contact_at ? (
                <span className={l.is_overdue ? "text-warning" : undefined}>
                  {l.days_since_contact === 0 ? "Today" : `${l.days_since_contact}d ago`}
                  {l.is_overdue && " · overdue"}
                </span>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </Td>
            <Td className="text-right tabular-nums">{l.trial_count || "-"}</Td>
            <Td className="text-right">
              <Button size="sm" variant="ghost" onClick={() => onOpen(l.id)}>
                Open
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

/* ------------------------------------------------------------------ Lead detail */

function LeadDetailDialog({
  id,
  board,
  onEdit,
  onClose,
}: {
  id: string;
  board: Row;
  onEdit: (row: Row) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLead({ data: { id } }),
  });
  const remove = useServerFn(deleteLead);
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<"contact" | "trial" | "convert" | null>(null);
  const [trialToEdit, setTrialToEdit] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lead = data?.lead as Row | undefined;
  const contacts = (data?.contacts ?? []) as Row[];
  const trials = (data?.trials ?? []) as Row[];
  const student = data?.student as Row | undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {isLoading || !lead ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {lead.student_name}
                <StatusPill tone={toneForStatus("lead", lead.status)}>
                  {LABELS.leadStatus[lead.status as keyof typeof LABELS.leadStatus]}
                </StatusPill>
              </DialogTitle>
              <DialogDescription>
                <Code>{lead.code}</Code> · Parent: {lead.guardian_name}
                {lead.guardian_mobile && ` · ${lead.guardian_mobile}`}
                {lead.guardian_email && ` · ${lead.guardian_email}`}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Interest">
                {lead.program_interest_name ?? lead.subject_interest ?? "-"}
              </Field>
              <Field label="Year level">{lead.year_level ?? "-"}</Field>
              <Field label="Source">
                {LABELS.leadSource[lead.source as keyof typeof LABELS.leadSource]}
                {lead.source_detail ? ` · ${lead.source_detail}` : ""}
              </Field>
              <Field label="Assigned to">{lead.assigned_name ?? "Unassigned"}</Field>
              <Field label="In pipeline">{lead.days_in_pipeline}d</Field>
              <Field label="Next action">
                <span className={lead.is_overdue ? "text-warning" : undefined}>
                  {lead.next_action_on ? formatDate(lead.next_action_on) : "-"}
                </span>
              </Field>
            </dl>

            {lead.status === "lost" && lead.lost_reason && (
              <p className="rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-sm">
                <span className="text-muted-foreground">Lost: </span>
                {lead.lost_reason}
              </p>
            )}
            {lead.notes && (
              <p className="rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-sm">
                {lead.notes}
              </p>
            )}

            {student && (
              <div className="rounded-xl border border-success/35 bg-success/10 px-3.5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-success" strokeWidth={1.8} />
                  <span className="font-semibold">Became a student</span>
                  <Code>{student.code}</Code>
                  <Link
                    to="/students/$id"
                    params={{ id: student.id }}
                    className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open profile →
                  </Link>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  <Field label="Student">{student.full_name}</Field>
                  <Field label="Payer">{student.payer_name ?? "Not set"}</Field>
                  <Field label="Year level">{student.year_level ?? "-"}</Field>
                  {student.enrolment && (
                    <>
                      <Field label="Class">
                        {student.enrolment.class_offerings?.programs?.name ??
                          student.enrolment.class_offerings?.code ??
                          "-"}
                      </Field>
                      <Field label="Enrolment">
                        <StatusPill tone={toneForStatus("enrolment", student.enrolment.status)}>
                          {
                            LABELS.enrolmentStatus[
                              student.enrolment.status as keyof typeof LABELS.enrolmentStatus
                            ]
                          }
                        </StatusPill>
                      </Field>
                    </>
                  )}
                </dl>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPanel("contact")}>
                <MessageSquarePlus className="mr-1 h-4 w-4" /> Log contact
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPanel("trial")}>
                <FlaskConical className="mr-1 h-4 w-4" /> Book trial
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(lead)}>
                Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanently removes {lead.code} and its contact log and trials. This can't be
                      undone.
                      {lead.status === "converted" &&
                        " The student and enrolment created on conversion are kept."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await remove({ data: { id } });
                          await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
                          toast.success("Lead deleted.");
                          onClose();
                        } catch (error) {
                          toast.error((error as Error).message);
                          setDeleting(false);
                        }
                      }}
                    >
                      Delete lead
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {lead.status !== "converted" && (
                <Button size="sm" className="ml-auto" onClick={() => setPanel("convert")}>
                  <UserPlus className="mr-1 h-4 w-4" /> Convert to student
                </Button>
              )}
            </div>

            {/* Trials */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Trials & diagnostics ({trials.length})</h3>
              {trials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None booked. “Book trial” sits them in on an existing class, or records a
                  diagnostic test.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {trials.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setTrialToEdit(t)}
                        className="group flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--edge-strong)]"
                      >
                        <Code>{t.code}</Code>
                        <span className="font-medium">
                          {LABELS.trialKind[t.kind as keyof typeof LABELS.trialKind]}
                        </span>
                        <StatusPill tone={toneForStatus("trial", t.status)}>
                          {LABELS.trialStatus[t.status as keyof typeof LABELS.trialStatus]}
                        </StatusPill>
                        {t.class_offerings?.programs?.name && (
                          <span className="text-muted-foreground">
                            {t.class_offerings.programs.name}
                          </span>
                        )}
                        {t.scheduled_for && (
                          <span className="text-muted-foreground">
                            {formatDate(t.scheduled_for)}
                          </span>
                        )}
                        {t.recommendation && (
                          <span className="text-xs text-muted-foreground">
                            →{" "}
                            {
                              LABELS.diagnosticRecommendation[
                                t.recommendation as keyof typeof LABELS.diagnosticRecommendation
                              ]
                            }
                          </span>
                        )}
                        <Pencil className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Contact log */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Contact log ({contacts.length})</h3>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contact recorded yet. Every call, text or email goes here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {contacts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="neutral">
                          {LABELS.contactChannel[c.channel as keyof typeof LABELS.contactChannel]}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(c.contacted_at)}
                          {c.staff?.full_name && ` · ${c.staff.full_name}`}
                        </span>
                        {c.next_action_on && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            Follow up {formatDate(c.next_action_on)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 leading-relaxed">{c.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {panel === "contact" && <ContactDialog leadId={id} onClose={() => setPanel(null)} />}
            {(panel === "trial" || trialToEdit) && (
              <TrialDialog
                leadId={id}
                lead={lead}
                board={board}
                trial={trialToEdit ?? undefined}
                onClose={() => {
                  setPanel(null);
                  setTrialToEdit(null);
                }}
              />
            )}
            {panel === "convert" && (
              <ConvertDialog lead={lead} board={board} onClose={() => setPanel(null)} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- Create / edit lead */

function LeadDialog({ row, board, onClose }: { row?: Row; board: Row; onClose: () => void }) {
  const save = useServerFn(saveLead);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    student_name: row?.student_name ?? "",
    year_level: row?.year_level ?? "",
    subject_interest: row?.subject_interest ?? "",
    program_interest_id: row?.program_interest_id ?? "",
    guardian_name: row?.guardian_name ?? "",
    guardian_email: row?.guardian_email ?? "",
    guardian_mobile: row?.guardian_mobile ?? "",
    status: row?.status ?? "new",
    source: row?.source ?? "referral",
    source_detail: row?.source_detail ?? "",
    assigned_to: row?.assigned_to ?? "",
    next_action_on: row?.next_action_on ?? "",
    lost_reason: row?.lost_reason ?? "",
    notes: row?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>
            An enquiry about tutoring. The child and the enquiring parent, with no student record
            yet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Child's name"
            value={form.student_name}
            onChange={(v) => setForm({ ...form, student_name: v })}
            placeholder="e.g. Aisha Khan"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Year level"
              value={form.year_level}
              onChange={(v) => setForm({ ...form, year_level: v })}
              placeholder="Year 5"
            />
            <SelectField
              label="Program of interest"
              value={form.program_interest_id || "none"}
              options={{
                none: "Not sure yet",
                ...Object.fromEntries((board.programs as Row[]).map((p) => [p.id, p.name])),
              }}
              onChange={(v) => setForm({ ...form, program_interest_id: v === "none" ? "" : v })}
            />
          </div>
          <TextField
            label="Subject interest (if no program)"
            value={form.subject_interest}
            onChange={(v) => setForm({ ...form, subject_interest: v })}
            placeholder="Maths, selective prep…"
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Parent's name"
              value={form.guardian_name}
              onChange={(v) => setForm({ ...form, guardian_name: v })}
            />
            <TextField
              label="Mobile"
              value={form.guardian_mobile}
              onChange={(v) => setForm({ ...form, guardian_mobile: v })}
            />
          </div>
          <TextField
            label="Email"
            value={form.guardian_email}
            onChange={(v) => setForm({ ...form, guardian_email: v })}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Status"
              value={form.status}
              options={LABELS.leadStatus}
              onChange={(v) => setForm({ ...form, status: v })}
            />
            <SelectField
              label="Source"
              value={form.source}
              options={LABELS.leadSource}
              onChange={(v) => setForm({ ...form, source: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Assigned to"
              value={form.assigned_to || "none"}
              options={{
                none: "Unassigned",
                ...Object.fromEntries((board.staff as Row[]).map((s) => [s.user_id, s.full_name])),
              }}
              onChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}
            />
            <TextField
              label="Next action on"
              type="date"
              value={form.next_action_on}
              onChange={(v) => setForm({ ...form, next_action_on: v })}
            />
          </div>

          {form.status === "lost" && (
            <TextField
              label="Why lost (required)"
              value={form.lost_reason}
              onChange={(v) => setForm({ ...form, lost_reason: v })}
              placeholder="Chose another tutor, price, moved away…"
            />
          )}
          <TextAreaField
            label="Notes"
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !form.student_name ||
              !form.guardian_name ||
              (form.status === "lost" && !form.lost_reason)
            }
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  data: {
                    ...form,
                    id: row?.id,
                    program_interest_id: form.program_interest_id || null,
                    assigned_to: form.assigned_to || null,
                  },
                });
                await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
                if (row?.id) await queryClient.invalidateQueries({ queryKey: ["lead", row.id] });
                toast.success("Lead saved.");
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

/* --------------------------------------------------------------- Log a contact */

function ContactDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const save = useServerFn(logContact);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    channel: "phone",
    summary: "",
    contacted_at: sydToday(),
    next_action_on: "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a contact</DialogTitle>
          <DialogDescription>
            Record a call, text or email. A first contact moves a new lead to “contacted”.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Channel"
              value={form.channel}
              options={LABELS.contactChannel}
              onChange={(v) => setForm({ ...form, channel: v })}
            />
            <TextField
              label="When"
              type="date"
              value={form.contacted_at}
              onChange={(v) => setForm({ ...form, contacted_at: v })}
            />
          </div>
          <TextAreaField
            label="What was discussed"
            value={form.summary}
            onChange={(v) => setForm({ ...form, summary: v })}
            placeholder="Left a voicemail; keen on Year 5 selective prep, will call back Tuesday."
          />
          <TextField
            label="Follow up on (optional)"
            type="date"
            value={form.next_action_on}
            onChange={(v) => setForm({ ...form, next_action_on: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.summary}
            onClick={async () => {
              setBusy(true);
              try {
                await save({ data: { ...form, lead_id: leadId } });
                await queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
                await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
                toast.success("Contact logged.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Log it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ Book a trial */

function TrialDialog({
  leadId,
  lead,
  board,
  trial,
  onClose,
}: {
  leadId: string;
  lead: Row;
  board: Row;
  trial?: Row | undefined;
  onClose: () => void;
}) {
  const save = useServerFn(saveTrial);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    kind: trial?.kind ?? "class_trial",
    class_offering_id: trial?.class_offering_id ?? "",
    session_id: trial?.session_id ?? "",
    scheduled_for: trial?.session_id ? "" : (trial?.scheduled_for ?? ""),
    status: trial?.status ?? "proposed",
    recommendation: trial?.recommendation ?? "",
    recommended_program_id: trial?.recommended_program_id ?? "",
    score: trial?.score ?? "",
    outcome_notes: trial?.outcome_notes ?? "",
    conducted_by: trial?.conducted_by ?? "",
    // The trial student's own details, held on the lead until conversion.
    student_name: lead?.student_name ?? "",
    year_level: lead?.year_level ?? "",
    guardian_mobile: lead?.guardian_mobile ?? "",
    guardian_email: lead?.guardian_email ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDiagnostic = form.kind === "diagnostic_test";

  // Every upcoming lesson across all live classes, so the trial can be pinned to
  // one exact session straight from the calendar - no picking a class first.
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["trial-sessions"],
    queryFn: () => listTrialSessions(),
    enabled: !isDiagnostic,
  });
  const chosen = (sessions as Row[]).find((s) => s.id === form.session_id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trial ? `Edit trial ${trial.code}` : "Book a trial"}</DialogTitle>
          <DialogDescription>
            Sit them in on a single class session - pick the exact lesson from the calendar - or
            record a bespoke diagnostic test. Once booked, the trial shows on that lesson's roll,
            where you confirm they turned up.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] p-3">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Trial student
            </p>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Name"
                  value={form.student_name}
                  onChange={(v) => setForm({ ...form, student_name: v })}
                />
                <TextField
                  label="Year level"
                  value={form.year_level}
                  onChange={(v) => setForm({ ...form, year_level: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Parent mobile"
                  value={form.guardian_mobile}
                  onChange={(v) => setForm({ ...form, guardian_mobile: v })}
                />
                <TextField
                  label="Parent email"
                  value={form.guardian_email}
                  onChange={(v) => setForm({ ...form, guardian_email: v })}
                />
              </div>
            </div>
          </div>

          <SelectField
            label="Kind"
            value={form.kind}
            options={LABELS.trialKind}
            onChange={(v) => setForm({ ...form, kind: v })}
          />
          {!isDiagnostic ? (
            <>
              <div className="space-y-1.5">
                <Label>Class & lesson to sit in on</Label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--edge-strong)]"
                >
                  <span className={form.session_id ? "text-foreground" : "text-muted-foreground"}>
                    {chosen
                      ? `${
                          chosen.class_offerings?.programs?.name ??
                          chosen.class_offerings?.code ??
                          "Lesson"
                        } · ${formatDate(chosen.starts_at)} · ${formatTime(chosen.starts_at)}`
                      : form.session_id && trial?.scheduled_for
                        ? `${
                            trial.class_offerings?.programs?.name ?? "Lesson"
                          } · ${formatDate(trial.scheduled_for)}`
                        : "Select a lesson…"}
                  </span>
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>

              <SelectField
                label="Status"
                value={form.status}
                options={LABELS.trialStatus}
                onChange={(v) => setForm({ ...form, status: v })}
              />

              {pickerOpen && (
                <SessionPickerDialog
                  sessions={sessions as Row[]}
                  loading={sessionsLoading}
                  valueSessionId={form.session_id}
                  onCancel={() => setPickerOpen(false)}
                  onConfirm={(s) => {
                    setForm({
                      ...form,
                      session_id: s.id,
                      class_offering_id: s.class_offering_id,
                      scheduled_for: s.starts_at,
                    });
                    setPickerOpen(false);
                  }}
                />
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Scheduled for"
                type="date"
                value={form.scheduled_for}
                onChange={(v) => setForm({ ...form, scheduled_for: v })}
              />
              <SelectField
                label="Status"
                value={form.status}
                options={LABELS.trialStatus}
                onChange={(v) => setForm({ ...form, status: v })}
              />
            </div>
          )}
          {isDiagnostic && (
            <>
              <SelectField
                label="Conducted by"
                value={form.conducted_by || "none"}
                options={{
                  none: "Unassigned",
                  ...Object.fromEntries((board.tutors as Row[]).map((t) => [t.id, t.full_name])),
                }}
                onChange={(v) => setForm({ ...form, conducted_by: v === "none" ? "" : v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Recommendation"
                  value={form.recommendation || "none"}
                  options={{ none: "-", ...LABELS.diagnosticRecommendation }}
                  onChange={(v) => setForm({ ...form, recommendation: v === "none" ? "" : v })}
                />
                <TextField
                  label="Score / level"
                  value={form.score}
                  onChange={(v) => setForm({ ...form, score: v })}
                  placeholder="e.g. 78% · Year 4 level"
                />
              </div>
              <SelectField
                label="Recommended program"
                value={form.recommended_program_id || "none"}
                options={{
                  none: "-",
                  ...Object.fromEntries((board.programs as Row[]).map((p) => [p.id, p.name])),
                }}
                onChange={(v) =>
                  setForm({ ...form, recommended_program_id: v === "none" ? "" : v })
                }
              />
            </>
          )}
          <TextAreaField
            label="Outcome notes"
            value={form.outcome_notes}
            onChange={(v) => setForm({ ...form, outcome_notes: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (!isDiagnostic && !form.session_id)}
            onClick={async () => {
              setBusy(true);
              try {
                await save({
                  data: {
                    ...form,
                    id: trial?.id,
                    lead_id: leadId,
                    class_offering_id: isDiagnostic ? null : form.class_offering_id || null,
                    session_id: isDiagnostic ? null : form.session_id || null,
                    recommendation: form.recommendation || null,
                    recommended_program_id: form.recommended_program_id || null,
                    conducted_by: form.conducted_by || null,
                  },
                });
                await queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
                await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
                toast.success(trial ? "Trial updated." : "Trial booked.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {trial ? "Save changes" : "Book trial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------- Convert to student */

function ConvertDialog({ lead, board, onClose }: { lead: Row; board: Row; onClose: () => void }) {
  const convert = useServerFn(convertLead);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    relationship: "Parent",
    enrol_offering_id: "",
    enrol_status: "trial",
    enrol_method: "hours",
    enrol_starts_on: sydToday(),
  });
  const [busy, setBusy] = useState(false);
  const active = form.enrol_status === "active";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert to student</DialogTitle>
          <DialogDescription>
            Creates a new student ({lead.student_name}) and guardian ({lead.guardian_name}), links
            them, and makes the parent the default payer. Optionally enrols them in a class, as a
            trial or a full student.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label="Relationship"
            value={form.relationship}
            onChange={(v) => setForm({ ...form, relationship: v })}
            placeholder="Parent, Mother, Guardian…"
          />
          <SelectField
            label="Enrol in a class (optional)"
            value={form.enrol_offering_id || "none"}
            options={{
              none: "Don't enrol yet",
              ...Object.fromEntries(
                (board.offerings as Row[]).map((o) => [
                  o.id,
                  `${o.code} · ${o.programs?.name ?? ""}`,
                ]),
              ),
            }}
            onChange={(v) => setForm({ ...form, enrol_offering_id: v === "none" ? "" : v })}
          />

          {form.enrol_offering_id && (
            <>
              <div className="space-y-1.5">
                <Label>Enrol as</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enrol_status: "trial" })}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      !active
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-[var(--edge)] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block font-medium">Trial student</span>
                    <span className="block text-xs opacity-80">
                      Sits in, consumes nothing. Convert to active later.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enrol_status: "active" })}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-[var(--edge)] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block font-medium">Full student</span>
                    <span className="block text-xs opacity-80">
                      Active enrolment that bills from day one.
                    </span>
                  </button>
                </div>
              </div>

              {active && (
                <SelectField
                  label="Billing method"
                  value={form.enrol_method}
                  options={LABELS.billingMethod}
                  onChange={(v) => setForm({ ...form, enrol_method: v })}
                />
              )}

              <TextField
                label="Enrolment starts on"
                type="date"
                value={form.enrol_starts_on}
                onChange={(v) => setForm({ ...form, enrol_starts_on: v })}
              />

              <p className="text-xs text-muted-foreground">
                {active
                  ? "Set the agreed price on Enrolments & Hours — until then it shows on Needs Attention as a reminder."
                  : "A trial keeps them open with no billing. Push them to a full student anytime from Enrolments & Hours."}
              </p>
            </>
          )}
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
                await convert({
                  data: {
                    lead_id: lead.id,
                    relationship: form.relationship,
                    enrol_offering_id: form.enrol_offering_id || null,
                    enrol_status: form.enrol_status as "trial" | "active",
                    enrol_method: active ? (form.enrol_method as "hours" | "payg") : null,
                    enrol_starts_on: form.enrol_starts_on,
                  },
                });
                await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
                await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
                await queryClient.invalidateQueries({ queryKey: ["students"] });
                toast.success("Converted. The new student is on the Students & Families screen.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- Pick a lesson (pop-up) */

/**
 * The calendar pop-up for a class trial: pick the exact lesson to sit in on.
 *
 * Days that have a lesson are highlighted and selectable; days with none are
 * disabled. Tapping a day lists that day's lessons across every live class;
 * choosing one and pressing OK pins the trial to that single session. Nothing
 * is committed until OK, so it can be opened, browsed and cancelled without
 * touching the booking behind it.
 */
function SessionPickerDialog({
  sessions,
  loading,
  valueSessionId,
  onCancel,
  onConfirm,
}: {
  sessions: Row[];
  loading: boolean;
  valueSessionId: string;
  onCancel: () => void;
  onConfirm: (session: Row) => void;
}) {
  const initial = sessions.find((s) => s.id === valueSessionId);
  const [pendingId, setPendingId] = useState(valueSessionId);
  const [day, setDay] = useState<Date | undefined>(() =>
    initial?.session_date ? ymdToDate(initial.session_date) : undefined,
  );

  const sessionDates = new Set(sessions.map((s) => s.session_date));
  const enabledDays = [...sessionDates].map(ymdToDate);
  const selectedYmd = day ? dateToYmd(day) : null;
  const daySessions = selectedYmd ? sessions.filter((s) => s.session_date === selectedYmd) : [];
  const pending = sessions.find((s) => s.id === pendingId);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pick a lesson</DialogTitle>
          <DialogDescription>
            Days with lessons are highlighted. Tap a day, choose the exact session, then press OK.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading lessons…</div>
        ) : enabledDays.length === 0 ? (
          <div className="rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3 py-3 text-sm text-muted-foreground">
            No upcoming lessons on any active class. Generate the timetable for a class first, then
            book the trial onto one of its sessions.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)]">
              <Calendar
                mode="single"
                selected={day}
                onSelect={setDay}
                disabled={(d) => !sessionDates.has(dateToYmd(d))}
                modifiers={{ hasSession: enabledDays }}
                modifiersClassNames={{
                  hasSession: "font-semibold underline underline-offset-4 decoration-primary/70",
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {selectedYmd ? `Lessons on ${formatDate(selectedYmd)}` : "Lessons on the chosen day"}
              </Label>
              {!day ? (
                <p className="mt-1.5 rounded-lg border border-dashed border-[var(--edge)] px-3 py-6 text-center text-sm text-muted-foreground">
                  Pick a highlighted day to see its lessons.
                </p>
              ) : daySessions.length === 0 ? (
                <p className="mt-1.5 rounded-lg border border-dashed border-[var(--edge)] px-3 py-6 text-center text-sm text-muted-foreground">
                  No lessons on this day.
                </p>
              ) : (
                <ul className="mt-1.5 max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                  {daySessions.map((s) => {
                    const active = pendingId === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setPendingId(s.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "border-primary/50 bg-primary/15 text-foreground"
                              : "border-[var(--edge)] text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <div className="truncate font-medium text-foreground">
                            {s.class_offerings?.programs?.name ??
                              s.class_offerings?.code ??
                              "Lesson"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(s.starts_at)}–{formatTime(s.ends_at)}
                            {s.tutors?.full_name ? ` · ${s.tutors.full_name}` : ""}
                            {s.class_offerings?.code ? ` · ${s.class_offerings.code}` : ""}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!pending} onClick={() => pending && onConfirm(pending)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A "YYYY-MM-DD" day string to a local-midnight Date the calendar can match. */
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** A calendar Date back to the "YYYY-MM-DD" the session list is keyed by. */
function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------------- Fields */

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

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        value={value}
        placeholder={placeholder}
        rows={3}
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
