import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getStudentWithPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: student, error } = await context.supabase
      .from("proto_students")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const { data: packages, error: packagesError } = await context.supabase
      .from("proto_student_packages")
      .select("*, proto_packages(name)")
      .eq("student_id", data.id)
      .order("purchase_date", { ascending: false });
    if (packagesError) throw packagesError;

    return {
      student,
      packages: (packages ?? []).map((p) => ({
        ...p,
        package_name: p.proto_packages?.name ?? "Unknown Package",
      })),
    };
  });

export const getStudentAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: attendance, error } = await context.supabase
      .from("proto_session_students")
      .select("*, proto_sessions(title, start_time, proto_tutors(first_name, last_name))")
      .eq("student_id", data.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (attendance ?? []).map((a) => ({
      ...a,
      session_title: a.proto_sessions?.title ?? "Unknown Session",
      start_time: a.proto_sessions?.start_time ?? null,
      tutor_name: a.proto_sessions?.proto_tutors
        ? `${a.proto_sessions.proto_tutors.first_name} ${a.proto_sessions.proto_tutors.last_name}`
        : "Unassigned",
    }));
  });
