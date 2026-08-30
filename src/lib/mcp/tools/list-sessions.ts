import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a Sydney calendar date, YYYY-MM-DD.");

export default defineTool({
  name: "list_sessions",
  title: "List lessons",
  description:
    "List scheduled lessons between two Sydney dates, with their tutor, room, status and payable hours.",
  inputSchema: {
    from: DATE.describe("First Sydney date to include, YYYY-MM-DD."),
    to: DATE.describe("Last Sydney date to include, YYYY-MM-DD."),
    status: z
      .enum(["scheduled", "completed", "cancelled", "rescheduled"])
      .optional()
      .describe("Filter by lesson status."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum lessons to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("v_sessions")
      .select(
        "id, code, session_date, starts_at, ends_at, status, session_type, room, tutor_id, class_offering_id, duration_hours, payable_hours",
      )
      .gte("session_date", from)
      .lte("session_date", to)
      .order("starts_at")
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { sessions: data ?? [], count: data?.length ?? 0 },
    };
  },
});
