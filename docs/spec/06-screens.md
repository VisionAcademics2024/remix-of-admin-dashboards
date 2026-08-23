# 06 — Screens

The fourteen screens of the existing system, what each is for, and what it reads and writes.
Screens are named after **jobs**, not tables — keep that.

Routes are suggestions. Layout and styling are yours; see `08-CUSTOMISE-ME.md`.

---

## Navigation order

Daily use first, setup last.

```
Today · Timetable · Roll · Class Builder · Make-Ups · Classes
Students & Families · Enrolments & Hours · Billing
Needs Attention · Tutor Pay (owners only) · Setup · Staff (owners only)
```

---

## 1. Today — `/`

The page an admin keeps open all day. Four questions: who needs marking, what is on, who is
running out of hours, what is ready to invoice.

**Reads** `v_attendance` (today, unmarked), `v_sessions` (today), `v_hours_packages` (low),
uncharged PAYG count.
**Writes** `attendance.status`.

Sections: still-to-mark count and list · today's timetable · low-balance students · charges waiting.

*Done looks like:* still-to-mark reads zero.

---

## 2. Timetable — `/timetable`

The week, coloured by tutor. Where lessons get moved, retutored, cancelled or added.

**Reads** `v_sessions` for the week, `tutors` for colours.
**Writes** `sessions` — times, tutor, room, status; insert one-off lessons.

Must have: week navigation, filter by tutor and class, drag or edit to change times.

*Trap to design against:* make **cancel** obvious and **delete** buried. Deleting a lesson cascades
its roll; cancelling preserves it.

---

## 3. Roll — `/roll`

The full attendance record. The corrections and history screen.

**Reads** `v_attendance` with student, lesson, class, tutor.
**Writes** `attendance` — status, package, correction note, make-up links.

Saved filters: Today · Unmarked · This week · Absences owed a make-up · Make-ups booked · Trials · All.

Every filter must compute "today" in Sydney. Use `v_attendance.session_date`, never a raw
timestamp comparison.

---

## 4. Class Builder — `/classes/new`

A guided four-step build. Each step clears itself when complete.

1. **Create the class** — program, term, tutor, capacity, dates, recurrence, duration.
2. **Add enrolments** — student, dates, billing method, price.
3. **Generate lessons** — one action, idempotent.
4. **Seed the roll** — automatic, with a manual re-run available.

Steps 2 and 3 are order-independent here, unlike the old system. Say so in the UI; staff have been
trained to fear it.

---

## 5. Make-Ups — `/make-ups`

**Reads** `v_attendance` grouped by `make_up_state`.
**Writes** `attendance` — create make-up rows, mark them present.

Sections: outstanding absences · make-ups booked · make-ups to mark.

---

## 6. Classes — `/classes`

The class list for maintenance: capacity vs enrolled, close a class, look up a term.

**Reads** `class_offerings` with enrolment counts.
**Writes** `class_offerings`.

---

## 7. Students & Families — `/students`

**Reads** `students`, `guardians`, `student_guardians`.
**Writes** all three.

Creating a student must be as fast as typing a name. Guardian linking needs an obvious distinction
between "attach an existing person" and "create a new one" — conflating those corrupted records in
the old system.

---

## 8. Enrolments & Hours — `/enrolments`

The commercial view: every enrolment with its agreed price, every package with its balance.

**Reads** `v_enrolments`, `v_hours_packages`.
**Writes** `enrolments`, `hours_packages`, `package_eligibility`.

**`package_eligibility` needs a first-class UI.** It is the most misunderstood relationship in the
system — a student in two classes needs both enrolments ticked or their roll will not validate.
Do not bury it.

---

## 9. Billing — `/billing`

Money in, as a pipeline.

**Reads** uncharged PAYG attendance, `v_charges` by status.
**Writes** `charges`.

Sections: to charge → to invoice → unpaid → received → history.

Enforce one charge per lesson in the UI as well as the database. Offer "bill these together" that
raises separate charges sharing one `xero_invoice_no`.

---

## 10. Needs Attention — `/needs-attention`

One query, `v_needs_attention`, grouped by entity. Each row links to the record that fixes it.

Empty is the goal. Nothing else on this screen.

---

## 11. Tutor Pay — `/tutor-pay` *(owners only)*

**Reads** `v_tutor_fortnight_pay`, `v_session_pay`, `tutor_pay_rates`, `tutor_payouts`.
**Writes** `session_pay_adjustments`, `tutor_pay_rates`, `tutor_payouts`.

Three sections:

1. **Hours and pay** — grouped by fortnight then tutor, with totals. Tabs for this / last / next
   fortnight. Adjustments editable inline with a mandatory note.
2. **Rates** — current rate per tutor, with history.
3. **Payouts** — one row per tutor per fortnight; copy the total across, mark paid.

Hide from the nav entirely for non-owners.

---

## 12. Setup — `/setup`

Terms, programs, prices, tutors. Slow-changing, high-consequence.

**Writes** `operating_periods`, `programs`, `standard_prices`, `tutors`.

Prices are versioned: the UI should offer "supersede this price", creating a new row and closing
the old, rather than an edit field.

---

## 13. Staff — `/staff` *(owners only)*

Invite, deactivate, set roles.

---

## 14. Student Detail — `/students/:id`

Everything about one student on one page: family, enrolments, packages with balances, attendance
history, charges. This is the screen you open when a parent rings, and the old system did not
have it. Build it.

---

## Cross-cutting UI rules

- **Sydney everywhere.** Format every date and time in `Australia/Sydney`, explicitly.
- **Never round for display in a way that hides a value.** 1.5 hours shows as 1.5. Money shows
  cents.
- **Exception counts belong in the nav.** A badge on Needs Attention beats a screen nobody visits.
- **Confirm destructive actions**, and prefer cancel over delete wherever both exist.
- **Empty states should say what to do next**, not just "no records".
