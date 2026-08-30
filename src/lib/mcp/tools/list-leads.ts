import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "List enquiries",
  description:
    "List enquiries (leads) in the pipeline, newest first, optionally filtered by pipeline status.",
  inputSchema: {
    status: z
      .enum(["new", "contacted", "nurturing", "trial_booked", "converted", "lost"])
      .optional()
      .describe("Filter by pipeline status."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum enquiries to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("leads")
      .select(
        "id, code, student_name, guardian_name, guardian_email, guardian_mobile, year_level, subject_interest, source, status, next_action_on, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [], count: data?.length ?? 0 },
    };
  },
});
