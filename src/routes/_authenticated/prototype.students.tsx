import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} from "@/lib/prototype/students.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queryOptions, useQueryClient } from "@tanstack/react-query";

const studentsQueryOptions = () =>
  queryOptions({
    queryKey: ["students"],
    queryFn: () => listStudents(),
  });

export const Route = createFileRoute("/_authenticated/prototype/students")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions()),
  component: StudentsPage,
});

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  parent_name: "",
  parent_phone: "",
  parent_email: "",
  date_of_birth: "",
  grade: "",
  school: "",
  notes: "",
  status: "active" as const,
};

function StudentsPage() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createStudent);
  const updateFn = useServerFn(updateStudent);
  const deleteFn = useServerFn(deleteStudent);

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.school?.toLowerCase().includes(q)
    );
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(student: (typeof students)[number]) {
    setEditingId(student.id);
    setForm({
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email ?? "",
      phone: student.phone ?? "",
      parent_name: student.parent_name ?? "",
      parent_phone: student.parent_phone ?? "",
      parent_email: student.parent_email ?? "",
      date_of_birth: student.date_of_birth ?? "",
      grade: student.grade ?? "",
      school: student.school ?? "",
      notes: student.notes ?? "",
      status: student.status as typeof emptyForm.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateFn({ data: { id: editingId, ...form } });
        toast.success("Student updated");
      } else {
        await createFn({ data: form });
        toast.success("Student created");
      }
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save student");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this student?")) return;
    try {
      await deleteFn({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete student");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">Manage student records and profiles.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add student
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((student) => (
          <Card key={student.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Link
                    to="/prototype/students/$id"
                    params={{ id: student.id }}
                    className="font-medium hover:underline"
                  >
                    {student.first_name} {student.last_name}
                  </Link>
                  <div className="text-sm text-muted-foreground">
                    {student.grade && `Grade ${student.grade}`}
                    {student.grade && student.school && " · "}
                    {student.school}
                    {student.email && ` · ${student.email}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={student.status === "active" ? "default" : "secondary"}>
                  {student.status}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(student)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(student.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">No students found.</div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit student" : "Add student"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_name">Parent name</Label>
              <Input
                id="parent_name"
                value={form.parent_name}
                onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_phone">Parent phone</Label>
              <Input
                id="parent_phone"
                value={form.parent_phone}
                onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_email">Parent email</Label>
              <Input
                id="parent_email"
                type="email"
                value={form.parent_email}
                onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade</Label>
              <Input
                id="grade"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school">School</Label>
              <Input
                id="school"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as typeof emptyForm.status })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="graduated">Graduated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!form.first_name || !form.last_name}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
