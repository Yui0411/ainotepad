import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton } from '@/components/header-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeleteTag, useTagsWithCounts, type TagWithCount } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';

export default function TagsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tags = useTagsWithCounts();
  const deleteTag = useDeleteTag();

  function confirmDelete(tag: TagWithCount) {
    const usage =
      tag.noteCount === 0
        ? 'No notes use it.'
        : `It will be removed from ${tag.noteCount} ${tag.noteCount === 1 ? 'note' : 'notes'}. The notes themselves stay.`;
    Alert.alert(`Delete #${tag.name}?`, usage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteTag.mutate(tag.id, {
            onError: () => Alert.alert("Couldn't delete the tag. Try again."),
          }),
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={tags.data ?? []}
        keyExtractor={(tag) => tag.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.rowText}>
              <ThemedText numberOfLines={1}>#{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'}
              </ThemedText>
            </View>
            <HeaderButton
              label="Delete"
              color="danger"
              accessibilityLabel={`Delete tag ${item.name}`}
              onPress={() => confirmDelete(item)}
              disabled={deleteTag.isPending}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {tags.isPending ? (
              <ActivityIndicator />
            ) : tags.isError ? (
              <ThemedText themeColor="danger">Couldn&apos;t load tags. Pull down to retry.</ThemedText>
            ) : (
              <ThemedText themeColor="textSecondary">No tags yet. Add them from a note with +.</ThemedText>
            )}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={tags.isRefetching} onRefresh={() => void tags.refetch()} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.six,
  },
});
