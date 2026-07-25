// quad — send-new-post-push Edge Function
//
// Fans out a push to *every other authenticated user* when a new gig, hangout
// or voice is posted. The DB triggers that call it are trg_gigs_push /
// trg_hangouts_push (0012) and trg_voices_push (0019), all sharing
// notify_new_post(), which posts the standard Supabase DB-webhook payload.
//
// Per-user opt-in is enforced via public.notification_prefs, and the default
// for a MISSING row differs per kind (migration 0015):
//   * new gigs:     pref column `new_gigs`     — default true  (opt-out)
//   * new hangouts: pref column `new_hangouts` — default true  (opt-out)
//   * new voices:   pref column `new_voices`   — default FALSE (opt-in)
// Voices are opt-in because the feed is high-volume; see resolveRecipients,
// which flips the query direction accordingly.
//
// Payload contract (matches Supabase DB webhook):
//   {
//     "type": "INSERT",
//     "table": "gigs" | "hangouts" | "voices",
//     "schema": "public",
//     "record": { id, title|body, poster_id|host_id|author_id, anonymous, ... }
//   }
//
// Notification data:
//   { kind: 'gig',     gigId: <uuid> }       → routes to /gig/<id>
//   { kind: 'hangout', hangoutId: <uuid> }   → routes to /hangout/<id>
//   { kind: 'voice',   voiceId: <uuid> }     → routes to /voice/<id>
//
// ANONYMITY: voices are an anonymous surface (0027 / 0034 / 0037). The voice
// notification may carry only the body and the topic — never the author's name
// and never anything derived from author_id. author_id is used server-side
// only, to exclude the author from their own push and to apply the two-way
// block filter.

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
type VoiceRecord = { id: string; body: string; topic?: string; author_id: string; anonymous?: boolean };

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'gigs' | 'hangouts' | 'voices' | string;
  schema: string;
  record?: GigRecord | HangoutRecord | VoiceRecord | null;
};

type PrefColumn = 'new_gigs' | 'new_hangouts' | 'new_voices';

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

// Deletes ONE dead device row. Scoped to (user_id, expo_push_token) because
// since migration 0040 a user may have several rows — deleting by user_id
// alone would unregister their other, healthy devices on the strength of one
// DeviceNotRegistered receipt.
async function pgDeleteToken(userId: string, token: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/user_push_tokens?user_id=eq.${encodeURIComponent(
    userId,
  )}&expo_push_token=eq.${encodeURIComponent(token)}`;
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

// Collapse whitespace and clip to `max`, ellipsis included in the budget —
// same helper as send-new-comment-push.
function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

// Build the recipient list: every device token, EXCEPT the author's, EXCEPT
// anyone the author has blocked (or who has blocked the author), AND only
// users whose pref for this kind resolves to true. `prefDefault` is what a
// MISSING notification_prefs row means for this kind (0015: true for
// gigs/hangouts, false for voices) and decides which side of the pref table we
// query.
async function resolveRecipients(
  authorId: string,
  prefColumn: PrefColumn,
  prefDefault: boolean,
): Promise<{ userId: string; token: string }[]> {
  // 1) All push tokens (paginated — see pgSelectAll). Since 0040 a user can
  // have several rows, so user_id alone is no longer a total order and pages
  // could shear across a tie; order by the full primary key.
  const tokens = await pgSelectAll<{ user_id: string; expo_push_token: string }>(
    `user_push_tokens?select=user_id,expo_push_token&order=user_id.asc,expo_push_token.asc`,
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

  // 3) Apply notification_prefs. Either way we query one side of the pref
  // table directly rather than an in-list of every candidate — an in-list of
  // thousands of uuids overflows the URL long before the row cap bites.
  // Tolerate the table not existing yet; note that the tolerant fallback for
  // an opt-in kind is "send to nobody", which is the safe direction.
  if (prefDefault) {
    // Opt-out kind: everyone is a recipient unless they set the pref false.
    const optedOutRows = await pgSelectAll<{ user_id: string }>(
      `notification_prefs?${prefColumn}=eq.false&select=user_id&order=user_id.asc`,
    ).catch(() => [] as { user_id: string }[]);
    const optedOut = new Set<string>(optedOutRows.map((p) => p.user_id));
    candidates = candidates.filter((c) => !optedOut.has(c.user_id));
  } else {
    // Opt-in kind (voices): only users who explicitly set the pref true. A
    // user with NO prefs row has not opted in, so the opted-out query used for
    // the other kinds would have pushed every voice to all of campus — the
    // exact opposite of "High volume — off by default".
    const optedInRows = await pgSelectAll<{ user_id: string }>(
      `notification_prefs?${prefColumn}=eq.true&select=user_id&order=user_id.asc`,
    ).catch(() => [] as { user_id: string }[]);
    const optedIn = new Set<string>(optedInRows.map((p) => p.user_id));
    candidates = candidates.filter((c) => optedIn.has(c.user_id));
  }

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
  // Tickets line up positionally with `messages`, which was mapped 1:1 from
  // `batch` — still true now that a user can appear in `batch` more than once
  // (one entry per device), so recipient.token is the token that failed.
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
        await pgDeleteToken(recipient.userId, recipient.token);
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
  // Validation is per-table: gigs and hangouts have `title`, voices have
  // `body`. A single `!rec.title` guard up front (as this had) rejects every
  // voice before the dispatch is even reached.
  const rec = payload.record as
    | (GigRecord & HangoutRecord & VoiceRecord & {
        poster_id?: string;
        host_id?: string;
        author_id?: string;
        title?: string;
        body?: string;
        topic?: string;
      })
    | null;
  if (!rec || !rec.id) {
    return json(400, { error: 'malformed record' });
  }

  let authorId: string;
  let prefColumn: PrefColumn;
  let prefDefault: boolean;
  let kind: 'gig' | 'hangout' | 'voice';
  let title: string;
  let bodySource: string;
  let data: Record<string, unknown>;

  if (table === 'gigs') {
    if (!rec.poster_id) return json(400, { error: 'missing poster_id' });
    if (!rec.title) return json(400, { error: 'missing title' });
    authorId = rec.poster_id;
    prefColumn = 'new_gigs';
    prefDefault = true;
    kind = 'gig';
    title = 'New gig on quad';
    bodySource = rec.title;
    data = { kind: 'gig', gigId: rec.id };
  } else if (table === 'hangouts') {
    if (!rec.host_id) return json(400, { error: 'missing host_id' });
    if (!rec.title) return json(400, { error: 'missing title' });
    authorId = rec.host_id;
    prefColumn = 'new_hangouts';
    prefDefault = true;
    kind = 'hangout';
    title = 'New hangout on quad';
    bodySource = rec.title;
    data = { kind: 'hangout', hangoutId: rec.id };
  } else if (table === 'voices') {
    if (!rec.author_id) return json(400, { error: 'missing author_id' });
    if (!rec.body) return json(400, { error: 'missing body' });
    // author_id goes no further than resolveRecipients (author exclusion +
    // block filter). Nothing below derives a name, an initial or a profile
    // lookup from it: the notification carries only the topic and the body,
    // because a voice is anonymous by default and the push must not become
    // the one place that says who wrote it.
    authorId = rec.author_id;
    prefColumn = 'new_voices';
    prefDefault = false; // 0015: new_voices defaults to false — opt-in only.
    kind = 'voice';
    title = rec.topic ? `New voice on quad · ${clip(rec.topic, 24)}` : 'New voice on quad';
    bodySource = rec.body;
    data = { kind: 'voice', voiceId: rec.id };
  } else {
    return json(200, { skipped: true, reason: `unsupported table ${table}` });
  }

  // Trim — Expo wraps long text and iOS truncates around ~178 chars.
  const body = clip(bodySource, 180);

  try {
    const recipients = await resolveRecipients(authorId, prefColumn, prefDefault);
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
