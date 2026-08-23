# Migrating Vision Admin V2 (Jah Copy) into the app

Written against your **actual** base. I read the schema and record counts
directly through the Airtable connector.

Base: **Vision Admin V2 (Jah Copy)** — `appEobvB14kpW8hHw`, confirmed by you as
the live one.

The runnable part lives in `scripts/airtable-import/`. Read section 2 first —
there is one blocker that has to be settled before any of it runs.

---

## 1. What is actually there

| Airtable table | Records | Becomes |
|---|---:|---|
| Parents / Guardians | 28 | `guardians` |
| Students | 33 | `students` + `student_guardians` |
| Tutors | 5 | `tutors` + `tutor_pay_rates` |
| Operating Periods | small | `operating_periods` |
| Standard Prices | small | `standard_prices` |
| Programs | small | `programs` |
| Class Offerings | 23 | `class_offerings` |
| **Billing** | 40 | **`enrolments`** |
| **Hours** | 24 | **`hours_packages`** + `package_eligibility` |
| Sessions | 216 | `sessions` + `session_pay_adjustments` |
| Attendance | 391 | `attendance` |
| Charges | 28 | `charges` |
| Tutor Payouts | 0 | `tutor_payouts` |

**About 790 records.** Small enough that the whole thing is one careful pass
that can be re-run from scratch as often as you like.

### Two corrections to what I told you earlier

I originally read **Vision Admin V2**, not the Jah Copy. The Jah Copy is a
later, more developed base, and two things I said about V2 are wrong for it:

**Tutor pay does exist.** The Jah Copy added it. `Tutors.Hourly Rate` is
populated (Harrison Liu $45, Irene Park $35, Alice Park $35; Joshua Chan and
Justin Cho both $0), there is a `Tutor Payouts` table, and `Sessions` carries
`Pay Adjustment` and `Pay Note`. All three now migrate:

- `Tutors.Hourly Rate` → one `tutor_pay_rates` row per tutor, effective from
  before the earliest imported lesson so history prices correctly instead of
  computing at zero.
- `Sessions.Pay Adjustment` + `Pay Note` → `session_pay_adjustments`.
- `Tutor Payouts` → `tutor_payouts`. Currently empty, so nothing moves.

The two $0 rates import as $0. If Joshua and Justin are owners rather than
hourly staff that is correct; if not, fix the rate in Airtable before importing
or on the Tutor Pay screen after.

**There are no draft Billing records.** All 40 are `Active`, so the decision
about excluding drafts is moot — everything comes across. The exclusion is still
in the transform in case a draft appears before cutover.

### Codes

Your Class Offering codes are a **mix** — 17 in the old
`OFF-2026T3-Y5-PRI-GEN-01` format and 6 in the newer `OFF-0021` format. That is
what you were getting at with "change all of them": they are now regenerated
consistently as `OFF-0001`…`OFF-0023` in Airtable creation order, and Billing
becomes `ENR-nnnn` in `BILL-nnnn` order.

Every other table keeps codes that match what Airtable already had. Originals
are preserved in `airtable_id` on every row, forever.

### Fields with no home

`Students.Gender` and `Students.Exam Targets` have no column in the schema. Say
the word and I will add them; otherwise they are dropped.

---

## 2. The blocker: which schema is actually live

**This has to be settled before anything runs, and I cannot settle it from
here** — it needs one query against your Supabase database.

The repo contains **two migrations that both create the Vision schema**, and
they disagree:

| | `20260823074753_ed256d3c…` | `20260823090100_vision_crm_core` |
|---|---|---|
| `airtable_id` | absent | on every table |
| `code` | plain column + per-table sequence | generated column |
| Guardian codes | `GDN-0001` | `GUA-0001` |
| Hours package codes | `PKG-00001` | `HRS-0001` |
| Charge codes | `CHG-00001` | `CHG-2026-0001` |
| `charge_one_source` | **missing** | present |
| Default-payer trigger | **missing** | present |
| `enrolment_method_required` | **missing** | present |
| `make_up_has_source` | **missing** | present |

Applied in filename order the first wins and the second fails outright with
`type "staff_role" already exists`. Which one your database actually has depends
on the order Supabase ran them, and that is not knowable from the repo.

It matters for two reasons:

1. **`airtable_id` is what makes the import re-runnable and reconcilable.**
   Without it there is no way to say "this Postgres row came from that Airtable
   record", so a second run duplicates everything and the hours-balance check in
   section 6 cannot be written at all.
2. **`charge_one_source` is the constraint that makes double-billing
   impossible** — the single most load-bearing rule in `04-business-logic.md`.
   If it is missing, so is the guarantee.

### What to do

Run this against your Supabase database and send me the output:

```sh
psql "$DATABASE_URL" -f scripts/airtable-import/00-preflight.sql
```

`DATABASE_URL` is in Supabase under Project Settings → Database → Connection
string → URI. Or paste the file into the Supabase SQL editor.

It prints one of three verdicts:

- **SPEC SCHEMA** — the import runs exactly as written. Nothing else needed.
- **ALTERNATE SCHEMA** — I write a small alignment migration first that adds
  `airtable_id`, the missing constraints and the default-payer trigger. Half an
  hour of work, and it needs doing regardless of the migration because those
  constraints are the app's correctness guarantees.
- **NO VISION SCHEMA** — the core migration never applied; that gets fixed
  first.

It also reports whether the target already holds data, because importing on top
of real rows is not safe.

---

## 3. Why not CSV

The obvious move is Airtable's CSV export. **Don't**, for the linked tables.

Airtable exports a linked record as its *primary field display text* — so
Students' payer exports as the string `"GUA-0013 | Leerang Lim"`, not a stable
identifier. Rebuilding the relationships means parsing display names, and it
breaks the moment two people share a name or a label gets edited.

Pull **JSON through the API instead**, where every link is a record ID. Those IDs
are exactly what the `airtable_id` columns in the new schema exist to hold, which
makes the whole load re-runnable and reconcilable.

CSV is fine for eyeballing, and fine for the small reference tables that have no
links. Not for Billing, Hours, Sessions, Attendance or Charges.

---

## 4. The steps

### Step 0 — snapshot Airtable

Duplicate the base (**Vision Admin V2 → duplicate with records**). You have five
snapshots already, so you clearly know to do this — but it is the only real undo.

### Step 1 — clean in Airtable, not in SQL

Every V2 table has a `Validation Flag` formula. The new database enforces the
same rules as hard constraints, so anything flagged now becomes a failed insert
later. Fixing it in Airtable takes seconds; debugging it mid-load does not.

In each table, filter `Validation Flag` is not `OK` and clear the list. Pay
particular attention to:

| Check | Why |
|---|---|
| Students with no Default Payer / Contact, or a payer who is not one of their guardians | Rejected by a deferred trigger at commit |
| Billing rows that are not Trial and have no Billing Method | Violates `enrolment_method_required` |
| Courtesy Hours with a price, or with no Courtesy Reason | Violates `courtesy_is_free` |
| Private Class Offerings with Capacity ≠ 1 | Violates `private_capacity_one` |
| Charges with both an Hours and an Attendance link, or neither | Violates `charge_one_source` |
| Two Charges against the same Hours record or the same Attendance | Violates the partial unique indexes |
| Charges marked Paid with no Paid Date or Payment Method | Violates `charge_paid_needs_evidence` |
| Attendance with no Session or no Billing link | Both are `not null` |
| Two Attendance rows for the same Billing record in the same Session | Violates `attendance_unique` |
| Sessions where Scheduled End ≤ Scheduled Start | Violates `session_times_ordered` |

Also check whether any Attendance rows still have a **blank Attendance Code**.
Your highest code is `ATT-0115` but there are 340 records, so a lot of them may
still be uncoded drafts from the ATT-00 flow. Decide whether those are real
attendance or scratch.

### Step 2 — extract to JSON

Two ways, pick one:

**A. I do it.** I have connector access to the base. I pull all twelve tables to
JSON with record IDs, and hand you one `.sql` file. At 680 records this is the
fastest path by a wide margin, and it is what I would suggest.

**B. You do it.** Personal access token from
`airtable.com/create/tokens` with `data.records:read` + `schema.bases:read`
scoped to the base, then one request per table:

```
GET https://api.airtable.com/v0/appAquMtznlUgsPBw/{tableIdOrName}
Authorization: Bearer patXXXX
```

Page with the `offset` in each response until it stops coming back. Save one JSON
file per table.

### Step 3 — load into a staging schema

Never transform on the way in. Land the raw JSON first, then transform in SQL
where you can inspect and re-run:

```sql
create schema if not exists staging;

-- One table per Airtable table. The whole record goes in as jsonb, so an
-- unexpected field is never silently lost.
create table staging.at_students   (id text primary key, fields jsonb not null);
create table staging.at_guardians  (id text primary key, fields jsonb not null);
create table staging.at_tutors     (id text primary key, fields jsonb not null);
create table staging.at_periods    (id text primary key, fields jsonb not null);
create table staging.at_prices     (id text primary key, fields jsonb not null);
create table staging.at_programs   (id text primary key, fields jsonb not null);
create table staging.at_offerings  (id text primary key, fields jsonb not null);
create table staging.at_billing    (id text primary key, fields jsonb not null);
create table staging.at_hours      (id text primary key, fields jsonb not null);
create table staging.at_sessions   (id text primary key, fields jsonb not null);
create table staging.at_attendance (id text primary key, fields jsonb not null);
create table staging.at_charges    (id text primary key, fields jsonb not null);
```

### Step 4 — transform, in dependency order

Load parents before children; the foreign keys will stop you otherwise, which is
the point. Every insert carries `airtable_id`, which is what makes each step
re-runnable and every later reconciliation possible.

```
 1  guardians
 2  students                  (without default_payer_id)
 3  student_guardians    →    then set students.default_payer_id
 4  tutors
 5  operating_periods
 6  standard_prices
 7  programs
 8  class_offerings
 9  enrolments           ←    Billing
10  hours_packages       ←    Hours
11  package_eligibility  ←    Hours.Eligible Billing
                         →    then set enrolments.default_package_id
12  sessions
13  attendance
14  charges
```

Steps 3 and 11 are two-pass: insert the rows, then update the back-reference.
`students.default_payer_id` has a **deferred** constraint trigger precisely so
this works inside one transaction — it only checks at `COMMIT`.

The shape of every step is the same. Guardians, as the simplest:

```sql
insert into guardians (full_name, email, mobile, status, notes, airtable_id)
select
  f->>'Full Name',
  nullif(f->>'Email', ''),
  nullif(f->>'Mobile', ''),
  lower(f->>'Status')::person_status,
  nullif(f->>'Notes', ''),
  s.id
from staging.at_guardians s, lateral (select s.fields) x(f)
order by f->>'Guardian Code'          -- so GUA-nnnn regenerates in the same order
on conflict (airtable_id) do nothing;  -- makes the step re-runnable
```

And a linked one, where the Airtable record ID resolves the join:

```sql
insert into enrolments (
  student_id, class_offering_id, status, starts_on, ends_on, closure,
  method, standard_price_id, base_price, adjustment, adjustment_value,
  hours_override, airtable_id
)
select
  st.id, co.id,
  lower(f->>'Status')::enrolment_status,
  (f->>'Start Date')::date,
  nullif(f->>'End Date','')::date,
  nullif(lower(f->>'Closure Reason'),'')::closure_reason,
  case f->>'Billing Method' when 'Hours' then 'hours'
                            when 'PAYG'  then 'payg' end::billing_method,
  sp.id,
  nullif(f->>'Base Price','')::numeric,
  replace(lower(f->>'Adjustment Type'), ' ', '_')::adjustment_type,
  coalesce(nullif(f->>'Adjustment Value','')::numeric, 0),
  nullif(f->>'Hours Purchased Override','')::numeric,
  b.id
from staging.at_billing b, lateral (select b.fields) x(f)
join students        st on st.airtable_id = f->'Student'->>0
join class_offerings co on co.airtable_id = f->'Class Offering'->>0
left join standard_prices sp on sp.airtable_id = f->'Standard Price'->>0
where f->>'Status' <> 'Draft' and f->>'Status' is not null   -- Decision 2
order by f->>'Billing Code'
on conflict (airtable_id) do nothing;
```

**Do not migrate anything Airtable computed.** All of it is a view now:
every `… Candidate`, every `Validation Flag`, every `… Count`, every
`… Unique Key`, `Hours Used`, `Hours Remaining`, `Final Amount`,
`Final Agreed Price`, `Hours to Consume`, `Effective Status`, `Make-up State`,
`Scheduled Duration`, and every `… - Lookup`. Also drop the automation
plumbing: `Hours Creation *`, `Charge Creation *`, `Retry *`, `Activation *`,
`Creation *`, `Generate Sessions`, `Hours Used (Migration Staging)`,
`Scheduled Hours (Migration Staging)`.

### Step 5 — reset the sequences

Generated codes come off identity sequences. After loading, move each one past
the highest imported value or the first new record collides:

```sql
select setval(pg_get_serial_sequence('students','seq'),
              (select max(seq) from students));
-- repeat for guardians, tutors, class_offerings, sessions,
-- enrolments, hours_packages, attendance, charges, tutor_payouts
```

### Step 6 — verify

Row counts first:

```sql
select 'guardians' t, count(*) from guardians
union all select 'students',       count(*) from students
union all select 'class_offerings',count(*) from class_offerings
union all select 'enrolments',     count(*) from enrolments
union all select 'hours_packages', count(*) from hours_packages
union all select 'sessions',       count(*) from sessions
union all select 'attendance',     count(*) from attendance
union all select 'charges',        count(*) from charges;
```

Against the table in section 1: 26 / 29 / 20 / 38 (less any drafts) / 26 / 166 /
340 / 28.

**Then the check that actually matters.** Every family's account depends on it:

```sql
select code, hours_purchased, hours_used, hours_remaining
from v_hours_packages order by code;
```

Compare each row against Airtable's `Hours Remaining`. They must match exactly.
If one differs, the consumption rule or the `package_eligibility` links did not
come across, and you must stop and find out why before going live.

Money next:

```sql
select status, count(*), sum(final_amount) from v_charges group by status;
```

Then the exception list, which should be a sane length rather than empty:

```sql
select entity, issue, count(*) from v_needs_attention
group by entity, issue order by count(*) desc;
```

Expect hits on *"Hours enrolment with no default package"* and *"No default payer
set"* if you skipped any Airtable cleanup. Those are the same rules Airtable's
`Validation Flag` was applying — now enforced rather than displayed.

### Step 7 — cut over

1. Tell staff to stop editing Airtable, and mean it.
2. Final export, final load, re-run every check in step 6.
3. Enter tutor pay rates (Tutor Pay → Rates) — see section 1.
4. Set Airtable to read-only. Keep it that way for at least a term.
5. Run both in parallel for a week if you can bear it, comparing hours balances
   daily.

---

## 5. If you want me to do it

Say the word and I will:

1. Pull all twelve tables through the connector.
2. Generate `supabase/migrations/<ts>_airtable_import.sql` — staging tables, the
   raw data, the full transform, sequence resets and the verification queries,
   as one file you run in the Supabase SQL editor.
3. Run it against a throwaway Postgres here first and show you the verification
   output before it goes anywhere near your live database.

At 680 records that is a genuinely small job. What I need from you first is
**Decision 1 (codes), Decision 2 (drafts) and Decision 3 (which base)** — all
three change the SQL, and none of them can be sensibly guessed.
