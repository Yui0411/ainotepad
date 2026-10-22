import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { HeaderIconButton } from '@/components/header-icon-button';
import { TagMenu } from '@/components/tag-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { noteKeys, saveNote, useNote, useSetFavorite, type Note, type Tag } from '@/features/notes/api';
import { formatNoteDate } from '@/features/notes/format';
import { resolveTag, useAddTag, useRemoveTag, useTags } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';

const AUTOSAVE_DELAY_MS = 1500;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save. Will retry on your next edit.",
};

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const note = useNote(id);

  if (note.isPending) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (note.isError) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="danger">Couldn&apos;t load this note.</ThemedText>
      </ThemedView>
    );
  }

  // Mount the editor only once the note has loaded, so its initial text is final.
  return <NoteEditor id={id} initialNote={note.data} />;
}

function NoteEditor({ id, initialNote }: { id: string; initialNote: Note | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: note } = useNote(id);
  const allTags = useTags();
  const addTag = useAddTag();
  const setFavoriteMutation = useSetFavorite();
  const removeTag = useRemoveTag();

  const [body, setBody] = useState(initialNote?.body ?? '');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(initialNote?.is_favorite ?? false);
  const noteTags = note?.tags ?? [];

  const latestBody = useRef(initialNote?.body ?? '');
  const savedBody = useRef(initialNote?.body ?? '');
  const exists = useRef(initialNote !== null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Saves run one after another so the first insert always lands before later updates.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function enqueue(task: () => Promise<void>) {
    queue.current = queue.current.then(task);
    return queue.current;
  }

  function persist(options: { createIfEmpty?: boolean } = {}) {
    clearTimeout(timer.current);
    return enqueue(async () => {
      const text = latestBody.current;
      if (exists.current && text === savedBody.current) return;
      // Leaving a brand-new note empty shouldn't create a row.
      if (!exists.current && text.trim() === '' && !options.createIfEmpty) return;

      setStatus('saving');
      try {
        await saveNote(id, text, exists.current);
        exists.current = true;
        savedBody.current = text;
        setStatus('saved');
        queryClient.invalidateQueries({ queryKey: noteKeys.all });
      } catch {
        setStatus('error');
      }
    });
  }

  function onChangeBody(text: string) {
    latestBody.current = text;
    setBody(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(), AUTOSAVE_DELAY_MS);
  }

  // Flush pending edits when leaving the screen or backgrounding the app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') persist();
    });
    return () => {
      subscription.remove();
      persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyTag(tag: Tag, isNew: boolean) {
    // note_tags references the note, so a brand-new note has to be saved first.
    if (!exists.current) await persist({ createIfEmpty: true });
    if (exists.current) addTag.mutate({ noteId: id, tag, isNew });
  }

  function createTag(name: string) {
    const { tag, isNew } = resolveTag(name, allTags.data ?? []);
    applyTag(tag, isNew);
  }

  function toggleTag(tag: Tag) {
    if (noteTags.some((t) => t.id === tag.id)) {
      removeTag.mutate({ noteId: id, tagId: tag.id });
    } else {
      applyTag(tag, false);
    }
  }

  async function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    // A brand-new note has to exist before it can be starred.
    await persist({ createIfEmpty: true });
    if (!exists.current) {
      setIsFavorite(!next);
      return;
    }
    setFavoriteMutation.mutate({ id, isFavorite: next }, { onError: () => setIsFavorite(!next) });
  }

  function openTagMenu() {
    Keyboard.dismiss();
    setTagMenuOpen(!tagMenuOpen);
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: formatNoteDate(initialNote?.created_at ?? new Date().toISOString()),
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderIconButton
                icon={isFavorite ? 'star' : 'star-outline'}
                color={isFavorite ? theme.star : theme.textSecondary}
                accessibilityLabel="Favourite"
                selected={isFavorite}
                onPress={toggleFavorite}
              />
              <HeaderIconButton
                icon="add"
                color={theme.accent}
                accessibilityLabel="Tags"
                onPress={openTagMenu}
              />
            </View>
          ),
        }}
      />

      <TextInput
        value={body}
        onChangeText={onChangeBody}
        onFocus={() => setTagMenuOpen(false)}
        multiline
        autoFocus={initialNote === null}
        placeholder="Write something…"
        placeholderTextColor={theme.textSecondary}
        textAlignVertical="top"
        style={[styles.editor, { color: theme.text }]}
      />

      {(noteTags.length > 0 || status !== 'idle' || addTag.isError || removeTag.isError) && (
        <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
          {noteTags.length > 0 && (
            <View style={styles.chipRow}>
              {noteTags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={`#${tag.name}  ×`}
                  selected
                  accessibilityHint="Removes this tag"
                  onPress={() => removeTag.mutate({ noteId: id, tagId: tag.id })}
                />
              ))}
            </View>
          )}
          {(addTag.isError || removeTag.isError) && (
            <ThemedText type="small" themeColor="danger">
              Couldn&apos;t update tags.
            </ThemedText>
          )}
          {status !== 'idle' && (
            <ThemedText type="small" themeColor={status === 'error' ? 'danger' : 'textSecondary'}>
              {STATUS_LABELS[status]}
            </ThemedText>
          )}
        </View>
      )}

      {tagMenuOpen && (
        <TagMenu
          tags={allTags.data ?? []}
          selectedIds={noteTags.map((tag) => tag.id)}
          onToggle={toggleTag}
          onCreate={createTag}
          onClose={() => setTagMenuOpen(false)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editor: {
    flex: 1,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
