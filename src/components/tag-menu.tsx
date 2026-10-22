import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { MenuItem, PopoverMenu } from '@/components/popover-menu';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Tag } from '@/features/notes/api';
import { normalizeTagName } from '@/features/tags/api';
import { useTheme } from '@/hooks/use-theme';

type TagMenuProps = {
  tags: Tag[];
  selectedIds: string[];
  onToggle: (tag: Tag) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
};

/**
 * Lists every tag; tapping one adds it to or removes it from the note.
 * Typing a new name filters the list or creates a tag.
 */
export function TagMenu({ tags, selectedIds, onToggle, onCreate, onClose }: TagMenuProps) {
  const theme = useTheme();
  const [text, setText] = useState('');

  const query = normalizeTagName(text);
  const visibleTags = tags.filter((tag) => query === '' || tag.name.includes(query));
  const canCreate = query !== '' && !tags.some((tag) => tag.name === query);

  function create() {
    if (!canCreate) return;
    onCreate(query);
    setText('');
  }

  return (
    <PopoverMenu side="right" onClose={onClose} style={styles.menu}>
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Find or create a tag"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={create}
        style={styles.input}
      />

      <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
        {canCreate && <MenuItem label={`Create "#${query}"`} color={theme.accent} onPress={create} />}
        {visibleTags.map((tag) => (
          <MenuItem
            key={tag.id}
            label={`#${tag.name}`}
            checked={selectedIds.includes(tag.id)}
            onPress={() => onToggle(tag)}
          />
        ))}
        {tags.length === 0 && !canCreate && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No tags yet. Type a name above to create one.
          </ThemedText>
        )}
      </ScrollView>
    </PopoverMenu>
  );
}

const styles = StyleSheet.create({
  menu: {
    width: 260,
    maxHeight: 360,
  },
  input: {
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.one,
    minHeight: 40,
  },
  list: {
    flexGrow: 0,
  },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
