\pset pager off
set client_min_messages = notice;

\echo '--- TEST 17 (redone): the deferred payer trigger fires at COMMIT ---'
begin;
  update students set default_payer_id='a0000000-0000-0000-0000-000000000009'
   where id='b0000000-0000-0000-0000-000000000001';
  \echo '    (update accepted inside the transaction, as a deferred trigger should)'
commit;
