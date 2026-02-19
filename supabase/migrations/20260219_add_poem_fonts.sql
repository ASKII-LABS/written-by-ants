alter table public.poems
  add column if not exists title_font text not null default 'Lora',
  add column if not exists content_font text not null default 'Lora';

update public.poems
set
  title_font = coalesce(title_font, 'Lora'),
  content_font = coalesce(content_font, 'Lora')
where title_font is null or content_font is null;
