// quad — send-new-comment-push Edge Function
//
// Triggered by a Postgres webhook (pg_net) on INSERT into public.comments.
// Resolves the *owner* of the parent post (gig.poster_id / hangout.host_id /
// voice.author_id), and — if that owner is someone other than the commenter
// and has a registered push token — sends them a single Expo push that
// deep-links to the target's detail screen.
//
// Single-recipient on purpose: a comment is a reply to the post's author,
// not a campus-wide broadcast. (Multi-recipient threading — pinging other
// commenters — is a follow-up; would need a `participants` view.)
//
// Payload contract with the client (see lib/notifications.ts → routeForPayload):
//   data: { kind: 'gig'|'hangout'|'voice', gigId|hangoutId|voiceId, commentId }
//
// Same patterns as send-new-post-push: zero deps, prunes stale tokens on
// DeviceNotRegistered.

// deno-lint-ignore-file no-explicit-any
/* eslint-disable */
// @ts-ignore — Deno globals are provided by the Supabase Edge Runtime
declare const Deno: { env: { get(name: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  '';

// ─────────────────────── caller authorization ───────────────────────
// Invoked ONLY by our pg_net trigger (notify_new_comment), which forwards
// `Authorization: Bearer <service_role_key>`. The public function URL is
// otherwise unauthenticated; without this check anyone could POST a forged
// comments-INSERT payload and push attacker-controlled text to a post owner.
// The service role key never ships to a client, so requiring it as the bearer
// token is a sufficient shared secret. Constant-time compare avoids leaking the
// key a byte at a time.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function isAuthorizedCaller(req: Request): boolean {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return false;
  const token = header.slice(7).trim();
  if (!token || !SERVICE_ROLE_KEY) return false;
  return timingSafeEqual(token, SERVICE_ROLE_KEY);
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type TargetType = 'gig' | 'hangout' | 'voice';

type CommentRow = {
  id: string;
  target_type: TargetType;
  target_id: string;
  author_id: string;
  anonymous: boolean;
  body: string;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'comments' | string;
  schema: string;
  record?: CommentRow | null;
  old_record?: unknown;
};

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

type ExpoTicketResponse = {
  data?: ExpoTicket[];
  errors?: { message: string }[];
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function pgGetOne<T>(path: string): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`pgGetOne ${path} failed: ${res.status} ${txt}`);
  }
  const arr = (await res.json()) as T[];
  return arr[0] ?? null;
}

async function pgDeleteToken(userId: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/user_push_tokens?user_id=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.warn(`pgDeleteToken ${userId} failed: ${res.status} ${txt}`);
  }
}

const OWNER_COL: Record<TargetType, string> = {
  gig: 'poster_id',
  hangout: 'host_id',
  voice: 'author_id',
};

const TABLE_FOR: Record<TargetType, string> = {
  gig: 'gigs',
  hangout: 'hangouts',
  voice: 'voices',
};

async function resolveOwner(
  targetType: TargetType,
  targetId: string,
): Promise<{ ownerId: string; title: string | null } | null> {
  const ownerCol = OWNER_COL[targetType];
  const table = TABLE_FOR[targetType];
  // Voices don't have a title — fall back to a slice of body so the push
  // preview reads "Re: south dining hall is straight up unhinged…" instead
  // of "Re: (null)".
  const titleCol = targetType === 'voice' ? 'body' : 'title';
  const path = `${table}?id=eq.${encodeURIComponent(targetId)}&select=${ownerCol},${titleCol}`;
  const row = await pgGetOne<Record<string, unknown>>(path);
  if (!row) return null;
  const ownerId = row[ownerCol];
  const rawTitle = row[titleCol];
  if (typeof ownerId !== 'string') return null;
  return {
    ownerId,
    title: typeof rawTitle === 'string' ? rawTitle : null,
  };
}

async function getPushToken(userId: string): Promise<string | null> {
  const row = await pgGetOne<{ expo_push_token: string | null }>(
    `user_push_tokens?user_id=eq.${encodeURIComponent(userId)}&select=expo_push_token`,
  );
  return row?.expo_push_token ?? null;
}

async function commenterDisplayName(
  authorId: string,
  anonymous: boolean,
): Promise<string> {
  if (anonymous) return 'Someone (anonymous)';
  const row = await pgGetOne<{ display_name: string | null }>(
    `profiles?id=eq.${encodeURIComponent(authorId)}&select=display_name`,
  ).catch(() => null);
  return row?.display_name ?? 'Someone';
}

function clip(text: string | null, max: number): string {
  if (!text) return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function buildFields(
  targetType: TargetType,
  ownerPostTitle: string | null,
  commenterName: string,
  body: string,
): { title: string; body: string } {
  const noun =
    targetType === 'gig' ? 'gig' :
    targetType === 'hangout' ? 'hangout' :
    'voice';
  const previewSubject = clip(ownerPostTitle, 60);
  const title = previewSubject
    ? `New comment on your ${noun} · ${previewSubject}`
    : `New comment on your ${noun}`;
  const preview = clip(body, 120);
  return { title, body: `${commenterName}: ${preview}` };
}

function payloadFor(
  targetType: TargetType,
  targetId: string,
  commentId: string,
): Record<string, unknown> {
  switch (targetType) {
    case 'gig':
      return { kind: 'gig', gigId: targetId, commentId };
    case 'hangout':
      return { kind: 'hangout', hangoutId: targetId, commentId };
    case 'voice':
      return { kind: 'voice', voiceId: targetId, commentId };
  }
}

async function sendOne(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  recipientUserId: string,
): Promise<void> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify([{ to: token, title, body, sound: 'default', data }]),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`Expo push failed: ${res.status} ${txt}`);
    return;
  }

  const payload = (await res.json()) as ExpoTicketResponse;
  const ticket = payload.data?.[0];
  if (ticket && ticket.status === 'error') {
    const code = ticket.details?.error;
    console.warn(
      `Expo ticket error for user=${recipientUserId}: ${ticket.message} (${code ?? 'no-code'})`,
    );
    if (code === 'DeviceNotRegistered') {
      await pgDeleteToken(recipientUserId);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env' });
  }

  if (!isAuthorizedCaller(req)) {
    return json(401, { error: 'unauthorized' });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch (_e) {
    return json(400, { error: 'invalid JSON body' });
  }

  if (payload.type !== 'INSERT') {
    return json(200, { skipped: true, reason: 'not an INSERT' });
  }
  if (payload.table !== 'comments') {
    return json(200, { skipped: true, reason: `unsupported table: ${payload.table}` });
  }

  const record = payload.record;
  if (!record || !record.id || !record.target_id || !record.target_type) {
    return json(400, { error: 'malformed record' });
  }

  try {
    const owner = await resolveOwner(record.target_type, record.target_id);
    if (!owner) {
      return json(200, { skipped: true, reason: 'parent post not found' });
    }
    if (owner.ownerId === record.author_id) {
      return json(200, { skipped: true, reason: 'self-comment' });
    }

    const token = await getPushToken(owner.ownerId);
    if (!token) {
      return json(200, { skipped: true, reason: 'owner has no push token' });
    }

    const commenter = await commenterDisplayName(record.author_id, record.anonymous);
    const { title, body } = buildFields(
      record.target_type,
      owner.title,
      commenter,
      record.body,
    );
    const data = payloadFor(record.target_type, record.target_id, record.id);

    await sendOne(token, title, body, data, owner.ownerId);
    return json(200, { sent: 1, owner: owner.ownerId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-new-comment-push failed:', message);
    return json(500, { error: message });
  }
});
