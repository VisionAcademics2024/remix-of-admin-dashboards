# Migrating Vision Admin V2 into the app

Written against your **actual** base, not the generic plan in
`docs/spec/07-data-migration.md`. I read the schema and record counts directly
through the Airtable connector on 23 Aug 2026.

Read section 2 before doing anything — there are three decisions that have to be
made first, and one of them affects what families see on invoices.

---

## 1. What is actually there

Base: **Vision Admin V2** — `appAquMtznlUgsPBw`.

| Airtable table | Records | Becomes |
|---|---:|---|
| Parents / Guardians | 26 | `guardians` |
| Students | 29 | `students` + `student_guardians` |
| Tutors | small | `tutors` |
| Operating Periods | small | `operating_periods` |
| Standard Prices | small | `standard_prices` |
| Programs | small | `programs` |
| Class Offerings | 20 | `class_offerings` |
| **Billing** | 38 | **`enrolments`** |
| **Hours** | 26 | **`hours_packages`** + `package_eligibility` |
| Sessions | 166 | `sessions` |
| Attendance | 340 | `attendance` |
| Charges | 28 | `charges` |

**Roughly 680 records in total.** That number matters more than anything else in
this document: this is not an ETL project. It is one careful pass that fits in
an afternoon, and it can be re-run from scratch as many times as you like.

The good news is that your V2 base is a close match for the schema — the field
names line up, the select options line up, and you already keep `Legacy Record
ID` on most tables. Whoever designed V2 did the hard part.

### Where there is nothing to migrate

**Tutor pay does not exist in Airtable.** The Tutors table says so explicitly:
*"No pay rates or payroll fields."* So `tutor_pay_rates`, `session_pay_adjustments`
and `tutor_payouts` all start empty. Before your first payroll run in the new
app you will need to enter each tutor's hourly rate on **Tutor Pay → Rates**,
with an `effective_from` date early enough to cover the lessons you migrated —
otherwise historical lessons compute at $0.

### Fields with no home

`Students.Gender` and `Students.Exam Targets` have no column in the new schema.
Tell me if you want them and I will add them; otherwise they are dropped.

---

## 2. Three decisions to make first

### Decision 1 — codes

In the new database, `code` is a **generated column**. It is computed from a
sequence and cannot be written to. Most of your codes already match the shape it
produces, so they will come out identical if the rows are loaded in code order:

| Table | Your code | Generated | Match? |
|---|---|---|---|
| Students | `STU-0019` | `STU-nnnn` | ✅ |
| Guardians | `GUA-0024` | `GUA-nnnn` | ✅ |
| Hours | `HRS-0001` | `HRS-nnnn` | ✅ |
| Sessions | `SES-0051` | `SES-nnnn` | ✅ |
| Attendance | `ATT-0115` | `ATT-nnnn` | ✅ |
| Charges | `CHG-2026-0008` | `CHG-yyyy-nnnn` | ✅ |
| **Class Offerings** | `OFF-2026T3-Y6-PRI-GEN-01` | `OFF-nnnn` | ❌ |
| **Billing** | `BILL-0038` | `ENR-0038` | ❌ prefix |

So two tables cannot keep their codes.

- **Recommended:** let both be regenerated. The originals are preserved forever
  in `airtable_id`, and neither `OFF-` nor `BILL-` codes are the sort of thing
  you quote to a parent.
- **If those codes appear on anything you have already sent families**, say so
  and I will convert `code` on those two tables to a plain unique column with a
  trigger for new rows. It is a small change but it must be decided before the
  load, not after.

### Decision 2 — Draft billing records

Your Billing table has a **`Draft`** status. The new `enrolment_status` enum only
has `trial`, `active` and `closed`, so drafts have nowhere to go.

Drafts are, by definition, incomplete — they are the half-filled records the
Draft-first interface produces. **My recommendation is to exclude them** and
re-create any that are still wanted directly in the new app, where Class Builder
makes it a 30-second job.

Before you decide, run this in Airtable to see how many there are: filter Billing
by Status is Draft, and also by Status is empty (blank counts as draft too).

### Decision 3 — which base is live

You have six bases. I used **Vision Admin V2** (`appAquMtznlUgsPBw`). The other
five look like snapshots and copies:

```
Vision Admin                                   apptzUOQ9GOn09pHj
Vision Admin V1 Snapshot - 2026-07-28          apptScLjoccF9pCvY
Vision Admin V2                                appAquMtznlUgsPBw   ← assumed live
Vision Admin V2 Pre-Test - 2026-07-28          appJkYG9NBOlc0hiu
Vision Admin V2 — Step 6 UAT — 2026-08-05      appIU3t9XzwZzcmdv
Vision Admin V2 (Jah Copy)                     appEobvB14kpW8hHw
```

Confirm V2 is the one with your real current data. If it is actually the Jah Copy
or the UAT base, tell me and everything below still applies — only the base ID
changes.

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
