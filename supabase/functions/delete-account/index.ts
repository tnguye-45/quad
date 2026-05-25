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
//  12. avatars storage      (path prefix `{uid}/`)
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

// Storage REST: list and delete every object under `{uid}/` in the avatars bucket.
async function deleteAvatarObjects(userId: string): Promise<void> {
  try {
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/avatars`, {
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
      console.warn(`avatars list failed: ${listRes.status} ${txt}`);
      return;
    }
    const items = (await listRes.json()) as { name: string }[];
    if (!Array.isArray(items) || items.length === 0) return;
    const paths = items.map((i) => `${userId}/${i.name}`);
    const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars`, {
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
      console.warn(`avatars delete failed: ${delRes.status} ${txt}`);
    }
  } catch (err) {
    console.warn('avatars cleanup threw', err);
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
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      },
    });
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
    // Order matters: kill leaves before the trunk. Most tables cascade from
    // auth.users delete, but doing it explicitly makes failure modes obvious
    // and gives the FK cascades less work.
    await pgDelete('voice_votes', uidEq);
    await pgDelete('voices', `author_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('hangout_attendees', uidEq);
    await pgDelete('messages', `sender_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('conversation_members', uidEq);
    await pgDelete('gigs', `poster_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('hangouts', `host_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('reports', `reporter_id=eq.${encodeURIComponent(uid)}`);
    // user_blocks: two FKs, two deletes.
    await pgDelete('user_blocks', `blocker_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('user_blocks', `blocked_id=eq.${encodeURIComponent(uid)}`);
    await pgDelete('notification_prefs', uidEq);
    await pgDelete('user_push_tokens', uidEq);

    await deleteAvatarObjects(uid);

    // profiles cascades from auth.users, but explicit delete protects against
    // the rare case where auth delete partially fails.
    await pgDelete('profiles', `id=eq.${encodeURIComponent(uid)}`);

    const authResult = await deleteAuthUser(uid);
    if (!authResult.ok) {
      return json(500, { error: authResult.error ?? 'auth delete failed' });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('delete-account failed:', message);
    return json(500, { error: message });
  }
});
