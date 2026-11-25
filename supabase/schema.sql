-- Nellies träningsapp – databasschema för Supabase.
-- Kör hela filen en gång i Supabase → SQL Editor.

-- Appens data (ett generiskt nyckel/värde-lager per tabell i appen).
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tbl text not null,
  key text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, key)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

alter table public.records enable row level security;
drop policy if exists "egna rader" on public.records;
create policy "egna rader" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Data som Garmin-synkjobbet hämtar (skrivs bara av servern, läses av appen).
create table if not exists public.garmin_payloads (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists garmin_payloads_user_created on public.garmin_payloads (user_id, created_at);
alter table public.garmin_payloads enable row level security;
drop policy if exists "läs egna" on public.garmin_payloads;
create policy "läs egna" on public.garmin_payloads for select using (auth.uid() = user_id);

-- Status för "senast synkad".
create table if not exists public.sync_status (
  user_id uuid primary key references auth.users on delete cascade,
  last_run timestamptz,
  last_success timestamptz,
  ok boolean,
  message text,
  synced_until date
);
alter table public.sync_status enable row level security;
drop policy if exists "läs egen status" on public.sync_status;
create policy "läs egen status" on public.sync_status for select using (auth.uid() = user_id);

-- Garmin-tokens. RLS på utan policyer = bara servern (service role) kommer åt dem.
create table if not exists public.garmin_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  tokens text not null,
  updated_at timestamptz not null default now()
);
alter table public.garmin_tokens enable row level security;
