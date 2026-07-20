// "..." trust-and-safety menu: Report, Block user. Lives in the chat thread
// header (app/chat/[id].tsx), and is reusable from any screen that has a
// reportable target.
//
// Props:
//   * conversationId   — used as the report target id when targetKind is `message`
//   * otherUserId      — the user being blocked / whose content is being reported.
//                        Pass '' when there is no single counterpart (e.g. a
//                        hangout group chat) — the Block item is hidden and the
//                        menu is report-only.
//   * otherUserName    — for the confirm copy ("Block Marcus K.?")
//   * targetKind       — what the menu should report. Defaults to `message`
//                        (i.e. report the conversation itself); pass `profile`
//                        if the menu is opened from a 1:1 thread header.
//
// On block: confirms, inserts into `user_blocks`, and calls `onBlocked` so the
// host screen can pop the chat back to the inbox. We also delete the caller's
// own `conversation_members` row to remove the thread from their inbox.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';

type TargetKind = 'message' | 'profile' | 'gig' | 'hangout' | 'voice';

type Props = {
  conversationId?: string;
  otherUserId: string;
  otherUserName?: string;
  targetKind?: TargetKind;
  targetId?: string;
  onBlocked?: () => void;
};

export function ChatHeaderMenu({
  conversationId,
  otherUserId,
  otherUserName,
  targetKind = 'message',
  targetId,
  onBlocked,
}: Props) {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const [working, setWorking] = useState(false);
  // Inline menu instead of Alert/ActionSheet: react-native-web's Alert is a
  // no-op, which previously made block/report unreachable on the web build.
  const [open, setOpen] = useState(false);

  function openReport() {
    setOpen(false);
    const id = targetId ?? conversationId ?? otherUserId;
    router.push({
      pathname: '/report',
      params: { type: targetKind, id, userId: otherUserId },
    });
  }

  async function confirmBlock() {
    setOpen(false);
    if (working) return;
    if (isDev) {
      await confirmAsync({ title: 'Dev mode', message: 'Block is disabled in dev mode.', confirmLabel: 'OK' });
      return;
    }
    if (!session) return;
    const who = otherUserName ? otherUserName : 'this user';
    const confirmed = await confirmAsync({
      title: `Block ${who}?`,
      message:
        "They won't see your posts and you won't see theirs. You can unblock from Account settings.",
      confirmLabel: 'Block',
      destructive: true,
    });
    if (!confirmed) return;

    setWorking(true);
    // Upsert (not insert) so re-blocking an already-blocked user is idempotent
    // instead of surfacing a raw unique-constraint error.
    const { error } = await supabase
      .from('user_blocks')
      .upsert(
        { blocker_id: session.user.id, blocked_id: otherUserId },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
      );
    if (error) {
      setWorking(false);
      await confirmAsync({ title: 'Block failed', message: error.message, confirmLabel: 'OK' });
      return;
    }
    // Remove the conversation from the caller's inbox if we have one.
    if (conversationId) {
      await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', session.user.id);
    }
    setWorking(false);
    onBlocked?.();
    router.back();
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityLabel="More options"
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.5 : 1 }]}>
        <IconSymbol name="ellipsis" size={20} color={c.text} />
      </Pressable>

      {open ? (
        <>
          {/* Tap-away scrim so the menu closes when tapping elsewhere. */}
          <Pressable
            style={styles.scrim}
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
          />
          <View style={[styles.menu, { backgroundColor: c.background, borderColor: c.border }]}>
            <Pressable
              onPress={openReport}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText style={[styles.itemText, { color: c.text }]}>Report</ThemedText>
            </Pressable>
            {otherUserId ? (
              <>
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <Pressable
                  onPress={confirmBlock}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}>
                  <ThemedText style={[styles.itemText, { color: c.danger }]}>Block user</ThemedText>
                </Pressable>
              </>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full-screen invisible layer to catch outside taps.
  scrim: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    width: 4000,
    height: 4000,
  },
  menu: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 160,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    boxShadow: '0px 6px 20px rgba(12, 35, 64, 0.14)',
    elevation: 6,
    zIndex: 50,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
});
