import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;

    const now = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: activeStudents },
      { count: tutors },
      { count: upcomingSessions },
      { count: packagesSold },
      { count: attendanceThisWeek },
      { data: packageRows },
    ] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("tutors").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("sessions").select("id", { count: "exact", head: true }).gte("start_time", now),
      supabase.from("student_packages").select("id", { count: "exact", head: true }),
      supabase.from("session_students").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("student_packages").select("sessions_total, sessions_used"),
    ]);

    const classesRemaining =
      packageRows?.reduce((sum, row) => sum + (row.sessions_total - row.sessions_used), 0) ?? 0;

    return {
      activeStudents: activeStudents ?? 0,
      tutors: tutors ?? 0,
      upcomingSessions: upcomingSessions ?? 0,
      packagesSold: packagesSold ?? 0,
      attendanceThisWeek: attendanceThisWeek ?? 0,
      classesRemaining,
    };
  });
