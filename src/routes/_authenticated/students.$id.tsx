import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, School } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Code,
  EmptyState,
  PageHeader,
  Section,
  StatCard,
  StatusPill,
  TableShell,
  Td,
  Th,
  WarningNote,
  toneForStatus,
} from "@/components/vision/ui";
import { formatDate, formatDay, formatHours, formatMoney, formatTime } from "@/lib/format";
import { getStudentDetail } from "@/lib/vision/people.functions";
import { LABELS, Row } from "@/lib/vision/types";

const detailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["student-detail", id],
    queryFn: () => getStudentDetail({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/students/$id")({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(detailQueryOptions(params.id));
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.student ? `${loaderData.student.full_name} | Vision CRM` : "Student" },
    ],
  }),
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(detailQueryOptions(id));
  if (!data) return null;

  const { student, guardians, enrolments, packages, attendance, charges } = data;

  const hoursRemaining = packages
    .filter((p: Row) => p.status === "active")
    .reduce((sum: number, p: Row) => sum + Number(p.hours_remaining ?? 0), 0);
  const outstanding = charges
    .filter((c: Row) => c.status === "to_invoice" || c.status === "invoiced")
    .reduce((sum: number, c: Row) => sum + Number(c.final_amount ?? 0), 0);
  const absencesOwed = attendance.filter((a: Row) => a.make_up_state === "outstanding").length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/students">
          <ArrowLeft className="mr-1 h-4 w-4" /> All students
        </Link>
      </Button>

      <PageHeader
        title={student.full_name}
        description={[student.code, student.year_level, student.current_school]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <StatusPill tone={toneForStatus("person", student.status)}>{student.status}</StatusPill>
        }
      />

      {!student.default_payer_id && (
        <WarningNote>
          No default payer set. Charges need an unambiguous person to bill, so nothing can be
          invoiced for this student until one of their guardians is made the payer.
        </WarningNote>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours remaining"
          value={formatHours(hoursRemaining)}
          hint="Across active packages"
        />
        <StatCard
          label="Open enrolments"
          value={enrolments.filter((e: Row) => e.status !== "closed").length}
        />
        <StatCard
          label="Owed a make-up"
          value={absencesOwed}
          tone={absencesOwed ? "warning" : "default"}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding)}
          hint="To invoice plus invoiced"
          tone={outstanding > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Family" count={guardians.length}>
          {guardians.length === 0 ? (
            <EmptyState
              title="No guardians linked"
              hint="Link one from Students & Families — the default payer must be one of them."
            />
          ) : (
            <ul className="divide-y">
              {guardians.map((g: Row) => (
                <li key={g.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.full_name}</span>
                      {student.default_payer_id === g.id && (
                        <StatusPill tone="success">Default payer</StatusPill>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {g.relationship && <span>{g.relationship}</span>}
                      {g.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {g.email}
                        </span>
                      )}
                      {g.mobile && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {g.mobile}
                        </span>
                      )}
                    </div>
                  </div>
                  <Code>{g.code}</Code>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Details">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Code" value={student.code} />
            <Detail label="Year level" value={student.year_level} />
            <Detail label="School" value={student.current_school} icon={School} />
            <Detail
              label="Date of birth"
              value={student.date_of_birth && formatDate(student.date_of_birth)}
            />
            <Detail label="Joined" value={student.joined_on && formatDate(student.joined_on)} />
            <Detail label="Found us via" value={student.how_they_found_us} />
          </dl>
          {student.notes && (
            <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              {student.notes}
            </p>
          )}
        </Section>
      </div>

      <Section title="Enrolments" count={enrolments.length}>
        {enrolments.length === 0 ? (
          <EmptyState
            title="Not enrolled in anything"
            hint="Add an enrolment from Enrolments & Hours or Class Builder."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Class</Th>
                <Th>Term</Th>
                <Th>From</Th>
                <Th>Method</Th>
                <Th className="text-right">Agreed price</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {enrolments.map((e: Row) => (
                <tr key={e.id}>
                  <Td>
                    {e.class_offerings?.programs?.name ?? "—"}
                    <div>
                      <Code>{e.code}</Code>
                    </div>
                  </Td>
                  <Td>{e.class_offerings?.operating_periods?.code ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{formatDate(e.starts_on)}</Td>
                  <Td>{e.method ? LABELS.billingMethod[e.method as "hours" | "payg"] : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(e.final_agreed_price)}</Td>
                  <Td>
                    <StatusPill tone={toneForStatus("enrolment", e.status)}>{e.status}</StatusPill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section
        title="Hours packages"
        count={packages.length}
        description="Balance is computed from attendance, never stored."
      >
        {packages.length === 0 ? (
          <EmptyState
            title="No packages"
            hint="This student may be paying as they go, which is normal."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Package</Th>
                <Th>Type</Th>
                <Th className="text-right">Purchased</Th>
                <Th className="text-right">Used</Th>
                <Th className="text-right">Remaining</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p: Row) => (
                <tr key={p.id}>
                  <Td>
                    <Code>{p.code}</Code>
                    <div className="text-xs text-muted-foreground">{formatDate(p.approved_on)}</div>
                  </Td>
                  <Td>{LABELS.packageType[p.package_type as "purchased" | "courtesy"]}</Td>
                  <Td className="text-right tabular-nums">{formatHours(p.hours_purchased)}</Td>
                  <Td className="text-right tabular-nums">{formatHours(p.hours_used)}</Td>
                  <Td className="text-right">
                    <StatusPill tone={p.is_overdrawn ? "danger" : p.is_low ? "warning" : "success"}>
                      {formatHours(p.hours_remaining)}
                    </StatusPill>
                  </Td>
                  <Td>
                    <StatusPill tone={toneForStatus("package", p.status)}>{p.status}</StatusPill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section
        title="Attendance"
        count={attendance.length}
        description="Most recent 100 roll entries."
      >
        {attendance.length === 0 ? (
          <EmptyState
            title="No attendance yet"
            hint="Roll entries appear once lessons are generated and seeded."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Lesson</Th>
                <Th>Tutor</Th>
                <Th>Type</Th>
                <Th className="text-right">Hours</Th>
                <Th>Status</Th>
                <Th>Make-up</Th>
              </tr>
            </thead>
            <tbody>
              {attendance.slice(0, 40).map((a: Row) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">
                    {formatDay(a.lesson_starts_at)}
                    <div className="text-xs text-muted-foreground">
                      {formatTime(a.lesson_starts_at)}
                    </div>
                  </Td>
                  <Td>
                    <Code>{a.sessions?.code}</Code>
                  </Td>
                  <Td>{a.sessions?.tutors?.full_name ?? "—"}</Td>
                  <Td>{LABELS.attendanceType[a.att_type as "regular" | "trial" | "make_up"]}</Td>
                  <Td className="text-right tabular-nums">{formatHours(a.hours_consumed)}</Td>
                  <Td>
                    <StatusPill tone={toneForStatus("attendance", a.effective_status)}>
                      {a.effective_status.replace("_", " ")}
                    </StatusPill>
                  </Td>
                  <Td>
                    {a.make_up_state ? (
                      <StatusPill tone={toneForStatus("makeup", a.make_up_state)}>
                        {a.make_up_state}
                      </StatusPill>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section title="Charges" count={charges.length}>
        {charges.length === 0 ? (
          <EmptyState
            title="Nothing billed yet"
            hint="Charges are raised from the Billing screen."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Charge</Th>
                <Th>Source</Th>
                <Th className="text-right">Standard</Th>
                <Th className="text-right">Adjustment</Th>
                <Th className="text-right">Final</Th>
                <Th>Status</Th>
                <Th>Invoice</Th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c: Row) => (
                <tr key={c.id}>
                  <Td>
                    <Code>{c.code}</Code>
                  </Td>
                  <Td>{c.source === "hours" ? "Hours package" : "PAYG lesson"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(c.standard_amount)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(c.adjustment)}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(c.final_amount)}
                  </Td>
                  <Td>
                    <StatusPill tone={toneForStatus("charge", c.status)}>
                      {LABELS.chargeStatus[c.status as keyof typeof LABELS.chargeStatus]}
                    </StatusPill>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{c.xero_invoice_no ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: string | null;
  icon?: typeof School;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5">
        {Icon && value && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value || "—"}
      </dd>
    </div>
  );
}
