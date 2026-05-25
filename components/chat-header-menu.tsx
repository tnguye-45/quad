// Standalone "..." menu for chat threads. Renders an ellipsis button that,
// when tapped, surfaces an ActionSheet (iOS) / Alert (Android) with the
// trust-and-safety actions: Report, Block user.
//
// Intentionally NOT wired into `app/chat/[id].tsx` here — that file is owned
// by Engineer B's chat-polish track. This component lives alone so the wiring
// step is a clean import + one JSX line once the merges are sorted.
//
// Props:
//   * conversationId   — used as the report target id when targetKind is `message`
//   * otherUserId      — the user being blocked / whose content is being reported
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
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
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

  function openReport() {
    const id = targetId ?? conversationId ?? otherUserId;
    router.push({
      pathname: '/report',
      params: { type: targetKind, id, userId: otherUserId },
    });
  }

  async function doBlock() {
    if (working) return;
    if (isDev) {
      Alert.alert('Dev mode', 'Block is disabled in dev mode.');
      return;
    }
    if (!session) return;
    setWorking(true);
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: session.user.id, blocked_id: otherUserId });
    if (error) {
      setWorking(false);
      Alert.alert('Block failed', error.message);
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

  function confirmBlock() {
    const who = otherUserName ? otherUserName : 'this user';
    Alert.alert(
      `Block ${who}?`,
      `They won't see your posts and you won't see theirs. You can unblock from Account settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: doBlock },
      ],
    );
  }

  function openMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Report', 'Block user'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (idx) => {
          if (idx === 1) openReport();
          else if (idx === 2) confirmBlock();
        },
      );
      return;
    }
    // Android / web fallback: a vertical alert with the same two actions.
    Alert.alert('Options', undefined, [
      { text: 'Report', onPress: openReport },
      { text: 'Block user', style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View>
      <Pressable
        onPress={openMenu}
        hitSlop={8}
        accessibilityLabel="More options"
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.5 : 1 }]}>
        <IconSymbol name="ellipsis" size={20} color={c.text} />
      </Pressable>
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
});
