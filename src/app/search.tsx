import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { NoteCard } from '@/components/note-card';
import { TagFilter } from '@/components/tag-filter';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { DATE_RANGE_LABELS, useSearch, type DateRange } from '@/features/search/api';
import { useTags } from '@/features/tags/api';

const DATE_RANGES = Object.keys(DATE_RANGE_LABELS) as DateRange[];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const tags = useTags();
  const [text, setText] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('any');

  const search = useSearch({ query: submittedQuery, tagIds, dateRange });

  return (
    <ThemedView style={styles.container}>
      <View style={styles.controls}>
        <View style={styles.inset}>
          <TextField
            value={text}
            onChangeText={setText}
            placeholder="Describe the note you're looking for"
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => setSubmittedQuery(text)}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled">
          {DATE_RANGES.map((range) => (
            <Chip
              key={range}
              label={DATE_RANGE_LABELS[range]}
              selected={dateRange === range}
              onPress={() => setDateRange(range)}
            />
          ))}
        </ScrollView>

        <TagFilter tags={tags.data ?? []} selectedIds={tagIds} onChange={setTagIds} />

        {search.data && !search.data.semantic && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.inset}>
            AI search is unavailable right now. These results are keyword matches only.
          </ThemedText>
        )}
      </View>

      <FlatList
        data={search.data?.results ?? []}
        keyExtractor={(result) => result.id}
        renderItem={({ item }) => (
          <NoteCard
            body={item.body}
            createdAt={item.created_at}
            tags={item.tags}
            onPress={() => router.push(`/note/${item.id}`)}
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {submittedQuery.trim() === '' ? (
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                Search by meaning. Try something vague, like &quot;that time my car was acting weird&quot;.
              </ThemedText>
            ) : search.isFetching ? (
              <ActivityIndicator />
            ) : search.isError ? (
              <ThemedText themeColor="danger">Search failed. Check your connection and try again.</ThemedText>
            ) : (
              <ThemedText themeColor="textSecondary">No matching notes.</ThemedText>
            )}
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  inset: {
    paddingHorizontal: Spacing.three,
  },
  chipRow: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  list: {
    padding: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
});
