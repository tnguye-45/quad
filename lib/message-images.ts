import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const BUCKET = 'message-images';

/**
 * Max long-edge target for chat image uploads. Photos out of an iPhone's
 * 12MP camera are 4032px on the long edge — that's a ~3MB JPEG which is
 * wasteful to push through Realtime and over flaky campus wifi. 1600px is
 * Instagram-DM quality and saves ~10x on bandwidth.
 */
const MAX_EDGE = 1600;

export type MessageImageUploadResult =
  | { url: string; width: number; height: number; error?: never }
  | { url?: never; width?: never; height?: never; error: string };

/**
 * Upload a local image to the message-images bucket and return its public URL
 * + final pixel dimensions. The dimensions are stored on the message row so
 * the chat bubble can size correctly before the image finishes downloading.
 *
 * Path scheme: `{conversationId}/{timestamp}-{random}.jpg` (0037). The path
 * must NOT contain the uploader's uid: image URLs are visible to every
 * conversation member, and a uid in the path de-anonymizes an anonymous
 * hangout host. RLS on storage.objects checks the first path segment against
 * the uploader's conversation memberships.
 *
 * EXIF stripping: we re-encode as JPEG via expo-image-manipulator, which
 * drops EXIF metadata as a side effect (no GPS coords or device IDs leak).
 * We also clamp the long edge to MAX_EDGE px.
 */
export async function uploadMessageImage(
  conversationId: string,
  localUri: string,
): Promise<MessageImageUploadResult> {
  try {
    const processed = await resizeAndStripExif(localUri);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${conversationId}/${stamp}-${rand}.jpg`;

    const body = await readAsUploadBody(processed.uri);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '3600',
      });
    if (uploadErr) return { error: uploadErr.message };

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return {
      url: pub.publicUrl,
      width: processed.width,
      height: processed.height,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed.';
    return { error: msg };
  }
}

type ProcessedImage = { uri: string; width: number; height: number };

/**
 * Resize the long edge to <= MAX_EDGE and re-encode as JPEG (which strips
 * EXIF as a side effect). A first zero-action pass tells us source dims
 * cheaply; if it's already <= MAX_EDGE we skip the resize step.
 */
async function resizeAndStripExif(uri: string): Promise<ProcessedImage> {
  const probe = await manipulateAsync(uri, [], {
    compress: 1,
    format: SaveFormat.JPEG,
  });
  const longEdge = Math.max(probe.width, probe.height);
  if (longEdge <= MAX_EDGE) {
    const out = await manipulateAsync(uri, [], {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return { uri: out.uri, width: out.width, height: out.height };
  }
  const scale = MAX_EDGE / longEdge;
  const targetW = Math.round(probe.width * scale);
  const targetH = Math.round(probe.height * scale);
  const resized = await manipulateAsync(
    uri,
    [{ resize: { width: targetW, height: targetH } }],
    { compress: 0.8, format: SaveFormat.JPEG },
  );
  return { uri: resized.uri, width: resized.width, height: resized.height };
}

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
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
