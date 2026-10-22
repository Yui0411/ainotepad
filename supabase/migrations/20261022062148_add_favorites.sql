-- Favourite flag on notes. Toggling it doesn't count as an edit: the
-- notes_before_update trigger only bumps updated_at for body/deleted_at changes.
alter table public.notes add column is_favorite boolean not null default false;

grant update (is_favorite) on public.notes to authenticated;
