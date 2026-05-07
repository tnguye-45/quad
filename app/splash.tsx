import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SplashScreen() {
  const c = Colors[useColorScheme() ?? 'light'];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.brandBlock}>
        <NamePlaque size="xl" align="vertical" />
        <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
          your campus, in your pocket
        </ThemedText>
      </View>

      <Pressable
        onPress={() => router.replace('/welcome')}
        style={({ pressed }) => [
          styles.playRing,
          {
            borderColor: c.border,
            backgroundColor: pressed ? c.subtle : 'transparent',
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}>
        {({ pressed }) => (
          <View
            style={[
              styles.playButton,
              {
                backgroundColor: c.tint,
                shadowOpacity: pressed ? 0.1 : 0.25,
              },
            ]}>
            <View style={[styles.playTriangle, { borderLeftColor: c.background }]} />
          </View>
        )}
      </Pressable>

      <ThemedText style={[styles.hint, { color: c.textSecondary }]}>tap to begin</ThemedText>

      <View style={styles.footer}>
        <ThemedText style={[styles.footerText, { color: c.textSecondary }]}>
          University of Notre Dame
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 56,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  playRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 22,
    borderBottomWidth: 22,
    borderLeftWidth: 34,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 8,
  },
  hint: {
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
