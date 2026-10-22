import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { noteKeys, type Note, type Tag } from '@/features/notes/api';
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
      const { data, error } = await supabase.from('tags').select('id, name').order('position');
      if (error) throw error;
      return data as Tag[];
    },
  });
}

/**
 * Returns the existing tag with this name, or a new tag with a client-side id
 * so it can be shown (and selected) before the server has created it.
 */
export function resolveTag(name: string, existingTags: Tag[]): { tag: Tag; isNew: boolean } {
  const normalized = normalizeTagName(name);
  const existing = existingTags.find((tag) => tag.name === normalized);
  return existing ? { tag: existing, isNew: false } : { tag: { id: Crypto.randomUUID(), name: normalized }, isNew: true };
}

// Shared by adding and removing so overlapping taps don't refetch over each other.
const NOTE_TAGS_MUTATION_KEY = ['note-tags'];

type OptimisticSnapshot = {
  previousNote: Note | null | undefined;
  previousTags: Tag[] | undefined;
};

/** Applies a tag change to the cached note right away, keeping the user's tag order. */
async function updateCachedNoteTags(
  queryClient: QueryClient,
  noteId: string,
  update: (tags: Tag[]) => Tag[],
  newTag?: Tag,
): Promise<OptimisticSnapshot> {
  await queryClient.cancelQueries({ queryKey: noteKeys.detail(noteId) });
  const previousNote = queryClient.getQueryData<Note | null>(noteKeys.detail(noteId));
  const previousTags = queryClient.getQueryData<Tag[]>(tagKeys.all);

  const allTags = newTag ? [...(previousTags ?? []), newTag] : (previousTags ?? []);
  if (newTag) queryClient.setQueryData<Tag[]>(tagKeys.all, allTags);

  const rank = (tag: Tag) => {
    const index = allTags.findIndex((t) => t.id === tag.id);
    return index === -1 ? allTags.length : index;
  };
  queryClient.setQueryData<Note | null>(noteKeys.detail(noteId), (note) =>
    note ? { ...note, tags: update(note.tags).sort((a, b) => rank(a) - rank(b)) } : note,
  );

  return { previousNote, previousTags };
}

function rollback(queryClient: QueryClient, noteId: string, snapshot: OptimisticSnapshot | undefined) {
  if (!snapshot) return;
  queryClient.setQueryData(noteKeys.detail(noteId), snapshot.previousNote);
  queryClient.setQueryData(tagKeys.all, snapshot.previousTags);
}

function refetchWhenIdle(queryClient: QueryClient) {
  // Only the last of several quick taps refetches, so earlier responses can't undo later taps.
  if (queryClient.isMutating({ mutationKey: NOTE_TAGS_MUTATION_KEY }) === 1) {
    queryClient.invalidateQueries({ queryKey: noteKeys.all });
    queryClient.invalidateQueries({ queryKey: tagKeys.all });
  }
}

type AddTagInput = { noteId: string; tag: Tag; isNew: boolean };

/** The note must already be saved, since note_tags references it. */
export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: NOTE_TAGS_MUTATION_KEY,
    mutationFn: async ({ noteId, tag, isNew }: AddTagInput) => {
      let tagId = tag.id;
      if (isNew) {
        const created = await supabase.from('tags').insert({ id: tag.id, name: tag.name });
        if (created.error) {
          if (created.error.code !== UNIQUE_VIOLATION) throw created.error;
          // Another device created this name meanwhile: use that tag.
          const existing = await supabase.from('tags').select('id').eq('name', tag.name).single();
          if (existing.error) throw existing.error;
          tagId = existing.data.id;
        }
      }
      const { error } = await supabase.from('note_tags').insert({ note_id: noteId, tag_id: tagId });
      // Already tagged: nothing to do.
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    onMutate: ({ noteId, tag, isNew }) =>
      updateCachedNoteTags(
        queryClient,
        noteId,
        (tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag]),
        isNew ? tag : undefined,
      ),
    onError: (_error, { noteId }, snapshot) => rollback(queryClient, noteId, snapshot),
    onSettled: () => refetchWhenIdle(queryClient),
  });
}

export type TagWithCount = Tag & { noteCount: number };

const tagCountsKey = [...tagKeys.all, 'counts'];

/** Tags with how many notes (including binned ones) use each. */
export function useTagsWithCounts() {
  return useQuery({
    queryKey: tagCountsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('id, name, note_tags(count)').order('position');
      if (error) throw error;
      return (data as { id: string; name: string; note_tags: { count: number }[] }[]).map(
        (tag): TagWithCount => ({ id: tag.id, name: tag.name, noteCount: tag.note_tags[0]?.count ?? 0 }),
      );
    },
  });
}

/** Saves a new tag order. Updates the cached lists first so the drop sticks immediately. */
export function useReorderTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tags: TagWithCount[]) => {
      const { error } = await supabase.rpc('reorder_tags', { tag_ids: tags.map((tag) => tag.id) });
      if (error) throw error;
    },
    onMutate: (tags) => {
      queryClient.setQueryData<TagWithCount[]>(tagCountsKey, tags);
      queryClient.setQueryData<Tag[]>(tagKeys.all, tags.map(({ id, name }) => ({ id, name })));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

/** Deletes the tag everywhere; the database removes it from every note. */
export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', tagId);
      if (error) throw error;
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
    mutationKey: NOTE_TAGS_MUTATION_KEY,
    mutationFn: async ({ noteId, tagId }: { noteId: string; tagId: string }) => {
      const { error } = await supabase
        .from('note_tags')
        .delete()
        .eq('note_id', noteId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onMutate: ({ noteId, tagId }) =>
      updateCachedNoteTags(queryClient, noteId, (tags) => tags.filter((t) => t.id !== tagId)),
    onError: (_error, { noteId }, snapshot) => rollback(queryClient, noteId, snapshot),
    onSettled: () => refetchWhenIdle(queryClient),
  });
}
