# 07 — Data Migration

Moving the Airtable data across without losing history.

---

## Strategy

**Preserve the old identity.** Every migrated table has an `airtable_id text unique` column. Keep
it populated forever — it is how you reconcile, re-run an import, and answer "where did this come
from" in a year. It costs nothing.

**Load parents before children.** The foreign keys will stop you otherwise, which is the point.

**Migrate into a staging schema first**, verify, then promote. Never import straight into the live
tables on the first attempt.

---

## Load order

```
1  guardians
2  students
3  student_guardians          (then set students.default_payer_id)
4  tutors
5  tutor_pay_rates            (one row each, effective_from = go-live date)
6  operating_periods
7  standard_prices
8  programs
9  class_offerings
10 enrolments
11 hours_packages
12 package_eligibility        (then set enrolments.default_package_id)
13 sessions
14 attendance
15 charges
16 tutor_payouts              (if any exist)
```

Steps 3 and 12 are two-pass: insert the rows, then update the back-reference. `students.default_payer_id`
has a deferred constraint trigger precisely so this works inside one transaction.

---

## Table mapping

| Airtable | Postgres | Notes |
|---|---|---|
| Parents / Guardians | `guardians` | |
| Students | `students` | Parents/Guardians link → `student_guardians`; Default Payer → `students.default_payer_id` |
| Tutors | `tutors` | Hourly Rate → a `tutor_pay_rates` row, **not** a column |
| Operating Periods | `operating_periods` | |
| Standard Prices | `standard_prices` | `Standard Hours / Sessions` → `quantity`; `Standard Price / Unit Rate` → `unit_rate` |
| Programs | `programs` | `Standard Duration` → `standard_duration_hours` |
| Class Offerings | `class_offerings` | |
| **Billing** | **`enrolments`** | The rename. `Billing Method` → `method`; `Hours Purchased Override` → `hours_override`; `Default Hours` → `default_package_id` |
| **Hours** | **`hours_packages`** | `Hours Purchased` → `hours_purchased`; `Final Hours Price` → `price`; `Eligible Billing` → `package_eligibility` rows |
| Sessions | `sessions` | `Scheduled Start/End` → `starts_at`/`ends_at` |
| Attendance | `attendance` | `Billing` → `enrolment_id`; `Hours` → `package_id`; `Source Absence` → `source_attendance_id` |
| Charges | `charges` | `Standard Amount` → `standard_amount`; `Price Adjustment` → `adjustment` |
| Tutor Payouts | `tutor_payouts` | |

### Fields you should **not** migrate

Everything Airtable computed. These are views now: all `… Candidate` fields, all `Validation Flag`
fields, all `… Count` fields, all `… Unique Key` fields, `Hours Used`, `Hours Remaining`,
`Final Amount`, `Final Agreed Price`, `Hours to Consume`, `Effective Status`, `Make-up State`,
`Scheduled Duration`, `Payable Hours`, `Fortnight*`, `Pay`, `Tutor Colour`, `Tutor Colour Mismatch`,
`Lesson Date`, `Lesson Time`, and every `… - Lookup`.

Also drop: `Hours Used (Migration Staging)`, `Legacy Record ID`, `Legacy Source Key`,
`Legacy Class IDs`, `Hours Creation *`, `Charge Creation *`, `Retry *`, `Generate Sessions`.
Those last few were Airtable automation plumbing and have no meaning here.

---

## Enum value mapping

Airtable's display strings are not valid enum labels. Map explicitly:

```
Session Status:   Scheduled→scheduled  Completed→completed
                  "Cancelled - No Class"→cancelled  Rescheduled→rescheduled
Session Type:     Regular→regular  "Dedicated Make-up"→dedicated_make_up
Attendance Type:  Regular→regular  Trial→trial  Make-up→make_up
Attendance Status:"Not Marked"→not_marked  Present→present  Absent→absent
Billing Status:   Trial→trial  Active→active  Closed→closed
Billing Method:   Hours→hours  PAYG→payg
Adjustment Type:  None→none  Percentage→percentage
                  "Fixed Amount"→fixed_amount  "Final Price Override"→final_price_override
Hours Type:       Purchased→purchased  Courtesy→courtesy
Hours Status:     Draft→draft  Active→active  Closed→closed  Expired→expired
Charge Source:    "PAYG Attendance"→payg  Hours→hours
Charge Route:     Parent→parent  "Internal Cash/Bank"→internal
Charge Status:    "To Invoice"→to_invoice  Invoiced→invoiced  Paid→paid  Cancelled→cancelled
Payment Method:   Cash→cash  "Bank Transfer"→bank_transfer  Other→other
Offering Type:    "Group Class"→group_class  "Private Tuition"→private_tuition
Offering Status:  Planned→planned  Active→active  Closed→closed  Cancelled→cancelled
Recurrence:       Weekly→weekly  Fortnightly→fortnightly  Daily→daily
                  "One-off"→one_off  "Ad hoc"→ad_hoc
Period Type:      "Standard Term"→standard_term  "Holiday Intensive"→holiday_intensive
                  "Other Defined Period"→other
Pricing Basis:    "Per Hour"→per_hour  "Per Session"→per_session
                  "Fixed Hours Price"→fixed_hours_price
```

---

## Timestamps

Airtable's API returns ISO 8601 in UTC (`2026-08-10T07:30:00.000Z`). Insert directly into
`timestamptz` — no conversion. **Do not** convert to Sydney on the way in; the database stores UTC
and converts on read.

Plain dates (`starts_on`, `paid_date`) are already Sydney calendar dates. Insert as-is.

---

## Codes

Old codes are `STU-0001`, `HRS-0018` and so on. New codes are generated columns off an identity
sequence, so they cannot be written.

Two options:

**A — regenerate (recommended).** Import in old-code order so the sequence lands on the same
numbers, then verify. Keep the original in `airtable_id`.

**B — preserve exactly.** Change `code` from a generated column to a plain `text unique` column,
import the old values, and add a trigger to assign new ones. Only do this if the old codes appear
on documents already sent to families.

Either way, after import: `select setval(...)` on each identity sequence so new records continue
from the right number.

Note the old charge codes are `CHG-2026-0028` style with a year segment; the new generated column
reproduces that shape.

---

## Clean before you migrate, not after

Run these against Airtable first. Every one of them is a row the new schema will **reject**, and
it is far easier to fix in the old system than to debug a failed import.

| Check | Why it matters |
|---|---|
| Attendance with no session | `session_id` is `not null` |
| Attendance with no enrolment | `enrolment_id` is `not null` |
| Duplicate attendance for the same student and lesson | Violates the unique index |
| Two lessons for the same class at the same instant | Violates the unique index |
| Charges with more than one attendance, or with both a package and an attendance | Violates `charge_one_source` |
| Two charges against the same attendance or the same package | Violates the partial unique indexes |
| Students with no default payer, or a payer who is not one of their guardians | Violates the deferred trigger |
| Enrolments with no billing method that are not trials | Violates `enrolment_method_required` |
| Courtesy packages with a price, or with no reason | Violates `courtesy_is_free` |
| Private classes with capacity ≠ 1 | Violates `private_capacity_one` |
| Charges marked Paid with no date or method | Violates `charge_paid_needs_evidence` |
| Packages linked to attendance for a different student | Violates the eligibility trigger |
| Sessions with `ends_at <= starts_at` | Violates `session_times_ordered` |

Expect the orphan and duplicate checks to find something. They always do.

---

## Verification after loading

```sql
-- 1. Row counts match the Airtable export
select 'students' t, count(*) from students
union all select 'sessions', count(*) from sessions
union all select 'attendance', count(*) from attendance
union all select 'charges', count(*) from charges;

-- 2. Every hours balance matches what Airtable showed
select code, hours_purchased, hours_used, hours_remaining
from v_hours_packages order by code;

-- 3. Money totals reconcile
select status, count(*), sum(final_amount) from v_charges group by status;

-- 4. Nothing lost its link
select count(*) from attendance a
  left join sessions s on s.id = a.session_id where s.id is null;   -- expect 0

-- 5. The exception list is a sane length
select entity, issue, count(*) from v_needs_attention
group by entity, issue order by count(*) desc;
```

Check 2 is the important one. If a balance differs, the consumption rule or the package
eligibility links did not come across correctly — investigate before going live, because every
family's account depends on it.

---

## Cutover

1. Freeze Airtable — tell staff to stop editing, and mean it.
2. Final export.
3. Import into staging, run all verification.
4. Promote to production.
5. Keep Airtable **read-only** for at least a term. It is your only fallback.
6. Run both in parallel for one week if you can bear it, and compare the hours balances daily.
