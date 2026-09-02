import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link2, Mail, Pencil, Phone, Plus, Search, UserPlus, Users } from "lucide-react";
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
  StatusPill,
  TableShell,
  Td,
  Th,
  WarningNote,
  toneForStatus,
} from "@/components/vision/ui";
import { sydToday } from "@/lib/format";
import type { Row } from "@/lib/vision/types";
import {
  addGuardianToStudent,
  createGuardian,
  createStudent,
  linkGuardian,
  listGuardians,
  listStudents,
  setDefaultPayer,
  updateGuardian,
  updateStudent,
} from "@/lib/vision/people.functions";

const studentsQueryOptions = () =>
  queryOptions({ queryKey: ["students"], queryFn: () => listStudents() });
const guardiansQueryOptions = () =>
  queryOptions({ queryKey: ["guardians"], queryFn: () => listGuardians() });

export const Route = createFileRoute("/_authenticated/students/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(studentsQueryOptions());
    context.queryClient.ensureQueryData(guardiansQueryOptions());
  },
  component: StudentsPage,
});

function StudentsPage() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions());
  const { data: guardians } = useSuspenseQuery(guardiansQueryOptions());
  const [search, setSearch] = useState("");
  const [newStudent, setNewStudent] = useState(false);
  const [newGuardian, setNewGuardian] = useState(false);
  const [linking, setLinking] = useState<Row | null>(null);
  const [editStudent, setEditStudent] = useState<Row | null>(null);
  const [editGuardian, setEditGuardian] = useState<Row | null>(null);

  const term = search.trim().toLowerCase();

  // Searching a student by their parent's name or number is the common case:
  // the parent rings, and their name is all you have.
  const filteredStudents = term
    ? students.filter((s: Row) =>
        [
          s.full_name,
          s.code,
          s.year_level,
          s.current_school,
          ...s.guardians.flatMap((g: Row) => [g.full_name, g.email, g.mobile]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : students;

  const filteredGuardians = term
    ? guardians.filter((g: Row) =>
        `${g.full_name} ${g.code} ${g.email ?? ""} ${g.mobile ?? ""}`.toLowerCase().includes(term),
      )
    : guardians;

  const missingPayer = students.filter((s: Row) => s.status === "active" && !s.default_payer_id);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Students & Families"
        description="The student is the record; parents are attached to them. One parent can cover several students - that is how siblings work - and every student needs exactly one default payer, drawn from their own parents."
        actions={
          <Button size="sm" onClick={() => setNewStudent(true)}>
            <Plus className="mr-1 h-4 w-4" /> New student
          </Button>
        }
      />

      {missingPayer.length > 0 && (
        <WarningNote>
          {missingPayer.length} active {missingPayer.length === 1 ? "student has" : "students have"}{" "}
          no default payer. Charges need an unambiguous person to bill, so they cannot be invoiced
          until this is set.
        </WarningNote>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search by student, parent, phone or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students ({filteredStudents.length})</TabsTrigger>
          <TabsTrigger value="families">Families ({filteredGuardians.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          {filteredStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title={term ? "Nothing matches that search" : "No students yet"}
              hint={
                term
                  ? "Try part of a name, a phone number or an email address."
                  : "Creating a student is as fast as typing a name - everything else can wait."
              }
              action={
                term ? undefined : (
                  <Button size="sm" onClick={() => setNewStudent(true)}>
                    Add the first student
                  </Button>
                )
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Year</Th>
                  <Th>School</Th>
                  <Th>Parent</Th>
                  <Th>Contact</Th>
                  <Th className="text-right">Family</Th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s: Row) => {
                  const payer = s.guardians.find((g: Row) => g.id === s.default_payer_id);
                  const others = s.guardians.filter((g: Row) => g.id !== s.default_payer_id);
                  return (
                    <tr key={s.id}>
                      <Td>
                        <Link
                          to="/students/$id"
                          params={{ id: s.id }}
                          className="font-medium hover:underline"
                        >
                          {s.full_name}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          <Code>{s.code}</Code>
                          {s.status !== "active" && (
                            <StatusPill tone={toneForStatus("person", s.status)}>
                              {s.status}
                            </StatusPill>
                          )}
                        </div>
                      </Td>
                      <Td>{s.year_level ?? "-"}</Td>
                      <Td className="max-w-40 truncate">{s.current_school ?? "-"}</Td>
                      <Td>
                        {payer ? (
                          <>
                            <div className="font-medium">{payer.full_name}</div>
                            {(payer.relationship || others.length > 0) && (
                              <div className="text-xs text-muted-foreground">
                                {[payer.relationship, others.length > 0 && `+${others.length} more`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </>
                        ) : s.guardians.length > 0 ? (
                          <>
                            <div>{s.guardians.map((g: Row) => g.full_name).join(", ")}</div>
                            <StatusPill tone="warning">No payer set</StatusPill>
                          </>
                        ) : (
                          <StatusPill tone="warning">No parent linked</StatusPill>
                        )}
                      </Td>
                      <Td>
                        <ContactLinks person={payer ?? s.guardians[0]} />
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditStudent(s)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLinking(s)}>
                            <Link2 className="mr-1 h-4 w-4" /> Family
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </TabsContent>

        <TabsContent value="families" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Grouped by parent, so siblings sit together. A parent with no student attached is
              usually a record that needs a student, not a parent that needs deleting.
            </p>
            <Button size="sm" variant="outline" onClick={() => setNewGuardian(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> New parent
            </Button>
          </div>

          {filteredGuardians.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={term ? "Nothing matches that search" : "No parents yet"}
              hint="Parents are contact and billing records. They never log in."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredGuardians.map((g: Row) => {
                const children = students.filter((s: Row) =>
                  s.guardians.some((sg: Row) => sg.id === g.id),
                );
                return (
                  <div key={g.id} className="glass rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{g.full_name}</div>
                        <Code>{g.code}</Code>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {g.status !== "active" && (
                          <StatusPill tone={toneForStatus("person", g.status)}>
                            {g.status}
                          </StatusPill>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setEditGuardian(g)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2">
                      <ContactLinks person={g} />
                    </div>

                    <div className="mt-3 border-t pt-3">
                      {children.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No students attached.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {children.map((c: Row) => (
                            <Link
                              key={c.id}
                              to="/students/$id"
                              params={{ id: c.id }}
                              className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                            >
                              {c.full_name}
                              {c.default_payer_id === g.id && " · pays"}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {newStudent && <NewStudentDialog onClose={() => setNewStudent(false)} />}
      {newGuardian && <NewGuardianDialog onClose={() => setNewGuardian(false)} />}
      {editStudent && (
        <EditStudentDialog student={editStudent} onClose={() => setEditStudent(null)} />
      )}
      {editGuardian && (
        <EditGuardianDialog guardian={editGuardian} onClose={() => setEditGuardian(null)} />
      )}
      {linking && (
        <FamilyDialog student={linking} guardians={guardians} onClose={() => setLinking(null)} />
      )}
    </div>
  );
}

/**
 * Phone and email as links, not as text. Ringing a parent back is the single
 * most common thing anyone does on this screen, and copying a number out of a
 * table cell is a worse way to do it than tapping one.
 */
function ContactLinks({ person }: { person: Row | undefined }) {
  if (!person || (!person.mobile && !person.email)) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  return (
    <div className="space-y-0.5 text-xs">
      {person.mobile && (
        <a
          href={`tel:${String(person.mobile).replace(/\s/g, "")}`}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Phone className="h-3 w-3 shrink-0" /> {person.mobile}
        </a>
      )}
      {person.email && (
        <a
          href={`mailto:${person.email}`}
          className="flex items-center gap-1 truncate text-muted-foreground hover:underline"
        >
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{person.email}</span>
        </a>
      )}
    </div>
  );
}

function NewStudentDialog({ onClose }: { onClose: () => void }) {
  const create = useServerFn(createStudent);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    year_level: "",
    current_school: "",
    date_of_birth: "",
    joined_on: sydToday(),
    how_they_found_us: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New student</DialogTitle>
          <DialogDescription>
            Only the name is required. Link guardians afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
            autoFocus
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Year level"
              value={form.year_level}
              onChange={(v) => setForm({ ...form, year_level: v })}
            />
            <Field
              label="Joined on"
              type="date"
              value={form.joined_on}
              onChange={(v) => setForm({ ...form, joined_on: v })}
            />
          </div>
          <Field
            label="Current school"
            value={form.current_school}
            onChange={(v) => setForm({ ...form, current_school: v })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={(v) => setForm({ ...form, date_of_birth: v })}
            />
            <Field
              label="How they found us"
              value={form.how_they_found_us}
              onChange={(v) => setForm({ ...form, how_they_found_us: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!form.full_name || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await create({ data: { ...form, status: "active" } });
                await queryClient.invalidateQueries({ queryKey: ["students"] });
                toast.success("Student created.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGuardianDialog({ onClose }: { onClose: () => void }) {
  const create = useServerFn(createGuardian);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: "", email: "", mobile: "", notes: "" });
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New guardian</DialogTitle>
          <DialogDescription>
            A parent or payer. Guardians never log in - this is a contact record, not an account.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
            autoFocus
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            label="Mobile"
            value={form.mobile}
            onChange={(v) => setForm({ ...form, mobile: v })}
          />
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
          <Button
            disabled={!form.full_name || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await create({ data: { ...form, status: "active" } });
                await queryClient.invalidateQueries({ queryKey: ["guardians"] });
                toast.success("Guardian created.");
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create guardian
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStudentDialog({ student, onClose }: { student: Row; onClose: () => void }) {
  const update = useServerFn(updateStudent);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: student.full_name ?? "",
    year_level: student.year_level ?? "",
    current_school: student.current_school ?? "",
    date_of_birth: student.date_of_birth ?? "",
    joined_on: student.joined_on ?? "",
    how_they_found_us: student.how_they_found_us ?? "",
    status: (student.status ?? "active") as "active" | "inactive",
    notes: student.notes ?? "",
  });

  async function submit() {
    setBusy(true);
    try {
      await update({ data: { ...form, id: student.id } });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
      toast.success("Student updated.");
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
          <DialogTitle>
            Edit {student.full_name} <Code>{student.code}</Code>
          </DialogTitle>
          <DialogDescription>Their details. Parents are managed under Family.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Year level"
              value={form.year_level}
              onChange={(v) => setForm({ ...form, year_level: v })}
            />
            <Field
              label="Joined on"
              type="date"
              value={form.joined_on}
              onChange={(v) => setForm({ ...form, joined_on: v })}
            />
          </div>
          <Field
            label="Current school"
            value={form.current_school}
            onChange={(v) => setForm({ ...form, current_school: v })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={(v) => setForm({ ...form, date_of_birth: v })}
            />
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
          </div>
          <Field
            label="How they found us"
            value={form.how_they_found_us}
            onChange={(v) => setForm({ ...form, how_they_found_us: v })}
          />
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
          <Button disabled={!form.full_name || busy} onClick={submit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGuardianDialog({ guardian, onClose }: { guardian: Row; onClose: () => void }) {
  const update = useServerFn(updateGuardian);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: guardian.full_name ?? "",
    email: guardian.email ?? "",
    mobile: guardian.mobile ?? "",
    status: (guardian.status ?? "active") as "active" | "inactive",
    notes: guardian.notes ?? "",
  });

  async function submit() {
    setBusy(true);
    try {
      await update({ data: { ...form, id: guardian.id } });
      await queryClient.invalidateQueries({ queryKey: ["guardians"] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Parent updated.");
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
          <DialogTitle>
            Edit {guardian.full_name} <Code>{guardian.code}</Code>
          </DialogTitle>
          <DialogDescription>
            A parent or payer. Which students they belong to is managed on the student.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Field
              label="Mobile"
              value={form.mobile}
              onChange={(v) => setForm({ ...form, mobile: v })}
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
          <Button disabled={!form.full_name || busy} onClick={submit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FamilyDialog({
  student,
  guardians,
  onClose,
}: {
  student: Row;
  guardians: Row[];
  onClose: () => void;
}) {
  const link = useServerFn(linkGuardian);
  const addParent = useServerFn(addGuardianToStudent);
  const setPayer = useServerFn(setDefaultPayer);
  const update = useServerFn(updateStudent);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingId, setExistingId] = useState("");
  const [relationship, setRelationship] = useState("");
  const [fresh, setFresh] = useState({ full_name: "", email: "", mobile: "", notes: "" });
  const [makePayer, setMakePayer] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["students"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
  }

  const linked = student.guardians ?? [];
  const unlinked = guardians.filter((g: Row) => !linked.some((l: Row) => l.id === g.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{student.full_name}'s family</DialogTitle>
          <DialogDescription>
            Parents belong to the student, and one parent can belong to several. Exactly one of them
            pays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Parents attached</Label>
            {linked.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No parent attached yet.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {linked.map((g: Row) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{g.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.relationship || g.email || g.mobile || "-"}
                      </div>
                    </div>
                    {student.default_payer_id === g.id ? (
                      <StatusPill tone="success">Default payer</StatusPill>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await setPayer({ data: { student_id: student.id, guardian_id: g.id } });
                            toast.success(`${g.full_name} is now the default payer.`);
                            await refresh();
                            onClose();
                          } catch (error) {
                            toast.error((error as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Make payer
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <Label>Attach a parent</Label>
            <p className="text-xs text-muted-foreground">
              Attach someone already on file when this is a sibling - that is what keeps one parent
              record covering both children instead of two half-filled ones.
            </p>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "existing" | "new")}>
              <TabsList className="w-full">
                <TabsTrigger value="existing" className="flex-1">
                  Already on file
                </TabsTrigger>
                <TabsTrigger value="new" className="flex-1">
                  Someone new
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="mt-3 space-y-2">
                <Select value={existingId} onValueChange={setExistingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose someone already on file…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinked.map((g: Row) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.full_name} · {g.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Relationship (mother, father, grandparent…)"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!existingId || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await link({
                        data: { student_id: student.id, guardian_id: existingId, relationship },
                      });
                      toast.success("Parent attached.");
                      await refresh();
                      onClose();
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Attach
                </Button>
              </TabsContent>

              <TabsContent value="new" className="mt-3 space-y-2">
                <Input
                  placeholder="Full name"
                  value={fresh.full_name}
                  onChange={(e) => setFresh({ ...fresh, full_name: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Mobile"
                    value={fresh.mobile}
                    onChange={(e) => setFresh({ ...fresh, mobile: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    value={fresh.email}
                    onChange={(e) => setFresh({ ...fresh, email: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Relationship (mother, father, grandparent…)"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-current"
                    checked={makePayer}
                    onChange={(e) => setMakePayer(e.target.checked)}
                  />
                  Make them the default payer
                </label>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!fresh.full_name || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await addParent({
                        data: {
                          ...fresh,
                          student_id: student.id,
                          relationship,
                          make_payer: makePayer,
                          status: "active",
                        },
                      });
                      await queryClient.invalidateQueries({ queryKey: ["guardians"] });
                      toast.success(`${fresh.full_name} attached to ${student.full_name}.`);
                      await refresh();
                      onClose();
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Create and attach
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label>Student status</Label>
            <Select
              value={student.status}
              onValueChange={async (v) => {
                await update({ data: { ...student, status: v as "active" | "inactive" } });
                await refresh();
                onClose();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Students are made inactive, never deleted.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
