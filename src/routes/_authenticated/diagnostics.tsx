import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";

import {
  EmptyState,
  PageHeader,
  Section,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/vision/ui";
import { formatDate, formatHours, formatMoney, sydToday } from "@/lib/format";
import { getDiagnostics } from "@/lib/vision/overview.functions";
import type { Row } from "@/lib/vision/types";

const diagnosticsQueryOptions = () =>
  queryOptions({
    queryKey: ["diagnostics", sydToday()],
    queryFn: () => getDiagnostics({ data: { date: sydToday() } }),
  });

export const Route = createFileRoute("/_authenticated/diagnostics")({
  loader: ({ context }) => context.queryClient.ensureQueryData(diagnosticsQueryOptions()),
  component: DiagnosticsPage,
});

/**
 * What the data actually looks like, before anything is built on it.
 *
 * Today is being rebuilt around the teaching day, and each block it will carry
 * rests on a field that a term of real use may or may not have filled in. This
 * page counts them: how many lessons have no tutor, how many absences nobody
 * rebooked, how old the oldest unpaid invoice is, and what the "needs
 * attention" number in the sidebar is actually made of.
 *
 * It writes nothing. It is here to be read once, argued with, and to keep the
 * design of the dashboard honest about the data underneath it.
 */
function DiagnosticsPage() {
  const { data } = useSuspenseQuery(diagnosticsQueryOptions());
  return <DiagnosticsBody data={data} />;
}

export function DiagnosticsBody({ data }: { data: Row }) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Data check"
        description="A read-only look at what the Today dashboard would have to work with. Nothing here changes anything."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Needs attention"
          value={data.attention.total}
          hint={`${data.attention.byIssue.length} different problems`}
          tone={data.attention.total ? "warning" : "success"}
        />
        <StatCard
          label="Lessons with no tutor"
          value={data.coverage.weekAhead.noTutor}
          hint={`Of ${data.coverage.weekAhead.lessons} in the next 7 days`}
          tone={data.coverage.weekAhead.noTutor ? "warning" : "success"}
        />
        <StatCard
          label="Make-ups outstanding"
          value={data.absences.byState.find((s: Row) => s.label === "outstanding")?.count ?? 0}
          hint={`Of ${data.absences.total} absences since ${formatDate(data.absences.since)}`}
          tone={
            (data.absences.byState.find((s: Row) => s.label === "outstanding")?.count ?? 0) > 0
              ? "warning"
              : "success"
          }
        />
        <StatCard
          label="Invoiced, unpaid"
          value={formatMoney(data.money.unpaidValue)}
          hint={
            data.money.oldestUnpaidInvoiceDate
              ? `Oldest sent ${formatDate(data.money.oldestUnpaidInvoiceDate)}`
              : `${data.money.unpaidCount} charges`
          }
        />
      </div>

      <Section
        title="What “needs attention” is made of"
        count={data.attention.total}
        description="One badge in the sidebar, itemised. This is the list the dashboard could surface."
      >
        {data.attention.byIssue.length === 0 ? (
          <EmptyState icon={Stethoscope} title="Nothing outstanding" hint="Every check passes." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Problem</Th>
                <Th className="text-right">Count</Th>
              </tr>
            </thead>
            <tbody>
              {data.attention.byIssue.map((row: Row) => (
                <tr key={row.label}>
                  <Td>{row.label}</Td>
                  <Td className="text-right font-medium tabular-nums">{row.count}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section
        title="Tutor cover"
        description="Whether the timetable knows who is teaching. A lesson with no tutor is the block that would sit at the top of Today."
      >
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th className="text-right">Lessons</Th>
              <Th className="text-right">Hours</Th>
              <Th className="text-right">No tutor</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Today", data.coverage.today],
                ["Tomorrow", data.coverage.tomorrow],
                ["Next 7 days", data.coverage.weekAhead],
              ] as const
            ).map(([label, c]) => (
              <tr key={label}>
                <Td className="font-medium">{label}</Td>
                <Td className="text-right tabular-nums">{c.lessons}</Td>
                <Td className="text-right tabular-nums">{formatHours(c.hours)}</Td>
                <Td className="text-right tabular-nums">
                  {c.noTutor === 0 ? "-" : <span className="text-warning">{c.noTutor}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.coverage.activeTutors} active tutors on the books.
        </p>
      </Section>

      <Section
        title="Absences and make-ups"
        count={data.absences.total}
        description={`Every absence since ${formatDate(data.absences.since)}, and whether anyone rebooked it.`}
      >
        {data.absences.total === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No absences recorded"
            hint="Either nobody has missed a lesson, or absences are not being marked."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>State</Th>
                <Th className="text-right">Count</Th>
              </tr>
            </thead>
            <tbody>
              {data.absences.byState.map((row: Row) => (
                <tr key={row.label}>
                  <Td className="font-medium">{row.label}</Td>
                  <Td className="text-right tabular-nums">{row.count}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section
        title="Charges by status"
        description="What the money block on Today would be summarising."
      >
        <TableShell>
          <thead>
            <tr>
              <Th>Status</Th>
              <Th className="text-right">Count</Th>
            </tr>
          </thead>
          <tbody>
            {data.money.byStatus.map((row: Row) => (
              <tr key={row.label}>
                <Td className="font-medium">{row.label}</Td>
                <Td className="text-right tabular-nums">{row.count}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Section>
    </div>
  );
}
