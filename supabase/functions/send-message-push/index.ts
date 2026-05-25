// quad — send-message-push Edge Function
//
// Triggered by a Postgres webhook (pg_net) on INSERT into public.messages.
// Resolves every conversation member except the sender, looks up their Expo
// push token, and POSTs to https://exp.host/--/api/v2/push/send in batches
// of <=100. Stale tokens (DeviceNotRegistered receipts) are deleted from
// public.user_push_tokens so we stop trying to push to dead devices.
//
// Payload contract with the client (see lib/notifications.ts → routeForPayload):
//   data: { kind: 'message', conversationId: <uuid>, messageId: <uuid> }
//
// Auth: the function expects to be called with the Supabase service role JWT
// (set up by the trigger via pg_net). It uses the same key (auto-injected by
// the Supabase runtime as SUPABASE_SERVICE_ROLE_KEY) to talk back to Postgres
// with RLS bypass — required to read user_push_tokens (RLS only allows
// per-user self-reads) and to delete stale tokens.
//
// Zero external dependencies on purpose: just fetch + the Supabase runtime's
// built-in Deno stdlib. The Supabase JS SDK is intentionally avoided to keep
// cold starts small.

// deno-lint-ignore-file no-explicit-any

/* eslint-disable */
// @ts-ignore — Deno globals are provided by the Supabase Edge Runtime
declare const Deno: { env: { get(name: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  '';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  sent_at?: string;
};

// Supabase DB webhook payload shape (https://supabase.com/docs/guides/database/webhooks).
type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record?: MessageRow | null;
  old_record?: MessageRow | null;
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

// Thin REST helper: PostgREST select with the service role bypasses RLS.
async function pgSelect<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`pgSelect ${path} failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as T[];
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
    const txt = await res.text();
    console.warn(`pgDeleteToken ${userId} failed: ${res.status} ${txt}`);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Build the human-readable title / body. Conversation context (gig title vs
// hangout title) is fetched so notifications read like "Marcus K. (Re: Help
// moving a couch)". If the lookup fails we still send a generic notification
// — better than nothing.
async function buildNotificationFields(message: MessageRow): Promise<{
  title: string;
  body: string;
}> {
  const senderRows = await pgSelect<{ display_name: string | null }>(
    `profiles?id=eq.${encodeURIComponent(message.sender_id)}&select=display_name`,
  ).catch(() => [] as { display_name: string | null }[]);
  const senderName = senderRows[0]?.display_name ?? 'Someone';

  const convRows = await pgSelect<{
    gig: { title: string } | null;
    hangout: { title: string } | null;
  }>(
    `conversations?id=eq.${encodeURIComponent(
      message.conversation_id,
    )}&select=gig:gigs(title),hangout:hangouts(title)`,
  ).catch(() => [] as never[]);
  const conv = convRows[0];
  let title = senderName;
  if (conv?.gig?.title) {
    title = `${senderName} · ${conv.gig.title}`;
  } else if (conv?.hangout?.title) {
    title = `${senderName} · ${conv.hangout.title}`;
  }
  // iOS truncates around ~178 chars; keep body short.
  const body =
    message.body.length > 200 ? `${message.body.slice(0, 197)}…` : message.body;
  return { title, body };
}

async function resolveRecipientTokens(
  conversationId: string,
  senderId: string,
): Promise<{ userId: string; token: string }[]> {
  // 1) Members of the conversation, excluding the sender.
  const members = await pgSelect<{ user_id: string }>(
    `conversation_members?conversation_id=eq.${encodeURIComponent(
      conversationId,
    )}&user_id=neq.${encodeURIComponent(senderId)}&select=user_id`,
  );
  if (members.length === 0) return [];

  // 2) Their push tokens (one row per user; PK is user_id).
  const userIds = members.map((m) => m.user_id);
  const inList = userIds.map(encodeURIComponent).join(',');
  const tokens = await pgSelect<{ user_id: string; expo_push_token: string }>(
    `user_push_tokens?user_id=in.(${inList})&select=user_id,expo_push_token`,
  );
  return tokens
    .filter((t) => typeof t.expo_push_token === 'string' && t.expo_push_token.length > 0)
    .map((t) => ({ userId: t.user_id, token: t.expo_push_token }));
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
    const txt = await res.text();
    console.warn(`Expo push failed: ${res.status} ${txt}`);
    return;
  }

  const payload = (await res.json()) as ExpoTicketResponse;
  const tickets = payload.data ?? [];

  // Each ticket lines up positionally with `messages`. If Expo says a device
  // isn't registered anymore, drop the stale token so we stop pushing to it.
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
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, {
      error: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env',
    });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch (_e) {
    return json(400, { error: 'invalid JSON body' });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'messages') {
    // Idempotently ignore anything that isn't a new message.
    return json(200, { skipped: true, reason: 'not a messages INSERT' });
  }

  const msg = payload.record;
  if (!msg || !msg.id || !msg.conversation_id || !msg.sender_id) {
    return json(400, { error: 'malformed record' });
  }

  try {
    const recipients = await resolveRecipientTokens(
      msg.conversation_id,
      msg.sender_id,
    );
    if (recipients.length === 0) {
      return json(200, { sent: 0, reason: 'no recipients with tokens' });
    }

    const { title, body } = await buildNotificationFields(msg);
    const data = {
      kind: 'message',
      conversationId: msg.conversation_id,
      messageId: msg.id,
    };

    const batches = chunk(recipients, BATCH_SIZE);
    await Promise.all(
      batches.map((b) => sendBatch(b, title, body, data)),
    );

    return json(200, { sent: recipients.length, batches: batches.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-message-push failed:', message);
    return json(500, { error: message });
  }
});
