import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

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

export const noteKeys = {
  all: ['notes'] as const,
  list: ['notes', 'list'] as const,
  bin: ['notes', 'bin'] as const,
  detail: (id: string) => ['notes', 'detail', id] as const,
};

export function useNotes() {
  return useQuery({
    queryKey: noteKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_COLUMNS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('position', { referencedTable: 'tags' });
      if (error) throw error;
      return data as Note[];
    },
  });
}

/**
 * Resolves to null when the note doesn't exist yet (a new, unsaved note).
 * Starts from the copy in the notes list, so notes open instantly and offline.
 */
export function useNote(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: noteKeys.detail(id),
    initialData: () => queryClient.getQueryData<Note[]>(noteKeys.list)?.find((note) => note.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(noteKeys.list)?.dataUpdatedAt,
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
  queryClient.setQueryData<Note[]>(noteKeys.list, (notes) => {
    if (!notes) return notes;
    if (notes.some((note) => note.id === id)) {
      return notes.map((note) => (note.id === id ? { ...note, body } : note));
    }
    const created: Note = { id, body, created_at: now, updated_at: now, is_favorite: false, tags: [] };
    return [created, ...notes];
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
      queryClient.setQueryData<Note[]>(noteKeys.list, (notes) =>
        notes?.map((note) => (note.id === id ? { ...note, is_favorite: isFavorite } : note)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
