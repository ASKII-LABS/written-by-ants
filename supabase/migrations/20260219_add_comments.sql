create extension if not exists pgcrypto;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  poem_id uuid not null references public.poems(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint comments_content_not_blank check (char_length(trim(content)) > 0),
  constraint comments_content_max_length check (char_length(content) <= 2000)
);

create index if not exists comments_poem_created_at_idx
  on public.comments (poem_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "comments_select_visible_poems" on public.comments;
create policy "comments_select_visible_poems"
  on public.comments
  for select
  using (
    exists (
      select 1
      from public.poems
      where poems.id = comments.poem_id
        and (poems.is_published or poems.author_id = auth.uid())
    )
  );

drop policy if exists "comments_insert_published_poems" on public.comments;
create policy "comments_insert_published_poems"
  on public.comments
  for insert
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.poems
      where poems.id = comments.poem_id
        and poems.is_published
    )
  );
