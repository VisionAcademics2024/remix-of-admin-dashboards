import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Calendar } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  markAttendance,
} from "@/lib/prototype/sessions.functions";
import { listTutors } from "@/lib/prototype/tutors.functions";
import { listStudents } from "@/lib/prototype/students.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queryOptions, useQueryClient } from "@tanstack/react-query";

const sessionsQueryOptions = () =>
  queryOptions({
    queryKey: ["sessions"],
    queryFn: () => listSessions(),
  });

const tutorsQueryOptions = () =>
  queryOptions({
    queryKey: ["tutors"],
    queryFn: () => listTutors(),
  });

const studentsQueryOptions = () =>
  queryOptions({
    queryKey: ["students"],
    queryFn: () => listStudents(),
  });

export const Route = createFileRoute("/_authenticated/prototype/sessions")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(sessionsQueryOptions());
    context.queryClient.ensureQueryData(tutorsQueryOptions());
    context.queryClient.ensureQueryData(studentsQueryOptions());
  },
  component: SessionsPage,
});

const emptyForm = {
  title: "",
  subject: "",
  tutor_id: "",
  start_time: "",
  end_time: "",
  location: "",
  notes: "",
  student_ids: [] as string[],
};

function formatLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SessionsPage() {
  const { data: sessions } = useSuspenseQuery(sessionsQueryOptions());
  const { data: tutors } = useSuspenseQuery(tutorsQueryOptions());
  const { data: students } = useSuspenseQuery(studentsQueryOptions());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createSession);
  const updateFn = useServerFn(updateSession);
  const deleteFn = useServerFn(deleteSession);
  const markAttendanceFn = useServerFn(markAttendance);

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      (s.subject?.toLowerCase().includes(q) ?? false) ||
      (s.tutor_name?.toLowerCase().includes(q) ?? false) ||
      (s.location?.toLowerCase().includes(q) ?? false)
    );
  });

  function openNew() {
    setEditingId(null);
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    setForm({
      ...emptyForm,
      start_time: formatLocalInput(now),
      end_time: formatLocalInput(oneHourLater),
    });
    setDialogOpen(true);
  }

  function openEdit(session: (typeof sessions)[number]) {
    setEditingId(session.id);
    setForm({
      title: session.title,
      subject: session.subject ?? "",
      tutor_id: session.tutor_id ?? "",
      start_time: session.start_time.slice(0, 16),
      end_time: session.end_time.slice(0, 16),
      location: session.location ?? "",
      notes: session.notes ?? "",
      student_ids: [],
    });
    setDialogOpen(true);
  }

  function toggleStudent(id: string) {
    setForm((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(id)
        ? prev.student_ids.filter((sid) => sid !== id)
        : [...prev.student_ids, id],
    }));
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateFn({ data: { id: editingId, ...form } });
        toast.success("Session updated");
      } else {
        await createFn({ data: form });
        toast.success("Session created");
      }
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save session");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session?")) return;
    try {
      await deleteFn({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete session");
    }
  }

  async function handleAttendance(sessionId: string, studentId: string, status: string) {
    try {
      await markAttendanceFn({
        data: { session_id: sessionId, student_id: studentId, attendance_status: status as any },
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Attendance updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update attendance");
    }
  }

  function formatSessionTime(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const dateStr = startDate.toLocaleDateString();
    const timeStr = `${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return `${dateStr} · ${timeStr}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">Schedule classes and track attendance.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add session
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((session) => (
          <Card key={session.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{session.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatSessionTime(session.start_time, session.end_time)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session.tutor_name && `Tutor: ${session.tutor_name}`}
                      {session.tutor_name && session.location && " · "}
                      {session.location}
                    </div>
                    {session.subject && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        {session.subject}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{session.student_count} students</Badge>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(session)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(session.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {session.student_count > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="mb-2 text-sm font-medium">Attendance</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {session.students?.map((s: any) => (
                      <div
                        key={s.session_student_id}
                        className="flex items-center justify-between rounded-md border p-2"
                      >
                        <span className="text-sm">
                          {s.first_name} {s.last_name}
                        </span>
                        <Select
                          value={s.attendance_status}
                          onValueChange={(v) => handleAttendance(session.id, s.student_id, v)}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="excused">Excused</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">No sessions found.</div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit session" : "Add session"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tutor">Tutor</Label>
              <Select
                value={form.tutor_id}
                onValueChange={(v) => setForm({ ...form, tutor_id: v })}
              >
                <SelectTrigger id="tutor">
                  <SelectValue placeholder="Select tutor" />
                </SelectTrigger>
                <SelectContent>
                  {tutors.map((tutor) => (
                    <SelectItem key={tutor.id} value={tutor.id}>
                      {tutor.first_name} {tutor.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_time">Start time</Label>
              <Input
                id="start_time"
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">End time</Label>
              <Input
                id="end_time"
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Students</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                {students.length === 0 && (
                  <div className="py-2 text-sm text-muted-foreground">No students available.</div>
                )}
                {students.map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-2 py-1 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={form.student_ids.includes(student.id)}
                      onCheckedChange={() => toggleStudent(student.id)}
                    />
                    <span>
                      {student.first_name} {student.last_name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title || !form.start_time || !form.end_time}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
