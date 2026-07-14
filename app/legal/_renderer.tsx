// Shared markdown-ish renderer for the two legal screens. Dep-free: we only
// handle the subset of markdown actually used in legal/privacy.md and
// legal/tos.md — H1, H2, bullets, bold inline runs, and paragraphs. Anything
// fancier (links, tables, images) is intentionally not supported so the doc
// authors don't accidentally rely on something we can't render.

import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

function parse(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      flushParagraph();
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      blocks.push({ kind: 'h1', text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      blocks.push({ kind: 'bullet', text: line.slice(2).trim() });
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

// Tiny inline-bold renderer. Splits on **...** runs and yields a styled
// fragment array. Doesn't try to handle escaped asterisks because the legal
// markdown doesn't use any.
function renderInline(text: string, boldColor: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <ThemedText
          key={i}
          style={{ fontWeight: '700', color: boldColor }}>
          {part.slice(2, -2)}
        </ThemedText>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function LegalDocument({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) {
  const c = Colors[useColorScheme() ?? 'light'];
  const blocks = parse(markdown);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText
              style={[styles.backText, { color: c.textMuted }]}
              type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText style={[styles.docTitle, { color: c.text }]}>
          {title}
        </ThemedText>

        {blocks.map((b, i) => {
          if (b.kind === 'h1') {
            // The markdown's own H1 is already shown as `docTitle` above; skip
            // the duplicate when it matches.
            if (b.text.toLowerCase() === title.toLowerCase()) return null;
            return (
              <ThemedText
                key={i}
                style={[styles.h1, { color: c.text }]}>
                {b.text}
              </ThemedText>
            );
          }
          if (b.kind === 'h2') {
            return (
              <ThemedText
                key={i}
                style={[styles.h2, { color: c.text }]}>
                {b.text}
              </ThemedText>
            );
          }
          if (b.kind === 'bullet') {
            return (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={[styles.bulletDot, { color: c.textMuted }]}>
                  •
                </ThemedText>
                <ThemedText style={[styles.bulletText, { color: c.text }]}>
                  {renderInline(b.text, c.text)}
                </ThemedText>
              </View>
            );
          }
          return (
            <ThemedText
              key={i}
              style={[styles.paragraph, { color: c.text }]}>
              {renderInline(b.text, c.text)}
            </ThemedText>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 60,
    gap: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  backText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  docTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 8,
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 27,
    marginTop: 16,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 22,
    marginTop: 18,
    marginBottom: 2,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: { fontSize: 15, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },
});
