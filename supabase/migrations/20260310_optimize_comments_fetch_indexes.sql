-- post_id in this project maps to poem_id.
-- Ensure comments fetches can use a leading (poem_id, created_at) index.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'comments'
      and indexdef ilike '%(poem_id, created_at%'
  ) then
    create index comments_poem_created_at_id_desc_fast_fetch_idx
      on public.comments (poem_id, created_at desc, id desc);
  end if;
end $$;
