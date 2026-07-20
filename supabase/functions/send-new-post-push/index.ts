// quad — send-new-post-push Edge Function
//
// Fans out a push to *every other authenticated user* when a new gig or
// hangout is posted. The trigger that calls this lives in a future migration
// (owned by Engineer B's push track); this function is shaped so the trigger
// can post the same Supabase DB-webhook payload as send-message-push.
//
// Per-user opt-in is enforced via public.notification_prefs:
//   * For new gigs:     pref column `new_gigs`     (default true).
//   * For new hangouts: pref column `new_hangouts` (default true).
// Missing row → defaults (per migration 0015 + the COALESCE in this file).
//
// Payload contract (matches Supabase DB webhook):
//   {
//     "type": "INSERT",
//     "table": "gigs" | "hangouts",
//     "schema": "public",
//     "record": { id, title, poster_id|host_id, anonymous, ... }
//   }
//
// Notification data:
//   { kind: 'gig',     gigId: <uuid> }       → routes to /gig/<id>
//   { kind: 'hangout', hangoutId: <uuid> }   → routes to a future hangout detail

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
// Invoked ONLY by our pg_net trigger (notify_new_post), which forwards
// `Authorization: Bearer <service_role_key>`. The public function URL is
// otherwise unauthenticated; without this check anyone could POST a forged
// gigs/hangouts-INSERT payload and blast a campus-wide push with
// attacker-controlled text. The service role key never ships to a client, so
// requiring it as the bearer token is a sufficient shared secret. Constant-time
// compare avoids leaking the key a byte at a time.
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
const BATCH_SIZE = 100;

type GigRecord = { id: string; title: string; poster_id: string; anonymous?: boolean };
type HangoutRecord = { id: string; title: string; host_id: string; anonymous?: boolean };

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'gigs' | 'hangouts' | string;
  schema: string;
  record?: GigRecord | HangoutRecord | null;
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

// PostgREST silently caps un-ranged selects (~1000 rows), which would make
// pushes stop reaching part of campus once user_push_tokens grows past the
// cap. Page through with Range headers until a short page. Callers must pass
// a deterministic `order=` in `path` so pages don't shear.
async function pgSelectAll<T>(path: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        accept: 'application/json',
        range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`pgSelectAll ${path} failed: ${res.status} ${txt}`);
    }
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

async function pgDeleteToken(userId: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/user_push_tokens?user_id=eq.${encodeURIComponent(
    userId,
  )}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    console.warn(`pgDeleteToken ${userId} failed: ${res.status}`);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Build the recipient list: every user with a push token, EXCEPT the author,
// EXCEPT anyone the author has blocked (or who has blocked the author), AND
// only users whose opt-in pref is true (default true).
async function resolveRecipients(
  authorId: string,
  prefColumn: 'new_gigs' | 'new_hangouts',
): Promise<{ userId: string; token: string }[]> {
  // 1) All push tokens (paginated — see pgSelectAll).
  const tokens = await pgSelectAll<{ user_id: string; expo_push_token: string }>(
    `user_push_tokens?select=user_id,expo_push_token&order=user_id.asc`,
  );

  let candidates = tokens.filter(
    (t) =>
      t.user_id !== authorId &&
      typeof t.expo_push_token === 'string' &&
      t.expo_push_token.length > 0,
  );
  if (candidates.length === 0) return [];

  // 2) Filter out users who blocked the author or whom the author blocked.
  // user_blocks lives in 0013 — tolerate missing table by catching.
  const blocks = await pgSelectAll<{ blocker_id: string; blocked_id: string }>(
    `user_blocks?or=(blocker_id.eq.${encodeURIComponent(
      authorId,
    )},blocked_id.eq.${encodeURIComponent(
      authorId,
    )})&select=blocker_id,blocked_id&order=blocker_id.asc,blocked_id.asc`,
  ).catch(() => [] as { blocker_id: string; blocked_id: string }[]);
  if (blocks.length > 0) {
    const blocked = new Set<string>();
    for (const b of blocks) {
      blocked.add(b.blocker_id === authorId ? b.blocked_id : b.blocker_id);
    }
    candidates = candidates.filter((c) => !blocked.has(c.user_id));
  }
  if (candidates.length === 0) return [];

  // 3) Apply notification_prefs. Anyone with the pref set to false drops out;
  // missing row defaults to true (the table's default). Query the opted-OUT
  // set directly instead of an in-list of every candidate — an in-list of
  // thousands of uuids overflows the URL long before the row cap bites.
  // Tolerate the table not existing yet.
  const prefs = await pgSelectAll<{ user_id: string }>(
    `notification_prefs?${prefColumn}=eq.false&select=user_id&order=user_id.asc`,
  ).catch(() => [] as { user_id: string }[]);
  const optedOut = new Set<string>(prefs.map((p) => p.user_id));
  candidates = candidates.filter((c) => !optedOut.has(c.user_id));

  return candidates.map((c) => ({ userId: c.user_id, token: c.expo_push_token }));
}

async function sendBatch(
  batch: { userId: string; token: string }[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const messages = batch.map(({ token }) => ({
    to: token,
    title,
    body,
    sound: 'default',
    data,
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.warn(`Expo push failed: ${res.status} ${await res.text()}`);
    return;
  }
  const payload = (await res.json()) as ExpoTicketResponse;
  const tickets = payload.data ?? [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const recipient = batch[i];
    if (!ticket || !recipient) continue;
    if (ticket.status === 'error') {
      const code = ticket.details?.error;
      console.warn(
        `Expo ticket error for user=${recipient.userId}: ${ticket.message} (${code ?? 'no-code'})`,
      );
      if (code === 'DeviceNotRegistered') {
        await pgDeleteToken(recipient.userId);
      }
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

  const table = payload.table;
  const rec = payload.record as GigRecord & HangoutRecord & { poster_id?: string; host_id?: string } | null;
  if (!rec || !rec.id || !rec.title) {
    return json(400, { error: 'malformed record' });
  }

  let authorId: string;
  let prefColumn: 'new_gigs' | 'new_hangouts';
  let kind: 'gig' | 'hangout';
  let title: string;
  let data: Record<string, unknown>;

  if (table === 'gigs') {
    if (!rec.poster_id) return json(400, { error: 'missing poster_id' });
    authorId = rec.poster_id;
    prefColumn = 'new_gigs';
    kind = 'gig';
    title = 'New gig on quad';
    data = { kind: 'gig', gigId: rec.id };
  } else if (table === 'hangouts') {
    if (!rec.host_id) return json(400, { error: 'missing host_id' });
    authorId = rec.host_id;
    prefColumn = 'new_hangouts';
    kind = 'hangout';
    title = 'New hangout on quad';
    data = { kind: 'hangout', hangoutId: rec.id };
  } else {
    return json(200, { skipped: true, reason: `unsupported table ${table}` });
  }

  // Trim the body — Expo wraps long titles.
  const body = rec.title.length > 180 ? `${rec.title.slice(0, 177)}…` : rec.title;

  try {
    const recipients = await resolveRecipients(authorId, prefColumn);
    if (recipients.length === 0) {
      return json(200, { sent: 0, reason: 'no opted-in recipients with tokens', kind });
    }
    const batches = chunk(recipients, BATCH_SIZE);
    await Promise.all(batches.map((b) => sendBatch(b, title, body, data)));
    return json(200, { sent: recipients.length, batches: batches.length, kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-new-post-push failed:', message);
    return json(500, { error: message });
  }
});
