import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { useComments, type CommentTargetType, type Comment } from '@/lib/comments';

const MAX_LEN = 500;

type Props = {
  targetType: CommentTargetType;
  targetId: string;
  /**
   * Anonymous-by-default for voices, named-by-default for gigs and hangouts.
   * The user can flip it per-comment.
   */
  defaultAnonymous?: boolean;
};

export function CommentThread({ targetType, targetId, defaultAnonymous = false }: Props) {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const { comments, loading, error, send, remove } = useComments(targetType, targetId);

  const [draft, setDraft] = useState('');
  const [anonymous, setAnonymous] = useState(defaultAnonymous);
  const [sending, setSending] = useState(false);

  const myId = session?.user.id ?? null;
  const trimmed = draft.trim();
  const canSend = realSession && trimmed.length > 0 && trimmed.length <= MAX_LEN && !sending;

  const onSubmit = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    try {
      // Only clear the draft if the comment actually posted — otherwise a failed
      // send (offline / RLS denial) would silently erase what the user typed.
      const ok = await send(draft, { anonymous });
      if (ok) setDraft('');
    } finally {
      setSending(false);
    }
  }, [canSend, draft, anonymous, send]);

  const ordered = useMemo(() => [...comments].sort((a, b) => a.postedAt - b.postedAt), [comments]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { borderTopColor: c.border }]}>
        <ThemedText style={[styles.eyebrow, { color: c.textMuted }]} type="mono">
          {ordered.length === 0 ? 'comments' : `${ordered.length} ${ordered.length === 1 ? 'comment' : 'comments'}`}
        </ThemedText>
      </View>

      {loading && ordered.length === 0 ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={c.textMuted} />
        </View>
      ) : ordered.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyText, { color: c.textSecondary }]}>
            No comments yet. Be the first to say something.
          </ThemedText>
        </View>
      ) : (
        <View>
          {ordered.map((cmt) => (
            <CommentRow
              key={cmt.id}
              comment={cmt}
              isMine={!!myId && cmt.authorId === myId}
              onDelete={() => remove(cmt.id)}
              targetType={targetType}
              targetId={targetId}
              c={c}
            />
          ))}
        </View>
      )}

      {error ? (
        <ThemedText style={[styles.errorText, { color: c.danger }]}>{error}</ThemedText>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.background }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              !realSession
                ? 'Sign in to comment'
                : anonymous
                  ? 'Comment anonymously…'
                  : 'Add a comment…'
            }
            placeholderTextColor={c.textMuted}
            editable={realSession}
            multiline
            maxLength={MAX_LEN}
            style={[
              styles.input,
              { color: c.text, backgroundColor: c.subtle, borderColor: c.border },
            ]}
          />

          <View style={styles.composerActions}>
            <Pressable
              onPress={() => setAnonymous((a) => !a)}
              disabled={!realSession}
              hitSlop={6}
              style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.5 : 1 }]}>
              <IconSymbol
                name={anonymous ? 'checkmark.circle.fill' : 'circle'}
                size={14}
                color={anonymous ? c.accent : c.textMuted}
              />
              <ThemedText
                style={[styles.toggleText, { color: anonymous ? c.text : c.textMuted }]}
                type="mono">
                anonymous
              </ThemedText>
            </Pressable>

            <View style={{ flex: 1 }} />

            {trimmed.length > 0 ? (
              <ThemedText
                style={[
                  styles.counter,
                  { color: trimmed.length > MAX_LEN ? c.danger : c.textMuted },
                ]}
                type="mono">
                {trimmed.length}/{MAX_LEN}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: canSend ? c.tint : c.subtle,
                  opacity: pressed && canSend ? 0.7 : 1,
                },
              ]}>
              <ThemedText
                style={[
                  styles.sendBtnText,
                  { color: canSend ? c.background : c.textMuted },
                ]}>
                {sending ? '…' : 'Post'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CommentRow({
  comment,
  isMine,
  onDelete,
  targetType,
  targetId,
  c,
}: {
  comment: Comment;
  isMine: boolean;
  onDelete: () => void;
  targetType: CommentTargetType;
  targetId: string;
  c: (typeof Colors)['light'];
}) {
  const displayName = comment.anonymous ? 'Anonymous' : comment.authorName ?? 'Unknown';
  const initials = comment.anonymous ? '?' : comment.authorInitials ?? '?';
  const avatarUri = comment.anonymous ? null : comment.authorAvatarUrl;

  return (
    <View style={[styles.commentRow, { borderBottomColor: c.border }]}>
      <Avatar uri={avatarUri} initials={initials} size={32} textSize={11} />
      <View style={styles.commentBody}>
        <View style={styles.commentMetaRow}>
          <ThemedText style={[styles.commentName, { color: c.text }]}>
            {displayName}
          </ThemedText>
          <ThemedText style={[styles.commentTime, { color: c.textMuted }]} type="mono">
            {timeAgo(comment.postedAt)}
          </ThemedText>
          {isMine ? (
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText style={[styles.deleteText, { color: c.textMuted }]} type="mono">
                delete
              </ThemedText>
            </Pressable>
          ) : (
            // The reports table has no `comment` kind, so a reported comment is
            // filed against its parent post with the comment author attached —
            // the moderator sees which thread and which user.
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: {
                    type: targetType,
                    id: targetId,
                    ...(comment.authorId ? { userId: comment.authorId } : {}),
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Report this comment"
              hitSlop={6}
              style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText style={[styles.deleteText, { color: c.textMuted }]} type="mono">
                report
              </ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedText style={[styles.commentText, { color: c.text }]}>{comment.body}</ThemedText>
      </View>
    </View>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
  },
  header: {
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  loadingBlock: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyBlock: {
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentBody: {
    flex: 1,
    gap: 4,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  commentTime: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  deleteBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  deleteText: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: 'center',
  },
  composer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 21,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  counter: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
