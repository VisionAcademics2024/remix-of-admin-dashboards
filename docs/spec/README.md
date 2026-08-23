# Vision CRM — Build Specification

A complete specification for rebuilding the Vision Academics admin system as a custom
application, replacing Airtable.

**Target stack:** Lovable → Supabase (Postgres + Auth + RLS) → GitHub → Claude Code.
Everything here assumes Postgres. If you move off Supabase, only `05-auth-and-permissions.md`
needs rewriting.

---

## How to use this package

1. Drop this whole folder into your repo, e.g. `/docs/spec/`.
2. Point Claude Code at it: *"Read /docs/spec and implement it."*
3. Fill in `08-CUSTOMISE-ME.md` **first** — it is deliberately blank. Everything in it
   overrides the defaults in the other files.

Read the files in order. Each is self-contained enough to hand to a coding agent on its own.

| File | What it covers |
|---|---|
| `01-domain-model.md` | The business. What a lesson, enrolment and package actually are, and how they relate. Read this first — the rest won't make sense otherwise. |
| `02-database-schema.md` | Every table and column in prose, with the reasoning behind each design decision. |
| `03-schema.sql` | Runnable Postgres DDL. Enums, tables, indexes, views, RLS. |
| `04-business-logic.md` | The rules: hour consumption, pay calculation, validation, code generation, recurrence. |
| `05-auth-and-permissions.md` | Login, roles, and exactly what each role can see and touch. |
| `06-screens.md` | The 14 screens, what each does, and what it reads and writes. |
| `07-data-migration.md` | Getting the existing Airtable data across without losing history. |
| `08-CUSTOMISE-ME.md` | **Blank template.** Your design, naming and feature preferences. |

---

## Naming: a deliberate break from the old system

The Airtable base used names that confused everyone who touched it. This spec fixes them.
If you are cross-referencing the old system, use this map:

| Airtable called it | This spec calls it | Why |
|---|---|---|
| Billing | `enrolments` | It is a student in a class, not an invoice. The old name caused constant confusion with Charges. |
| Hours | `hours_packages` | A block of purchased hours, not a quantity. |
| Charges | `charges` | Unchanged. |
| Class Offering | `class_offerings` | Unchanged. |
| Session | `sessions` | Unchanged. A "lesson" in conversation. |
| Attendance | `attendance` | Unchanged. A "roll entry" in conversation. |

---

## Six principles this design commits to

**1. Base tables store facts. Views compute.**
Anything derived — hours remaining, pay, validation state, which fortnight a lesson falls in —
lives in a view, never a stored column. Timezone-dependent maths cannot be a Postgres generated
column anyway (`at time zone` is stable, not immutable), and views keep the truth in one place.

**2. Money is `numeric(12,2)`. Never floats.**
Hours are `numeric(6,2)`.

**3. Every timestamp is `timestamptz`, stored in UTC, reasoned about in `Australia/Sydney`.**
Every "what day is it" question converts explicitly. The old system leaked GMT into filters and
showed tomorrow's lessons on the Today screen; this is the fix.

**4. Frozen commercial values are copied, not looked up.**
When an enrolment agrees a price, that number is written onto the enrolment. When a payout is
made, the hours and rate are written onto the payout. Changing a catalogue price or a tutor's
rate must never silently rewrite history.

**5. Deletes are soft where history matters.**
Classes, enrolments and packages are closed, not deleted. Hard deletes are reserved for records
created in error, and the schema enforces the order with foreign keys.

**6. Validation is queryable, not a flag people ignore.**
Every table has a rule set expressed as a view. A single `v_needs_attention` union drives the
whole exceptions screen.

---

## What gets better than the Airtable version

Worth knowing so you don't faithfully reproduce workarounds you no longer need:

- **Automations fire reliably.** Airtable's "when record matches conditions" only triggers when a
  record *starts* matching, so anything already in that state was invisible forever. In Postgres
  you run a transaction or a job. The single largest source of bugs in the old system disappears.
- **Ordering stops mattering.** Generating lessons before enrolling students left lessons with no
  roll. Here, seeding the roll is a function you can run at any time, idempotently.
- **Negative numbers just work.** No per-field toggle.
- **Column-level visibility is real.** Tutor pay can be genuinely invisible to non-owners, not
  merely hidden on a screen.
- **Number formatting is a display concern.** No stored value ever rounds itself.
