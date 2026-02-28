create extension if not exists pgcrypto;
create extension if not exists pg_session_jwt;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end
$$;

do $$
begin
  execute 'grant authenticated, anonymous to current_user';
exception
  when others then
    raise notice 'skipping role grant (%), this is only needed for SET ROLE testing', sqlerrm;
end
$$;

create table if not exists public.profiles (
  id text primary key,
  full_name text not null,
  locality text,
  wallet text unique,
  is_contractor boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  locality text not null,
  cost numeric(12, 2) not null default 0,
  status text not null default 'Draft',
  status_code smallint not null default 0,
  vote_count integer not null default 0,
  assigned boolean not null default false,
  contractor_wallet text,
  advance_paid numeric(12, 2),
  escrow_wei text,
  escrow_tx text,
  settle_tx text,
  remark text,
  reported_by text references public.profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint problems_status_code_range check (status_code between 0 and 5),
  constraint problems_cost_positive check (cost >= 0)
);

create index if not exists problems_locality_status_idx on public.problems (locality, status_code);
create index if not exists problems_contractor_idx on public.problems (lower(contractor_wallet));
create index if not exists profiles_wallet_idx on public.profiles (lower(wallet));

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.user_id()), false);
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.is_contractor is distinct from old.is_contractor then
    raise exception 'roles can only be changed by an administrator';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_roles on public.profiles;
create trigger profiles_guard_roles
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_problem_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_wallet text;
  assigned_contractor boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  select wallet into caller_wallet from public.profiles where id = auth.user_id();

  assigned_contractor := caller_wallet is not null
    and old.contractor_wallet is not null
    and lower(old.contractor_wallet) = lower(caller_wallet);

  if new.id is distinct from old.id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.image_url is distinct from old.image_url
     or new.locality is distinct from old.locality
     or new.cost is distinct from old.cost
     or new.assigned is distinct from old.assigned
     or new.contractor_wallet is distinct from old.contractor_wallet
     or new.advance_paid is distinct from old.advance_paid
     or new.escrow_wei is distinct from old.escrow_wei
     or new.escrow_tx is distinct from old.escrow_tx
     or new.settle_tx is distinct from old.settle_tx
     or new.reported_by is distinct from old.reported_by
     or new.created_at is distinct from old.created_at then
    raise exception 'only an administrator can change this problem';
  end if;

  if new.remark is distinct from old.remark and not assigned_contractor then
    raise exception 'only the assigned contractor can post work updates';
  end if;

  if new.status_code is distinct from old.status_code
     and not (assigned_contractor and old.status_code = 2 and new.status_code = 3) then
    raise exception 'only an administrator can change the status';
  end if;

  return new;
end;
$$;

drop trigger if exists problems_guard_columns on public.problems;
create trigger problems_guard_columns
  before update on public.problems
  for each row execute function public.guard_problem_update();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.problems to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter table public.profiles enable row level security;
alter table public.problems enable row level security;

drop policy if exists "profiles readable by owner and admins" on public.profiles;
create policy "profiles readable by owner and admins" on public.profiles
  for select to authenticated using (id = auth.user_id() or public.is_admin());

drop policy if exists "profiles created by their owner" on public.profiles;
create policy "profiles created by their owner" on public.profiles
  for insert to authenticated
  with check (id = auth.user_id() and is_admin = false);

drop policy if exists "profiles updatable by owner" on public.profiles;
create policy "profiles updatable by owner" on public.profiles
  for update to authenticated
  using (id = auth.user_id() or public.is_admin())
  with check (id = auth.user_id() or public.is_admin());

drop policy if exists "problems readable by authenticated" on public.problems;
create policy "problems readable by authenticated" on public.problems
  for select to authenticated using (true);

drop policy if exists "residents report problems" on public.problems;
create policy "residents report problems" on public.problems
  for insert to authenticated
  with check (
    reported_by = auth.user_id()
    and status_code = 0
    and assigned = false
    and contractor_wallet is null
  );

drop policy if exists "problems updatable" on public.problems;
create policy "problems updatable" on public.problems
  for update to authenticated using (true) with check (true);

drop policy if exists "problems deletable by admins" on public.problems;
create policy "problems deletable by admins" on public.problems
  for delete to authenticated using (public.is_admin());

