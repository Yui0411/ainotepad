-- User-defined tag order. Existing tags start in alphabetical order; new tags go last.
alter table public.tags add column position int;

update public.tags t
set position = r.rn
from (select id, row_number() over (partition by user_id order by name) as rn from public.tags) r
where r.id = t.id;

alter table public.tags alter column position set not null;

create function public.tags_set_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(t.position), 0) + 1 into new.position
    from public.tags t
    where t.user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger tags_set_position
  before insert on public.tags
  for each row execute function public.tags_set_position();

-- Saves a new order in one call: positions follow the order of tag_ids.
-- Runs as the caller, so row-level security limits it to their own tags.
create function public.reorder_tags(tag_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.tags t
  set position = o.ord::int
  from unnest(tag_ids) with ordinality as o(id, ord)
  where t.id = o.id;
$$;

grant update (position) on public.tags to authenticated;

revoke execute on function public.tags_set_position from public, anon, authenticated;
revoke execute on function public.reorder_tags from public, anon;
grant execute on function public.reorder_tags to authenticated;
