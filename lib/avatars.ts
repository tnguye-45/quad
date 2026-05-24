import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const BUCKET = 'avatars';

export type AvatarUploadResult =
  | { url: string; error?: never }
  | { url?: never; error: string };

/**
 * Upload a local image URI as the user's avatar and update their profile row.
 *
 * Path scheme: `{userId}/avatar.jpg` — one canonical file per user, upserted
 * each time. RLS on storage.objects checks `auth.uid()::text` against the
 * first path segment, so users can only overwrite their own avatar.
 *
 * Returns the public URL with a cache-busting `v=<timestamp>` query so React
 * Native's <Image> doesn't show the stale previous image.
 */
export async function uploadAvatar(
  userId: string,
  localUri: string,
  mimeType: string = 'image/jpeg',
): Promise<AvatarUploadResult> {
  try {
    const path = `${userId}/avatar.jpg`;
    const body = await readAsUploadBody(localUri);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
      });
    if (uploadErr) return { error: uploadErr.message };

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);
    if (updErr) return { error: updErr.message };

    return { url: publicUrl };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed.';
    return { error: msg };
  }
}

// Supabase JS needs either a Blob, File, ArrayBuffer, or FormData. On iOS the
// `fetch(uri).then(r => r.blob())` path is flaky for file:// URIs, so we read
// the file via expo-file-system as base64 and decode to bytes manually.
async function readAsUploadBody(uri: string): Promise<ArrayBuffer | Blob> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return await res.blob();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

function decodeBase64(b64: string): ArrayBuffer {
  // atob is available in Hermes. Decode to bytes manually because Buffer
  // is not available in React Native by default.
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
