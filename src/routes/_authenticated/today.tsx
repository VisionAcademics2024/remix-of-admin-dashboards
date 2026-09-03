import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Receipt,
  TrendingDown,
  Users,
  UserX,
} from "lucide-react";
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
import { meQueryOptions } from "./route";
import { getToday } from "@/lib/vision/overview.functions";
import { rollFor, tutorsFor, unassigned, type SessionRoll } from "@/lib/vision/today";
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
  const { data: me } = useSuspenseQuery(meQueryOptions());

  // A tutor sees the teaching day and their own pay, and nothing else about
  // money. The database already refuses charges, invoices and packages to a
  // tutor, so these blocks would come back empty rather than leaking - but an
  // empty "Owed to you" reading $0.00 is worse than absent: it looks like the
  // school is owed nothing, on a screen that is not theirs to read.
  const isTutor = me.staff?.role === "tutor";
  const myTutorId = me.staff?.tutor_id ?? null;
  const mySessionsToday = myTutorId
    ? (data.sessions as Row[]).filter((s) => s.tutor_id === myTutorId)
    : [];
  const myLessonsToday = mySessionsToday.length;
  const myHoursToday = mySessionsToday.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0);
  const queryClient = useQueryClient();
  const mark = useServerFn(markAttendance);
  const setTrial = useServerFn(setTrialStatus);

  // Trial students booked onto a lesson today. They have no attendance row, so
  // they come straight from the trials table and are confirmed on their own.
  const { data: trials = [] } = useQuery({
    queryKey: ["today-trials", today],
    queryFn: () =>
      listTrialRoll({ data: { filter: "today", today, week_start: weekStart(today) } }),
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

  // Who is teaching, and the lessons nobody is. Two different questions, so two
  // different answers rather than one list with a hole in it.
  const tutorDay = tutorsFor(sessions);
  const uncovered = unassigned(sessions);
  // The busiest tutor sets the scale, so the bars compare against the real day
  // rather than an invented ceiling.
  const heaviest = Math.max(1, ...tutorDay.map((t) => t.hours));

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
        description={
          isTutor
            ? "Your teaching day: what is on, and who is teaching it."
            : "The teaching day first: what is on, who is teaching it, and who missed a lesson. The money sits underneath."
        }
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

      {/* The day first, then what it costs. Ordered the way the page is used:
          you are here to run this afternoon, not to read a ledger. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
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
          label="Tutors on today"
          value={tutorDay.length}
          hint={
            uncovered.length > 0
              ? `${uncovered.length} ${uncovered.length === 1 ? "lesson has" : "lessons have"} no tutor`
              : tutorDay.length === 0
                ? "Nobody teaching"
                : "Every lesson covered"
          }
          tone={uncovered.length ? "warning" : "default"}
          icon={Users}
          to="/timetable"
        />
        {isTutor ? (
          <StatCard
            label="Your hours today"
            value={formatHours(myHoursToday)}
            hint={
              myLessonsToday === 0
                ? "Nothing scheduled for you"
                : `${myLessonsToday} ${myLessonsToday === 1 ? "lesson" : "lessons"} · see your pay`
            }
            icon={BadgeDollarSign}
            to="/tutor-pay"
          />
        ) : (
          <StatCard
            label="Owed to you"
            value={formatMoney(data.unpaidValue)}
            hint={
              data.unpaidAgeing.oldestDays == null
                ? `${data.unpaidCount} invoices`
                : `${data.unpaidCount} invoices · oldest ${data.unpaidAgeing.oldestDays} days`
            }
            tone={(data.unpaidAgeing.oldestDays ?? 0) > 60 ? "warning" : "default"}
            icon={Receipt}
            to="/billing"
          />
        )}
      </div>

      {!isTutor && (trials as Row[]).length > 0 && (
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
                      <div>
                        {t.class_offerings?.programs?.name ?? t.class_offerings?.code ?? "-"}
                      </div>
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

      <div
        className={cn(
          "grid items-start gap-4",
          // The panel beside the timetable is hours packages, which a tutor
          // does not see. Without it the timetable would sit in a half-width
          // column against nothing.
          !isTutor && "xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]",
        )}
      >
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
                const roll = rollFor(s.id, data.roll as Row[]);

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
                        {s.tutor_id ? (
                          <TutorDot colour={s.tutors?.colour} name={s.tutors?.full_name} />
                        ) : (
                          <span className="font-medium text-destructive">No tutor assigned</span>
                        )}
                        {s.class_offerings?.room && ` · ${s.class_offerings.room}`}
                        {roll.total > 0 && ` · ${roll.marked}/${roll.total} marked`}
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
                      <RollPill session={s} roll={roll} isDone={isDone} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {!isTutor && (
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
        )}
      </div>

      {/* Who is teaching, and who missed a lesson. Both are about the day
          rather than the ledger, so they sit above the money.

          auto-fit rather than a fixed two columns: "Absent today" only appears
          when somebody was, and a lone box should fill the row rather than sit
          in a half-width column against nothing. */}
      <div className="grid items-start gap-4 sm:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
        <Section
          title="Tutors on today"
          count={tutorDay.length}
          description="Load across the day, and anything still uncovered."
          tone={uncovered.length ? "warning" : undefined}
          className="h-full"
        >
          {tutorDay.length === 0 && uncovered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nobody teaching today"
              hint="No lessons are scheduled, so there is no cover to arrange."
            />
          ) : (
            <ul className="space-y-1.5">
              {tutorDay.map((t) => (
                <li
                  key={t.tutorId}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--edge)] bg-[var(--mat-thin)] px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      <TutorDot colour={t.colour} name={t.name} />
                    </div>
                    <div className="text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                      {t.from && t.to && `${formatTime(t.from)}–${formatTime(t.to)} · `}
                      {t.lessons} {t.lessons === 1 ? "lesson" : "lessons"}
                    </div>
                  </div>
                  {/* The bar is scaled against the busiest tutor today, so it
                      compares real days rather than an invented ceiling. */}
                  <span
                    aria-hidden
                    className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--edge)]"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((t.hours / heaviest) * 100)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatHours(t.hours)}
                  </span>
                </li>
              ))}

              {uncovered.map((s: Row) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-destructive">
                      {s.class_offerings?.programs?.name ?? "Lesson"} has nobody teaching it
                    </div>
                    <div className="text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                      {formatTime(s.starts_at)} · <Code>{s.code}</Code>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/timetable">Assign</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {/* Today's absences, while the reason is still fresh - that is when a
            make-up is easiest to arrange. */}
        {data.absentToday.length > 0 && (
          <Section
            title="Absent today"
            count={data.absentToday.length}
            description="Book the make-up while you still remember why."
            tone="warning"
            actions={
              <Button asChild size="sm" variant="outline">
                <Link to="/roll">Book a make-up</Link>
              </Button>
            }
          >
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {(data.absentToday as Row[]).map((a: Row) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--edge)] bg-[var(--mat-thin)] px-4 py-2.5"
                >
                  <UserX className="h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.enrolments?.students?.full_name ?? "Student"}{" "}
                      <Code>{a.enrolments?.students?.code}</Code>
                    </div>
                    <div className="truncate text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                      {a.sessions?.class_offerings?.programs?.name ?? "Lesson"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {!isTutor && (
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
              {
                label: "Invoiced, unpaid",
                value: formatMoney(data.unpaidValue),
                hint:
                  data.unpaidAgeing.oldestDays == null
                    ? undefined
                    : `Oldest sent ${data.unpaidAgeing.oldestDays} days ago`,
              },
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

          {/* How overdue, not just how much. A total says what is owed and
            nothing about whether it is a problem: twelve thousand invoiced last
            week is a good month, the same figure sent in July is a conversation
            nobody has had. */}
          {data.unpaidValue > 0 && (
            <div className="mt-4">
              <div
                className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`Unpaid by age: ${formatMoney(data.unpaidAgeing.under30)} under 30 days, ${formatMoney(data.unpaidAgeing.from30to60)} 30 to 60 days, ${formatMoney(data.unpaidAgeing.over60)} over 60 days`}
              >
                {(
                  [
                    ["bg-success", data.unpaidAgeing.under30],
                    ["bg-warning", data.unpaidAgeing.from30to60],
                    ["bg-destructive", data.unpaidAgeing.over60],
                  ] as const
                ).map(
                  ([tone, amount]) =>
                    amount > 0 && (
                      <span
                        key={tone}
                        className={cn("h-full rounded-full", tone)}
                        style={{ flex: amount }}
                      />
                    ),
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] tracking-[0.004em] text-muted-foreground">
                <span>Under 30 days {formatMoney(data.unpaidAgeing.under30)}</span>
                <span>30–60 {formatMoney(data.unpaidAgeing.from30to60)}</span>
                <span className={data.unpaidAgeing.over60 > 0 ? "text-destructive" : undefined}>
                  Over 60 {formatMoney(data.unpaidAgeing.over60)}
                </span>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

/**
 * What a lesson still needs from you.
 *
 * The session's own status ("scheduled") is not the useful thing once the day
 * has started - every lesson is scheduled. What changes, and what you are
 * chasing at six in the evening, is whether the roll has been taken; and a roll
 * half taken is its own state, because it is the one that looks finished from a
 * distance while somebody's hours quietly never get spent.
 */
function RollPill({ session, roll, isDone }: { session: Row; roll: SessionRoll; isDone: boolean }) {
  if (session.status === "cancelled") {
    return <StatusPill tone={toneForStatus("session", session.status)}>cancelled</StatusPill>;
  }
  if (!session.tutor_id) {
    return (
      <StatusPill tone="danger" className="normal-case">
        Needs a tutor
      </StatusPill>
    );
  }
  if (roll.state === "marked") {
    return (
      <StatusPill tone="success" className="normal-case">
        {roll.total === 1 ? "Marked" : `All ${roll.total} marked`}
      </StatusPill>
    );
  }
  if (roll.state === "partial") {
    return (
      <StatusPill tone="warning" className="normal-case">
        {roll.marked} of {roll.total} marked
      </StatusPill>
    );
  }
  if (roll.state === "empty") {
    return (
      <StatusPill tone="muted" className="normal-case">
        No students
      </StatusPill>
    );
  }
  // Untouched: only overdue once the lesson has actually finished.
  return (
    <StatusPill tone={isDone ? "warning" : "muted"} className="normal-case">
      {isDone ? "Not marked" : "To mark"}
    </StatusPill>
  );
}
