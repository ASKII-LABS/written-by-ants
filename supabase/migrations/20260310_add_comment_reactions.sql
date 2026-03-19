create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_comment_id_idx
  on public.comment_reactions (comment_id);

create index if not exists comment_reactions_user_id_idx
  on public.comment_reactions (user_id);

alter table public.comment_reactions enable row level security;

drop policy if exists "comment_reactions_select_visible_comments" on public.comment_reactions;
create policy "comment_reactions_select_visible_comments"
  on public.comment_reactions
  for select
  using (
    exists (
      select 1
      from public.comments
      join public.poems on poems.id = comments.poem_id
      where comments.id = comment_reactions.comment_id
        and (poems.is_published or poems.author_id = auth.uid())
    )
  );

drop policy if exists "comment_reactions_insert_visible_comments" on public.comment_reactions;
create policy "comment_reactions_insert_visible_comments"
  on public.comment_reactions
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.comments
      join public.poems on poems.id = comments.poem_id
      where comments.id = comment_reactions.comment_id
        and (poems.is_published or poems.author_id = auth.uid())
    )
  );

drop policy if exists "comment_reactions_delete_own" on public.comment_reactions;
create policy "comment_reactions_delete_own"
  on public.comment_reactions
  for delete
  using (auth.uid() = user_id);
