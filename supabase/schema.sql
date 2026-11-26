-- Nellies träningsapp – molnbackup i Supabase (valfritt).
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
