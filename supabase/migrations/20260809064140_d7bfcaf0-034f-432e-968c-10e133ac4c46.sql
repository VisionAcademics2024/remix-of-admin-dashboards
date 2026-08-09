revoke all on function public.increment_sessions_used(uuid, int) from public;
revoke all on function public.increment_sessions_used(uuid, int) from anon;

alter function public.increment_sessions_used(uuid, int) security invoker;

grant execute on function public.increment_sessions_used(uuid, int) to authenticated;
grant execute on function public.increment_sessions_used(uuid, int) to service_role;
