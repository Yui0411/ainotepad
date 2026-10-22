import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type DateRange = 'any' | 'week' | 'month' | 'year';

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any time',
  week: 'Past week',
  month: 'Past month',
  year: 'Past year',
};

const DAYS: Record<Exclude<DateRange, 'any'>, number> = { week: 7, month: 31, year: 365 };

export type SearchResult = {
  id: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  score: number;
};

type SearchResponse = {
  results: SearchResult[];
  /** False when the query couldn't be embedded and only keyword search ran. */
  semantic: boolean;
};

export type SearchParams = {
  query: string;
  tagIds: string[];
  dateRange: DateRange;
};

function dateFrom(range: DateRange): string | null {
  if (range === 'any') return null;
  return new Date(Date.now() - DAYS[range] * 24 * 60 * 60 * 1000).toISOString();
}

export function useSearch(params: SearchParams) {
  const query = params.query.trim();
  return useQuery({
    queryKey: ['search', query, params.tagIds, params.dateRange],
    enabled: query !== '',
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<SearchResponse>('search', {
        body: { query, tagIds: params.tagIds, dateFrom: dateFrom(params.dateRange) },
      });
      if (error) throw error;
      return data ?? { results: [], semantic: true };
    },
  });
}
