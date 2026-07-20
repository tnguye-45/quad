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

type GigEmbed = {
  title: string;
  payout_cents: number;
  anonymous: boolean;
} | null;

type HangoutEmbed = {
  title: string;
  anonymous: boolean;
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

  const fetchAll = async () => {
    if (!realSession) {
      setRows([]);
      setLoading(false);
      return;
    }
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
        setRows([]);
        setLoading(false);
        return;
      }

      const [convRes, partnerRes] = await Promise.all([
        // Conversation context + latest message per conversation. The ordered
        // limit-1 embed replaces the old "download every message in every
        // thread and dedupe in JS" preview query.
        supabase
          .from('conversations')
          .select(
            'id, gig_id, hangout_id, gig:gigs(title, payout_cents, anonymous), ' +
              'hangout:hangouts(title, anonymous), messages(id, sender_id, body, sent_at, image_url)',
          )
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

      const convById = new Map<string, ConversationRow>();
      for (const conv of (convRes.data ?? []) as unknown as ConversationRow[]) {
        convById.set(conv.id, conv);
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
      setRows(summaries);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load conversations.';
      console.warn('[messaging] useConversations failed:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (!realSession) return;
    const channel = supabase
      .channel(`conv-list:${++channelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchAll(),
      )
      .on(
        'postgres_changes',
        // Deleting the latest message must refresh the row preview.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        () => fetchAll(),
      )
      .subscribe((status) => {
        // Fires on every (re)join, not just the first — messages that arrived
        // while the socket was down would otherwise be missing until remount.
        if (status === 'SUBSCRIBED') void fetchAll();
      });
    return () => {
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
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', session!.user.id);
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
          supabase
            .from('conversations')
            .select(`
              id, gig_id, hangout_id,
              gig:gigs(title, payout_cents, anonymous),
              hangout:hangouts(title, anonymous)
            `)
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
        setConversation((convRes.data ?? null) as unknown as ConversationRow | null);
        setMessages(
          ((msgsRes.data ?? []) as unknown as MessageRow[]).map(messageFromRow).reverse(),
        );
        const partner = (partnerRes.data ?? [])[0] as unknown as
          | { user: ProfileEmbed }
          | undefined;
        if (partner?.user) {
          setPartnerName(partner.user.display_name ?? 'Unknown');
          setPartnerInitials(partner.user.initials ?? '?');
          setPartnerAvatarUrl(partner.user.avatar_url ?? null);
        }
        // Read my own profile name once for typing-presence display.
        const { data: meProf } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session!.user.id)
          .maybeSingle();
        myDisplayNameRef.current = meProf?.display_name ?? null;

        // Hydrate other members' last_read_at first (so "Read" doesn't flicker),
        // then bump my own last_read_at to "now" so the partner sees we caught up.
        await hydrateOtherReads();
        await markRead();
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : 'Failed to load thread.';
        console.warn('[messaging] useThread failed:', msg);
        setError(msg);
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
      setError(sendErr.message);
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
      setError(delErr.message);
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
      messages,
      loading,
      error,
      otherReads,
      typing,
    ],
  );
}

// Start (or reuse) a 1:1 conversation with the gig's poster. Backed by the
// `start_gig_conversation` SECURITY DEFINER RPC, which is the only way to
// insert a membership row for someone other than yourself.
export async function findOrCreateGigConversation(args: {
  meId: string;
  gigId: string;
  posterId: string;
}): Promise<string | null> {
  if (args.meId === args.posterId) return null;
  const { data, error } = await supabase.rpc('start_gig_conversation', {
    p_gig_id: args.gigId,
  });
  if (error) {
    console.warn('[messaging] start_gig_conversation failed:', error.message);
    return null;
  }
  return (data as string) ?? null;
}

// RSVP to a hangout and join its group conversation in one atomic call.
// Returns the conversation id on success, or null on error.
export async function joinHangout(hangoutId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('join_hangout', {
    p_hangout_id: hangoutId,
  });
  if (error) {
    console.warn('[messaging] join_hangout failed:', error.message);
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
