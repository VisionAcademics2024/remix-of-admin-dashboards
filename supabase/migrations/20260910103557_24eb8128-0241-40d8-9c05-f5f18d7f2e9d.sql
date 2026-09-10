drop view if exists v_charges;

create view v_charges
with (security_invoker = true) as
select c.*, round(c.standard_amount + c.adjustment, 2) as final_amount
from charges c;

grant select on public.v_charges to authenticated;
grant all    on public.v_charges to service_role;

notify pgrst, 'reload schema';