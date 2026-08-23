import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, GraduationCap } from "lucide-react";

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
  listTutors,
  createTutor,
  updateTutor,
  deleteTutor,
} from "@/lib/prototype/tutors.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queryOptions, useQueryClient } from "@tanstack/react-query";

const tutorsQueryOptions = () =>
  queryOptions({
    queryKey: ["tutors"],
    queryFn: () => listTutors(),
  });

export const Route = createFileRoute("/_authenticated/prototype/tutors")({
  loader: ({ context }) => context.queryClient.ensureQueryData(tutorsQueryOptions()),
  component: TutorsPage,
});

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  subjects: [] as string[],
  notes: "",
  status: "active" as const,
};

function TutorsPage() {
  const { data: tutors } = useSuspenseQuery(tutorsQueryOptions());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [subjectInput, setSubjectInput] = useState("");
  const queryClient = useQueryClient();
  const createFn = useServerFn(createTutor);
  const updateFn = useServerFn(updateTutor);
  const deleteFn = useServerFn(deleteTutor);

  const filtered = tutors.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.first_name.toLowerCase().includes(q) ||
      t.last_name.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.subjects?.some((s) => s.toLowerCase().includes(q))
    );
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setSubjectInput("");
    setDialogOpen(true);
  }

  function openEdit(tutor: (typeof tutors)[number]) {
    setEditingId(tutor.id);
    setForm({
      first_name: tutor.first_name,
      last_name: tutor.last_name,
      email: tutor.email ?? "",
      phone: tutor.phone ?? "",
      subjects: tutor.subjects ?? [],
      notes: tutor.notes ?? "",
      status: tutor.status as typeof emptyForm.status,
    });
    setSubjectInput("");
    setDialogOpen(true);
  }

  function addSubject() {
    const value = subjectInput.trim();
    if (!value) return;
    setForm({ ...form, subjects: [...form.subjects, value] });
    setSubjectInput("");
  }

  function removeSubject(index: number) {
    setForm({ ...form, subjects: form.subjects.filter((_, i) => i !== index) });
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateFn({ data: { id: editingId, ...form } });
        toast.success("Tutor updated");
      } else {
        await createFn({ data: form });
        toast.success("Tutor created");
      }
      queryClient.invalidateQueries({ queryKey: ["tutors"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save tutor");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tutor?")) return;
    try {
      await deleteFn({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["tutors"] });
      toast.success("Tutor deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete tutor");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tutors</h1>
          <p className="text-sm text-muted-foreground">Manage tutors and instructors.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add tutor
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tutors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((tutor) => (
          <Card key={tutor.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">
                    {tutor.first_name} {tutor.last_name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {tutor.email && `${tutor.email}`}
                    {tutor.email && tutor.phone && " · "}
                    {tutor.phone}
                  </div>
                  {tutor.subjects && tutor.subjects.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tutor.subjects.map((subject) => (
                        <Badge key={subject} variant="outline" className="text-xs">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tutor.status === "active" ? "default" : "secondary"}>
                  {tutor.status}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(tutor)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(tutor.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">No tutors found.</div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit tutor" : "Add tutor"}</DialogTitle>
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
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Subjects</Label>
              <div className="flex gap-2">
                <Input
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubject();
                    }
                  }}
                  placeholder="Add a subject and press Enter"
                />
                <Button type="button" variant="outline" onClick={addSubject}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {form.subjects.map((subject, i) => (
                  <Badge key={`${subject}-${i}`} variant="secondary" className="gap-1">
                    {subject}
                    <button
                      type="button"
                      onClick={() => removeSubject(i)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
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
