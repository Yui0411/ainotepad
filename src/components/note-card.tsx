import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatNoteDate, noteSnippet } from '@/features/notes/format';
import { useTheme } from '@/hooks/use-theme';

type NoteCardProps = {
  body: string;
  createdAt: string;
  tags: string[];
  onPress: () => void;
  onLongPress?: () => void;
  /** Set while the list is in select mode; undefined otherwise. */
  selected?: boolean;
};

export function NoteCard({ body, createdAt, tags, onPress, onLongPress, selected }: NoteCardProps) {
  const theme = useTheme();
  const snippet = noteSnippet(body);
  const selecting = selected !== undefined;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
        selected && { borderColor: theme.accent },
        pressed && styles.pressed,
      ]}>
      <View style={styles.content}>
        <ThemedText numberOfLines={3}>{snippet || 'Empty note'}</ThemedText>
        <View style={styles.meta}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatNoteDate(createdAt)}
          </ThemedText>
          {tags.length > 0 && (
            <ThemedText type="small" themeColor="accent" numberOfLines={1} style={styles.tags}>
              {tags.map((tag) => `#${tag}`).join('  ')}
            </ThemedText>
          )}
        </View>
      </View>

      {selecting && (
        <View
          style={[
            styles.checkbox,
            { borderColor: selected ? theme.accent : theme.textSecondary },
            selected && { backgroundColor: theme.accent },
          ]}>
          {selected && <ThemedText style={styles.checkmark}>✓</ThemedText>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    gap: Spacing.two,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  tags: {
    flexShrink: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 16,
  },
});
