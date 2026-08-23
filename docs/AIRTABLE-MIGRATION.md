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

## 2. The schema question, and why it no longer blocks you

The repo contains **two migrations that both create the Vision schema**, and
they disagree:

| | `20260823074753_ed256d3c…` | `20260823090100_vision_crm_core` |
|---|---|---|
| `airtable_id` | absent | on every table |
| `code` | plain column + per-table sequence | generated column |
| Guardian codes | `GDN-0001` | `GUA-0001` |
| Hours package codes | `PKG-00001` | `HRS-0001` |
| Charge codes | `CHG-00001` | `CHG-2026-0001` |
| `app_settings` (fortnight anchor) | **missing** | present |
| `updated_at` | **missing** | on every table |
| `charge_one_source` | **missing** | present |
| Default-payer trigger | **missing** | present |
| `enrolment_method_required` | **missing** | present |
| `make_up_has_source` | **missing** | present |
| One roll entry per lesson | per lesson **and type** | per lesson |

Applied in filename order the first wins and the second fails outright with
`type "staff_role" already exists`. Which one your database actually has depends
on the order Supabase ran them, and that is not knowable from the repo.

Rather than have you find out and tell me, there is now a migration that works
either way: **`20260823130000_align_vision_schema.sql`**. It adds only what is
missing, so on a database that is already correct it does nothing, and on the
other variant it brings across every one of the rows in that table. Run it and
the question stops mattering.

I verified that by building both variants from their own migrations, applying
the alignment to each, and diffing every column of every table and view. They
come out identical apart from a `user_roles` table in the alternate one that
nothing reads. The importer then produces the same result on both.

Two of those rows are worth knowing about:

- **`charge_one_source`** is the constraint that makes double-billing
  impossible — the single most load-bearing rule in `04-business-logic.md`.
  Without it, it is a convention rather than a guarantee.
- **One roll entry per lesson** is the spec's rule and the alignment enforces
  it. Your base currently has one lesson carrying two (see section 6); the
  alignment declines to tighten the index while that is true, and says so.

You can still run the preflight if you want to see what you are starting from:

```sh
psql "$DATABASE_URL" -f scripts/airtable-import/00-preflight.sql
```

`DATABASE_URL` is in Supabase under Project Settings → Database → Connection
string → URI. Or paste the file into the Supabase SQL editor. It reports which
variant you have and whether the target already holds data — importing on top of
real rows is not safe.

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

## 5. What is already done

The data is extracted and the import is written. `airtable-export/00-data.sql`
holds all **807 records** from the Jah Copy, with Airtable's record IDs intact.
It is deliberately **not** committed — it is real student and guardian data.

I ran the whole pipeline against a throwaway Postgres here, on **both** schema
variants, three times over. Results:

| | |
|---|---|
| Records loaded | 807 of 807 |
| Rows skipped | 1 (named below) |
| Hours balances reconciling to Airtable | 23 of 24 exactly, 1 off by the skipped row |
| Re-running the import | no duplicates, no drift |

### The one row that needs a decision from you

**ATT-0384** — a Make-up marked Present, sitting on the same lesson
(`recaYYeYfHeVwSyzJ`) as **ATT-0381**, Limlao Kang's ordinary roll entry for that
lesson, which is Not Marked. The spec allows one roll entry per student per
lesson, so only the first lands and the make-up is skipped and named by
`03-verify.sql`. That is also why Limlao Kang's HRS-0018 balance reads 16.00
here against 15 in Airtable — one hour of consumption is sitting in the skipped
row.

Fix it in Airtable, whichever way is true: if that lesson *was* the make-up,
delete the unmarked ATT-0381; if it was an ordinary lesson, mark ATT-0381 and
move the make-up to its own lesson. Then re-run the import — it is re-runnable,
so nothing else changes.

### Nineteen charges came across as Invoiced, not Paid

Airtable marks 19 charges Paid while recording no payment date and no payment
method — and those rows' own notes say the status was *meant* to read Invoiced.
Importing them as paid would put $16,285 of unevidenced money in the ledger, so
they land as **invoiced** with a note on each saying why, and `03-verify.sql`
lists every one by code, payer and student. Confirm them in the app and mark
them paid, or leave them if the payments never happened.

### People first

If you want the family side in and usable before the rest, there is a smaller
path that imports only guardians, students and who belongs to whom. Nothing in
it depends on classes, lessons, hours or money.

```sh
psql "$DATABASE_URL" -f supabase/migrations/20260823130000_align_vision_schema.sql
psql "$DATABASE_URL" -f scripts/airtable-import/01-staging.sql
psql "$DATABASE_URL" -f airtable-export/people.sql
psql "$DATABASE_URL" -f scripts/airtable-import/02a-transform-people.sql
psql "$DATABASE_URL" -f scripts/airtable-import/03a-verify-people.sql
```

That brings across **28 parents and 33 students**, every student attached to at
least one parent and every one of them with a default payer set. Running the
full import afterwards picks up where this left off — it skips these rows and
goes on to the rest, so this is not a fork in the road.

Two things the verification will show you:

- **Five parents cover two students each** — Andre Chen, Andrew Oh, Jiae Kim, S
  and Whitney. That is the sibling relationship, and it is why parents are
  shared records rather than copied onto each child.
- **Seven records need a human.** Five parents have a one-character name in
  Airtable's Full Name field (GUA-0023 through GUA-0028) even though the
  Guardian Label beside them reads in full, and three have neither an email nor
  a mobile. `03a-verify-people.sql` lists them; fix them in Airtable and re-run,
  or fix them in the app now that they are in it.

Codes are regenerated rather than carried across, which was agreed. Where
Airtable's numbering has no gaps they come out identical: 24 of 28 parent codes
and 27 of 33 student codes match exactly, and the rest shift up because the
Airtable sequence skips numbers where records were deleted. The original
Airtable record ID is kept on every row either way.

### To run it


```sh
psql "$DATABASE_URL" -f supabase/migrations/20260823130000_align_vision_schema.sql
psql "$DATABASE_URL" -f scripts/airtable-import/01-staging.sql
psql "$DATABASE_URL" -f airtable-export/00-data.sql
psql "$DATABASE_URL" -f scripts/airtable-import/02-transform.sql
psql "$DATABASE_URL" -f scripts/airtable-import/03-verify.sql
```

All five work in the Supabase SQL editor too — paste one file at a time, in that
order. The transform runs as a single transaction: either all of it lands or
none of it does.

### To re-extract later

If the base moves on and you want a fresh pull, there are two ways:

- **With a personal access token** — `AIRTABLE_PAT=pat… node
  scripts/airtable-import/extract.mjs`. This is the better path: it pulls the
  base itself, unattended.
- **Through the connector** — what I used, because this environment has no
  token and cannot reach `api.airtable.com`. The connector hands back pages of
  JSON; those go in `airtable-export/pages/` and
  `scripts/airtable-import/from-mcp.mjs` turns them into the same
  `00-data.sql`. Nothing is retyped by hand, so a damaged page fails as a JSON
  parse error rather than as a plausible wrong value.
