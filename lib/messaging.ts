import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth-context';
import { supabase } from './supabase';

// Realtime channel topics must be unique per hook instance: realtime-js hands
// back the EXISTING channel for a duplicate topic, so the second consumer's
// post-join .on() bindings never reach the server and either consumer's
// cleanup kills the shared channel. Presence is the one exception (see the
// refcounted registry below) because typing needs a topic shared across users.
let channelSeq = 0;

export type ConversationSummary = {
  id: string;
  contextLabel: string;     // "Re: Help moving a couch · $40" or "Hangout · 4 people"
  partnerName: string;      // counterpart's display name (or "Group · N")
  partnerInitials: string;
  partnerAvatarUrl: string | null;
  preview: string;
  preview_at: number;
  unread: boolean;
};

export type Message = {
  id: string;
  body: string;
  sent_at: number;
  sender_id: string;
  sender_name: string | null;
  sender_initials: string | null;
  sender_avatar_url: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
};

type ProfileEmbed = {
  display_name: string | null;
  initials: string | null;
  avatar_url: string | null;
} | null;

// Conversation context now comes from the 0027 `*_feed` views, not embeds on
// the base tables — table-wide SELECT on gigs/hangouts was revoked and the
// identity columns (`poster_id`/`host_id`) were never re-granted, so the old
// `gig:gigs(...)` embed fails the WHOLE request with 42501. View semantics:
// the author id is NULL when the row is anonymous and not mine; my own rows
// always carry my id. That null IS the masking signal.
type GigEmbed = {
  title: string;
  payout_cents: number;
  anonymous: boolean;
  /** null ⇢ anonymous poster who isn't me (masked by gigs_feed). */
  poster_id: string | null;
} | null;

type HangoutEmbed = {
  title: string;
  anonymous: boolean;
  /** null ⇢ anonymous host who isn't me (masked by hangouts_feed). */
  host_id: string | null;
} | null;

type PreviewMessage = {
  id: string;
  sender_id: string;
  body: string | null;
  sent_at: string;
  image_url: string | null;
};

type ConversationRow = {
  id: string;
  gig_id: string | null;
  hangout_id: string | null;
  gig: GigEmbed;
  hangout: HangoutEmbed;
  /** Latest message only — the embed is ordered desc and limited to 1. */
  messages?: PreviewMessage[];
};

type MemberRow = {
  conversation_id: string;
  user_id: string;
  user: ProfileEmbed;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  sent_at: string;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  sender: ProfileEmbed;
};

const MESSAGE_SELECT =
  'id, conversation_id, sender_id, body, sent_at, image_url, image_width, image_height, ' +
  'sender:profiles!messages_sender_id_fkey(display_name, initials, avatar_url)';

/** Newest messages fetched per thread. Older history stays on the server
 *  instead of being re-downloaded on every INSERT/DELETE. */
const THREAD_PAGE_SIZE = 50;

function messageFromRow(m: MessageRow): Message {
  return {
    id: m.id,
    body: m.body ?? '',
    sent_at: new Date(m.sent_at).getTime(),
    sender_id: m.sender_id,
    sender_name: m.sender?.display_name ?? null,
    sender_initials: m.sender?.initials ?? null,
    sender_avatar_url: m.sender?.avatar_url ?? null,
    image_url: m.image_url ?? null,
    image_width: m.image_width ?? null,
    image_height: m.image_height ?? null,
  };
}

// ─────────────── Shared presence channels (typing indicator) ───────────────
// Typing presence must ride a topic BOTH chat partners join, so it can't be
// made instance-unique like the postgres_changes channels above. Same-topic
// consumers on this device instead share one refcounted channel — only the
// last release tears it down, so a stacked duplicate of the same chat screen
// can no longer kill the channel out from under the instance below it.

type PresenceMeta = { typing?: boolean; displayName?: string | null };
type PresenceListener = (state: Record<string, PresenceMeta[]>) => void;

const presenceRegistry = new Map<
  string,
  {
    channel: ReturnType<typeof supabase.channel>;
    refs: number;
    listeners: Set<PresenceListener>;
  }
>();

function acquirePresenceChannel(
  topic: string,
  presenceKey: string,
  listener: PresenceListener,
) {
  let entry = presenceRegistry.get(topic);
  if (!entry) {
    const channel = supabase.channel(topic, {
      config: { presence: { key: presenceKey } },
    });
    const created = { channel, refs: 0, listeners: new Set<PresenceListener>() };
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, PresenceMeta[]>;
      created.listeners.forEach((l) => l(state));
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track an initial "not typing" state so other clients see us join
        // the presence set immediately.
        await channel.track({ typing: false, displayName: null });
      }
    });
    presenceRegistry.set(topic, created);
    entry = created;
  }
  const acquired = entry;
  acquired.refs += 1;
  acquired.listeners.add(listener);
  // Late joiners on an already-live channel would otherwise wait for the next
  // presence diff before seeing who's typing.
  listener(acquired.channel.presenceState() as Record<string, PresenceMeta[]>);
  let released = false;
  return {
    channel: acquired.channel,
    release: () => {
      if (released) return;
      released = true;
      acquired.refs -= 1;
      acquired.listeners.delete(listener);
      if (acquired.refs <= 0) {
        presenceRegistry.delete(topic);
        void supabase.removeChannel(acquired.channel);
      }
    },
  };
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

// A conversation counterpart must never reveal an anonymous author's identity.
// Gigs can no longer be DM'd anonymously (0034 refuses it server-side), but an
// anonymous hangout still forms a group chat with its host — so mask wherever
// we'd otherwise render their real name/avatar. The `*_feed` views null the
// author id for anonymous rows that aren't mine, so:
//   author id === my id → I'm the anonymous author (safe to know)
//   author id === null  → the anonymous author is some OTHER member — in a
//     1:1 gig thread or a two-person hangout chat, that's the counterpart.
function anonymousAuthorIsOther(conv: ConversationRow): boolean {
  if (conv.gig?.anonymous && conv.gig.poster_id === null) return true;
  if (conv.hangout?.anonymous && conv.hangout.host_id === null) return true;
  return false;
}

function isMyAnonymousConversation(conv: ConversationRow, myId: string): boolean {
  if (conv.gig?.anonymous && conv.gig.poster_id === myId) return true;
  if (conv.hangout?.anonymous && conv.hangout.host_id === myId) return true;
  return false;
}

const GIG_CONTEXT_SELECT = 'id, title, payout_cents, anonymous, poster_id';
const HANGOUT_CONTEXT_SELECT = 'id, title, anonymous, host_id';

type GigContextRow = NonNullable<GigEmbed> & { id: string };
type HangoutContextRow = NonNullable<HangoutEmbed> & { id: string };

// Batch-fetch gig/hangout context through the feed views. Rows missing from
// the result (deleted, or the author is blocked and the view filtered them)
// simply fall out of the maps and callers render a generic label. Errors
// THROW rather than degrade: without context we can't tell an anonymous
// conversation from a named one, and rendering unmasked names on a guess is
// exactly the leak the views exist to prevent.
async function fetchConversationContexts(
  gigIds: string[],
  hangoutIds: string[],
): Promise<{
  gigs: Map<string, NonNullable<GigEmbed>>;
  hangouts: Map<string, NonNullable<HangoutEmbed>>;
}> {
  const [gigRes, hangoutRes] = await Promise.all([
    gigIds.length > 0
      ? supabase.from('gigs_feed').select(GIG_CONTEXT_SELECT).in('id', gigIds)
      : Promise.resolve({ data: [], error: null }),
    hangoutIds.length > 0
      ? supabase.from('hangouts_feed').select(HANGOUT_CONTEXT_SELECT).in('id', hangoutIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (gigRes.error) throw gigRes.error;
  if (hangoutRes.error) throw hangoutRes.error;
  const gigs = new Map<string, NonNullable<GigEmbed>>();
  for (const g of (gigRes.data ?? []) as unknown as GigContextRow[]) {
    gigs.set(g.id, {
      title: g.title,
      payout_cents: g.payout_cents,
      anonymous: g.anonymous,
      poster_id: g.poster_id,
    });
  }
  const hangouts = new Map<string, NonNullable<HangoutEmbed>>();
  for (const h of (hangoutRes.data ?? []) as unknown as HangoutContextRow[]) {
    hangouts.set(h.id, {
      title: h.title,
      anonymous: h.anonymous,
      host_id: h.host_id,
    });
  }
  return { gigs, hangouts };
}

const MASKED_PARTNER = {
  name: 'Anonymous',
  initials: '?',
  avatarUrl: null as string | null,
};

function contextLabelFor(conv: ConversationRow): string {
  if (conv.gig) {
    const who = conv.gig.anonymous ? '(anonymous)' : '';
    return `Re: ${conv.gig.title} · ${dollars(conv.gig.payout_cents)} ${who}`.trim();
  }
  if (conv.hangout) {
    const who = conv.hangout.anonymous ? '· anonymous host' : '';
    return `Hangout · ${conv.hangout.title} ${who}`.trim();
  }
  return 'Conversation';
}

export function useConversations(): {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Every realtime event (INSERT/DELETE/read) triggers a full refetch; a busy
  // thread can fire several in flight at once. A generation counter makes the
  // latest fetch the only one allowed to commit, so an older snapshot resolving
  // late can't overwrite newer state.
  const fetchGenRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = async () => {
    if (!realSession) {
      setRows([]);
      setLoading(false);
      return;
    }
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const me = session!.user.id;
      const { data: memberRows, error: e1 } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', me);
      if (e1) throw e1;

      const memberData = (memberRows ?? []) as {
        conversation_id: string;
        last_read_at: string;
      }[];
      const convIds = memberData.map((m) => m.conversation_id);
      if (convIds.length === 0) {
        if (fetchGenRef.current === gen) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const [convRes, partnerRes] = await Promise.all([
        // Latest message per conversation via the ordered limit-1 embed (it
        // replaces the old "download every message in every thread and dedupe
        // in JS" preview query). Gig/hangout context is fetched separately
        // through the *_feed views — embedding the base tables selects the
        // revoked identity columns and 42501s the whole request.
        supabase
          .from('conversations')
          .select('id, gig_id, hangout_id, messages(id, sender_id, body, sent_at, image_url)')
          .in('id', convIds)
          .order('sent_at', { referencedTable: 'messages', ascending: false })
          .limit(1, { referencedTable: 'messages' }),
        // Other members of each conversation (everyone except me, with name).
        supabase
          .from('conversation_members')
          .select(
            'conversation_id, user_id, user:profiles!conversation_members_user_id_fkey(display_name, initials, avatar_url)',
          )
          .in('conversation_id', convIds)
          .neq('user_id', me),
      ]);
      if (convRes.error) throw convRes.error;
      if (partnerRes.error) throw partnerRes.error;

      const rawConvs = (convRes.data ?? []) as unknown as Omit<
        ConversationRow,
        'gig' | 'hangout'
      >[];
      const ctx = await fetchConversationContexts(
        [...new Set(rawConvs.map((c) => c.gig_id).filter((id): id is string => !!id))],
        [...new Set(rawConvs.map((c) => c.hangout_id).filter((id): id is string => !!id))],
      );
      const convById = new Map<string, ConversationRow>();
      for (const conv of rawConvs) {
        convById.set(conv.id, {
          ...conv,
          gig: conv.gig_id ? (ctx.gigs.get(conv.gig_id) ?? null) : null,
          hangout: conv.hangout_id ? (ctx.hangouts.get(conv.hangout_id) ?? null) : null,
        });
      }
      const partnersByConv = new Map<string, MemberRow[]>();
      for (const p of (partnerRes.data ?? []) as unknown as MemberRow[]) {
        const list = partnersByConv.get(p.conversation_id) ?? [];
        list.push(p);
        partnersByConv.set(p.conversation_id, list);
      }

      const summaries: ConversationSummary[] = memberData.map((m) => {
        const conv =
          convById.get(m.conversation_id) ??
          ({ id: m.conversation_id, gig_id: null, hangout_id: null, gig: null, hangout: null } as ConversationRow);
        const partners = partnersByConv.get(m.conversation_id) ?? [];
        const partner = partners[0];
        const last = conv.messages?.[0];
        let partnerName = partner?.user?.display_name ?? 'Unknown';
        let partnerInitials = partner?.user?.initials ?? '?';
        let partnerAvatarUrl = partner?.user?.avatar_url ?? null;
        if (partners.length > 1) {
          partnerName = `Group · ${partners.length + 1} people`;
          partnerInitials = '··';
          partnerAvatarUrl = null;
        } else if (partner && anonymousAuthorIsOther(conv)) {
          // One counterpart + an anonymous author who isn't me ⇒ the
          // counterpart is the anonymous author.
          partnerName = MASKED_PARTNER.name;
          partnerInitials = MASKED_PARTNER.initials;
          partnerAvatarUrl = MASKED_PARTNER.avatarUrl;
        }
        const lastReadAt = new Date(m.last_read_at).getTime();
        const lastMsgAt = last ? new Date(last.sent_at).getTime() : 0;
        return {
          id: m.conversation_id,
          contextLabel: contextLabelFor(conv),
          partnerName,
          partnerInitials,
          partnerAvatarUrl,
          preview: last
            ? (last.body && last.body.length > 0
                ? last.body
                : last.image_url
                  ? '📷 Photo'
                  : '')
            : 'No messages yet — say hi.',
          preview_at: lastMsgAt,
          unread: !!last && last.sender_id !== me && lastMsgAt > lastReadAt,
        };
      });
      summaries.sort((a, b) => b.preview_at - a.preview_at);
      if (fetchGenRef.current !== gen) return;
      setRows(summaries);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load conversations.';
      console.warn('[messaging] useConversations failed:', msg);
      if (fetchGenRef.current === gen) setError(msg);
    } finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (!realSession) return;
    // Coalesce bursts of events (a group chat delivering several messages, or a
    // read bumping last_read_at) into a single refetch.
    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchAll(), 300);
    };
    const channel = supabase
      .channel(`conv-list:${++channelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        // Deleting the latest message must refresh the row preview.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        // Reading a thread bumps my last_read_at; without this the row's unread
        // flag stayed set until the next message arrived (the badge never
        // cleared after opening and reading a conversation).
        { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        scheduleRefetch,
      )
      .subscribe((status) => {
        // Fires on every (re)join, not just the first — messages that arrived
        // while the socket was down would otherwise be missing until remount.
        if (status === 'SUBSCRIBED') void fetchAll();
      });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, session?.user.id]);

  return { conversations: rows, loading, error, refresh: fetchAll };
}

export type SendArgs = {
  body?: string;
  image?: { url: string; width: number; height: number } | null;
};

/** Member read state for the active conversation. Keyed by user_id. */
export type MemberReadState = {
  userId: string;
  displayName: string | null;
  lastReadAt: number;
};

/** Typing presence for the active conversation. Keyed by user_id. */
export type TypingState = {
  userId: string;
  displayName: string | null;
};

export function useThread(conversationId: string | undefined): {
  conversation: ConversationRow | null;
  partnerName: string;
  partnerInitials: string;
  partnerAvatarUrl: string | null;
  /** True when the counterpart is an anonymous author we're masking. Callers MUST
   *  withhold their user id from anything that would reveal it — the block insert
   *  and the report params both take a raw uid, and the public profiles directory
   *  turns one into a name. */
  partnerIsMasked: boolean;
  messages: Message[];
  loading: boolean;
  error: string | null;
  /** Resolves true when the message reached the server, false on failure. */
  send: (args: SendArgs) => Promise<boolean>;
  /** Hard-delete my own messages by id. Resolves true on success. */
  deleteMessages: (ids: string[]) => Promise<boolean>;
  /** Other members' last_read_at timestamps (ms epoch). Excludes the caller. */
  otherReads: MemberReadState[];
  /** Other members typing right now. Excludes the caller. */
  typing: TypingState[];
  /** Mark a typing intent. Debounced to send "false" 1.5s after last call. */
  setTyping: (isTyping: boolean) => void;
} {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerName, setPartnerName] = useState('Conversation');
  const [partnerInitials, setPartnerInitials] = useState('?');
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);
  const [partnerIsMasked, setPartnerIsMasked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherReads, setOtherReads] = useState<MemberReadState[]>([]);
  const [typing, setTypingList] = useState<TypingState[]>([]);

  // Stable refs the typing debouncer reads — we can't capture changing state
  // in the debounce timer without rescheduling on every keypress.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myDisplayNameRef = useRef<string | null>(null);
  const lastTypingSentRef = useRef<boolean>(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // markRead must not fire while the chat is covered by another pushed screen
  // or the app is backgrounded — the thread is mounted but nobody is reading
  // it, and a wrongly-bumped last_read_at hides the unread badge for good.
  const isFocused = useIsFocused();
  const readGateRef = useRef({
    focused: isFocused,
    appActive: AppState.currentState === 'active',
  });

  const markRead = useCallback(async () => {
    if (!realSession || !conversationId) return;
    if (!readGateRef.current.focused || !readGateRef.current.appActive) return;
    // Server stamps last_read_at with now() so it's on the same clock as
    // sent_at — a skewed device clock no longer strands the unread badge.
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, conversationId, session?.user.id]);

  useEffect(() => {
    readGateRef.current.focused = isFocused;
    // Coming back into view: catch up on whatever arrived while covered.
    if (isFocused) void markRead();
  }, [isFocused, markRead]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      readGateRef.current.appActive = next === 'active';
      if (next === 'active') void markRead();
    });
    return () => sub.remove();
  }, [markRead]);

  useEffect(() => {
    let mounted = true;
    if (!realSession || !conversationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Fail closed while the new thread loads: an unmasked flag left over from the
    // previous conversation would expose this one's counterpart for a frame.
    setPartnerIsMasked(true);

    const hydrateOtherReads = async () => {
      const { data, error: err } = await supabase
        .from('conversation_members')
        .select(
          'user_id, last_read_at, user:profiles!conversation_members_user_id_fkey(display_name)',
        )
        .eq('conversation_id', conversationId)
        .neq('user_id', session!.user.id);
      if (err || !data) return;
      const rows = (data as unknown as {
        user_id: string;
        last_read_at: string;
        user: { display_name: string | null } | null;
      }[]).map((r) => ({
        userId: r.user_id,
        displayName: r.user?.display_name ?? null,
        lastReadAt: new Date(r.last_read_at).getTime(),
      }));
      if (mounted) setOtherReads(rows);
    };

    (async () => {
      try {
        const [convRes, msgsRes, partnerRes] = await Promise.all([
          // Context comes from the *_feed views below — embedding gigs/
          // hangouts here selects revoked identity columns (42501).
          supabase
            .from('conversations')
            .select('id, gig_id, hangout_id')
            .eq('id', conversationId)
            .maybeSingle(),
          // Latest page only — full history stays on the server.
          supabase
            .from('messages')
            .select(MESSAGE_SELECT)
            .eq('conversation_id', conversationId)
            .order('sent_at', { ascending: false })
            .limit(THREAD_PAGE_SIZE),
          supabase
            .from('conversation_members')
            .select(
              'user_id, user:profiles!conversation_members_user_id_fkey(display_name, initials, avatar_url)',
            )
            .eq('conversation_id', conversationId)
            .neq('user_id', session!.user.id),
        ]);
        if (!mounted) return;
        if (convRes.error) throw convRes.error;
        if (msgsRes.error) throw msgsRes.error;
        if (partnerRes.error) throw partnerRes.error;
        const rawConv = (convRes.data ?? null) as unknown as Omit<
          ConversationRow,
          'gig' | 'hangout'
        > | null;
        let convRow: ConversationRow | null = null;
        if (rawConv) {
          const ctx = await fetchConversationContexts(
            rawConv.gig_id ? [rawConv.gig_id] : [],
            rawConv.hangout_id ? [rawConv.hangout_id] : [],
          );
          convRow = {
            ...rawConv,
            gig: rawConv.gig_id ? (ctx.gigs.get(rawConv.gig_id) ?? null) : null,
            hangout: rawConv.hangout_id ? (ctx.hangouts.get(rawConv.hangout_id) ?? null) : null,
          };
        }
        if (!mounted) return;
        setConversation(convRow);
        setMessages(
          ((msgsRes.data ?? []) as unknown as MessageRow[]).map(messageFromRow).reverse(),
        );
        const partner = (partnerRes.data ?? [])[0] as unknown as
          | { user_id: string; user: ProfileEmbed }
          | undefined;
        // With view-masked context we can no longer point at WHICH member is
        // the anonymous author — mask the counterpart whenever the author is
        // anonymous-and-not-me. In a 1:1 that's exact; in a group it's
        // conservative (better to over-mask than leak).
        const partnerIsAnon = !!partner && !!convRow && anonymousAuthorIsOther(convRow);
        // Set unconditionally: a thread with no counterpart row must clear the flag
        // rather than inherit the previous conversation's value.
        setPartnerIsMasked(partnerIsAnon);
        if (partnerIsAnon) {
          // Anonymous hangout host: never surface their real identity in the
          // chat header.
          setPartnerName(MASKED_PARTNER.name);
          setPartnerInitials(MASKED_PARTNER.initials);
          setPartnerAvatarUrl(MASKED_PARTNER.avatarUrl);
        } else if (partner?.user) {
          setPartnerName(partner.user.display_name ?? 'Unknown');
          setPartnerInitials(partner.user.initials ?? '?');
          setPartnerAvatarUrl(partner.user.avatar_url ?? null);
        }
        // Read my own profile name once for typing-presence display — but if
        // I'm the anonymous author of this conversation (anonymous hangout
        // host), broadcast no name, or the typing indicator would leak it as
        // "<real name> is typing…". A null name renders as "Someone".
        const meIsAnon =
          !!convRow && isMyAnonymousConversation(convRow, session!.user.id);
        if (meIsAnon) {
          myDisplayNameRef.current = null;
        } else {
          const { data: meProf } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', session!.user.id)
            .maybeSingle();
          myDisplayNameRef.current = meProf?.display_name ?? null;
        }

        // Hydrate other members' last_read_at first (so "Read" doesn't flicker),
        // then bump my own last_read_at to "now" so the partner sees we caught up.
        await hydrateOtherReads();
        await markRead();
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : 'Failed to load thread.';
        // The raw text goes to the log, not the screen: this state is rendered
        // verbatim in the chat's error bar, and PostgREST/RLS messages read like a
        // crash to a student.
        console.warn('[messaging] useThread failed:', msg);
        setError("Couldn't load this conversation. Check your connection.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Refetch the newest page and merge it in by id. Runs on every SUBSCRIBED
    // (initial join AND every rejoin after an outage) — messages inserted
    // while the socket was down, or in the gap between the initial fetch and
    // the join, would otherwise be lost until remount.
    const refetchLatest = async () => {
      const { data } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .limit(THREAD_PAGE_SIZE);
      if (!mounted || !data) return;
      const fresh = (data as unknown as MessageRow[]).map(messageFromRow);
      setMessages((cur) => {
        const byId = new Map(cur.map((m) => [m.id, m]));
        for (const f of fresh) byId.set(f.id, f);
        return [...byId.values()].sort((a, b) => a.sent_at - b.sent_at);
      });
    };

    // Data channel: new messages + member read-receipt updates. The topic is
    // instance-unique (see channelSeq) so a stacked duplicate of this chat
    // screen gets its own channel instead of silently sharing (and later
    // killing) this one. Typing presence lives on a separate shared channel.
    const channel = supabase
      .channel(`conv-data:${conversationId}:${++channelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as MessageRow;
          // Hydrate sender details — payload won't include the joined profile.
          const { data: senderRes } = await supabase
            .from('profiles')
            .select('display_name, initials, avatar_url')
            .eq('id', row.sender_id)
            .maybeSingle();
          if (!mounted) return;
          setMessages((cur) => {
            if (cur.some((m) => m.id === row.id)) return cur;
            return [
              ...cur,
              {
                id: row.id,
                body: row.body ?? '',
                sent_at: new Date(row.sent_at).getTime(),
                sender_id: row.sender_id,
                sender_name: senderRes?.display_name ?? null,
                sender_initials: senderRes?.initials ?? null,
                sender_avatar_url: senderRes?.avatar_url ?? null,
                image_url: row.image_url ?? null,
                image_width: row.image_width ?? null,
                image_height: row.image_height ?? null,
              },
            ];
          });
          // A new message from someone else — bump my last_read_at so the
          // sender sees "Read". markRead itself is gated on the screen being
          // focused AND the app foregrounded, so a covered thread stays unread.
          if (row.sender_id !== session!.user.id) {
            void markRead();
          }
        },
      )
      .on(
        'postgres_changes',
        // No conversation_id filter: DELETE payloads only carry the primary
        // key (replica identity), so a column filter would never match.
        // Filtering client-side by id is a no-op for other threads' messages.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId || !mounted) return;
          setMessages((cur) => cur.filter((m) => m.id !== deletedId));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            last_read_at: string;
          };
          if (row.user_id === session!.user.id) return;
          setOtherReads((cur) => {
            const lastReadAt = new Date(row.last_read_at).getTime();
            const idx = cur.findIndex((r) => r.userId === row.user_id);
            if (idx === -1) {
              return [
                ...cur,
                { userId: row.user_id, displayName: null, lastReadAt },
              ];
            }
            const next = cur.slice();
            next[idx] = { ...next[idx], lastReadAt };
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refetchLatest();
      });

    return () => {
      mounted = false;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, conversationId, session?.user.id]);

  // Typing presence rides the shared per-conversation topic (both partners
  // must be in the same "room"), refcounted so stacked duplicates coexist.
  // Presence state: { [userId]: Array<{ typing: boolean, displayName?: string }> }
  // A user counts as typing iff ANY of their connected devices says so.
  useEffect(() => {
    if (!realSession || !conversationId) return;
    const me = session!.user.id;
    const acquired = acquirePresenceChannel(
      `conversation:${conversationId}`,
      me,
      (state) => {
        const next: TypingState[] = [];
        for (const [userId, metas] of Object.entries(state)) {
          if (userId === me) continue;
          const anyTyping = metas.some((m) => m.typing === true);
          if (anyTyping) {
            next.push({
              userId,
              displayName: metas[0]?.displayName ?? null,
            });
          }
        }
        setTypingList(next);
      },
    );
    channelRef.current = acquired.channel;
    return () => {
      channelRef.current = null;
      acquired.release();
      setTypingList([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, conversationId, session?.user.id]);

  // Resolves true when the message reached the server. Callers use the result
  // to decide whether to restore the draft they optimistically cleared.
  const send = async (args: SendArgs): Promise<boolean> => {
    if (!realSession || !conversationId) return false;
    const trimmed = (args.body ?? '').trim();
    const hasImage = !!args.image?.url;
    if (!trimmed && !hasImage) return false;
    const payload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_id: session!.user.id,
      body: trimmed.length > 0 ? trimmed : null,
    };
    if (hasImage && args.image) {
      payload.image_url = args.image.url;
      payload.image_width = args.image.width;
      payload.image_height = args.image.height;
    }
    // Clear any prior failure so a stale banner doesn't outlive a good send.
    setError(null);
    // Select the inserted row back so we can append it immediately. Relying on
    // the realtime echo alone means the message never appears if the channel
    // hasn't finished subscribing or the socket silently dropped — the user
    // then assumes failure and re-sends, duplicating on the partner's side.
    const { data: inserted, error: sendErr } = await supabase
      .from('messages')
      .insert(payload)
      .select(MESSAGE_SELECT)
      .single();
    if (sendErr) {
      console.warn('[messaging] send failed:', sendErr.message);
      // Contract §3: 42501 on a messages insert means a block (either
      // direction) closed this 1:1 thread. 54000 is the 0036 rate limit.
      // Anything else keeps generic copy — raw RLS text reads like a bug.
      const code = (sendErr as { code?: string }).code;
      setError(
        code === '42501'
          ? 'You can no longer message this person.'
          : code === '54000'
            ? "You're sending messages too quickly — try again in a bit."
            : "Couldn't send. Check your connection and try again.",
      );
      return false;
    }
    if (inserted) {
      const fresh = messageFromRow(inserted as unknown as MessageRow);
      // Dedup by id — the realtime INSERT handler may also deliver this row.
      setMessages((cur) => {
        if (cur.some((m) => m.id === fresh.id)) return cur;
        return [...cur, fresh];
      });
    }
    if (channelRef.current && lastTypingSentRef.current) {
      // Drop typing state on send so the indicator doesn't linger after we
      // actually sent the message.
      lastTypingSentRef.current = false;
      void channelRef.current.track({
        typing: false,
        displayName: myDisplayNameRef.current,
      });
    }
    return true;
  };

  // Hard-delete. RLS only lets a sender delete their own rows; the extra
  // sender_id filter keeps a buggy caller from silently deleting nothing and
  // reporting success on someone else's ids.
  const deleteMessages = async (ids: string[]): Promise<boolean> => {
    if (!realSession || ids.length === 0) return false;
    const { error: delErr } = await supabase
      .from('messages')
      .delete()
      .in('id', ids)
      .eq('sender_id', session!.user.id);
    if (delErr) {
      console.warn('[messaging] deleteMessages failed:', delErr.message);
      setError("Couldn't delete. Check your connection and try again.");
      return false;
    }
    setMessages((cur) => cur.filter((m) => !ids.includes(m.id)));
    return true;
  };

  // Typing-indicator debouncer. We broadcast `{ typing: true }` on the first
  // keystroke (idempotent if we're already saying we're typing) and then
  // `{ typing: false }` 1.5s after the last call.
  const setTyping = (isTyping: boolean) => {
    if (!channelRef.current) return;
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTyping) {
      if (!lastTypingSentRef.current) {
        lastTypingSentRef.current = true;
        void channelRef.current.track({
          typing: true,
          displayName: myDisplayNameRef.current,
        });
      }
      typingTimerRef.current = setTimeout(() => {
        if (channelRef.current && lastTypingSentRef.current) {
          lastTypingSentRef.current = false;
          void channelRef.current.track({
            typing: false,
            displayName: myDisplayNameRef.current,
          });
        }
        typingTimerRef.current = null;
      }, 1500);
    } else if (lastTypingSentRef.current) {
      lastTypingSentRef.current = false;
      void channelRef.current.track({
        typing: false,
        displayName: myDisplayNameRef.current,
      });
    }
  };

  return useMemo(
    () => ({
      conversation,
      partnerName,
      partnerInitials,
      partnerAvatarUrl,
      partnerIsMasked,
      messages,
      loading,
      error,
      send,
      deleteMessages,
      otherReads,
      typing,
      setTyping,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      conversation,
      partnerName,
      partnerInitials,
      partnerAvatarUrl,
      partnerIsMasked,
      messages,
      loading,
      error,
      otherReads,
      typing,
    ],
  );
}

export type StartConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; code: 'blocked' | 'not_found' | 'error' };

// Start (or reuse) a 1:1 conversation with the gig's poster. Backed by the
// `start_gig_conversation` SECURITY DEFINER RPC, which is the only way to
// insert a membership row for someone other than yourself. Contract §3:
// 42501 = block (either direction) or an anonymous poster (0034); P0002 =
// gig no longer exists.
export async function findOrCreateGigConversation(args: {
  meId: string;
  gigId: string;
  posterId: string;
}): Promise<StartConversationResult> {
  if (args.meId === args.posterId) return { ok: false, code: 'error' };
  const { data, error } = await supabase.rpc('start_gig_conversation', {
    p_gig_id: args.gigId,
  });
  if (error) {
    console.warn('[messaging] start_gig_conversation failed:', error.message);
    const code = (error as { code?: string }).code;
    return {
      ok: false,
      code: code === '42501' ? 'blocked' : code === 'P0002' ? 'not_found' : 'error',
    };
  }
  const conversationId = (data as string) ?? null;
  return conversationId
    ? { ok: true, conversationId }
    : { ok: false, code: 'error' };
}

// NOTE: there is deliberately no `joinHangout` wrapper here. RSVP goes through
// posts-store's `rsvpHangoutImpl`, which calls the join_hangout RPC directly and
// owns the optimistic going-count and the myRsvps guard; a second entry point was
// only ever used to re-resolve a conversation id, and that is now
// `hangoutConversationId` below — a read, not a mutation.

/**
 * Read-only lookup of a hangout's group conversation. Returns null when the
 * hangout has no conversation (it's anonymous — 0038 refuses to create one), when
 * the caller isn't a member, or on error; callers can't distinguish those and
 * shouldn't need to.
 *
 * This exists so opening a chat stops going through `join_hangout`. Using a
 * mutation as a lookup is what made the 0029 capacity bug fatal: every attendee of
 * a full hangout got 23514 on a read they were entitled to.
 */
export async function hangoutConversationId(hangoutId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('hangout_conversation_id', {
    p_hangout_id: hangoutId,
  });
  if (error) {
    console.warn('[messaging] hangout_conversation_id failed:', error.message);
    return null;
  }
  return (data as string) ?? null;
}

export async function leaveHangout(hangoutId: string): Promise<boolean> {
  const { error } = await supabase.rpc('leave_hangout', {
    p_hangout_id: hangoutId,
  });
  if (error) {
    console.warn('[messaging] leave_hangout failed:', error.message);
    return false;
  }
  return true;
}

// ─────────────────────── Unread counts (deliverable 4) ───────────────────────

/**
 * Per-conversation unread message counts for the current user, plus the
 * total across all conversations. Drives both the gold dot on Messages-tab
 * rows and the global Messages tab-icon badge.
 *
 * One global realtime subscription on `messages` is used to invalidate the
 * cache — we do NOT open a subscription per conversation in the DM list.
 * The RLS policy on messages already restricts SELECTs to conversations
 * the user is a member of, so the realtime stream naturally filters out
 * unrelated rows.
 */
export function useUnreadCounts(): {
  byConversation: Record<string, number>;
  total: number;
  refresh: () => Promise<void>;
} {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const [byConversation, setByConversation] = useState<Record<string, number>>({});

  const fetchCounts = async () => {
    if (!realSession) {
      setByConversation({});
      return;
    }
    const { data, error } = await supabase.rpc('unread_counts_for_user', {
      p_user_id: session!.user.id,
    });
    if (error) {
      console.warn('[messaging] unread_counts_for_user failed:', error.message);
      return;
    }
    const next: Record<string, number> = {};
    for (const row of (data ?? []) as { conversation_id: string; unread: number }[]) {
      next[row.conversation_id] = row.unread;
    }
    setByConversation(next);
  };

  useEffect(() => {
    fetchCounts();
    if (!realSession) return;
    // ONE subscription per hook instance — RLS filters to conversations we're
    // in. The topic carries a sequence number because the tab bar and the
    // Messages screen both mount this hook; a duplicate topic would make them
    // share (and then tear down) one underlying channel.
    const channel = supabase
      .channel(`unread-counts:${++channelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchCounts(),
      )
      .on(
        'postgres_changes',
        // Deleted-before-read messages must drop out of the badge count.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        () => fetchCounts(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => fetchCounts(),
      )
      .subscribe((status) => {
        // Recount on every (re)join so an outage can't leave a stale badge.
        if (status === 'SUBSCRIBED') void fetchCounts();
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, session?.user.id]);

  const total = useMemo(
    () => Object.values(byConversation).reduce((s, n) => s + n, 0),
    [byConversation],
  );

  return { byConversation, total, refresh: fetchCounts };
}
