# Vision CRM — what was built, and where everything is

The spec in `docs/spec/` is now implemented: 19 tables, 8 views, 14 screens, and
the permission boundary. The original Lovable prototype is untouched and still
reachable — it was moved aside, not deleted.

This document is the map. Read the first two sections to get in and look around;
the rest is reference.

---

## 1. Getting in

There is no seeded account, because I had no email addresses for Justin or
Joshua. The first run bootstraps itself.

1. Run the app (`npm run dev`, or open it in Lovable) and go to `/auth`.
2. **Sign up** with your email. This creates an `auth.users` row and nothing else
   — signing in grants no access on its own.
3. You land on a **"Set up Vision CRM"** card. Enter your name and press
   **Claim owner access**.
4. You are now an owner and the full app opens at `/today`.

That claim works exactly once. `bootstrap_first_owner()` refuses the moment any
staff row exists, so it cannot be used to escalate later.

**Everyone after the first person:**

1. They sign up, and see a **"No access yet"** card instead.
2. They press **Request access**.
3. An owner opens **Staff** (`/staff`), picks Owner or Admin, and approves them.

Deactivating someone is a switch on that same screen, never a delete — deleting
the row would lose the audit trail on per-lesson pay adjustments.

> **Before you go live, turn off public sign-up** in the Supabase dashboard and
> invite people from there instead. The sign-up tab is only how the first owner
> gets in. Leaving it on is not a data risk — an account with no staff row can
> read nothing — but it does let strangers create dormant accounts.

---

## 2. Where to find each screen

Navigation is grouped daily-use first, exactly as `06-screens.md` asks.

### Every day

| Screen | URL | What it is for |
|---|---|---|
| **Today** | `/today` | The page to leave open. Four questions: who needs marking, what is on, who is running out of hours, what is ready to invoice. Mark students present or absent straight from it. |
| **Timetable** | `/timetable` | The week, coloured by tutor, with a marked/total badge per lesson. Click a lesson to change its time, tutor, room or notes, or to cancel it. |
| **Roll** | `/roll` | The full attendance record. Seven saved filters, a search box, and a "mark all present" action. |
| **Class Builder** | `/classes/new` | The guided four-step build. Steps tick themselves off as you complete them. |
| **Make-Ups** | `/make-ups` | Outstanding absences, booked make-ups, make-ups waiting to be marked, and completed ones. |
| **Classes** | `/classes` | The class list: capacity against enrolled, lesson counts, generate/seed buttons, status changes. |

### Records

| Screen | URL | What it is for |
|---|---|---|
| **Leads & Trials** | `/leads` | The pre-student pipeline. Enquiries as an Open / Converted / Lost board, a contact log per lead, booked class trials and diagnostics, and one-click conversion into a student, guardian and (optionally) a trial enrolment. |
| **Students & Families** | `/students` | Two tabs, students and guardians. "Manage" on a student opens the family dialog: link guardians, set the default payer, change status. |
| **Student Detail** | `/students/:id` | Everything about one student on one page — family, enrolments, packages with balances, attendance, charges. The screen to open when a parent rings. |
| **Enrolments & Hours** | `/enrolments` | The commercial view. Package balances, and the eligibility dialog. |
| **Billing** | `/billing` | Money in as a pipeline: to charge → to invoice → unpaid → received → cancelled. |

### Admin

| Screen | URL | Who |
|---|---|---|
| **Needs Attention** | `/needs-attention` | Everyone. One query, grouped by entity, each row linking to where it gets fixed. The sidebar carries a live count badge. |
| **Tutor Pay** | `/tutor-pay` | **Owners only.** Hidden from the nav for admins, and the API refuses them. |
| **Setup** | `/setup` | Everyone. Terms, programs, prices, tutors. |
| **Staff** | `/staff` | **Owners only.** Approve requests, set roles, deactivate. |

### Reference

| Screen | URL | Note |
|---|---|---|
| **Prototype** | `/prototype/dashboard`, `/prototype/students`, `/prototype/tutors`, `/prototype/packages`, `/prototype/sessions` | The original app, working, on its own renamed tables. Linked from the bottom of the sidebar. |

---

## 3. The five things worth trying first

To see the parts that matter, in order:

1. **Setup → Terms**, add a term. Then **Programs**, add one (say "Year 5
   Private", 1.5 hours). Then **Prices** — pick **Per hour** and watch the form
   warn you that the quantity is meaningless. Then **Tutors**, add one and give
   them a colour.
2. **Students & Families** → add a student, add a guardian, then **Manage** on
   the student → attach the guardian → **Make payer**. Try making an unattached
   guardian the payer; it refuses.
3. **Class Builder** → build a class with a first lesson at 5:30pm in late
   September. Enrol the student. Generate lessons. **Press Generate twice** —
   the second press reports zero new lessons.
4. **Timetable** → step to a week in October. Every lesson is still at 5:30pm,
   across the daylight-saving change.
5. **Roll** → mark someone present, then look at **Enrolments & Hours**: the
   balance dropped. Un-mark them; it comes back. Cancel their lesson on the
   Timetable; it comes back too.

---

## 4. What lives where

```
supabase/
  migrations/
    20260809064115_*.sql          the original prototype schema (untouched)
    20260809064140_*.sql          the original follow-up (untouched)
    20260823090000_prototype_rename.sql   renames prototype tables to proto_*
    20260823090100_vision_crm_core.sql    the whole spec schema, 1031 lines
  tests/                          the verification suite, and how to run it

docs/
  spec/                           the nine spec files, as handed over
  spec/08-CUSTOMISE-ME.md         now filled in — every default I chose
  BUILD-GUIDE.md                  this file

src/
  lib/
    format.ts                     Sydney dates, times, money, hours, fortnights
    vision/
      types.ts                    domain types, enum labels, tutor colours
      guard.ts                    requireStaff / requireOwner, the loose client
      session.functions.ts        who am I, bootstrap, access requests, staff
      people.functions.ts         students, guardians, links, student detail
      catalogue.functions.ts      terms, programs, prices, tutors
      classes.functions.ts        class offerings, generation, seeding
      schedule.functions.ts       the week, lesson edits, one-off lessons
      roll.functions.ts           attendance filters, marking, make-ups
      commerce.functions.ts       enrolments, packages, eligibility, pricing
      leads.functions.ts          leads, contacts, trials, lead conversion
      billing.functions.ts        charges, invoicing, payments
      pay.functions.ts            rates, adjustments, payouts (owner-only)
      overview.functions.ts       Today, Needs Attention
    prototype/                    the prototype's server functions, repointed
  components/
    vision/ui.tsx                 page shell, sections, tables, badges, empties
    app-sidebar.tsx               nav, role gating, attention badge, theme toggle
    ui/                           the shadcn components — untouched
  routes/_authenticated/
    route.tsx                     the access gate and app shell
    today.tsx  timetable.tsx  roll.tsx  make-ups.tsx  classes.index.tsx
    classes.new.tsx  students.tsx  students.$id.tsx  enrolments.tsx
    leads.tsx  billing.tsx  needs-attention.tsx  tutor-pay.tsx  setup.tsx  staff.tsx
    prototype.*.tsx               the prototype's screens
```

The TanStack Start + Router + Query wiring, the Supabase client and auth
middleware, and all 46 shadcn components are the originals. Nothing there was
rewritten.

---

## 5. The database

### Applying it

Two new migrations, in this order. On Supabase they run automatically; locally,
`supabase db push` or `supabase migration up`.

**`20260823090000_prototype_rename.sql`** — renames `students`, `tutors`,
`sessions`, `packages`, `student_packages`, `session_students` and `user_roles`
to `proto_*`. Every row, index, policy and foreign key comes with them; nothing
is dropped. This frees the canonical names for the spec schema. It also fixes a
live prototype bug: the UI offered a "Pending" attendance value the check
constraint rejected, so choosing it always failed. The constraint now allows it.

**`20260823090100_vision_crm_core.sql`** — the spec schema, essentially
`docs/spec/03-schema.sql` verbatim, plus:

- `generate_sessions(offering_id)` — walks the recurrence in Sydney local time
  and rebuilds the instant on each date, so a 5:30pm class stays 5:30pm across
  the daylight-saving change. Idempotent via `on conflict do nothing`.
- `seed_roll(session_id)` and `seed_roll_for_offering(offering_id)` — idempotent
  roll seeding, callable at any time.
- `bootstrap_first_owner(name)` — the first-run claim, inert once staff exist.
- `access_requests` — the invite queue, so onboarding needs no service-role key.
- Explicit grants for `authenticated` and `service_role` on every table, view and
  function. RLS decides which rows; grants decide whether the role can reach the
  table at all. Both are needed.
- The prototype lockdown, described in section 7.

### One deliberate deviation from the spec

`04-business-logic.md` §7 says to seed the roll with
`package_id = enrolments.default_package_id`. Doing that literally makes seeding
brittle: if the package has no eligibility row for that enrolment, the trigger
rejects the insert and the **whole seed fails**, including every unrelated
student on the lesson.

`seed_roll()` therefore attaches the default package **only when an eligibility
row already exists**, and leaves it null otherwise. The row saves, and the gap
surfaces on Needs Attention as *"Present on an hours enrolment with no package
linked"* — a report rather than a hard stop, which is what that validation rule
is for. The trigger still refuses any ineligible package written any other way.

Everything else follows the spec as written.

---

## 6. The business rules, and where each one is enforced

| Rule | Enforced by |
|---|---|
| Hours are consumed only by a present, non-trial roll entry on a lesson that ran | `v_attendance.hours_consumed` |
| Balance is purchased minus consumed, never stored | `v_hours_packages` |
| Un-marking refunds; cancelling a lesson refunds everyone on it | Falls out of the two above — nothing to undo |
| A package may only be spent where it is eligible, and on its own student | `check_package_eligible` trigger |
| A charge has exactly one source | `charge_one_source` check |
| One lesson, one charge; one package, one charge | Partial unique indexes on `charges` |
| Paid needs a date and a method | `charge_paid_needs_evidence` check |
| A courtesy package is free and states why | `courtesy_is_free` check |
| Private tuition is capacity 1 | `private_capacity_one` check |
| Only a trial may omit a billing method | `enrolment_method_required` check |
| A pay adjustment needs a written reason | `payout_adjustment_needs_reason` check |
| The default payer must be a guardian of that student | Deferred constraint trigger, fires at COMMIT |
| A lesson pays its tutor at the rate in force on its own date | `v_session_pay` lateral join |
| Cancelled and rescheduled lessons pay nothing | `v_sessions.payable_hours` |
| Fortnights are absolute, anchored to 3 Aug 2026 | `fortnight_start()`, `floor` not truncation |
| Re-running lesson generation never duplicates | Unique index on `(class_offering_id, starts_at)` |
| Every calendar question is answered in Sydney | `syd_date()` in SQL, `src/lib/format.ts` in the app |

The one rule that is a *policy* rather than a constraint: a per-hour price must
state how many hours are being bought. `computeBasePrice()` in
`commerce.functions.ts` throws if it is missing, and the enrolment form warns
before you can get there.

---

## 7. Security

The audit found three real problems. All three are closed.

**Every table was readable and writable by any signed-in user.** The prototype
shipped `using (true) with check (true)` on all seven of its tables, so an
`auth.users` row alone gave full access to every student and family record. Both
the new tables and the prototype's now require an active `staff` row.

**Anyone could grant themselves a role.** `user_roles` had the same open policy.
It is now `proto_user_roles`, behind the staff check, and unused — roles live on
`staff` and only owners can write it.

**Public sign-up granted access.** It no longer does. Signing in with no staff
row shows the "No access yet" card and can read nothing.

The boundary itself, per `05-auth-and-permissions.md`:

- `is_staff()` gates the fourteen operational tables.
- `is_owner()` gates the three pay tables — `tutor_pay_rates`,
  `session_pay_adjustments`, `tutor_payouts`.
- All views are `security_invoker = true`, so `v_session_pay` computes as zero
  for an admin rather than leaking.
- On top of that, `requireOwner` refuses admins outright on every pay endpoint,
  which the spec offers as the kinder alternative to showing them zeroes.
- Hiding Tutor Pay from the nav is cosmetic and is treated as such.

---

## 8. It was verified against a real database

The migrations were applied to a throwaway Postgres 16 and the rules exercised
with data. 25 checks, all passing. `supabase/tests/README.md` has the commands.

Highlights:

```
generation across the DST change   7 lessons, every one 17:30–19:00 Sydney
re-running generation              0 new lessons
re-running roll seeding            0 new entries
mark 3 present                     4.50 h used, 5.50 h remaining
un-mark one                        3.00 h used, 7.00 h remaining
cancel another                     1.50 h used, 8.50 h remaining
lesson on 28 Oct                   rate 60.00, pay 90.00
lesson on 4 Nov (after a raise)    rate 75.00, pay 112.50
cancelled lesson                   0 payable hours, 0.00 pay
fortnight of 2026-07-30            2026-07-20   (before the anchor, floors correctly)
make-up lifecycle                  outstanding → scheduled → completed
admin: payouts / rates visible     0 / 0,  max pay 0.00
owner: payouts / rates visible     1 / 2,  max pay 112.50
no-staff user: students / charges  0 / 0
admin writing a pay rate           blocked
```

Every constraint listed in section 6 was also tested by attempting to violate it.

The app itself typechecks clean (`npx tsc --noEmit`), builds clean
(`npx vite build`), and the new code is lint-clean.

**What has not been tested:** the screens against a live Supabase project. I have
no credentials for yours, so no page has been loaded in a browser and no server
function has run against real data. The SQL is proven; the UI is not.

---

## 9. What is deliberately not built

- **The Airtable migration.** `07-data-migration.md` is unimplemented — there are
  no import scripts, no staging schema, no reconciliation queries. Every table
  carries its `airtable_id` column ready for it. This is the largest remaining
  piece of the spec.
- **Drag-to-move on the timetable.** Lesson times are edited in a dialog. The
  spec asks for "drag or edit"; this is the edit half.
- **Any integration** — Xero, email, SMS, calendar, payments. Charges carry
  `xero_invoice_no` as free text and "bill these together" stamps one number
  across several charges, which is the manual path the spec describes.
- **Tutor logins and a third role.** The schema is shaped to allow them;
  `05-auth-and-permissions.md` says to do it as a deliberate project.
- **An audit log**, and **soft-delete columns**. Both are listed as deliberate
  omissions in `02-database-schema.md`.

---

## 10. Choices I made that you may want to overrule

Recorded in full in `docs/spec/08-CUSTOMISE-ME.md`, which was blank and is now
filled in. The ones most worth a second opinion:

- **The name "Vision CRM"** and the indigo palette. Both are placeholders that
  look deliberate rather than defaults that look unfinished.
- **Compact density.** Chosen because Roll and Billing are read as dense lists;
  if staff find it tight, one change in `08` and the spacing scale loosens.
- **No webfont.** The system stack renders instantly; naming a typeface is worth
  deciding on purpose.
- **Owner accounts unseeded.** I had no addresses for Justin or Joshua, so the
  first-run claim exists instead.
- **The prototype kept.** It costs one migration and a nav item. When you no
  longer want it, delete the `proto_*` tables, `src/lib/prototype/`, the
  `prototype.*.tsx` routes, and the sidebar entry — nothing else refers to it.
