-- Notes, tags, row-level security, and hybrid (semantic + keyword) search.

create extension if not exists vector with schema extensions;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Bumped whenever the text that gets embedded (body or tags) changes.
  content_changed_at timestamptz not null default now(),
  -- gemini-embedding-2 at 768 dimensions.
  embedding extensions.vector(768),
  -- The content_changed_at value the current embedding was generated from.
  -- A note needs (re-)embedding when this differs from content_changed_at.
  embedded_version timestamptz,
  embedding_attempts int not null default 0,
  embedding_error text,
  fts tsvector generated always as (to_tsvector('english', body)) stored
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name = lower(btrim(name)) and name <> ''),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

create index notes_user_created_idx on public.notes (user_id, created_at desc) where deleted_at is null;
create index notes_fts_idx on public.notes using gin (fts);
create index note_tags_tag_idx on public.note_tags (tag_id);
-- No vector index: a sequential scan over a few hundred notes is instant.

-- ─── Triggers ────────────────────────────────────────────────────────────────

create function public.notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only user-visible edits count as "updated"; embedding writes don't.
  if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
    new.updated_at := now();
  end if;

  if new.body is distinct from old.body then
    new.content_changed_at := now();
  end if;

  -- New content gets a fresh set of embedding retries.
  if new.content_changed_at is distinct from old.content_changed_at then
    new.embedding_attempts := 0;
    new.embedding_error := null;
  end if;

  return new;
end;
$$;

create trigger notes_before_update
  before update on public.notes
  for each row execute function public.notes_before_update();

-- Tags are part of the embedded text, so adding/removing one marks the note changed.
-- Security definer because clients can't write content_changed_at directly.
create function public.note_tags_touch_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_note_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_note_id := old.note_id;
  else
    changed_note_id := new.note_id;
  end if;

  update public.notes
  set content_changed_at = now(), updated_at = now()
  where id = changed_note_id;

  return null;
end;
$$;

create trigger note_tags_touch_note
  after insert or delete on public.note_tags
  for each row execute function public.note_tags_touch_note();

-- Renaming a tag changes the embedded text of every note that has it.
create function public.tags_touch_tagged_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes n
  set content_changed_at = now()
  from public.note_tags nt
  where nt.tag_id = new.id and nt.note_id = n.id;

  return null;
end;
$$;

create trigger tags_touch_tagged_notes
  after update of name on public.tags
  for each row
  when (old.name is distinct from new.name)
  execute function public.tags_touch_tagged_notes();

-- ─── Row-level security ──────────────────────────────────────────────────────

alter table public.notes enable row level security;
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;

create policy "Users read own notes" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own notes" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own notes" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own notes" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own tags" on public.tags
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own tags" on public.tags
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own tags" on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own tags" on public.tags
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own note tags" on public.note_tags
  for select to authenticated using (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
  );
create policy "Users tag own notes with own tags" on public.note_tags
  for insert to authenticated with check (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );
create policy "Users untag own notes" on public.note_tags
  for delete to authenticated using (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))
  );

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- New tables aren't exposed to the Data API automatically in this project.
-- Logged-in users may only write the columns the app edits; anon gets nothing.

grant select, delete on public.notes to authenticated;
grant insert (id, body) on public.notes to authenticated;
grant update (body, deleted_at) on public.notes to authenticated;

grant select, delete on public.tags to authenticated;
grant insert (id, name) on public.tags to authenticated;
grant update (name) on public.tags to authenticated;

grant select, insert, delete on public.note_tags to authenticated;

grant all on public.notes, public.tags, public.note_tags to service_role;

-- ─── Search ──────────────────────────────────────────────────────────────────

-- Hybrid search: ranks notes by embedding similarity and by keyword match, then
-- merges the two rankings with reciprocal rank fusion. With a null
-- query_embedding it falls back to keyword-only search.
create function public.search_notes(
  query_text text,
  query_embedding extensions.vector(768) default null,
  match_count int default 10,
  filter_tag_ids uuid[] default null,
  date_from timestamptz default null,
  date_to timestamptz default null,
  semantic_weight float default 1,
  keyword_weight float default 1,
  rrf_k int default 50
)
returns table (
  id uuid,
  body text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  score float
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select n.id, n.embedding, n.fts
    from public.notes n
    where n.deleted_at is null
      and (date_from is null or n.created_at >= date_from)
      and (date_to is null or n.created_at < date_to)
      -- Note must have every requested tag.
      and (filter_tag_ids is null or not exists (
        select 1
        from unnest(filter_tag_ids) as wanted(tag_id)
        where not exists (
          select 1 from public.note_tags nt
          where nt.note_id = n.id and nt.tag_id = wanted.tag_id
        )
      ))
  ),
  keyword_query as (
    -- OR the words together so vague, wordy queries still match on any term.
    select nullif(replace(plainto_tsquery('english', query_text)::text, '&', '|'), '')::tsquery as q
  ),
  semantic as (
    select
      c.id,
      row_number() over (order by c.embedding operator(extensions.<=>) query_embedding) as rank_ix
    from candidates c
    where query_embedding is not null and c.embedding is not null
    order by rank_ix
    limit match_count * 2
  ),
  keyword as (
    select
      c.id,
      row_number() over (order by ts_rank_cd(c.fts, kq.q) desc) as rank_ix
    from candidates c
    cross join keyword_query kq
    where kq.q is not null and c.fts @@ kq.q
    order by rank_ix
    limit match_count * 2
  )
  select
    n.id,
    n.body,
    coalesce(array(
      select t.name
      from public.note_tags nt
      join public.tags t on t.id = nt.tag_id
      where nt.note_id = n.id
      order by t.name
    ), '{}') as tags,
    n.created_at,
    n.updated_at,
    coalesce(semantic_weight / (rrf_k + s.rank_ix), 0.0)
      + coalesce(keyword_weight / (rrf_k + k.rank_ix), 0.0) as score
  from semantic s
  full outer join keyword k on k.id = s.id
  join public.notes n on n.id = coalesce(s.id, k.id)
  order by score desc
  limit match_count;
$$;

-- Notes whose embedding is missing or stale. Waits 30 seconds after the last
-- change so autosave bursts produce one embedding call, and gives up after 5 failures.
create function public.notes_pending_embedding(batch_size int default 20)
returns table (
  id uuid,
  version timestamptz,
  attempts int,
  body text,
  tags text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.content_changed_at,
    n.embedding_attempts,
    n.body,
    coalesce(array(
      select t.name
      from public.note_tags nt
      join public.tags t on t.id = nt.tag_id
      where nt.note_id = n.id
      order by t.name
    ), '{}')
  from public.notes n
  where n.deleted_at is null
    and n.embedded_version is distinct from n.content_changed_at
    and n.content_changed_at < now() - interval '30 seconds'
    and n.embedding_attempts < 5
  order by n.content_changed_at
  limit batch_size;
$$;

-- Supabase grants execute on new public functions to anon/authenticated by default.
revoke execute on function public.search_notes from public, anon;
grant execute on function public.search_notes to authenticated, service_role;

revoke execute on function public.notes_pending_embedding from public, anon, authenticated;
grant execute on function public.notes_pending_embedding to service_role;

revoke execute on function public.notes_before_update from public, anon, authenticated;
revoke execute on function public.note_tags_touch_note from public, anon, authenticated;
revoke execute on function public.tags_touch_tagged_notes from public, anon, authenticated;
