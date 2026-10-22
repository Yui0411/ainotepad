-- One page of the notes list, newest first, with tag and favourite filters
-- applied on the server. Pages are keyed on (created_at, id): pass the last
-- row of the previous page to get the next one.
create function public.list_notes(
  page_size int default 50,
  after_created_at timestamptz default null,
  after_id uuid default null,
  filter_tag_ids uuid[] default null,
  favorites_only boolean default false
)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  is_favorite boolean,
  tags jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.body,
    n.created_at,
    n.updated_at,
    n.is_favorite,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.position)
      from public.note_tags nt
      join public.tags t on t.id = nt.tag_id
      where nt.note_id = n.id
    ), '[]'::jsonb) as tags
  from public.notes n
  where n.deleted_at is null
    and (not favorites_only or n.is_favorite)
    and (after_created_at is null or (n.created_at, n.id) < (after_created_at, after_id))
    -- Note must have every requested tag.
    and (filter_tag_ids is null or not exists (
      select 1
      from unnest(filter_tag_ids) as wanted(tag_id)
      where not exists (
        select 1 from public.note_tags nt
        where nt.note_id = n.id and nt.tag_id = wanted.tag_id
      )
    ))
  order by n.created_at desc, n.id desc
  limit least(greatest(page_size, 1), 200);
$$;

revoke execute on function public.list_notes from public, anon;
grant execute on function public.list_notes to authenticated;

-- Matches the page order so each page is an index range scan.
drop index public.notes_user_created_idx;
create index notes_user_created_idx on public.notes (user_id, created_at desc, id desc) where deleted_at is null;
