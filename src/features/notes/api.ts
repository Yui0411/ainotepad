import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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

/** Resolves to null when the note doesn't exist yet (a new, unsaved note). */
export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
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

/** Inserts the note on first save, updates it afterwards. */
export async function saveNote(id: string, body: string, exists: boolean) {
  const { error } = exists
    ? await supabase.from('notes').update({ body }).eq('id', id)
    : await supabase.from('notes').insert({ id, body });
  if (error) throw error;
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
