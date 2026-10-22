import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { noteKeys, type Tag } from '@/features/notes/api';
import { supabase } from '@/lib/supabase';

const UNIQUE_VIOLATION = '23505';

export const tagKeys = {
  all: ['tags'] as const,
};

/** Tags are stored lowercase and trimmed (enforced by the database). */
export function normalizeTagName(name: string) {
  return name.trim().toLowerCase();
}

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('id, name').order('name');
      if (error) throw error;
      return data as Tag[];
    },
  });
}

async function findOrCreateTag(name: string): Promise<string> {
  const existing = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const created = await supabase.from('tags').insert({ name }).select('id').single();
  if (created.error) throw created.error;
  return created.data.id;
}

/** The note must already be saved, since note_tags references it. */
export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, name }: { noteId: string; name: string }) => {
      const tagId = await findOrCreateTag(normalizeTagName(name));
      const { error } = await supabase.from('note_tags').insert({ note_id: noteId, tag_id: tagId });
      // Already tagged: nothing to do.
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, tagId }: { noteId: string; tagId: string }) => {
      const { error } = await supabase
        .from('note_tags')
        .delete()
        .eq('note_id', noteId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
