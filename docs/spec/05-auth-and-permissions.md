# 05 — Auth and Permissions

Login, roles, and exactly what each role may see and touch.

---

## The requirement

> Justin and Joshua are co-owners and see everything. Other admins run the day-to-day but must not
> see or touch tutor pay.

Two roles, one hard boundary: **money paid to tutors**.

Everything else — students, families, enrolments, packages, lessons, the roll, and money *in* from
families — is shared. Only pay *out* is restricted.

---

## Roles

| Role | Who | Sees |
|---|---|---|
| `owner` | Justin, Joshua | Everything, including tutor rates, per-lesson pay and payouts |
| `admin` | Other office staff | Everything except anything about what tutors are paid |

Deliberately only two. A third role is a permissions matrix nobody maintains. Add one when a real
need appears, not in anticipation.

---

## How login works

Supabase Auth handles credentials. The app never stores passwords.

1. Email + password sign-in against `auth.users`.
2. On success, read the matching `public.staff` row by `user_id`.
3. **No `staff` row, or `is_active = false` → sign the user out and show "no access".**
   An `auth.users` row on its own grants nothing.
4. Load `role` into app state and use it for UI gating.

**Owners invite staff**; there is no public sign-up. Disable it in the Supabase dashboard.
Creating a staff member is: invite via Supabase Auth, then insert the `staff` row with a role.

Deactivating someone is `is_active = false` — never delete the row, or you lose the audit trail on
`session_pay_adjustments.created_by`.

### The staff table
```sql
staff (user_id → auth.users, full_name, email, role, is_active, created_at, updated_at)
```

---

## Enforcement: three layers, and only one that counts

**1. Database (RLS) — the real boundary.** Everything else is convenience.

Two helper functions, both `security definer` so they can read `staff` without recursing through
its own policy:

```sql
is_staff()  -- an active staff member
is_owner()  -- an active staff member whose role is 'owner'
```

Operational tables: `using (is_staff())`.
Pay tables: `using (is_owner())`.

The pay-restricted tables are:

- `tutor_pay_rates`
- `session_pay_adjustments`
- `tutor_payouts`

Notice what is **not** on that list: `tutors` and `sessions` are readable by all staff. That is why
rates were pulled out into their own table rather than left as a column — RLS filters rows, not
columns, so anything sensitive must live in its own table to be hidden at all.

**2. Views inherit the caller's rights.** All views are `security_invoker = true`. For an admin,
`v_session_pay` returns rows with a null rate and zero pay, because the underlying rate table
returns nothing. No leak, but also no error.

**3. UI gating.** Hide the Tutor Pay screen from non-owners. This is cosmetic. Never treat it as
security — the API is still there.

> **If you want an admin to be refused rather than shown zeroes**, check the role in the API layer
> and return 403. Empty results are safe but confusing; an explicit refusal is kinder.

---

## Permission matrix

| Area | owner | admin |
|---|---|---|
| Students, guardians | full | full |
| Tutors (contact details, colour) | full | full |
| **Tutor pay rates** | full | **none** |
| Terms, programs, prices | full | full |
| Classes, lessons, timetable | full | full |
| Roll and attendance | full | full |
| Enrolments, hours packages | full | full |
| Charges, invoicing, payments | full | full |
| **Per-lesson pay adjustments** | full | **none** |
| **Tutor payouts** | full | **none** |
| Staff management | full | read only |
| App settings | full | read only |

---

## Testing it properly

Do not sign off on this by looking at the UI. Write tests that hit the database as each role:

```sql
-- as an admin
select count(*) from tutor_payouts;      -- expect 0 rows, not an error
insert into tutor_pay_rates (...);       -- expect a policy violation
select pay from v_session_pay limit 1;   -- expect 0 / null rate

-- as an owner
select count(*) from tutor_payouts;      -- expect the real count
```

RLS failures are silent by design — a policy that blocks a read returns no rows rather than an
error. A test that only checks "did it error" will pass while leaking. **Assert on row counts.**

---

## Things that will bite you

- **Table owners bypass RLS.** In Supabase the `postgres` role and the service key ignore policies
  entirely. Server-side code using the service key sees everything. Use the anon/authenticated key
  for anything acting on behalf of a user, and keep the service key out of the browser.
- **A staff row with no matching `auth.users` row** is dead weight and will confuse the login
  check. The foreign key cascades on delete, which handles the normal case.
- **Changing someone's role** takes effect on their next request; there is no session to refresh,
  but a cached client-side role will be stale. Re-read `staff` on app focus.
- **`security_invoker` needs Postgres 15+.** Supabase is fine. On older Postgres, views run as
  their owner and the pay views would leak to everyone.

---

## If you add tutor logins later

The schema is shaped for it but it is not built. You would need:

1. `staff.tutor_id → tutors.id`, and a `tutor` value in `staff_role`.
2. RLS on `sessions` and `attendance` filtered to their own lessons.
3. A rule for whether a tutor sees their own pay — probably yes for payouts, no for other tutors'.
4. A separate, much smaller UI. Do not give tutors the admin app.

Do this as a deliberate project, not as an extra role bolted onto the existing policies.
