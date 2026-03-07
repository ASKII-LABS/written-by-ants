create or replace function public.comment_parent_is_valid(
  target_parent_comment_id uuid,
  target_poem_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.comments parent
    where parent.id = target_parent_comment_id
      and parent.poem_id = target_poem_id
  );
$$;

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
      or public.comment_parent_is_valid(comments.parent_comment_id, comments.poem_id)
    )
  );
