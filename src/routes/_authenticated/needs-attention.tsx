import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import {
  Code,
  EmptyState,
  PageHeader,
  Section,
  StatusPill,
  TableShell,
  Td,
  Th,
} from "@/components/vision/ui";
import { getNeedsAttention } from "@/lib/vision/overview.functions";
import type { NeedsAttentionRow } from "@/lib/vision/types";

const attentionQueryOptions = () =>
  queryOptions({ queryKey: ["needs-attention"], queryFn: () => getNeedsAttention() });

export const Route = createFileRoute("/_authenticated/needs-attention")({
  loader: ({ context }) => context.queryClient.ensureQueryData(attentionQueryOptions()),
  component: NeedsAttentionPage,
});

/** Where to send someone so they can actually fix the thing. */
const DESTINATION: Record<NeedsAttentionRow["entity"], { label: string; to: string }> = {
  session: { label: "Timetable", to: "/timetable" },
  attendance: { label: "Roll", to: "/roll" },
  student: { label: "Students & Families", to: "/students" },
  enrolment: { label: "Enrolments & Hours", to: "/enrolments" },
  hours_package: { label: "Enrolments & Hours", to: "/enrolments" },
};

const ENTITY_LABEL: Record<NeedsAttentionRow["entity"], string> = {
  session: "Lessons",
  attendance: "Roll",
  student: "Students",
  enrolment: "Enrolments",
  hours_package: "Hours packages",
};

function NeedsAttentionPage() {
  const { data: rows } = useSuspenseQuery(attentionQueryOptions());

  const grouped = new Map<string, NeedsAttentionRow[]>();
  for (const row of rows as NeedsAttentionRow[]) {
    const list = grouped.get(row.entity) ?? [];
    list.push(row);
    grouped.set(row.entity, list);
  }

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="Needs Attention"
        description="Every exception in the system, as one query. Empty is the goal."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs attention"
          hint="No missing tutors, unmarked rolls, unlinked packages, uncharged lessons or overdrawn balances."
        />
      ) : (
        [...grouped.entries()].map(([entity, list]) => (
          <Section
            key={entity}
            title={ENTITY_LABEL[entity as NeedsAttentionRow["entity"]] ?? entity}
            count={list.length}
          >
            <TableShell>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Issue</Th>
                  <Th className="text-right">Fix it in</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={`${row.entity}-${row.id}-${row.issue}`}>
                    <Td>
                      <Code>{row.code}</Code>
                    </Td>
                    <Td>{row.issue}</Td>
                    <Td className="text-right">
                      {row.entity === "student" ? (
                        <Link
                          to="/students/$id"
                          params={{ id: row.id }}
                          className="text-sm underline"
                        >
                          Open student
                        </Link>
                      ) : (
                        <Link to={DESTINATION[row.entity].to} className="text-sm underline">
                          {DESTINATION[row.entity].label}
                        </Link>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Section>
        ))
      )}

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Rules live in <Code>v_needs_attention</Code>. Add one by adding a <Code>union all</Code>{" "}
          branch — anything expressible as a check constraint should be a constraint instead,
          because constraints prevent and views only report.
        </p>
      )}
    </div>
  );
}
