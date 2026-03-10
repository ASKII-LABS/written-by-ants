create or replace function public.fetch_poem_comments_page(
  target_poem_id uuid,
  page_limit integer default 12,
  page_sort text default 'desc',
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  include_count boolean default true
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  content text,
  created_at timestamptz,
  parent_comment_id uuid,
  comment_count bigint,
  next_cursor_created_at timestamptz,
  next_cursor_id uuid
)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select
      greatest(1, least(coalesce(page_limit, 12), 50)) as limit_value,
      case
        when lower(coalesce(page_sort, 'desc')) = 'asc' then 'asc'
        else 'desc'
      end as sort_value
  ),
  root_candidates as (
    select
      c.id,
      c.created_at,
      row_number() over (
        order by
          case when n.sort_value = 'asc' then c.created_at end asc,
          case when n.sort_value = 'desc' then c.created_at end desc,
          case when n.sort_value = 'asc' then c.id end asc,
          case when n.sort_value = 'desc' then c.id end desc
      ) as root_rank
    from public.comments c
    cross join normalized n
    where c.poem_id = target_poem_id
      and c.parent_comment_id is null
      and (
        cursor_created_at is null
        or (
          n.sort_value = 'desc'
          and (
            c.created_at < cursor_created_at
            or (
              c.created_at = cursor_created_at
              and (
                cursor_id is null
                or c.id < cursor_id
              )
            )
          )
        )
        or (
          n.sort_value = 'asc'
          and (
            c.created_at > cursor_created_at
            or (
              c.created_at = cursor_created_at
              and (
                cursor_id is null
                or c.id > cursor_id
              )
            )
          )
        )
      )
    limit (select limit_value + 1 from normalized)
  ),
  paged_roots as (
    select id, created_at, root_rank
    from root_candidates
    where root_rank <= (select limit_value from normalized)
  ),
  page_meta as (
    select
      case
        when include_count then (
          select count(*)::bigint
          from public.comments c
          where c.poem_id = target_poem_id
        )
        else 0::bigint
      end as comment_count,
      exists (
        select 1
        from root_candidates rc
        where rc.root_rank > (select limit_value from normalized)
      ) as has_more
  ),
  cursor_meta as (
    select
      case when pm.has_more then pr.created_at else null end as next_cursor_created_at,
      case when pm.has_more then pr.id else null end as next_cursor_id
    from page_meta pm
    left join paged_roots pr
      on pr.root_rank = (select limit_value from normalized)
  ),
  thread as (
    with recursive thread_rows as (
      select
        c.id,
        c.author_id,
        c.content,
        c.created_at,
        c.parent_comment_id,
        pr.root_rank,
        array[0]::integer[] as sort_path,
        array[c.id]::uuid[] as visited_path
      from public.comments c
      join paged_roots pr on pr.id = c.id

      union all

      select
        child.id,
        child.author_id,
        child.content,
        child.created_at,
        child.parent_comment_id,
        parent.root_rank,
        parent.sort_path || child.rank,
        parent.visited_path || child.id
      from thread_rows parent
      join lateral (
        select
          c.id,
          c.author_id,
          c.content,
          c.created_at,
          c.parent_comment_id,
          row_number() over (order by c.created_at asc, c.id asc)::integer as rank
        from public.comments c
        where c.poem_id = target_poem_id
          and c.parent_comment_id = parent.id
      ) as child on true
      where not (child.id = any(parent.visited_path))
    )
    select
      tr.id,
      tr.author_id,
      coalesce(p.display_name, 'Poet') as author_name,
      tr.content,
      tr.created_at,
      tr.parent_comment_id,
      tr.root_rank,
      tr.sort_path
    from thread_rows tr
    left join public.profiles p on p.id = tr.author_id
  )
  select
    t.id,
    t.author_id,
    t.author_name,
    t.content,
    t.created_at,
    t.parent_comment_id,
    pm.comment_count,
    cm.next_cursor_created_at,
    cm.next_cursor_id
  from thread t
  cross join page_meta pm
  cross join cursor_meta cm
  order by t.root_rank asc, t.sort_path asc, t.created_at asc, t.id asc;
$$;
