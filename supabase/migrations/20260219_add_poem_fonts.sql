alter table public.poems
  add column if not exists title_font text not null default 'Inter',
  add column if not exists content_font text not null default 'Inter';

update public.poems
set
  title_font = coalesce(title_font, 'Inter'),
  content_font = coalesce(content_font, 'Inter')
where title_font is null or content_font is null;
