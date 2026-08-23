import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link2, Plus, Search, UserPlus, Users } from "lucide-react";
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
  createGuardian,
  createStudent,
  linkGuardian,
  listGuardians,
  listStudents,
  setDefaultPayer,
  updateStudent,
} from "@/lib/vision/people.functions";

const studentsQueryOptions = () =>
  queryOptions({ queryKey: ["students"], queryFn: () => listStudents() });
const guardiansQueryOptions = () =>
  queryOptions({ queryKey: ["guardians"], queryFn: () => listGuardians() });

export const Route = createFileRoute("/_authenticated/students")({
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

  const term = search.trim().toLowerCase();
  const filteredStudents = term
    ? students.filter((s: Row) =>
        `${s.full_name} ${s.code} ${s.year_level ?? ""} ${s.current_school ?? ""}`
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
    <div className="space-y-5">
      <PageHeader
        title="Students & Families"
        description="One guardian can cover several students — that is how siblings work. Every student needs exactly one default payer, drawn from their own guardians."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setNewGuardian(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> New guardian
            </Button>
            <Button size="sm" onClick={() => setNewStudent(true)}>
              <Plus className="mr-1 h-4 w-4" /> New student
            </Button>
          </>
        }
      />

      {missingPayer.length > 0 && (
        <WarningNote>
          {missingPayer.length} active {missingPayer.length === 1 ? "student has" : "students have"}{" "}
          no default payer. Charges need an unambiguous person to bill, so they cannot be invoiced
          until this is set.
        </WarningNote>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search students and guardians…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students ({filteredStudents.length})</TabsTrigger>
          <TabsTrigger value="guardians">Guardians ({filteredGuardians.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          {filteredStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students yet"
              hint="Creating a student is as fast as typing a name — everything else can wait."
              action={
                <Button size="sm" onClick={() => setNewStudent(true)}>
                  Add the first student
                </Button>
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Year</Th>
                  <Th>School</Th>
                  <Th>Guardians</Th>
                  <Th>Default payer</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Family</Th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s: Row) => (
                  <tr key={s.id}>
                    <Td>
                      <Link
                        to="/students/$id"
                        params={{ id: s.id }}
                        className="font-medium hover:underline"
                      >
                        {s.full_name}
                      </Link>
                      <div>
                        <Code>{s.code}</Code>
                      </div>
                    </Td>
                    <Td>{s.year_level ?? "—"}</Td>
                    <Td className="max-w-40 truncate">{s.current_school ?? "—"}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {s.guardians.length === 0
                        ? "None linked"
                        : s.guardians.map((g: Row) => g.full_name).join(", ")}
                    </Td>
                    <Td>
                      {s.default_payer_name ? (
                        s.default_payer_name
                      ) : (
                        <StatusPill tone="warning">Not set</StatusPill>
                      )}
                    </Td>
                    <Td>
                      <StatusPill tone={toneForStatus("person", s.status)}>{s.status}</StatusPill>
                    </Td>
                    <Td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setLinking(s)}>
                        <Link2 className="mr-1 h-4 w-4" /> Manage
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </TabsContent>

        <TabsContent value="guardians" className="mt-4">
          {filteredGuardians.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No guardians yet"
              hint="Guardians are parents and payers. They never log in."
              action={
                <Button size="sm" onClick={() => setNewGuardian(true)}>
                  Add a guardian
                </Button>
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Guardian</Th>
                  <Th>Email</Th>
                  <Th>Mobile</Th>
                  <Th>Students</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredGuardians.map((g: Row) => {
                  const children = students.filter((s: Row) =>
                    s.guardians.some((sg: Row) => sg.id === g.id),
                  );
                  return (
                    <tr key={g.id}>
                      <Td>
                        <div className="font-medium">{g.full_name}</div>
                        <Code>{g.code}</Code>
                      </Td>
                      <Td>{g.email ?? "—"}</Td>
                      <Td>{g.mobile ?? "—"}</Td>
                      <Td className="text-xs text-muted-foreground">
                        {children.length === 0
                          ? "—"
                          : children.map((c: Row) => c.full_name).join(", ")}
                      </Td>
                      <Td>
                        <StatusPill tone={toneForStatus("person", g.status)}>{g.status}</StatusPill>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </TabsContent>
      </Tabs>

      {newStudent && <NewStudentDialog onClose={() => setNewStudent(false)} />}
      {newGuardian && <NewGuardianDialog onClose={() => setNewGuardian(false)} />}
      {linking && (
        <FamilyDialog student={linking} guardians={guardians} onClose={() => setLinking(null)} />
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
            A parent or payer. Guardians never log in — this is a contact record, not an account.
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
  const setPayer = useServerFn(setDefaultPayer);
  const update = useServerFn(updateStudent);
  const queryClient = useQueryClient();

  const [existingId, setExistingId] = useState("");
  const [relationship, setRelationship] = useState("");
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
            Attaching an existing person and creating a new one are separate actions on purpose —
            conflating them is what corrupted records in the old system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Linked guardians</Label>
            {linked.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nobody linked yet.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {linked.map((g: Row) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{g.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.relationship || g.email || g.mobile || "—"}
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

          <div className="space-y-2 rounded-md border p-3">
            <Label>Attach an existing guardian</Label>
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
                  toast.success("Guardian linked.");
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
