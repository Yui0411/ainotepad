import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';

type HeaderIconButtonProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  onPress: () => void;
  color: string;
  /** For toggles, e.g. the favourite star. */
  selected?: boolean;
};

export function HeaderIconButton({ icon, accessibilityLabel, onPress, color, selected }: HeaderIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={selected === undefined ? 'button' : 'togglebutton'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.5,
  },
});
