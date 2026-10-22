import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton } from '@/components/header-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeleteTag, useReorderTags, useTagsWithCounts, type TagWithCount } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';

// Drag the handle (or long-press a row) to reorder. The order is used
// everywhere tags are listed, including the + menu in notes.
export default function TagsScreen() {
  const insets = useSafeAreaInsets();
  const tags = useTagsWithCounts();
  const reorderTags = useReorderTags();
  const deleteTag = useDeleteTag();

  function onReorder({ from, to }: ReorderableListReorderEvent) {
    if (!tags.data || from === to) return;
    reorderTags.mutate(reorderItems(tags.data, from, to), {
      onError: () => Alert.alert("Couldn't save the new order. Try again."),
    });
  }

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

  if (tags.isPending || tags.isError || tags.data.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        {tags.isPending ? (
          <ActivityIndicator />
        ) : tags.isError ? (
          <ThemedText themeColor="danger">Couldn&apos;t load tags.</ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">No tags yet. Add them from a note with +.</ThemedText>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ReorderableList
        data={tags.data}
        keyExtractor={(tag) => tag.id}
        onReorder={onReorder}
        renderItem={({ item }) => (
          <TagRow tag={item} onDelete={confirmDelete} deleteDisabled={deleteTag.isPending} />
        )}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Drag ≡ to reorder. This order is used in the + menu and tag filters.
          </ThemedText>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}
      />
    </ThemedView>
  );
}

type TagRowProps = {
  tag: TagWithCount;
  onDelete: (tag: TagWithCount) => void;
  deleteDisabled: boolean;
};

const TagRow = memo(function TagRow({ tag, onDelete, deleteDisabled }: TagRowProps) {
  const theme = useTheme();
  const drag = useReorderableDrag();

  return (
    <Pressable onLongPress={drag} style={styles.rowWrapper}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          onPressIn={drag}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${tag.name}`}
          style={styles.handle}>
          <Ionicons name="reorder-three" size={24} color={theme.textSecondary} />
        </Pressable>
        <View style={styles.rowText}>
          <ThemedText numberOfLines={1}>#{tag.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tag.noteCount} {tag.noteCount === 1 ? 'note' : 'notes'}
          </ThemedText>
        </View>
        <HeaderButton
          label="Delete"
          color="danger"
          accessibilityLabel={`Delete tag ${tag.name}`}
          onPress={() => onDelete(tag)}
          disabled={deleteDisabled}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  list: {
    padding: Spacing.three,
  },
  hint: {
    marginBottom: Spacing.three,
  },
  rowWrapper: {
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.two,
    borderRadius: Spacing.three,
  },
  handle: {
    padding: Spacing.one,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
