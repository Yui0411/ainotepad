import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const UNIQUE_VIOLATION = '23505';

export type Tag = {
  id: string;
  name: string;
};

export type Note = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  tags: Tag[];
};

// tags(...) follows the note_tags join table.
const NOTE_COLUMNS = 'id, body, created_at, updated_at, is_favorite, tags(id, name)';

export type NoteFilters = {
  tagIds: string[];
  favoritesOnly: boolean;
};

export const NOTES_PAGE_SIZE = 50;

export const noteKeys = {
  all: ['notes'] as const,
  /** Prefix shared by every filtered variant of the notes list. */
  lists: ['notes', 'list'] as const,
  list: (filters: NoteFilters) =>
    ['notes', 'list', { tagIds: [...filters.tagIds].sort(), favoritesOnly: filters.favoritesOnly }] as const,
  bin: ['notes', 'bin'] as const,
  detail: (id: string) => ['notes', 'detail', id] as const,
};

/** The last note of a page; the next page starts after it. */
type PageCursor = { createdAt: string; id: string } | null;

export type NotesPages = InfiniteData<Note[], PageCursor>;

/** The notes list, newest first, loaded a page at a time with filters applied on the server. */
export function useNotes(filters: NoteFilters) {
  return useInfiniteQuery({
    queryKey: noteKeys.list(filters),
    initialPageParam: null as PageCursor,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('list_notes', {
        page_size: NOTES_PAGE_SIZE,
        after_created_at: pageParam?.createdAt ?? null,
        after_id: pageParam?.id ?? null,
        filter_tag_ids: filters.tagIds.length > 0 ? filters.tagIds : null,
        favorites_only: filters.favoritesOnly,
      });
      if (error) throw error;
      return data as Note[];
    },
    getNextPageParam: (lastPage): PageCursor | undefined => {
      if (lastPage.length < NOTES_PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { createdAt: last.created_at, id: last.id };
    },
  });
}

/** Finds a note in any loaded page of any cached notes list. */
function findCachedListNote(queryClient: QueryClient, id: string): { note: Note; updatedAt: number } | undefined {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: noteKeys.lists })) {
    const pages = query.state.data as NotesPages | undefined;
    const note = pages?.pages.flat().find((n) => n.id === id);
    if (note) return { note, updatedAt: query.state.dataUpdatedAt };
  }
  return undefined;
}

/** Applies `update` to every cached notes list. */
function updateCachedLists(queryClient: QueryClient, update: (pages: Note[][], filters: NoteFilters) => Note[][]) {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: noteKeys.lists })) {
    const filters = query.queryKey[2] as NoteFilters;
    queryClient.setQueryData<NotesPages>(query.queryKey, (data) =>
      data ? { ...data, pages: update(data.pages, filters) } : data,
    );
  }
}

/**
 * Resolves to null when the note doesn't exist yet (a new, unsaved note).
 * Starts from the copy in the notes list, so notes open instantly and offline.
 */
export function useNote(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: noteKeys.detail(id),
    initialData: () => findCachedListNote(queryClient, id)?.note,
    initialDataUpdatedAt: () => findCachedListNote(queryClient, id)?.updatedAt,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .order('position', { referencedTable: 'tags' })
        .maybeSingle();
      if (error) throw error;
      return data as Note | null;
    },
  });
}

async function updateBody(id: string, body: string): Promise<boolean> {
  const { data, error } = await supabase.from('notes').update({ body }).eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

/**
 * Saves a note's text, creating the note if needed. `probablyExists` only picks
 * which request to try first; the other is the fallback, so a wrong guess
 * (e.g. a note created offline and synced twice) still ends up saved once.
 */
export async function saveNote(id: string, body: string, probablyExists: boolean) {
  if (probablyExists && (await updateBody(id, body))) return;

  const { error } = await supabase.from('notes').insert({ id, body });
  if (!error) return;
  if (error.code !== UNIQUE_VIOLATION) throw error;
  // Already created (by an earlier attempt or another sync): update it instead.
  await updateBody(id, body);
}

/**
 * Puts unsaved text into the cached note and notes list straight away, so it
 * shows (and is kept offline) before the server has confirmed the save.
 */
export function cacheNoteBody(queryClient: QueryClient, id: string, body: string) {
  const now = new Date().toISOString();
  queryClient.setQueryData<Note | null>(noteKeys.detail(id), (note) => (note ? { ...note, body } : note));
  updateCachedLists(queryClient, (pages, filters) => {
    if (pages.some((page) => page.some((note) => note.id === id))) {
      return pages.map((page) => page.map((note) => (note.id === id ? { ...note, body } : note)));
    }
    // A new note only belongs at the top of the unfiltered list.
    if (filters.tagIds.length > 0 || filters.favoritesOnly || pages.length === 0) return pages;
    const created: Note = { id, body, created_at: now, updated_at: now, is_favorite: false, tags: [] };
    return [[created, ...pages[0]], ...pages.slice(1)];
  });
}

/** Soft-deletes: the notes stay in the database with deleted_at set. */
export function useDeleteNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

export function useDeletedNotes() {
  return useQuery({
    queryKey: noteKeys.bin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_COLUMNS)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .order('position', { referencedTable: 'tags' });
      if (error) throw error;
      return data as Note[];
    },
  });
}

export function useRestoreNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('notes').update({ deleted_at: null }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

/** Permanently deletes binned notes. Pass no ids to empty the whole bin. */
export function usePurgeNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let query = supabase.from('notes').delete().not('deleted_at', 'is', null);
      if (ids) query = query.in('id', ids);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

/** Updates the cached note right away so the star responds instantly. */
export function useSetFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await supabase.from('notes').update({ is_favorite: isFavorite }).eq('id', id);
      if (error) throw error;
    },
    onMutate: ({ id, isFavorite }) => {
      queryClient.setQueryData<Note | null>(noteKeys.detail(id), (note) =>
        note ? { ...note, is_favorite: isFavorite } : note,
      );
      updateCachedLists(queryClient, (pages) =>
        pages.map((page) => page.map((note) => (note.id === id ? { ...note, is_favorite: isFavorite } : note))),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
