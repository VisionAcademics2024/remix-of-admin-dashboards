import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sessionSchema = z.object({
  title: z.string().min(1),
  subject: z.string().optional().or(z.literal("")),
  tutor_id: z.string().optional().or(z.literal("")),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  location: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  student_ids: z.array(z.string()).default([]),
});

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sessions")
      .select(
        "*, tutors(first_name, last_name), session_students(id, student_id, attendance_status, students(id, first_name, last_name))"
      )
      .order("start_time", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
      ...s,
      tutor_name: s.tutors ? `${s.tutors.first_name} ${s.tutors.last_name}` : null,
      student_count: s.session_students?.length ?? 0,
      students: (s.session_students ?? []).map((ss: any) => ({
        session_student_id: ss.id,
        student_id: ss.student_id,
        attendance_status: ss.attendance_status,
        first_name: ss.students?.first_name,
        last_name: ss.students?.last_name,
      })),
    }));
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: session, error } = await context.supabase
      .from("sessions")
      .select("*, tutors(first_name, last_name), session_students(id, student_id, attendance_status, students(id, first_name, last_name))")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return {
      ...session,
      tutor_name: session.tutors ? `${session.tutors.first_name} ${session.tutors.last_name}` : null,
      students: (session.session_students ?? []).map((ss: any) => ({
        session_student_id: ss.id,
        student_id: ss.student_id,
        attendance_status: ss.attendance_status,
        first_name: ss.students?.first_name,
        last_name: ss.students?.last_name,
      })),
    };
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sessionSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { student_ids, ...rest } = data;
    const payload = {
      ...rest,
      subject: rest.subject || null,
      tutor_id: rest.tutor_id || null,
      location: rest.location || null,
      notes: rest.notes || null,
    };
    const { data: session, error } = await context.supabase.from("sessions").insert(payload).select().single();
    if (error) throw error;
    if (student_ids.length > 0) {
      const rows = student_ids.map((student_id) => ({ session_id: session.id, student_id }));
      const { error: enrollError } = await context.supabase.from("session_students").insert(rows);
      if (enrollError) throw enrollError;
    }
    return session;
  });

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        ...sessionSchema.shape,
      })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const { id, student_ids, ...rest } = data;
    const payload = {
      ...rest,
      subject: rest.subject || null,
      tutor_id: rest.tutor_id || null,
      location: rest.location || null,
      notes: rest.notes || null,
    };
    const { data: session, error } = await context.supabase
      .from("sessions")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    const { error: deleteError } = await context.supabase.from("session_students").delete().eq("session_id", id);
    if (deleteError) throw deleteError;
    if (student_ids.length > 0) {
      const rows = student_ids.map((student_id) => ({ session_id: id, student_id }));
      const { error: enrollError } = await context.supabase.from("session_students").insert(rows);
      if (enrollError) throw enrollError;
    }
    return session;
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sessions").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        session_id: z.string(),
        student_id: z.string(),
        attendance_status: z.enum(["pending", "present", "absent", "excused"]),
      })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("session_students")
      .update({ attendance_status: data.attendance_status })
      .eq("session_id", data.session_id)
      .eq("student_id", data.student_id);
    if (error) throw error;
    return { success: true };
  });
