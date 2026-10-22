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
  tags: Tag[];
};

// tags(...) follows the note_tags join table.
const NOTE_COLUMNS = 'id, body, created_at, updated_at, tags(id, name)';

export const noteKeys = {
  all: ['notes'] as const,
  detail: (id: string) => ['notes', id] as const,
};

export function useNotes() {
  return useQuery({
    queryKey: noteKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_COLUMNS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
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

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
