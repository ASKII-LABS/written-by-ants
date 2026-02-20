create index if not exists comments_poem_created_at_id_desc_idx
  on public.comments (poem_id, created_at desc, id desc);
