import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * react-native-web's `Alert.alert` is a no-op: the buttons never render and the
 * callback never fires, so any Alert-gated action (account deletion, unblock,
 * message delete) silently does nothing on the hosted web build. This falls back
 * to `window.confirm` on web and uses a native `Alert` everywhere else.
 *
 * Resolves true only if the user confirmed.
 */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const confirmFn =
      typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function'
        ? globalThis.confirm
        : null;
    return Promise.resolve(confirmFn ? confirmFn(text) : false);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
