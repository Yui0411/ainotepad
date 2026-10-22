-- Supabase's default privileges still give anon/authenticated TRUNCATE, REFERENCES
-- and TRIGGER on new tables. TRUNCATE ignores row-level security, so remove them.
revoke truncate, references, trigger on public.notes, public.tags, public.note_tags from anon, authenticated;
revoke all on public.notes, public.tags, public.note_tags from anon;

-- Created by the "Enable automatic RLS" project option. It's an event trigger
-- function, so it can't run when called directly, but it shouldn't be exposed.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
