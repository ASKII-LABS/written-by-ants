alter table public.comments
  add column if not exists parent_comment_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_parent_comment_id_fkey'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_parent_comment_id_fkey
      foreign key (parent_comment_id)
      references public.comments(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_parent_not_self'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_parent_not_self
      check (parent_comment_id is null or parent_comment_id <> id);
  end if;
end $$;

create index if not exists comments_poem_parent_created_at_id_idx
  on public.comments (poem_id, parent_comment_id, created_at, id);

create index if not exists comments_poem_top_level_created_at_id_desc_idx
  on public.comments (poem_id, created_at desc, id desc)
  where parent_comment_id is null;

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
    and (
      comments.parent_comment_id is null
      or exists (
        select 1
        from public.comments parent
        where parent.id = comments.parent_comment_id
          and parent.poem_id = comments.poem_id
          and parent.parent_comment_id is null
      )
    )
  );
