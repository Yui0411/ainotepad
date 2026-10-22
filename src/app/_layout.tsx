import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider, useSession } from '@/features/auth/session';
import { useDraftSync } from '@/features/notes/sync';
import { persistOptions, queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // Send changes queued while offline once the saved cache is back.
        onSuccess={() => queryClient.resumePausedMutations()}>
        <SessionProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
          </ThemeProvider>
        </SessionProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const signedIn = session !== null;

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  // Don't leave one account's cached notes around after signing out. Waits for
  // the session to load so the saved offline cache isn't wiped at startup.
  useEffect(() => {
    if (!isLoading && !signedIn) queryClient.clear();
  }, [isLoading, signedIn]);

  // Keep the splash screen up until the saved session has been restored.
  if (isLoading) return null;

  return (
    <>
      {signedIn && <SignedInEffects />}
      <Stack>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ title: 'Notes' }} />
          <Stack.Screen name="note/[id]" options={{ title: '' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="bin" options={{ title: 'Bin' }} />
          <Stack.Screen name="tags" options={{ title: 'Tags' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function SignedInEffects() {
  useDraftSync();
  return null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
