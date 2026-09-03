-- =============================================================================
-- Billing: put invoice_id into v_charges.
--
-- The previous migration added charges.invoice_id, but the app reads charges
-- through v_charges, and that view was written as `select c.*`. A view expands
-- `*` once, when it is created - it does not follow the table afterwards. So
-- the new column existed on charges and was invisible to everything reading
-- the view, and the invoice a charge belonged to could never be seen.
--
-- Worse, the read added alongside it asked PostgREST to embed invoices through
-- that same view. A view carries no foreign keys, so there was no relationship
-- to follow, and the request failed outright - which is not a missing label but
-- a missing answer: every billing queue rendered as empty and the page showed
-- no money owed anywhere.
--
-- Rebuilding the view fixes the first half. The embed is gone from the app,
-- which fixes the second.
--
-- Nothing depends on v_charges, so dropping it is safe; it is recreated in the
-- same transaction. No row is touched - this is a definition, not data.
-- =============================================================================

drop view if exists v_charges;

create view v_charges
with (security_invoker = true) as
select c.*, round(c.standard_amount + c.adjustment, 2) as final_amount
from charges c;

grant select on public.v_charges to authenticated;
grant all    on public.v_charges to service_role;
