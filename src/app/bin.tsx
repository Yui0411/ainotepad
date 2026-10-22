import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton } from '@/components/header-button';
import { NoteCard } from '@/components/note-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeletedNotes, usePurgeNotes, useRestoreNotes } from '@/features/notes/api';

// Deleted notes. Tap notes to select them, then restore or delete them for good.
export default function BinScreen() {
  const insets = useSafeAreaInsets();
  const notes = useDeletedNotes();
  const restoreNotes = useRestoreNotes();
  const purgeNotes = usePurgeNotes();
  const [selection, setSelection] = useState<string[]>([]);

  const busy = restoreNotes.isPending || purgeNotes.isPending;
  const count = notes.data?.length ?? 0;

  function toggle(id: string) {
    setSelection(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]);
  }

  function restore() {
    restoreNotes.mutate(selection, {
      onSuccess: () => setSelection([]),
      onError: () => Alert.alert("Couldn't restore. Try again."),
    });
  }

  function confirmPurge(ids?: string[]) {
    const n = ids ? ids.length : count;
    Alert.alert(
      ids ? (n === 1 ? 'Delete this note forever?' : `Delete ${n} notes forever?`) : 'Empty the bin?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: ids ? 'Delete forever' : 'Empty bin',
          style: 'destructive',
          onPress: () =>
            purgeNotes.mutate(ids, {
              onSuccess: () => setSelection([]),
              onError: () => Alert.alert("Couldn't delete. Try again."),
            }),
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: selection.length > 0 ? `${selection.length} selected` : 'Bin',
          headerRight: () =>
            selection.length > 0 ? (
              <View style={styles.headerButtons}>
                <HeaderButton label="Restore" onPress={restore} disabled={busy} />
                <HeaderButton
                  label="Delete"
                  color="danger"
                  onPress={() => confirmPurge(selection)}
                  disabled={busy}
                />
              </View>
            ) : count > 0 ? (
              <HeaderButton label="Empty bin" color="danger" onPress={() => confirmPurge()} disabled={busy} />
            ) : undefined,
        }}
      />

      <FlatList
        data={notes.data ?? []}
        keyExtractor={(note) => note.id}
        extraData={selection}
        renderItem={({ item }) => (
          <NoteCard
            body={item.body}
            createdAt={item.created_at}
            tags={item.tags.map((tag) => tag.name)}
            selected={selection.includes(item.id)}
            onPress={() => toggle(item.id)}
          />
        )}
        ListHeaderComponent={
          count > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Tap notes to select them, then restore or delete them for good.
            </ThemedText>
          ) : undefined
        }
        ListHeaderComponentStyle={styles.listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            {notes.isPending ? (
              <ActivityIndicator />
            ) : notes.isError ? (
              <ThemedText themeColor="danger">Couldn&apos;t load the bin. Pull down to retry.</ThemedText>
            ) : (
              <ThemedText themeColor="textSecondary">The bin is empty.</ThemedText>
            )}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={notes.isRefetching} onRefresh={() => void notes.refetch()} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  list: {
    padding: Spacing.three,
  },
  listHeader: {
    marginBottom: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.six,
  },
});
