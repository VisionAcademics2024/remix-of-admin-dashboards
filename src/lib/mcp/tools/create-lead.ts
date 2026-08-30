import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_lead",
  title: "Create enquiry",
  description:
    "Record a new enquiry (lead) for a prospective student. The enquiry code is assigned by the system.",
  inputSchema: {
    student_name: z.string().trim().min(1).max(120).describe("The prospective student's name."),
    guardian_name: z.string().trim().min(1).max(120).describe("The parent or guardian's name."),
    guardian_email: z.string().trim().email().optional().describe("Guardian email, if known."),
    guardian_mobile: z.string().trim().max(40).optional().describe("Guardian mobile, if known."),
    year_level: z.string().trim().max(20).optional().describe('School year level, e.g. "Year 9".'),
    subject_interest: z.string().trim().max(120).optional().describe("Subject they asked about."),
    source: z
      .enum(["referral", "google", "social_media", "walk_in", "event", "website", "other"])
      .default("other")
      .describe("How the enquiry reached the college."),
    notes: z.string().trim().max(2000).optional().describe("Free-text context for the front desk."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        student_name: input.student_name,
        guardian_name: input.guardian_name,
        guardian_email: input.guardian_email ?? null,
        guardian_mobile: input.guardian_mobile ?? null,
        year_level: input.year_level ?? null,
        subject_interest: input.subject_interest ?? null,
        source: input.source,
        notes: input.notes ?? null,
      })
      .select("id, code, student_name, guardian_name, status, source, created_at")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Created enquiry ${data.code ?? data.id}.` }],
      structuredContent: { lead: data },
    };
  },
});
