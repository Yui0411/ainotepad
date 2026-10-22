import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/chip';
import { Spacing } from '@/constants/theme';
import type { Tag } from '@/features/notes/api';

type TagFilterProps = {
  tags: Tag[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
};

/** Horizontal row of tag chips; a note must have every selected tag. */
export function TagFilter({ tags, selectedIds, onChange }: TagFilterProps) {
  if (tags.length === 0) return null;

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      {tags.map((tag) => (
        <Chip
          key={tag.id}
          label={`#${tag.name}`}
          selected={selectedIds.includes(tag.id)}
          onPress={() => toggle(tag.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
