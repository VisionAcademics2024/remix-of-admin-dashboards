create type public.app_role as enum ('admin', 'staff');

create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role public.app_role not null,
    unique (user_id, role)
);

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Authenticated users can manage user roles"
on public.user_roles
for all
to authenticated
using (true)
with check (true);

create table public.students (
    id uuid primary key default gen_random_uuid(),
    first_name text not null,
    last_name text not null,
    email text,
    phone text,
    parent_name text,
    parent_phone text,
    parent_email text,
    date_of_birth date,
    grade text,
    school text,
    status text not null default 'active' check (status in ('active', 'inactive', 'graduated')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.students to authenticated;
grant all on public.students to service_role;

alter table public.students enable row level security;

create policy "Authenticated users can manage students"
on public.students
for all
to authenticated
using (true)
with check (true);

create table public.tutors (
    id uuid primary key default gen_random_uuid(),
    first_name text not null,
    last_name text not null,
    email text,
    phone text,
    subjects text[] not null default '{}',
    status text not null default 'active' check (status in ('active', 'inactive')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tutors to authenticated;
grant all on public.tutors to service_role;

alter table public.tutors enable row level security;

create policy "Authenticated users can manage tutors"
on public.tutors
for all
to authenticated
using (true)
with check (true);

create table public.packages (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    total_sessions int not null check (total_sessions > 0),
    price numeric(10, 2),
    validity_days int,
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.packages to authenticated;
grant all on public.packages to service_role;

alter table public.packages enable row level security;

create policy "Authenticated users can manage packages"
on public.packages
for all
to authenticated
using (true)
with check (true);

create table public.student_packages (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    package_id uuid not null references public.packages(id) on delete restrict,
    purchase_date date not null default current_date,
    expiry_date date,
    total_sessions int not null,
    sessions_used int not null default 0 check (sessions_used <= total_sessions),
    status text not null default 'active' check (status in ('active', 'completed', 'expired')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.student_packages to authenticated;
grant all on public.student_packages to service_role;

alter table public.student_packages enable row level security;

create policy "Authenticated users can manage student packages"
on public.student_packages
for all
to authenticated
using (true)
with check (true);

create table public.sessions (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    subject text,
    tutor_id uuid references public.tutors(id) on delete set null,
    start_time timestamptz not null,
    end_time timestamptz not null,
    location text,
    notes text,
    status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_time > start_time)
);

grant select, insert, update, delete on public.sessions to authenticated;
grant all on public.sessions to service_role;

alter table public.sessions enable row level security;

create policy "Authenticated users can manage sessions"
on public.sessions
for all
to authenticated
using (true)
with check (true);

create table public.session_students (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    attendance_status text not null default 'present' check (attendance_status in ('present', 'absent', 'late', 'excused')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, student_id)
);

grant select, insert, update, delete on public.session_students to authenticated;
grant all on public.session_students to service_role;

alter table public.session_students enable row level security;

create policy "Authenticated users can manage session students"
on public.session_students
for all
to authenticated
using (true)
with check (true);

create or replace function public.increment_sessions_used(
    _student_package_id uuid,
    _amount int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.student_packages
    set sessions_used = sessions_used + _amount,
        updated_at = now(),
        status = case
            when sessions_used + _amount >= total_sessions then 'completed'
            else status
        end
    where id = _student_package_id
      and sessions_used + _amount <= total_sessions;
end;
$$;

grant execute on function public.increment_sessions_used(uuid, int) to authenticated;
grant execute on function public.increment_sessions_used(uuid, int) to service_role;
