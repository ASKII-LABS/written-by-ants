alter table if exists public.profiles
  add column if not exists theme text not null default 'classic';

update public.profiles
set theme = 'classic'
where theme is null;

alter table public.profiles
  drop constraint if exists profiles_theme_allowed;

alter table public.profiles
  add constraint profiles_theme_allowed check (theme in ('classic', 'plum'));
