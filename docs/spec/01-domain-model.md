# 01 — Domain Model

What the business actually does, and how the records reflect it. Read this before the schema.

---

## The business in one paragraph

Vision Academics runs tutoring. Programs (e.g. "Year 5 Private") are taught in dated,
tutored instances called **class offerings**, each belonging to a **term**. Students **enrol**
in a class offering. Each class offering generates weekly **lessons**. Each lesson has a **roll**
with one row per enrolled student. Families pay one of two ways: buying a **package of hours**
up front and drawing it down, or **pay as you go** per lesson attended. Money owed becomes a
**charge**. Tutors are paid fortnightly for the hours they taught.

---

## The chain

Everything flows one direction. If a link is missing, everything downstream stalls.

```
guardian
  └── student
        └── enrolment ─────────────┐         (student × class offering)
              │                    │
              │                    └── hours_package   (optional; only if paying by hours)
              │
class_offering ──── session ──── attendance ──── charge
   (the class)     (a lesson)    (a roll entry)   (money owed)
        │
        ├── program          (what is taught)
        ├── operating_period (which term)
        └── tutor            (who teaches it, by default)
```

Two things are easy to get wrong:

- **An enrolment belongs to a student *and* a class offering.** It is the join, and it carries the
  commercial terms. One student in two classes has two enrolments.
- **A lesson's tutor is on the lesson, not the class.** The class has a *default* tutor. Any single
  lesson can be taught by someone else — that is how cover works, and it is what tutor pay counts.

---

## The entities

### Guardian
A parent or payer. One guardian can cover several students, which is how siblings work.
Guardians are not users of the system; they never log in.

### Student
A child. Has many guardians, and exactly **one default payer** who must also be one of their
guardians. That constraint exists because charges need an unambiguous person to bill.

### Tutor
A teacher. Has an hourly pay rate, which is **commercially sensitive** and isolated accordingly —
see `05-auth-and-permissions.md`.

### Operating period
A term or holiday intensive. Has start and end dates. Every class belongs to one. This is what
makes "Term 3" a real thing you can filter by rather than a naming convention.

### Program
The reusable catalogue: what is taught, at what year level, for how long a session normally runs.
Programs do not have dates or tutors. "Year 5 Private" is a program.

### Standard price
The price list, versioned by effective dates. Three pricing bases:

| Basis | Means | Quantity field means |
|---|---|---|
| `per_hour` | A rate per teaching hour | Nothing useful — the buyer chooses how many hours |
| `per_session` | A rate per lesson | Number of sessions in the standard block |
| `fixed_hours_price` | One price for a block of hours | Number of hours in the block |

**This distinction causes more mistakes than anything else in the system.** A `per_hour` price
carries a catalogue quantity of one hour, so an enrolment using one *must* state how many hours
are actually being bought, or the system will sell them a single hour for a whole term.

### Class offering
A dated, tutored instance of a program inside a term. "Year 5 Private, Term 3, Wednesdays 5:30pm,
Alice Park." Carries capacity, a recurrence rule, and the default session duration.

Private tuition should always have capacity 1.

### Enrolment
One student in one class offering, for a date range. Carries:

- **Status** — trial, active or closed
- **Billing method** — hours or PAYG
- **Frozen commercial terms** — the agreed price at the moment of enrolling, copied not referenced
- **Which package** hours should be drawn from by default

A trial enrolment needs no billing method and consumes no hours.

### Hours package
A block of hours a family has bought. Belongs to one student. Critically, it lists **which
enrolments it may be spent on** — a student in two classes can have one package covering both, or
separate packages per class. Balance is purchased minus consumed, always computed, never stored.

Two types: `purchased` (has a price) and `courtesy` (free, must have a reason recorded).

### Session
One lesson on one date. Has a scheduled start and end — duration is derived from those, not typed.
Carries its own tutor and room, so both can differ from the class default for a single lesson.

Statuses: `scheduled`, `completed`, `cancelled` and `rescheduled`. Cancelled and rescheduled
lessons pay nobody and consume nothing.

### Attendance
One student's outcome for one lesson. The unit of both hour consumption and PAYG billing.

Three types:
- `regular` — an ordinary roll entry
- `trial` — a trial student; attends and is marked, but never consumes hours
- `make_up` — replaces a specific earlier absence, which it links back to

Statuses: `not_marked`, `present`, `absent`.

**Marking a student present is the act that spends their money.** Nothing else does.

### Charge
An amount owed. Has exactly **one** source: either an hours package, or a single attendance record.
Never both, never two of either. That constraint is what prevents the same lesson being billed
twice, and the schema enforces it rather than trusting a formula.

Routed to a parent, or internally (cash/bank).

### Tutor payout
What a tutor was paid for one fortnight. Freezes the hours and the rate at the moment of payment,
so a later pay rise cannot reprice history.

---

## The two billing methods

This is the single most important distinction in the system.

### Hours

1. Family buys a block of hours. One `hours_package` is created.
2. One charge is raised against the package — that is the invoice.
3. From then on, money and lessons are **decoupled**. Attending a lesson draws down the balance.
4. Nothing further is invoiced until they buy more hours.

Balance = purchased − sum of hours consumed by present, non-trial attendance on non-cancelled
lessons.

### PAYG

1. Nothing bought in advance. No package.
2. Every attended lesson becomes **its own charge**.
3. One charge, one lesson, always.

A PAYG roll entry has no package linked, which is normal and should never be flagged.

---

## Make-ups

A student misses a lesson → their roll entry is marked `absent` → it is **owed a make-up**.

A make-up is a new attendance row on a *different* lesson, linked back to the absence via
`source_attendance_id`. Its state is derived, not stored:

- **Outstanding** — an absence with no make-up attached
- **Scheduled** — a make-up exists but has not happened
- **Completed** — a linked make-up has been marked present

A make-up consumes hours exactly like a normal lesson. It is not free unless you make it courtesy.

Make-ups are for **students who missed a lesson**. They are not the mechanism for a tutor swap or
a rescheduled class — both of those are edits to the lesson itself.

---

## Tutor pay

Pay is computed from **lessons**, not enrolments. A lesson pays its tutor
`payable_hours × their rate`, where payable hours is the scheduled duration unless the lesson was
cancelled or rescheduled, in which case it is zero.

Fortnights run **Monday to Sunday, two weeks**, anchored to a fixed date so the boundaries never
drift. The anchor is configurable; the current system uses **Monday 3 August 2026**.

Adjustments exist at two levels:
- **Per lesson** — a class ran long, or a bonus is being carried. Flows into the fortnight total.
- **Per payout** — a correction applied when the payment is actually recorded.

Every adjustment requires a written reason. This is enforced, not encouraged.

---

## Vocabulary that trips people up

| People say | System means |
|---|---|
| "Enrolment" | A row in `enrolments` — a student in a class, with prices |
| "Package" | A row in `hours_packages` |
| "The roll" | The set of `attendance` rows for one lesson |
| "Marking the roll" | Setting attendance status |
| "The class" | A `class_offering`, not a `program` |
| "A lesson" | A `session` |
| "Billing" | Ambiguous — ask whether they mean enrolling someone or invoicing them |
