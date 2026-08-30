import { auth, defineMcp, type McpDefinitionInput } from "@lovable.dev/mcp-js";

import createLeadTool from "./tools/create-lead";
import getStudentTool from "./tools/get-student";
import listLeadsTool from "./tools/list-leads";
import listSessionsTool from "./tools/list-sessions";
import listStudentsTool from "./tools/list-students";

// The OAuth issuer must be the direct Supabase host: the project ref is the only
// Supabase value that survives publish unchanged, and Vite inlines it at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "admin-dashboards",
  title: "Admin Dashboards",
  version: "0.1.0",
  instructions:
    "Tools for the Vision Academics admin workspace. Use `list_students` to find a student and `get_student` for their enrolments, hour packages and recent attendance. Use `list_sessions` for the timetable between two Sydney dates. Use `list_leads` and `create_lead` for the enquiry pipeline. All dates are Sydney calendar dates.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStudentsTool, getStudentTool, listSessionsTool, listLeadsTool, createLeadTool],
});
