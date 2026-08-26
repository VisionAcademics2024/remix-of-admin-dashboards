# 04 — Business Logic

Every rule the system enforces, and where it belongs. Written so a coding agent can implement
without needing to see the Airtable original.

---

## 1. Hour consumption

**One rule.** A roll entry consumes hours when **all** of these hold:

- `attendance.status = 'present'`
- `attendance.att_type <> 'trial'`
- the lesson's `status <> 'cancelled'`

The amount consumed is the lesson's **scheduled duration**, not a typed figure.

Everything follows from that. Un-marking a student refunds the hours automatically because the
balance is a view, not a stored number. Cancelling a lesson refunds everyone on it.

Balance = `hours_purchased − sum(hours consumed by attendance linked to that package)`.

**PAYG roll entries have no package and consume nothing.** This is normal and must never be
flagged as an error — it was a recurring false alarm in the old system.

---

## 2. Which package pays for a lesson

When a roll entry is created for an hours enrolment, attach `enrolments.default_package_id`.

Two guards, both enforced by the `check_package_eligible` trigger:

1. The package must belong to the **same student** as the enrolment.
2. The enrolment must be listed in **`package_eligibility`** for that package.

If either fails the write is rejected. Do not let the app work around this.

---

## 3. Money in

### Hours students
1. Family buys hours → one `hours_packages` row.
2. One charge, `source = 'hours'`, pointing at that package. That is the invoice.
3. Attendance draws the balance down. **Nothing else is ever invoiced** until they buy more.

### PAYG students
1. No package.
2. Every attended lesson becomes one charge, `source = 'payg'`, pointing at that one attendance.

The partial unique index on `charges.attendance_id` makes double-billing a lesson impossible.

### Amounts
`final_amount = standard_amount + adjustment`. Discounts are **negative adjustments**; never edit
`standard_amount`, which is the frozen source figure.

### The invoice queue
"Taught but not charged" is:

```sql
select * from v_attendance a
where a.billing_method = 'payg' and a.status = 'present'
  and not exists (select 1 from charges c where c.attendance_id = a.id);
```

To bill several PAYG lessons on one document, raise one charge each and put the same
`xero_invoice_no` on all of them. One charge per lesson is what keeps the audit trail.

---

## 4. Tutor pay

### Payable hours
A lesson's payable hours = its scheduled duration, **unless** status is `cancelled` or
`rescheduled`, in which case zero. A rescheduled lesson pays through its replacement.

### Rate
The rate in force **on the date of the lesson** — the latest `tutor_pay_rates` row with
`effective_from <= session_date`. This is why rate history matters: repricing a past fortnight
because someone got a raise is a bug, not a feature.

### Pay per lesson
```
pay = payable_hours × rate + sum(session_pay_adjustments.amount)
```
Adjustments may be negative and always require a note.

### Fortnights
Monday to Sunday, two weeks, anchored to a fixed Monday (default **2026-08-03**, stored in
`app_settings.fortnight_anchor`).

```sql
fortnight_start(d) = anchor + floor((d - anchor) / 14) * 14
```

`floor` — not truncation — so dates before the anchor bucket correctly. Never compute fortnights
by counting from "today"; the boundaries must be absolute or they drift.

### Payout
Copy hours and rate onto `tutor_payouts` at the moment of payment. From then on that row is a
historical record and does not track later edits.

```
total = (hours_worked + hours_adjustment) × rate_at_payout + amount_adjustment
```

---

## 5. Make-ups

A make-up is an `attendance` row with `att_type = 'make_up'` and `source_attendance_id` pointing
at the absence it settles.

State is derived, never stored:

| State | Condition |
|---|---|
| Outstanding | absent, no linked make-up exists |
| Scheduled | a linked make-up exists but is not present |
| Completed | a linked make-up is present |

A make-up consumes hours like any other lesson. Make-ups are for **students who missed a lesson** —
not for tutor swaps and not for rescheduled classes.

---

## 6. Generating lessons from a recurrence

Input: a class offering with `recurrence`, `recurrence_start`, `starts_on`, `ends_on`,
`session_duration_hours`.

```
step = weekly ? 7 : fortnightly ? 14 : daily ? 1 : none
```

`one_off` and `ad_hoc` generate nothing — those lessons are added by hand.

Walk from `recurrence_start` in **Sydney local time**, adding `step` days, until you pass
`ends_on`. For each date:

- build the start instant from the Sydney wall-clock time of `recurrence_start`, so a 5:30pm class
  stays 5:30pm across the daylight-saving change — **do not add 7×24 hours to a UTC timestamp**
- `ends_at = starts_at + session_duration_hours`
- insert; the partial unique index on `(class_offering_id, starts_at) where session_type =
  'regular'` makes re-running safe

**Make generation idempotent.** Re-running must never create duplicates. The index guarantees it;
use `on conflict do nothing` against that same partial target. Uniqueness applies to regular
lessons only, so a deliberate `dedicated_make_up` lesson may share a slot with the ordinary one.

### Changing lesson times
Move the affected lesson **in place** — one canonical operation updates `starts_at`/`ends_at` on the
same row. Do **not** delete and regenerate: that orphans the roll and loses attendance marks. The
first move records `original_starts_at`/`original_ends_at`; later moves keep that first memory.

Moving is refused when the lesson has already started or passed, or when any roll entry is marked.
Those lessons are cancelled instead, which preserves the history.

---

## 7. Seeding the roll

For a lesson with no attendance rows, insert one row per enrolment that:

- belongs to the same `class_offering_id`
- has status `active` or `trial`
- has `starts_on <= session_date` and (`ends_on is null` or `ends_on >= session_date`)

Set `status = 'not_marked'`, `att_type = 'trial'` for trial enrolments else `'regular'`, and
`package_id = enrolments.default_package_id`.

Make it an idempotent function callable at any time:

```sql
select seed_roll(session_id);        -- one lesson
select seed_roll_for_offering(id);   -- a whole class
```

**Ordering stops mattering.** In Airtable, generating lessons before enrolling students left the
roll permanently empty because the automation only fired once. Here you enrol whenever you like
and re-run the seed. Build this as a function called on enrolment creation *and* exposed as a
manual action.

---

## 8. Validation

Every rule lives in `v_needs_attention`, which returns `(entity, id, code, issue)`.

Current rules:

| Entity | Issue |
|---|---|
| session | Scheduled lesson with no tutor |
| attendance | Present on an hours enrolment with no package linked |
| attendance | Lesson has passed and the roll is still unmarked |
| attendance | PAYG lesson attended but not charged |
| student | Active student with no default payer |
| enrolment | Active hours enrolment with no default package |
| enrolment | Non-trial enrolment with no agreed price |
| hours_package | Balance at or below the low threshold |
| hours_package | Overdrawn |

Add rules by adding `union all` branches. Keep the four-column shape so one screen renders them all.

Anything expressible as a `check` constraint should be a constraint instead — constraints prevent,
views only report.

---

## 9. Timezone rules

**Store** every instant as `timestamptz` (UTC). **Reason** about every calendar question in
`Australia/Sydney`.

```sql
syd_date(ts) = (ts at time zone 'Australia/Sydney')::date
```

Any question of the form "is this today / this week / this fortnight" converts first. The old
system's Today screen showed tomorrow's 8am lessons because a rollup defaulted to GMT — at 6pm
Sydney it is still the same morning in UTC, so GMT's "today" ran ten hours into the Sydney
tomorrow. Converting explicitly is the whole fix.

Daylight saving: Sydney is UTC+10, or UTC+11 from the first Sunday in October to the first Sunday
in April. Never do date arithmetic on UTC timestamps and assume the wall clock holds.

---

## 10. Rounding and display

- Money is `numeric(12,2)`. Round only at the point of writing a monetary column.
- Hours are `numeric(6,2)`. A 1.5 hour lesson is 1.5, never 2.
- **Never round for storage to make a display look neat.** The old system displayed 1.5 hour
  lessons as "2" because a field was set to zero decimals; the maths was right and the screen
  lied. Formatting is a front-end concern.

---

## 11. Deletion rules

| Record | Rule |
|---|---|
| Class offering | Set status `closed` or `cancelled`. Delete only if it has no enrolments and no lessons. |
| Session | Set status `cancelled`. Deletion is refused outright once the lesson has a roll — attendance is never deleted to make room for it, and there is no force option. A lesson with no roll at all may be deleted. |
| Enrolment | Set `ends_on`, status `closed`, and a closure reason. `on delete restrict` from attendance blocks deletion once there is history. |
| Hours package | Status `closed` or `expired`. |
| Charge | Status `cancelled`. Never delete a charge that was invoiced. |
| Student / guardian | Status `inactive`. |

The foreign keys enforce this: `attendance.enrolment_id` is `on delete restrict`, so you cannot
delete an enrolment with history. `attendance.session_id` is `on delete cascade` because a roll
entry has no meaning without its lesson — which is precisely why you cancel rather than delete.
