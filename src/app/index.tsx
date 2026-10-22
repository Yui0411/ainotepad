import * as Crypto from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton } from '@/components/header-button';
import { NoteCard } from '@/components/note-card';
import { TagFilter } from '@/components/tag-filter';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/features/notes/api';
import { useTags } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

function confirmSignOut() {
  Alert.alert('Sign out?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);
}

export default function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notes = useNotes();
  const tags = useTags();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const visibleNotes = (notes.data ?? []).filter((note) =>
    selectedTagIds.every((tagId) => note.tags.some((tag) => tag.id === tagId)),
  );

  const refresh = () => {
    notes.refetch();
    tags.refetch();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <HeaderButton label="Search" onPress={() => router.push('/search')} />
              <HeaderButton label="Sign out" color="textSecondary" onPress={confirmSignOut} />
            </View>
          ),
        }}
      />

      <FlatList
        data={visibleNotes}
        keyExtractor={(note) => note.id}
        renderItem={({ item }) => (
          <NoteCard
            id={item.id}
            body={item.body}
            createdAt={item.created_at}
            tags={item.tags.map((tag) => tag.name)}
          />
        )}
        ListHeaderComponent={
          <TagFilter tags={tags.data ?? []} selectedIds={selectedTagIds} onChange={setSelectedTagIds} />
        }
        ListHeaderComponentStyle={styles.listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            {notes.isPending ? (
              <ActivityIndicator />
            ) : notes.isError ? (
              <ThemedText themeColor="danger">Couldn&apos;t load notes. Pull down to retry.</ThemedText>
            ) : (
              <ThemedText themeColor="textSecondary">
                {selectedTagIds.length > 0 ? 'No notes with these tags.' : 'No notes yet. Tap + to write one.'}
              </ThemedText>
            )}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={notes.isRefetching} onRefresh={refresh} />}
      />

      <Pressable
        onPress={() => router.push(`/note/${Crypto.randomUUID()}`)}
        accessibilityRole="button"
        accessibilityLabel="New note"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.accent, bottom: insets.bottom + Spacing.four },
          pressed && styles.pressed,
        ]}>
        <ThemedText style={styles.fabLabel}>+</ThemedText>
      </Pressable>
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
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  listHeader: {
    marginBottom: Spacing.three,
    marginHorizontal: -Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.six,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabLabel: {
    color: '#ffffff',
    fontSize: 32,
    lineHeight: 36,
  },
  pressed: {
    opacity: 0.8,
  },
});
