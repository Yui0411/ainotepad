import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PopoverMenuProps = {
  /** Which top corner of the screen the menu hangs from. */
  side: 'left' | 'right';
  onClose: () => void;
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * A dropdown panel under the header with a tap-outside-to-close backdrop.
 * Render it as the last child of the screen so it sits above the content.
 */
export function PopoverMenu({ side, onClose, children, style }: PopoverMenuProps) {
  const theme = useTheme();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        style={[
          styles.menu,
          side === 'left' ? styles.left : styles.right,
          { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          style,
        ]}>
        {children}
      </View>
    </View>
  );
}

type MenuItemProps = {
  label: string;
  onPress: () => void;
  checked?: boolean;
  color?: string;
};

export function MenuItem({ label, onPress, checked, color }: MenuItemProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={checked === undefined ? 'menuitem' : 'checkbox'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={[styles.itemLabel, color ? { color } : null]} numberOfLines={1}>
        {label}
      </ThemedText>
      {checked && <ThemedText themeColor="accent">✓</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    top: Spacing.two,
    minWidth: 200,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  left: {
    left: Spacing.two,
  },
  right: {
    right: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.two,
  },
  itemLabel: {
    flex: 1,
  },
});
