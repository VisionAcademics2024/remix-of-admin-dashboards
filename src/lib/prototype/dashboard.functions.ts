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
      supabase
        .from("proto_students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("proto_tutors")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("proto_sessions")
        .select("id", { count: "exact", head: true })
        .gte("start_time", now),
      supabase.from("proto_student_packages").select("id", { count: "exact", head: true }),
      supabase
        .from("proto_session_students")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo),
      supabase.from("proto_student_packages").select("total_sessions, sessions_used"),
    ]);

    const classesRemaining =
      packageRows?.reduce((sum, row) => sum + (row.total_sessions - row.sessions_used), 0) ?? 0;

    return {
      activeStudents: activeStudents ?? 0,
      tutors: tutors ?? 0,
      upcomingSessions: upcomingSessions ?? 0,
      packagesSold: packagesSold ?? 0,
      attendanceThisWeek: attendanceThisWeek ?? 0,
      classesRemaining,
    };
  });
