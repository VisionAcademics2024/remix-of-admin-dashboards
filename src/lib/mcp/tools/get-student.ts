import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_student",
  title: "Get student detail",
  description:
    "Return one student's profile, their enrolments, their hour packages and their most recent attendance.",
  inputSchema: {
    student_id: z.string().uuid().describe("The student's id, as returned by list_students."),
    attendance_limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("How many recent attendance rows to include."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ student_id, attendance_limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };

    const supabase = supabaseForUser(ctx);

    const [student, enrolments, packages, attendance] = await Promise.all([
      supabase
        .from("students")
        .select(
          "id, code, full_name, status, year_level, current_school, date_of_birth, joined_on, notes, default_payer_id",
        )
        .eq("id", student_id)
        .maybeSingle(),
      supabase
        .from("enrolments")
        .select("id, code, status, method, starts_on, ends_on, class_offering_id, closure")
        .eq("student_id", student_id)
        .order("starts_on", { ascending: false }),
      supabase
        .from("hours_packages")
        .select("id, code, status, package_type, hours_purchased, expires_on")
        .eq("student_id", student_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("v_attendance")
        .select("id, session_date, status, effective_status, att_type, hours_consumed, make_up_state")
        .eq("student_id", student_id)
        .order("session_date", { ascending: false })
        .limit(attendance_limit),
    ]);

    const failure = [student, enrolments, packages, attendance].find((r) => r.error)?.error;
    if (failure) return { content: [{ type: "text", text: failure.message }], isError: true };
    if (!student.data)
      return { content: [{ type: "text", text: "No student with that id." }], isError: true };

    const payload = {
      student: student.data,
      enrolments: enrolments.data ?? [],
      hour_packages: packages.data ?? [],
      recent_attendance: attendance.data ?? [],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
