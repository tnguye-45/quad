// quad — delete-account Edge Function
//
// Implements the App Store guideline 5.1.1(v) requirement: an in-app way for
// users to delete their account and the data we hold about them.
//
// The function expects the caller's user JWT in the Authorization header
// (Bearer ...). We verify the JWT via PostgREST (`/auth/v1/user`) to recover
// the caller's uid — never trust a uid sent in the body — and then, with the
// service role key, hard-delete every row tied to that uid:
//
//   1. voice_votes        (FK uid)
//   2. voices              (author_id)
//   3. hangout_attendees   (user_id) — and the associated leave_hangout/RPCs
//                            won't fire here; we just nuke the rows.
//   4. messages            (sender_id) — messages they sent. Messages others
//                            sent to them stay in the conversation history.
//   5. conversation_members(user_id)
//   6. gigs                (poster_id) — also cascades any conversations whose
//                            gig_id matches.
//   7. hangouts            (host_id) — same; their hangouts disappear.
//   8. reports             (reporter_id) — keep target rows that referenced
//                            this user (target_user_id) — those will null out
//                            via the existing FK ON DELETE SET NULL.
//   9. user_blocks         (blocker_id OR blocked_id)
//  10. notification_prefs  (user_id)
//  11. user_push_tokens    (user_id)
//  12. avatars + message-images storage (path prefix `{uid}/`, paginated)
//  13. profiles            (id) — cascades from auth.users delete below, but
//                            we delete explicitly for belt-and-suspenders.
//  14. auth.admin.deleteUser(uid) — last step, after everything else is gone.
//
// On success, return 200 { ok: true }. The client signs out (clears local
// session) and routes to /welcome.
//
// Zero external deps; same pattern as send-message-push.

// deno-lint-ignore-file no-explicit-any
/* eslint-disable */
// @ts-ignore — Deno globals are provided by the Supabase Edge Runtime
declare const Deno: { env: { get(name: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  '';

// The hosted web build runs on a different origin (github.io) from the
// function (supabase.co), so EVERY response — not just the OPTIONS preflight —
// needs CORS headers. Without them the browser rejects the POST response, and
// the client reports "delete failed" even though the account was destroyed.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

// Verify the caller's JWT by hitting GoTrue's /auth/v1/user with the user's
// access token. Returns the caller's uid or null.
async function verifyJwt(authHeader: string): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return typeof data.id === 'string' ? data.id : null;
  } catch (_err) {
    return null;
  }
}

async function pgDelete(table: string, filter: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      prefer: 'return=minimal',
    },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    // Log but do not throw — we want best-effort cleanup; the final
    // auth.admin.deleteUser call is the only must-succeed step.
    console.warn(`delete ${table} (${filter}) failed: ${res.status} ${txt}`);
  }
}

// Storage REST: list and delete every object under `{uid}/` in a bucket.
// Loops list→delete (always from offset 0 — each delete shifts the listing)
// until the prefix is empty, so users with more than one page of objects are
// fully cleaned up. The iteration cap only guards against a delete call that
// silently removes nothing; 200 pages × 100 objects is far beyond any real
// account.
// Returns true only if the prefix was fully cleaned. A false return means an
// object may survive as a public URL, so the caller must NOT proceed to the
// irreversible auth delete (the user would lose their JWT and could never
// retry the cleanup).
async function deleteBucketObjects(bucket: string, userId: string): Promise<boolean> {
  try {
    for (let page = 0; page < 200; page++) {
      const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }),
      });
      if (!listRes.ok) {
        const txt = await listRes.text();
        console.warn(`${bucket} list failed: ${listRes.status} ${txt}`);
        return false;
      }
      const items = (await listRes.json()) as { name: string }[];
      if (!Array.isArray(items) || items.length === 0) return true;
      const paths = items.map((i) => `${userId}/${i.name}`);
      const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!delRes.ok) {
        const txt = await delRes.text();
        console.warn(`${bucket} delete failed: ${delRes.status} ${txt}`);
        return false;
      }
    }
    console.warn(`${bucket} cleanup hit the page cap for user ${userId}`);
    return false;
  } catch (err) {
    console.warn(`${bucket} cleanup threw`, err);
    return false;
  }
}

// 0037 moved message-image paths from `{uid}/...` to `{conversationId}/...`
// (a uid in the path de-anonymized anonymous hangout hosts), so the prefix
// sweep above no longer finds them. Instead, collect the storage paths out of
// the user's own messages.image_url and delete those objects directly.
// Returns true only when every referenced object is gone (or none exist) —
// same abort-before-auth-delete contract as deleteBucketObjects.
async function deleteMessageImagesByReference(userId: string): Promise<boolean> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/messages` +
      `?sender_id=eq.${encodeURIComponent(userId)}&image_url=not.is.null&select=image_url`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) {
      console.warn(`message image_url query failed: ${res.status} ${await res.text()}`);
      return false;
    }
    const rows = (await res.json()) as { image_url: string | null }[];
    const marker = '/storage/v1/object/public/message-images/';
    const paths = rows
      .map((r) => r.image_url ?? '')
      .filter((u) => u.includes(marker))
      .map((u) => decodeURIComponent(u.slice(u.indexOf(marker) + marker.length)));
    if (paths.length === 0) return true;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/message-images`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefixes: chunk }),
      });
      if (!delRes.ok) {
        console.warn(`message-images by-reference delete failed: ${delRes.status} ${await delRes.text()}`);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('message-images by-reference cleanup threw', err);
    return false;
  }
}

async function deleteAuthUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: `auth delete ${res.status}: ${txt}` };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, {
      error: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env',
    });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const uid = await verifyJwt(authHeader);
  if (!uid) {
    return json(401, { error: 'invalid or missing user JWT' });
  }

  const uidEq = `user_id=eq.${encodeURIComponent(uid)}`;

  try {
    // Ordering rationale (fixes the "partial-delete" failure modes):
    //
    //  1) Storage FIRST, and abort if it doesn't fully clean. Both buckets are
    //     public and keyed by `{uid}/...`; a surviving object is addressable by
    //     URL forever (5.1.1(v) exposure). Because the auth delete below revokes
    //     the caller's JWT, a user can never re-invoke this function — so a
    //     storage failure must stop us BEFORE the point of no return, leaving
    //     the account intact and the request safely retriable.
    const avatarsOk = await deleteBucketObjects('avatars', uid);
    // Legacy `{uid}/...` message-image objects (pre-0037) plus current
    // `{conversationId}/...` objects found via the user's messages.
    const imagesOk = await deleteBucketObjects('message-images', uid);
    const refImagesOk = await deleteMessageImagesByReference(uid);
    if (!avatarsOk || !imagesOk || !refImagesOk) {
      return json(500, {
        error: 'storage cleanup incomplete; account not deleted — please retry',
      });
    }

    //  2) Delete the auth user. profiles references auth.users ON DELETE
    //     CASCADE, and every content table references profiles ON DELETE
    //     CASCADE, so this single call removes all of the user's DB rows
    //     atomically. It is the point of no return AND the must-succeed step:
    //     if it fails, no DB content has been touched, so the account stays
    //     coherent and the user can retry.
    const authResult = await deleteAuthUser(uid);
    if (!authResult.ok) {
      return json(500, { error: authResult.error ?? 'auth delete failed' });
    }

    //  3) Best-effort sweep of anything that somehow didn't cascade (idempotent
    //     — the rows are already gone in the normal case). Failures here are
    //     logged, not fatal: the account itself is already deleted.
    await pgDelete('voice_votes', uidEq);
    await pgDelete('voices', `author_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('hangout_attendees', uidEq);
    await pgDelete('messages', `sender_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('conversation_members', uidEq);
    await pgDelete('gigs', `poster_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('hangouts', `host_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('reports', `reporter_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('user_blocks', `blocker_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('user_blocks', `blocked_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('notification_prefs', uidEq);
    await pgDelete('user_push_tokens', uidEq);
    await pgDelete('profiles', `id=eq.${encodeURIComponent(uid)}`);

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('delete-account failed:', message);
    return json(500, { error: message });
  }
});
