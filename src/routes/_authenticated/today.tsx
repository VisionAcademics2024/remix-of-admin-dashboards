import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Receipt, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Code,
  EmptyState,
  Meter,
  PageHeader,
  Section,
  StatCard,
  StatusPill,
  Td,
  Th,
  TutorDot,
  toneForStatus,
} from "@/components/vision/ui";
import { colourFor } from "@/components/vision/calendar";
import { cn } from "@/lib/utils";
import {
  formatDay,
  formatDayDate,
  formatHours,
  formatMoney,
  formatTime,
  sydneyMinutesNow,
  sydneyMinutesOfDay,
  sydToday,
  weekStart,
} from "@/lib/format";
import { getToday } from "@/lib/vision/overview.functions";
import { listTrialRoll, setTrialStatus } from "@/lib/vision/leads.functions";
import { markAttendance } from "@/lib/vision/roll.functions";
import type { Row } from "@/lib/vision/types";

const todayQueryOptions = (date: string) =>
  queryOptions({ queryKey: ["today", date], queryFn: () => getToday({ data: { date } }) });

export const Route = createFileRoute("/_authenticated/today")({
  loader: ({ context }) => context.queryClient.ensureQueryData(todayQueryOptions(sydToday())),
  component: TodayPage,
});

function TodayPage() {
  const today = sydToday();
  const { data } = useSuspenseQuery(todayQueryOptions(today));
  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);
  const setTrial = useServerFn(setTrialStatus);

  // Trial students booked onto a lesson today. They have no attendance row, so
  // they come straight from the trials table and are confirmed on their own.
  const { data: trials = [] } = useQuery({
    queryKey: ["today-trials", today],
    queryFn: () => listTrialRoll({ data: { filter: "today", today, week_start: weekStart(today) } }),
  });

  async function setStatus(id: string, status: "present" | "absent") {
    try {
      await mark({ data: { id, status } });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["needs-attention-count"] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  // What is happening right now.
  //
  // The Sydney clock, once a minute. A dashboard called "Today" that does not
  // know what time it is can only ever list things; knowing the minute is what
  // lets it say which lesson is on, what is next, and how much of the day has
  // already gone.
  const [minutesNow, setMinutesNow] = useState(sydneyMinutesNow);
  useEffect(() => {
    const id = setInterval(() => setMinutesNow(sydneyMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const running = (s: Row) => ({
    start: sydneyMinutesOfDay(s.starts_at),
    end: sydneyMinutesOfDay(s.ends_at),
  });

  const sessions = data.sessions as Row[];
  const nowSession = sessions.find((s) => {
    const { start, end } = running(s);
    return s.status !== "cancelled" && start <= minutesNow && end > minutesNow;
  });
  const nextSession = sessions.find(
    (s) => s.status !== "cancelled" && running(s).start > minutesNow,
  );
  const finishedCount = sessions.filter((s) => running(s).end <= minutesNow).length;

  // An unmarked roll from a previous day is a different problem from one from
  // this morning - the first is a backlog, the second is just the day in
  // progress - so the section says which it is looking at.
  const todayCount = (data.toMark as Row[]).filter((r) => r.session_date === today).length;
  const backlogCount = data.toMark.length - todayCount;

  async function setTrialAttendance(id: string, status: "attended" | "no_show" | "scheduled") {
    try {
      await setTrial({ data: { id, status } });
      await queryClient.invalidateQueries({ queryKey: ["today-trials"] });
      await queryClient.invalidateQueries({ queryKey: ["leads-board"] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Today"
        eyebrow={formatDay(today)}
        description="Who needs marking, what is on, who is running out of hours, and what is ready to invoice."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/timetable">
                <CalendarDays />
                Timetable
              </Link>
            </Button>
            <Button asChild>
              <Link to="/roll">
                <CheckCircle2 />
                Mark attendance
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Still to mark"
          value={data.toMark.length}
          hint={
            data.toMark.length === 0 ? "Nothing outstanding" : "Lessons up to and including today"
          }
          tone={data.toMark.length === 0 ? "success" : "warning"}
          icon={Clock}
          to="/roll"
        />
        <StatCard
          label="Lessons today"
          value={data.sessions.length}
          hint={
            data.sessions.length === 0
              ? "Nothing scheduled"
              : nowSession
                ? `${nowSession.class_offerings?.programs?.name ?? "A lesson"} on now`
                : nextSession
                  ? `Next at ${formatTime(nextSession.starts_at)}`
                  : "All finished for today"
          }
          icon={CalendarDays}
          to="/timetable"
        />
        <StatCard
          label="Low or overdrawn"
          value={data.lowPackages.length}
          hint={data.lowPackages.length === 0 ? "Every package has room" : "Hour packages"}
          tone={data.lowPackages.length ? "warning" : "default"}
          icon={TrendingDown}
          to="/enrolments"
        />
        <StatCard
          label="Ready to invoice"
          value={formatMoney(data.toInvoiceValue)}
          hint={`${data.toInvoiceCount} charges · ${formatMoney(data.unpaidValue)} unpaid`}
          icon={Receipt}
          to="/billing"
        />
      </div>

      <Section
        title="Still to mark"
        count={data.toMark.length}
        description="Marking a student present is the act that spends their hours."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/roll">Open the roll</Link>
          </Button>
        }
        tone={data.toMark.length === 0 ? "success" : "warning"}
      >
        {data.toMark.length > 0 && backlogCount > 0 && (
          <p className="mb-3 text-[0.8rem] text-muted-foreground">
            <span className="font-medium text-foreground">{todayCount}</span> from today ·{" "}
            <span className="font-medium text-warning">{backlogCount}</span> carried over from
            earlier lessons.
          </p>
        )}

        {data.toMark.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing left to mark"
            hint="Every lesson up to today has a complete roll. This is what done looks like."
          />
        ) : (
          // The Section is the card; the table sits flush inside it rather than
          // in a second rounded box, so the row lines run the full width and
          // nothing reads as cut off under Mark.
          <div className="scroll-x">
            <table className="table-zebra w-full text-sm">
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Lesson</Th>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Mark</Th>
                </tr>
              </thead>
              <tbody>
                {data.toMark.slice(0, 25).map((row: Row) => (
                  <tr key={row.id}>
                    <Td>
                      <Link
                        to="/students/$id"
                        params={{ id: row.student_id }}
                        className="font-medium hover:underline"
                      >
                        {row.enrolments?.students?.full_name ?? "-"}
                      </Link>
                      <div>
                        <Code>{row.enrolments?.students?.code}</Code>
                      </div>
                    </Td>
                    <Td>
                      <div>{row.sessions?.class_offerings?.programs?.name ?? "-"}</div>
                      <Code>{row.sessions?.code}</Code>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.session_date === today ? "Today" : formatDayDate(row.session_date)}
                      <div className="text-xs text-muted-foreground">
                        {formatTime(row.lesson_starts_at)}
                      </div>
                    </Td>
                    <Td>
                      <StatusPill tone={row.att_type === "trial" ? "info" : "neutral"}>
                        {row.att_type === "make_up"
                          ? "Make-up"
                          : row.att_type === "trial"
                            ? "Trial"
                            : "Regular"}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(row.id, "present")}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(row.id, "absent")}
                        >
                          Absent
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.toMark.length > 25 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Showing 25 of {data.toMark.length}.{" "}
            <Link to="/roll" className="underline">
              Open the roll
            </Link>{" "}
            for the rest.
          </p>
        )}
      </Section>

      {(trials as Row[]).length > 0 && (
        <Section
          title="Trial students today"
          count={(trials as Row[]).length}
          description="Prospects sitting in on a lesson today. Confirm they turned up; a trial never spends hours."
        >
          <div className="scroll-x">
            <table className="table-zebra w-full text-sm">
              <thead>
                <tr>
                  <Th>Trial student</Th>
                  <Th>Lesson</Th>
                  <Th>When</Th>
                  <Th>Tutor</Th>
                  <Th className="text-right">Mark</Th>
                </tr>
              </thead>
              <tbody>
                {(trials as Row[]).map((t) => (
                  <tr key={t.id}>
                    <Td>
                      <div className="flex items-center gap-2 font-medium">
                        {t.leads?.student_name ?? "Trial"}
                        <StatusPill tone="info">Trial</StatusPill>
                      </div>
                      <Link
                        to="/leads"
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        {t.leads?.code ?? t.code}
                      </Link>
                    </Td>
                    <Td>
                      <div>{t.class_offerings?.programs?.name ?? t.class_offerings?.code ?? "-"}</div>
                      <Code>{t.sessions?.code}</Code>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {t.sessions?.starts_at ? formatTime(t.sessions.starts_at) : "-"}
                    </Td>
                    <Td>
                      <TutorDot
                        colour={t.sessions?.tutors?.colour}
                        name={t.sessions?.tutors?.full_name}
                      />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={t.status === "attended" ? "default" : "outline"}
                          onClick={() => setTrialAttendance(t.id, "attended")}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTrialAttendance(t.id, "no_show")}
                        >
                          Absent
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <Section title="Today's timetable" count={data.sessions.length} className="h-full">
          {data.sessions.length > 0 && (
            <div className="mb-4">
              <Meter
                label="Lessons finished"
                value={finishedCount}
                total={data.sessions.length}
                tone={finishedCount === data.sessions.length ? "success" : "default"}
              />
            </div>
          )}

          {data.sessions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No lessons today"
              hint="Add a one-off lesson from the Timetable, or generate a term's lessons in Class Builder."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/timetable">Go to timetable</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-1.5">
              {sessions.map((s: Row) => {
                const { start, end } = running(s);
                const isNow = s.status !== "cancelled" && start <= minutesNow && end > minutesNow;
                const isDone = end <= minutesNow;
                const colour = colourFor(s.tutor_id, s.tutors?.colour);

                return (
                  <li
                    key={s.id}
                    className={cn(
                      // The app's own material rather than a hand-mixed one, so
                      // the row belongs to the same substance as everything
                      // else on the page.
                      "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[var(--edge)] bg-[var(--mat-thin)] py-2.5 pl-5 pr-3 shadow-[inset_0_1px_0_0_var(--edge-top)]",
                      "transition-[background-color,opacity] duration-[var(--dur-fast)] [transition-timing-function:var(--ease-hover)]",
                      // A finished lesson steps back rather than disappearing:
                      // it is still part of the day, just no longer the part
                      // you are looking for.
                      isDone && !isNow && "opacity-60",
                      isNow && "bg-[var(--mat-regular)]",
                    )}
                  >
                    {/* The spine carries the tutor's colour - the same colour
                        the lesson has on the timetable, so a row here and a
                        block there are recognisably the same thing. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ backgroundColor: colour }}
                    />

                    <div className="w-[5.5rem] shrink-0 text-sm tabular-nums">
                      {formatTime(s.starts_at)}
                      <div className="text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                        {formatHours(s.duration_hours)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {s.class_offerings?.programs?.name ?? "Lesson"}
                      </div>
                      <div className="truncate text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                        <TutorDot colour={s.tutors?.colour} name={s.tutors?.full_name} />
                        {s.class_offerings?.room && ` · ${s.class_offerings.room}`}
                      </div>
                    </div>

                    {/* "On now" is the one thing on this list worth an accent,
                        so it takes the place of the status pill rather than
                        sitting next to it. */}
                    {isNow ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/16 px-2.5 py-0.5 text-[0.7rem] font-medium text-success">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-70 motion-safe:animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                        </span>
                        On now
                      </span>
                    ) : (
                      <StatusPill tone={toneForStatus("session", s.status)}>{s.status}</StatusPill>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Running out of hours"
          count={data.lowPackages.length}
          description="At or below the low-balance threshold."
          tone={data.lowPackages.length ? "warning" : undefined}
          className="h-full"
        >
          {data.lowPackages.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Every package has room"
              hint="Balances are recalculated from attendance, so this updates itself as rolls are marked."
            />
          ) : (
            <div className="scroll-x">
              <table className="table-zebra w-full text-sm">
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Package</Th>
                    <Th className="text-right">Remaining</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowPackages.map((p: Row) => (
                    <tr key={p.id}>
                      <Td>
                        <Link
                          to="/students/$id"
                          params={{ id: p.student_id }}
                          className="font-medium hover:underline"
                        >
                          {p.students?.full_name}
                        </Link>
                      </Td>
                      <Td>
                        <Code>{p.code}</Code>
                      </Td>
                      <Td className="text-right">
                        <StatusPill tone={p.is_overdrawn ? "danger" : "warning"}>
                          {formatHours(p.hours_remaining)}
                        </StatusPill>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Waiting to be charged"
        description="PAYG lessons attended but not yet billed, plus packages with no invoice raised."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/billing">Open billing</Link>
          </Button>
        }
      >
        {/* Figures, not cards.
            A translucent card inside a translucent card is the one thing
            Apple's material rules say never to do - the second surface has
            nothing left to be translucent against, and both go muddy. Inside a
            Section the numbers are just numbers, separated by a rule. */}
        <dl className="grid divide-y divide-[var(--edge)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: "PAYG lessons to charge", value: data.unchargedPaygCount, hint: undefined },
            {
              label: "Charges to invoice",
              value: data.toInvoiceCount,
              hint: formatMoney(data.toInvoiceValue),
            },
            { label: "Invoiced, unpaid", value: formatMoney(data.unpaidValue), hint: undefined },
          ].map((figure) => (
            <div key={figure.label} className="py-3.5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <dt className="text-[0.78rem] font-medium tracking-[0.004em] text-muted-foreground">
                {figure.label}
              </dt>
              <dd className="mt-1 text-[1.75rem] font-semibold leading-[1] tabular-nums tracking-[-0.03em]">
                {figure.value}
              </dd>
              {figure.hint && (
                <dd className="mt-1 text-[0.75rem] tracking-[0.004em] text-muted-foreground">
                  {figure.hint}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
