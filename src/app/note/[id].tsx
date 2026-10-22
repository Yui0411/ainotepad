import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { Chip } from '@/components/chip';
import { HeaderButton } from '@/components/header-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { noteKeys, saveNote, useDeleteNote, useNote, type Note } from '@/features/notes/api';
import { formatNoteDate } from '@/features/notes/format';
import { normalizeTagName, useAddTag, useRemoveTag, useTags } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';

const AUTOSAVE_DELAY_MS = 1500;
const MAX_TAG_SUGGESTIONS = 6;

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
  const removeTag = useRemoveTag();
  const deleteNote = useDeleteNote();

  const [body, setBody] = useState(initialNote?.body ?? '');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [newTag, setNewTag] = useState('');

  const latestBody = useRef(initialNote?.body ?? '');
  const savedBody = useRef(initialNote?.body ?? '');
  const exists = useRef(initialNote !== null);
  const deleted = useRef(false);
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
      if (deleted.current) return;
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

  async function submitTag() {
    const name = normalizeTagName(newTag);
    if (name === '') return;
    setNewTag('');
    // note_tags references the note, so make sure it's saved first.
    await persist({ createIfEmpty: true });
    if (exists.current) addTag.mutate({ noteId: id, name });
  }

  function confirmDelete() {
    Alert.alert('Delete this note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          clearTimeout(timer.current);
          await queue.current;
          deleted.current = true;
          if (exists.current) {
            try {
              await deleteNote.mutateAsync(id);
            } catch {
              deleted.current = false;
              Alert.alert("Couldn't delete the note. Try again.");
              return;
            }
          }
          router.back();
        },
      },
    ]);
  }

  const noteTags = note?.tags ?? [];
  const query = normalizeTagName(newTag);
  const suggestions = (allTags.data ?? [])
    .filter((tag) => !noteTags.some((t) => t.id === tag.id))
    .filter((tag) => query === '' || tag.name.startsWith(query))
    .slice(0, MAX_TAG_SUGGESTIONS);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: formatNoteDate(initialNote?.created_at ?? new Date().toISOString()),
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderButton
                label={mode === 'edit' ? 'Preview' : 'Edit'}
                onPress={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
              />
              <HeaderButton label="Delete" color="danger" onPress={confirmDelete} />
            </View>
          ),
        }}
      />

      {mode === 'edit' ? (
        <TextInput
          value={body}
          onChangeText={onChangeBody}
          multiline
          autoFocus={initialNote === null}
          placeholder="Write something… Markdown works: # heading, - list, - [ ] todo"
          placeholderTextColor={theme.textSecondary}
          textAlignVertical="top"
          style={[styles.editor, { color: theme.text }]}
        />
      ) : (
        <MarkdownPreview body={body} />
      )}

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

        <TextField
          value={newTag}
          onChangeText={setNewTag}
          placeholder="Add tag"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={submitTag}
        />

        {newTag !== '' && suggestions.length > 0 && (
          <View style={styles.chipRow}>
            {suggestions.map((tag) => (
              <Chip
                key={tag.id}
                label={`#${tag.name}`}
                onPress={async () => {
                  setNewTag('');
                  await persist({ createIfEmpty: true });
                  if (exists.current) addTag.mutate({ noteId: id, name: tag.name });
                }}
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
    </ThemedView>
  );
}

function MarkdownPreview({ body }: { body: string }) {
  const colorScheme = useColorScheme();
  const elements = useMarkdown(body || '_Nothing here yet._', { colorScheme: colorScheme ?? undefined });

  return (
    <ScrollView contentContainerStyle={styles.preview}>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </ScrollView>
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
    gap: Spacing.one,
  },
  editor: {
    flex: 1,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
  },
  preview: {
    padding: Spacing.three,
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
