# Vision Admin — Prototype Completion Plan

Vision Admin already runs against the live backend through server functions in `src/lib/vision/*`. This plan keeps that live path as the default, wraps it in typed repositories, adds a mock adapter for tests and isolated previews only, and builds out the missing pages, detail routes and guided workflows to the specified fidelity.

## Assumptions

- Live backend stays the default data path (`VITE_DATA_MODE=supabase`). The mock adapter is opt-in (`VITE_DATA_MODE=mock`) and used by tests and prototype previews. No existing screen is repointed to mock.
- No working server function is retired. Repositories wrap them; they remain the only place business rules execute for live mode.
- Routes stay top-level (`/today`, `/people`, `/billing`, …) with the specified sub-route hierarchy underneath.
- No new database tables, migrations, RLS changes or seeding in this plan. Schema work is a later, separate approval.
- "Billing" in the Airtable source is enrolment data; the app keeps Enrolments and Charges strictly separate.

## Non-goals

Parent/student portal, tutor login, automated parent messaging, Xero integration, production Airtable sync, payroll integration, production migration, new tables, Revenue reporting without a stated accounting basis.

## Route map

```
/auth                                  login
/today                                 Home / command centre
/people                    tabs: Students | Guardians | Tutors
  /people/students/:id     /people/guardians/:id     /people/tutors/:id
/classes                   tabs: Timetable | Offerings | Sessions | Generation jobs
  /classes/offerings/:id   /classes/sessions/:id     /classes/new (Class Builder)
/attendance                today's roll (existing /roll redirects here)
/makeups                   tabs: Outstanding | Scheduled | Completed
/enrolments                Enrolments + Hour Allocations
  /enrolments/:id          /hours/:id
/billing                   Charge queues
  /billing/charges/:id
/tutor-pay  (owner only)   /tutor-pay/:id
/reports
/setup                     tabs: Tutors | Periods | Programs | Prices | System Jobs
/needs-attention
/staff  (owner only)
```

Sidebar groups: **Operate** (Home, Classes & Schedule, Attendance, Make-ups) · **Manage** (People, Enrolments & Hours, Billing, Tutor Pay) · **Understand** (Reports, Needs Attention) · **Configure** (Setup, Staff). Header: global search, quick-create, Sydney date, environment badge (Test/Production/Mock), Needs Attention badge, user menu.

Old paths (`/roll`, `/students`, `/make-ups`, `/timetable`) keep working via redirects.

## Module structure

```
src/domain/          entity types, enums, value objects, labels (moves/extends src/lib/vision/types.ts)
src/data/            repository interfaces, query params, result types, ActionResult
src/data/live/       adapters over existing src/lib/vision/*.functions.ts  (default)
src/data/mock/       deterministic fixtures + mock clock + optional localStorage persistence
src/data/index.ts    adapter selection from import.meta.env.VITE_DATA_MODE (default "supabase")
src/services/        workflow orchestration + client-side validation (zod) per action
src/features/<page>/ view models, hooks, page-specific components
src/components/vision/  shared shell, tables, filters, chips, dialogs, states
```

Rules enforced in review: no route/component imports `@/integrations/supabase/*` or a `*.functions.ts` module directly; all reads/writes go through `src/data` + `src/services`. Business rules live in the server functions (live) and are mirrored in `src/services` validators for pre-submit feedback only.

## Repository interface (read contract)

One `VisionRepository` interface, implemented twice:

- `getStudentDirectory(params)` — student, guardians, default payer, active enrolments, remaining hours
- `getGuardianDirectory(params)`, `getTutorDirectory(params)`
- `getStudentDetail(id)`, `getGuardianDetail(id)`, `getTutorDetail(id)`
- `getTodaySessions(sydneyDate)` — excludes cancelled and rescheduled originals
- `getWeekSessions(range, filters)`, `getSessionDetail(id)`
- `getOfferingList(filters)`, `getOfferingDetail(id)`
- `getAttendanceQueue(sydneyDate, filters)` — grouped by session, not-marked first
- `getMakeupQueue(state)` — original absence + attempt chain + effective state
- `getEnrolmentList(filters)`, `getEnrolmentDetail(id)`
- `getHoursBalances(filters)`, `getHoursDetail(id)`
- `getChargeWorkQueue(status)` — count + AUD value + evidence
- `getTutorPaySessions(tutorId, fortnight)`, `getPayoutDetail(id)`
- `getReportMetrics(metric, range)` with drill-down rows
- `getCatalogue()`, `getJobRuns(filters)`
- `getDataQualityExceptions(filters)`

Every method returns view-model rows (camelCase), never raw table rows. Live adapters compose the existing server functions and views (`v_attendance`, `v_sessions`, `v_hours_packages`, `v_charges`, `v_needs_attention`, `v_tutor_fortnight_pay`); where a needed shape isn't available yet the adapter derives it client-side and the gap is listed for a later view.

## Service action contract

```ts
type ActionResult<T> =
  | { ok: true; data: T; message: string; createdIds?: string[] }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string,string>; retryable: boolean };
type BatchResult<T> = ActionResult<T> & { expectedCount: number; createdCount: number; skippedCount: number; failures: { id: string; message: string }[] };
```

Actions: `createStudentWithGuardian`, `createTutor`, `createProgram`, `createOffering`, `previewSessionGeneration`, `generateSessions`, `activateEnrolment`, `createCourtesyHours`, `markAttendance`, `createMakeup`, `rescheduleSession`, `updateChargeStatus`, `prepareTutorPayout`, `approveTutorPayout`. Each has a zod input schema, a typed result, a live implementation (existing server fn, or a new server fn only where one is missing) and a mock implementation.

## Guided workflows

- **New Student wizard** — search for existing student/guardian matches → pick or create guardian → student identity → link guardians and pick exactly one default payer → duplicate warnings + summary → single transaction → open student detail, offering "Enrol student" as a next action (never automatic).
- **New Class Offering wizard** — program/period/type → tutor, room, capacity, duration → dates, recurrence, first Sydney occurrence → validation (active dependencies, period bounds, private capacity 1, duplicate key) → session preview listing proposed/skipped/conflicting dates → create offering only; generation is a separate confirmed action.
- **Enrol / Activate** — three forms: Free Trial (enrolment only), PAYG (enrolment now, charge later on qualifying attendance), Hours (enrolment + purchased allocation + eligibility/default link + one charge, atomic). Review step lists exactly what will be created; error path demonstrates full rollback.
- **Mark Attendance** — atomic per session; present hours-based rows require an eligible same-student allocation; consumption equals scheduled duration only for present non-trial non-cancelled; corrections need a reason and log an activity event; never auto-mark.
- **Create Make-up** — starts from an absence, prefills source absence and enrolment, choose existing dedicated session or propose date/tutor/room, original absence preserved, duplicate open attempts blocked behind an explicit override.
- **Reschedule Session** — replacement date/tutor/room + reason; original marked rescheduled; one linked replacement; roll seeded once; chain shown on both records.
- **Update Charge** — explicit transitions; invoiced requires invoice date; paid requires paid date + method; cancel requires reason; source immutable; amount immutable after invoicing except via owner correction.
- **Prepare Payout** — tutor + fortnight, eligible completed unpaid sessions with frozen hours/rate/amount, adjustments require a reason, approve locks included sessions, paid requires date/method/reference, zero-rate session blocks approval with an owner-facing explanation.

## Page work (deltas against what exists)

- **Home** — five scoped KPI cards that each open their filtered queue, today's Sydney-ordered timetable with roll completion, action queue, quick actions, full state set.
- **People** — merge students/guardians/tutors into one tabbed page with the specified columns, filters, duplicate-candidate warnings, and three detail routes with contextual actions and an activity timeline. Student detail gains Overview/Guardians/Enrolments/Hours/Attendance/Charges/Activity tabs.
- **Classes & Schedule** — tabs for timetable, offerings, sessions, generation jobs; offering detail with roster/sessions/generation/activity; session detail with replacement history and reschedule/cancel/correct-tutor.
- **Attendance** — tablet-first grouped roll, 44px targets, keyboard nav, select-all-present with confirmation, per-row undo, sticky save bar, allocation picker only on problem/correction, correction reason with before/after.
- **Make-ups** — three tabs with overdue/failed attempts and attempt-chain detail.
- **Enrolments & Hours** — visually separated sections, top measures, both lists as specified, enrolment and hours detail routes, trials shown as "Free Trial" with paid fields hidden until activation.
- **Billing** — six queue tabs with count + AUD value and stated basis, evidence columns, locked source/amount after invoicing, focused mark-invoiced / mark-paid dialogs, internal cash/bank excluded from parent route but retaining amount.
- **Tutor Pay** — sessions grouped by tutor and fortnight, rate snapshots, adjustments with reasons, prepare/approve/mark-paid, prototype labelling, zero-rate block.
- **Reports** — only the six defined metrics, each with date filter, scope label and drill-down. No "Revenue".
- **Setup** — five owner tabs, history-not-recalculated notices, System Jobs with counts and safe retry, technical detail behind owner disclosure.
- **Needs Attention** — single prioritised queue with severity/entity/issue/impact/owner/age/action, filters, badge wiring, distinct migration exceptions.

## Components

`AppShell`, `SidebarNav`, `AppHeader`, `PageHeader`, `GlobalSearchDialog`, `QuickCreateMenu`, `EnvironmentBadge`, `MetricCard`, `QueueCard`, `StatusChip`, `SeverityBadge`, `FilterBar`, `SearchInput`, `DateRangeFilter`, `SavedViewMenu`, `DataTable`, `MobileRecordList`, `Pagination`, `ColumnVisibility`, `RecordDrawer`, `DetailTabs`, `ActivityTimeline`, `WizardShell`, `ReviewStep`, `InlineValidationSummary`, `EmptyState`, `LoadingSkeleton`, `ErrorState`, `RetryBanner`, `ConfirmActionDialog`, `CorrectionDialog`, `StickySaveBar`. Status chips pair text + icon with colour; dialogs manage focus and escape; destructive wording favours cancel over delete.

## Visual and responsive

Background #F8FAFC, white surfaces, ink #0F172A, body #475569, primary #2563EB with #EAF2FF, success #15803D, warning #B45309, danger #B91C1C. Inter with tabular numerals for money and hours. Sidebar 248px, content padding 24–32px, page titles 24–30px, table text ≥14px with sticky headers and a mobile list fallback. Desktop-first at 1440px, solid at 1024px, attendance fully usable at iPad width. AA contrast, visible focus, semantic headings, non-colour validation. All dates formatted explicitly in `Australia/Sydney`.

## Required states

Every page and data component ships: loading skeleton, meaningful empty with next action, populated, filtered-zero, validation-blocked, partial/stale data, action-in-progress, success stating what changed, recoverable error with retry, permission denied, and a local-persistence warning in mock mode.

## Permissions and privacy

Route guards plus capability checks: owner (everything), admin (operational pages; no schema, secrets, RLS or audit deletion), tutor (future; preview shows own sessions/roll only, no guardian contact, charges or other tutors' pay), unauthenticated (login only). No full DOB in lists, no sensitive contact in global search previews unless the role permits, no PII in console or error payloads.

## Mock fixtures

Deterministic IDs and dates relative to one mock `today` provider: 12 students (siblings sharing a guardian, one trial, one inactive, one low-hours), 8 guardians, 5 tutors (one zero-rate), 2 operating periods, 5 programs, 5 standard prices, 6 offerings (group, private, weekly, one-off, ad hoc), 18 sessions across last/this/next week including cancelled and rescheduled/replacement, 30 attendance rows across all outcomes, 7 hour allocations (normal, low, zero, courtesy, insufficient), 9 charges across every queue and both routes, 2 clearly synthetic draft payouts, 10 needs-attention issues. Synthetic names only. Owner settings gets a Reset Mock Data action, available in mock mode only.

## Checkpoints

1. **Foundations** — `src/domain`, `src/data` interfaces + `ActionResult`, live adapters over existing server functions, mock adapter skeleton + mock clock, mode switch, environment badge, sidebar regrouping, redirects. No visual regressions.
2. **Shared components + states** — component library above, table/filter/state primitives, global search and quick-create shells.
3. **Home, People** — command centre, tabbed People, three detail routes, New Student wizard.
4. **Classes & Schedule** — tabs, offering and session detail, Offering wizard, generation preview/commit, reschedule.
5. **Attendance, Make-ups** — tablet roll, corrections, make-up chains.
6. **Enrolments & Hours** — lists, detail routes, Activate flows (trial/PAYG/hours), courtesy hours.
7. **Billing, Tutor Pay** — queues, evidence dialogs, payout preparation and approval.
8. **Reports, Setup, Needs Attention** — defined metrics with drill-down, owner setup tabs with job runs, unified exception queue and badge.
9. **Fixtures + tests + polish** — full mock dataset, acceptance tests, accessibility and responsive pass.

## Test plan (acceptance scenarios)

Vitest against the mock adapter and services for scenarios 1–12 and 14 (student + guardian creation; sibling guardian reuse; private offering capacity 1 and idempotent double generation; trial creates enrolment only; hours activation creates four records atomically; consumption only for present non-trial; blocked save with no partial consumption when no eligible allocation; make-up chain completes with original preserved; reschedule leaves original and seeds one roll; duplicate PAYG charge returns the existing charge; parent charge paid blocked without evidence; zero-rate payout approval blocked; failed generation job surfaces in Needs Attention and retry succeeds). Playwright for scenario 13 (tutor preview role restrictions) and 15 (core pages at 1024px, attendance marking at tablet width without horizontal dependence).

## Decisions needing owner approval

1. Mock mode is a preview/test mode only — it will not be reachable from the published app's normal navigation. Confirm.
2. Some read shapes (make-up chains, charge queue values, report drill-downs) are currently derived client-side by the live adapters. Adding the matching database views is a later, separately approved change.
3. Tutor role stays permission-ready but disabled; the tutor preview exists only for testing.
4. Reports omit "Revenue"; cash received is Paid Charges by paid date. Confirm that basis.
