import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_students",
  title: "List students",
  description:
    "Search Vision Academics students by name or student code, optionally filtered by active/inactive status.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Part of a student name or code."),
    status: z.enum(["active", "inactive"]).optional().describe("Filter by student status."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("students")
      .select("id, code, full_name, status, year_level, current_school, joined_on")
      .order("full_name")
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (search) query = query.or(`full_name.ilike.%${search}%,code.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { students: data ?? [], count: data?.length ?? 0 },
    };
  },
});
