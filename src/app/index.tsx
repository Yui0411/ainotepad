import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton } from '@/components/header-button';
import { HeaderIconButton } from '@/components/header-icon-button';
import { NoteCard } from '@/components/note-card';
import { MenuItem, PopoverMenu } from '@/components/popover-menu';
import { TagFilter } from '@/components/tag-filter';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeleteNotes, useNotes } from '@/features/notes/api';
import { useTags } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notes = useNotes();
  const tags = useTags();
  const deleteNotes = useDeleteNotes();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Non-null while in select mode (entered by long-pressing a note).
  const [selection, setSelection] = useState<string[] | null>(null);
  const selecting = selection !== null;

  // Ignore filter selections for tags that have since been deleted.
  const activeTagIds = selectedTagIds.filter((id) => (tags.data ?? []).some((tag) => tag.id === id));
  const visibleNotes = (notes.data ?? []).filter(
    (note) =>
      (!favoritesOnly || note.is_favorite) &&
      activeTagIds.every((tagId) => note.tags.some((tag) => tag.id === tagId)),
  );

  // Android back leaves select mode instead of leaving the app.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);

  function toggleSelected(id: string) {
    if (selection === null) return;
    const next = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
    setSelection(next.length > 0 ? next : null);
  }

  function confirmDelete() {
    if (!selection || selection.length === 0) return;
    const count = selection.length;
    Alert.alert(count === 1 ? 'Delete this note?' : `Delete ${count} notes?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteNotes.mutate(selection, {
            onSuccess: () => setSelection(null),
            onError: () => Alert.alert("Couldn't delete. Try again."),
          }),
      },
    ]);
  }

  function openFromMenu(href: '/bin' | '/tags') {
    setMenuOpen(false);
    router.push(href);
  }

  function confirmSignOut() {
    setMenuOpen(false);
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const refresh = () => {
    notes.refetch();
    tags.refetch();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={
          selecting
            ? {
                title: `${selection.length} selected`,
                headerLeft: () => <HeaderButton label="Cancel" onPress={() => setSelection(null)} />,
                headerRight: () => (
                  <HeaderButton
                    label="Delete"
                    color="danger"
                    onPress={confirmDelete}
                    disabled={deleteNotes.isPending}
                  />
                ),
              }
            : {
                title: '',
                headerLeft: () => (
                  <HeaderIconButton
                    icon="menu"
                    color={theme.text}
                    accessibilityLabel="Menu"
                    onPress={() => setMenuOpen(!menuOpen)}
                  />
                ),
                headerRight: () => (
                  <View style={styles.headerButtons}>
                    <HeaderIconButton
                      icon={favoritesOnly ? 'star' : 'star-outline'}
                      color={favoritesOnly ? theme.star : theme.text}
                      accessibilityLabel="Show favourites only"
                      selected={favoritesOnly}
                      onPress={() => setFavoritesOnly(!favoritesOnly)}
                    />
                    <HeaderIconButton
                      icon="search"
                      color={theme.text}
                      accessibilityLabel="Search"
                      onPress={() => router.push('/search')}
                    />
                  </View>
                ),
              }
        }
      />

      <FlatList
        data={visibleNotes}
        keyExtractor={(note) => note.id}
        extraData={selection}
        renderItem={({ item }) => (
          <NoteCard
            body={item.body}
            createdAt={item.created_at}
            tags={item.tags.map((tag) => tag.name)}
            favorite={item.is_favorite}
            selected={selecting ? selection.includes(item.id) : undefined}
            onPress={() => (selecting ? toggleSelected(item.id) : router.push(`/note/${item.id}`))}
            onLongPress={() => (selecting ? toggleSelected(item.id) : setSelection([item.id]))}
          />
        )}
        ListHeaderComponent={
          <TagFilter tags={tags.data ?? []} selectedIds={activeTagIds} onChange={setSelectedTagIds} />
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
                {favoritesOnly
                  ? 'No favourites here. Tap the star in a note to add one.'
                  : activeTagIds.length > 0
                    ? 'No notes with these tags.'
                    : 'No notes yet. Tap + to write one.'}
              </ThemedText>
            )}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={notes.isRefetching} onRefresh={refresh} />}
      />

      {!selecting && (
        <Pressable
          onPress={() => router.push(`/note/${Crypto.randomUUID()}`)}
          accessibilityRole="button"
          accessibilityLabel="New note"
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.accent, bottom: insets.bottom + Spacing.four },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="add" size={32} color="#ffffff" />
        </Pressable>
      )}

      {menuOpen && (
        <PopoverMenu side="left" onClose={() => setMenuOpen(false)}>
          <MenuItem label="Tags" onPress={() => openFromMenu('/tags')} />
          <MenuItem label="Bin" onPress={() => openFromMenu('/bin')} />
          <MenuItem label="Sign out" color={theme.danger} onPress={confirmSignOut} />
        </PopoverMenu>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
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
  pressed: {
    opacity: 0.8,
  },
});
