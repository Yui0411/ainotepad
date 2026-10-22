import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// Email + password sign-in. Account creation only works while sign-ups are
// enabled in Supabase, and needs "Confirm email" turned off to sign in immediately.
export default function SignInScreen() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';
  const canSubmit =
    email.trim() !== '' && password !== '' && (!isSignUp || confirmPassword !== '');

  async function submit() {
    if (!canSubmit || busy) return;
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    setError(null);
    const credentials = { email: email.trim(), password };

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp(credentials);
      setBusy(false);
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setError('Account created, but Supabase wants the email confirmed first. Turn off "Confirm email" in Supabase, then sign in.');
        setMode('signIn');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      setBusy(false);
      if (error) setError(error.message);
    }
    // On success the session listener switches to the notes screen.
  }

  function toggleMode() {
    setError(null);
    setConfirmPassword('');
    setMode(isSignUp ? 'signIn' : 'signUp');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.content}>
          <ThemedText type="subtitle">ainotepad</ThemedText>

          <View style={styles.form}>
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <TextField
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType={isSignUp ? 'next' : 'go'}
              onSubmitEditing={isSignUp ? undefined : submit}
            />
            {isSignUp && (
              <TextField
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            )}
            <Button
              label={isSignUp ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              disabled={!canSubmit}
            />
            <Button
              label={isSignUp ? 'I already have an account' : 'Create an account'}
              variant="plain"
              onPress={toggleMode}
            />
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  form: {
    gap: Spacing.three,
  },
});
