import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Foreground behavior: show the alert/sound/banner while the app is open so
// users don't miss messages they're not actively looking at.
let handlerInstalled = false;
export function setupNotificationHandler() {
  if (handlerInstalled || Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerInstalled = true;
}

// Android requires at least one notification channel for sound/vibration.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0C2340',
  });
}

// Returns the Expo push token for this device, or null if we can't get one
// (web, simulator, denied permission, missing projectId). Persists the token
// to user_push_tokens so the server can look it up when sending pushes.
export async function registerForPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const ask = await Notifications.requestPermissionsAsync();
    granted = ask.granted;
  }
  if (!granted) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] missing EAS projectId — skipping token registration');
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        { user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) {
      console.warn('[push] failed to save token', error.message);
    }
    return token;
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed', err);
    return null;
  }
}

// Notification tap routing. The server should attach a `data` payload like:
//   { kind: 'message', conversationId: '<uuid>' }
// and we deep-link to the right screen here.
export type PushPayload =
  | { kind: 'message'; conversationId: string }
  | { kind: 'gig'; gigId: string }
  | { kind: 'voice'; voiceId: string };

export function routeForPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  switch (d.kind) {
    case 'message':
      return typeof d.conversationId === 'string' ? `/chat/${d.conversationId}` : null;
    case 'gig':
      return typeof d.gigId === 'string' ? `/gig/${d.gigId}` : null;
    case 'voice':
      // No dedicated voice detail screen yet; land on the Voices tab.
      return '/(tabs)/voices';
    default:
      return null;
  }
}

// Returns the route the user should land on if the app was launched via a
// notification tap. Call once after the navigation tree is mounted.
export async function getColdStartRoute(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const last = await Notifications.getLastNotificationResponseAsync();
  if (!last) return null;
  return routeForPayload(last.notification.request.content.data);
}

// Subscribe to notification taps while the app is running. Returns the
// cleanup function from expo-notifications' subscription.
export function subscribeToNotificationTaps(onRoute: (route: string) => void) {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeForPayload(response.notification.request.content.data);
    if (route) onRoute(route);
  });
  return () => sub.remove();
}

// Clears the device's saved token. Call on sign-out so the device stops
// receiving notifications for the previous account.
export async function clearPushToken(userId: string) {
  if (Platform.OS === 'web') return;
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('user_id', userId);
  if (error) {
    console.warn('[push] failed to clear token', error.message);
  }
}
