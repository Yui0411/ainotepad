import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';

type HeaderButtonProps = {
  label: string;
  onPress: () => void;
  color?: ThemeColor;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function HeaderButton({
  label,
  onPress,
  color = 'accent',
  disabled = false,
  accessibilityLabel,
}: HeaderButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
      <ThemedText type="smallBold" themeColor={color}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  dimmed: {
    opacity: 0.5,
  },
});
