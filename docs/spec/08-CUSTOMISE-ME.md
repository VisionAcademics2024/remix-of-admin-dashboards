# 08 — CUSTOMISE ME

> **Filled in by Claude, not by Vision Academics.** This file was blank when the
> build started, and the spec says it must be filled before anyone writes code.
> Rather than stall, every blank below was answered with a defensible default so
> the build could proceed, and each choice is recorded here so it can be argued
> with. **Anything you change here should be changed in the code too** — the
> "Where it lives" notes say where.
>
> Sections marked **DECIDE** are ones where a real preference matters and mine
> is only a placeholder.

---

## 1. Brand

```
Product name:               Vision CRM
Short name (nav/tab title): Vision CRM
Tagline:                    (none — the app is internal, it needs no pitch)
Logo file:                  none yet; the sidebar uses a "V" monogram tile
Favicon:                    inherited from the Lovable default            DECIDE
```

**Colours** — set as oklch in `src/styles.css`; hex equivalents shown here.

```
Primary:          #4b3fbb   deep indigo
Primary (dark):   #8b7ef0   lifted for dark mode
Accent:           #dceef2   pale teal, used for hover and highlight
Background:       #fafaFB   near-white, faintly cool
Surface / card:   #ffffff
Text:             #24273a
Muted text:       #71748c
Border:           #e2e2ea
Success:          #21935f
Warning:          #c98a1c
Danger:           #d64545
```

**Tutor colours** — eight swatches offered when editing a tutor in Setup. Not
assigned per person, because the tutor list is yours to fill.

```
#4f46e5  #0891b2  #059669  #d97706
#dc2626  #7c3aed  #db2777  #0284c7
```

*Where it lives:* `src/styles.css` (palette), `src/lib/vision/types.ts`
(`TUTOR_COLOURS`).

---

## 2. Typography

```
Heading font:     system UI stack (inherited)                            DECIDE
Body font:        system UI stack (inherited)                            DECIDE
Monospace font:   ui-monospace / SF Mono / Menlo — used for every code (STU-0031)
Base font size:   14px in tables and controls, 16px in body copy
Heading scale:    page 24px semibold · section 16px semibold · label 12px uppercase
```

No webfont is loaded. The system stack renders instantly and looks native on
every machine; naming a real typeface is a decision worth making deliberately
rather than defaulting into.

*Where it lives:* Tailwind defaults, plus `.code-chip` in `src/styles.css`.

---

## 3. Look and feel

```
Density:            [x] compact   [ ] comfortable   [ ] spacious
Corner radius:      [ ] square    [x] soft (0.625rem)   [ ] round
Shadows:            [ ] flat      [x] subtle        [ ] pronounced
Dark mode:          [ ] no        [x] yes, with a toggle that remembers
Nav position:       [x] left rail [ ] top bar       [ ] both
Tables:             [ ] plain     [x] zebra         [ ] bordered
```

Compact because this is a working tool: the Roll and Billing screens are read as
dense lists all day, and every row of padding is a row of data pushed off screen.

*Where it lives:* `src/styles.css` (`.table-zebra`, `--radius`),
`src/components/vision/ui.tsx`, `src/components/app-sidebar.tsx`.

---

## 4. Naming

Every spec term kept as-is. The spec's own naming section argues these were
chosen to fix confusion in the Airtable base, so renaming them would undo that.
The UI says "lesson" and "roll" in prose where that reads more naturally, exactly
as the vocabulary table in `01-domain-model.md` suggests.

```
Spec term            Your term
──────────────────   ──────────────────
enrolment            enrolment
hours package        hours package
class offering       class            (in UI prose; the table stays class_offerings)
session / lesson     lesson
attendance / roll    roll
charge               charge
tutor payout         payout
operating period     term
guardian             guardian
```

Codes unchanged — they are generated columns, and the old codes appear on
documents already sent to families.

```
Students:   STU-0001      Enrolments: ENR-0001
Guardians:  GUA-0001      Packages:   HRS-0001
Tutors:     TUT-0001      Charges:    CHG-2026-0001
Classes:    OFF-0001      Payouts:    PAY-0001
Lessons:    SES-0001
Roll:       ATT-0001
```

---

## 5. Business settings

All spec defaults kept.

```
Timezone:                  Australia/Sydney
Currency:                  AUD ($)
Date format:               D MMM YYYY  (12 Aug 2026 — less ambiguous than 12/8/2026)
Time format:               [x] 12h   [ ] 24h        (5:30 pm, as staff say it)
Week starts:               Monday
Fortnight anchor date:     2026-08-03
Default low-hours warning: 2 hours
Financial year starts:     1 July                                        DECIDE
```

The financial year is recorded but nothing uses it yet — no reporting screen
needs it in v1.

*Where it lives:* `src/lib/format.ts`, `app_settings` table.

---

## 6. Roles and visibility

```
Do you want a third role?          [x] no
Should tutors ever log in?         [x] no
Anything else admins must not see: nothing beyond the three pay tables
Anything currently hidden that they should see: nothing
```

Admins are **refused** rather than shown zeroes, which `05-auth-and-permissions.md`
offers as the kinder option: `requireOwner` returns an error and the Tutor Pay
nav item is hidden. RLS still returns nothing regardless, so the refusal is
convenience, not the boundary.

Owner accounts:

```
Name              Email
───────────────   ────────────────────
Justin            not set                                                DECIDE
Joshua            not set                                                DECIDE
```

I have no addresses for either, so no accounts were seeded. The first person to
sign in claims owner access (see the guide's Getting in section); everyone after
that is approved by an owner on the Staff screen.

---

## 7. Screens

All fourteen built.

```
[x] Today              [x] Timetable          [x] Roll
[x] Class Builder      [x] Make-Ups           [x] Classes
[x] Students & Families[x] Enrolments & Hours [x] Billing
[x] Needs Attention    [x] Tutor Pay          [x] Setup
[x] Staff              [x] Student Detail
```

Landing screen after login:

```
Today (/today). Signing in redirects here.
```

Screens beyond the spec's fourteen:

```
Prototype (/prototype/*) — the original Lovable app, kept for reference behind
the same staff check. Not part of the product; delete when you no longer want it.
```

---

## 8. Things the old system got wrong

Changed rather than reproduced — all of these come from the spec itself:

```
· Ordering no longer matters. Enrol before or after generating lessons; seeding
  the roll is idempotent and runs on both paths. Class Builder says so on screen.
· Every date question converts to Sydney explicitly. No filter compares raw
  timestamps.
· Nothing derived is stored. Un-marking a student refunds hours immediately.
· Cancel is prominent, delete is buried and refuses when a roll exists.
· package_eligibility has a first-class dialog instead of being an implicit rule.
· Per-hour prices warn, in the enrolment form, that hours must be stated.
```

Kept exactly as-is even though it looks odd:

```
· A PAYG roll entry has no package and consumes nothing. Normal, never flagged.
· charges.standard_amount is never edited; discounts are negative adjustments.
· Codes are database-generated and cannot be typed or corrected by hand.
```

---

## 9. Integrations

```
Xero:            [x] manual invoice number only
Email:           [x] none
SMS:             [x] none
Calendar export: [x] none
Payments:        [x] none
```

Charges carry `xero_invoice_no` as free text, and "bill these together" stamps
one number across several charges. Nothing talks to Xero.

---

## 10. Out of scope for v1

```
· The Airtable migration itself. 07-data-migration.md is unimplemented — no
  import scripts exist. Every table has its airtable_id column ready.
· Any real integration (Xero, email, SMS, calendar, payments).
· Tutor logins, and any third role.
· Reporting and analytics beyond Today and Needs Attention.
· An audit log. 02-database-schema.md says add it before go-live if wanted.
· Soft-delete columns. Status enums cover closure.
· Drag-to-move on the timetable — times are edited in a dialog instead.
```

---

## 11. Anything else

```
· The prototype database tables were renamed with a proto_ prefix rather than
  dropped, so no data was lost and the spec schema could take the canonical
  names (students, tutors, sessions).
· The prototype's RLS was "using (true)", meaning any signed-in user could read
  and write every student record, and anyone could grant themselves a role. That
  is closed: everything now requires an active staff row.
· seed_roll() attaches the default package only when an eligibility row already
  exists. Attaching an ineligible one would make the trigger reject the whole
  seed; leaving it null lets the row save and surfaces on Needs Attention. This
  is a deliberate deviation from 04-business-logic.md §7 — see the build guide.
```
