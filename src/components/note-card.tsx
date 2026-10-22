import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatNoteDate, noteSnippet } from '@/features/notes/format';
import { useTheme } from '@/hooks/use-theme';

type NoteCardProps = {
  id: string;
  body: string;
  createdAt: string;
  tags: string[];
};

export function NoteCard({ id, body, createdAt, tags }: NoteCardProps) {
  const theme = useTheme();
  const snippet = noteSnippet(body);

  return (
    <Link href={`/note/${id}`} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
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
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  tags: {
    flexShrink: 1,
  },
});
