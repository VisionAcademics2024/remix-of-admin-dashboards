# Schema verification

These scripts prove the schema does what `docs/spec/04-business-logic.md` and
`05-auth-and-permissions.md` say it does. They run against a throwaway local
Postgres — never against a real database, since they insert and mutate data.

`00-supabase-stub.sql` stands in for the parts of Supabase the migrations touch
(`auth.users`, `auth.uid()`, the `anon`/`authenticated`/`service_role` roles).

## Running them

Postgres must not run as root, so use an unprivileged user:

```sh
export PATH=/usr/lib/postgresql/16/bin:$PATH
PGROOT=/var/tmp/visionpg
rm -rf "$PGROOT" && mkdir -p "$PGROOT/pgdata"
chown -R postgres:postgres "$PGROOT" && chmod 700 "$PGROOT/pgdata"

su postgres -c "initdb -D $PGROOT/pgdata -U postgres --auth=trust"
su postgres -c "pg_ctl -D $PGROOT/pgdata -o '-p 55432 -k $PGROOT -c listen_addresses=' -l $PGROOT/pg.log start"
su postgres -c "psql -h $PGROOT -p 55432 -U postgres -c 'create database vision'"

# Stub, then every migration in order, then every test in order.
for f in supabase/tests/00-supabase-stub.sql supabase/migrations/*.sql supabase/tests/0[1-5]-*.sql; do
  cp "$f" "$PGROOT/" && chown postgres:postgres "$PGROOT/$(basename $f)"
  su postgres -c "psql -h $PGROOT -p 55432 -U postgres -d vision -f $PGROOT/$(basename $f)"
done
```

The tests are ordered and stateful: `01` seeds the data the rest rely on.

## What each file checks

| File | Covers |
|---|---|
| `01-business-logic.sql` | Lesson generation across the daylight-saving change, generation and seeding idempotency, hour consumption and refund, cancellation refunds, rate-at-lesson-date pay, fortnight boundaries before and after the anchor |
| `02-constraints.sql` | One source per charge, no double billing, paid needs evidence, package eligibility, courtesy packages free, private capacity 1, billing method required, adjustments need reasons, derived make-up state |
| `03-deferred-trigger.sql` | The default payer must be a guardian — enforced at COMMIT, so it must be tested across a transaction boundary |
| `04-rls.sql` | An admin sees zero pay rows and zero pay; an owner sees the real figures; a signed-in user with no `staff` row sees nothing; an admin cannot write pay data |
| `05-prototype-lockdown.sql` | The prototype tables sit behind the same staff check, `bootstrap_first_owner()` is inert once staff exist, and the prototype's `pending` attendance value now saves |

## Expected result

Every `PASS:` notice appears, no `FAIL:` notice appears, and the printed tables
match the values described in the comments. Notices only show when
`client_min_messages` is `notice` or lower — the scripts set this themselves.
