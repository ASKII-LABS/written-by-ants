create or replace function public.comment_counts_for_poems(poem_ids uuid[])
returns table (
  poem_id uuid,
  comment_count bigint
)
language sql
stable
as $$
  select
    comments.poem_id,
    count(*)::bigint as comment_count
  from public.comments
  where comments.poem_id = any (poem_ids)
  group by comments.poem_id;
$$;
