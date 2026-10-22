import 'expo-sqlite/localStorage/install';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { AppState } from 'react-native';

// How long notes and tags stay readable offline since the app last saw them.
// Kept under ~24 days, the longest timer gcTime can use.
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 20;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, gcTime: CACHE_MAX_AGE_MS },
  },
});

// Lets React Query pause requests while offline and refetch / resume queued
// changes when the connection comes back.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  }),
);

// Refetch stale data when the app returns to the foreground.
AppState.addEventListener('change', (status) => {
  focusManager.setFocused(status === 'active');
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister: createAsyncStoragePersister({
    storage: localStorage,
    key: 'ainotepad:query-cache',
  }),
  maxAge: CACHE_MAX_AGE_MS,
  // Bump when cached data shapes change so old caches are dropped.
  buster: 'v1',
  dehydrateOptions: {
    // Only notes and tags are worth keeping offline; search needs the network anyway.
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && (query.queryKey[0] === 'notes' || query.queryKey[0] === 'tags'),
  },
};
