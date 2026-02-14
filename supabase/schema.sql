-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bio text,
  public_profile boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.poems (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_html text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reactions (
  poem_id uuid not null references public.poems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poem_id, user_id)
);

create index if not exists poems_created_at_idx on public.poems (created_at desc);
create index if not exists poems_author_id_idx on public.poems (author_id);
create index if not exists poems_published_created_at_idx on public.poems (is_published, created_at desc);
create index if not exists reactions_user_id_idx on public.reactions (user_id);

create or replace function public.set_poems_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_poems_updated_at on public.poems;
create trigger set_poems_updated_at
before update on public.poems
for each row
execute function public.set_poems_updated_at();

alter table public.profiles enable row level security;
alter table public.poems enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "Profiles are readable when public or owner" on public.profiles;
create policy "Profiles are readable when public or owner"
on public.profiles
for select
using (public_profile = true or auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Published poems are readable and authors can read drafts" on public.poems;
create policy "Published poems are readable and authors can read drafts"
on public.poems
for select
using (is_published = true or auth.uid() = author_id);

drop policy if exists "Authors can insert poems" on public.poems;
create policy "Authors can insert poems"
on public.poems
for insert
with check (auth.uid() = author_id);

drop policy if exists "Authors can update poems" on public.poems;
create policy "Authors can update poems"
on public.poems
for update
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Authors can delete poems" on public.poems;
create policy "Authors can delete poems"
on public.poems
for delete
using (auth.uid() = author_id);

drop policy if exists "Reactions are readable by everyone" on public.reactions;
create policy "Reactions are readable by everyone"
on public.reactions
for select
using (true);

drop policy if exists "Users can insert own reactions" on public.reactions;
create policy "Users can insert own reactions"
on public.reactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reactions" on public.reactions;
create policy "Users can delete own reactions"
on public.reactions
for delete
using (auth.uid() = user_id);
