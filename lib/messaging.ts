import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-context';
import { supabase } from './supabase';

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

type ConversationRow = {
  id: string;
  gig_id: string | null;
  hangout_id: string | null;
  gig: GigEmbed;
  hangout: HangoutEmbed;
};

type MemberRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  conversation: ConversationRow;
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

const CONV_SELECT = `
  conversation_id,
  last_read_at,
  conversation:conversations(
    id, gig_id, hangout_id,
    gig:gigs(title, payout_cents, anonymous),
    hangout:hangouts(title, anonymous)
  )
`;

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
        .select(CONV_SELECT)
        .eq('user_id', me);
      if (e1) throw e1;

      const memberData = (memberRows ?? []) as unknown as Array<{
        conversation_id: string;
        last_read_at: string;
        conversation: ConversationRow;
      }>;
      const convIds = memberData.map((m) => m.conversation_id);
      if (convIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const [latestRes, partnerRes] = await Promise.all([
        // Latest message preview per conversation. We fetch all + dedupe in JS
        // — the row counts here are small (one chat thread per gig).
        supabase
          .from('messages')
          .select('id, conversation_id, sender_id, body, sent_at, image_url')
          .in('conversation_id', convIds)
          .order('sent_at', { ascending: false }),
        // Other members of each conversation (everyone except me, with name).
        supabase
          .from('conversation_members')
          .select(
            'conversation_id, user_id, user:profiles!conversation_members_user_id_fkey(display_name, initials, avatar_url)',
          )
          .in('conversation_id', convIds)
          .neq('user_id', me),
      ]);
      if (latestRes.error) throw latestRes.error;
      if (partnerRes.error) throw partnerRes.error;

      const lastByConv = new Map<
        string,
        { body: string | null; sent_at: string; sender_id: string; image_url: string | null }
      >();
      for (const m of latestRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) {
          lastByConv.set(m.conversation_id, {
            body: m.body,
            sent_at: m.sent_at,
            sender_id: m.sender_id,
            image_url: (m as { image_url?: string | null }).image_url ?? null,
          });
        }
      }
      const partnersByConv = new Map<string, MemberRow[]>();
      for (const p of (partnerRes.data ?? []) as unknown as MemberRow[]) {
        const list = partnersByConv.get(p.conversation_id) ?? [];
        list.push(p);
        partnersByConv.set(p.conversation_id, list);
      }

      const summaries: ConversationSummary[] = memberData.map((m) => {
        const conv = m.conversation;
        const partners = partnersByConv.get(m.conversation_id) ?? [];
        const partner = partners[0];
        const last = lastByConv.get(m.conversation_id);
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
      .channel('conv-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchAll(),
      )
      .subscribe();
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

  useEffect(() => {
    let mounted = true;
    if (!realSession || !conversationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const markRead = async () => {
      await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', session!.user.id);
    };

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
          supabase
            .from('messages')
            .select(
              'id, conversation_id, sender_id, body, sent_at, image_url, image_width, image_height, sender:profiles!messages_sender_id_fkey(display_name, initials, avatar_url)',
            )
            .eq('conversation_id', conversationId)
            .order('sent_at', { ascending: true }),
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
          ((msgsRes.data ?? []) as unknown as MessageRow[]).map((m) => ({
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
          })),
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

    // One channel for the whole conversation: new messages, member
    // read-receipt updates, and typing presence broadcasts. Presence is
    // keyed by user_id so each device contributes one "row" per user.
    const channel = supabase
      .channel(`conversation:${conversationId}`, {
        config: { presence: { key: session!.user.id } },
      })
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
          // A new message from someone else while we're looking at the thread —
          // bump my last_read_at so the sender sees a "Read" indicator.
          if (row.sender_id !== session!.user.id) {
            void markRead();
          }
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
      .on('presence', { event: 'sync' }, () => {
        // Presence state: { [userId]: Array<{ typing: boolean, displayName?: string }> }
        // We treat the user as typing iff ANY of their connected devices has
        // typing=true (multi-tab edge case).
        const state = channel.presenceState() as Record<
          string,
          { typing?: boolean; displayName?: string | null }[]
        >;
        const next: TypingState[] = [];
        for (const [userId, metas] of Object.entries(state)) {
          if (userId === session!.user.id) continue;
          const anyTyping = metas.some((m) => m.typing === true);
          if (anyTyping) {
            next.push({
              userId,
              displayName: metas[0]?.displayName ?? null,
            });
          }
        }
        if (mounted) setTypingList(next);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track an initial "not typing" state so other clients see us join
          // the presence set immediately.
          await channel.track({
            typing: false,
            displayName: myDisplayNameRef.current,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      mounted = false;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
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
    const { error: sendErr } = await supabase.from('messages').insert(payload);
    if (sendErr) {
      console.warn('[messaging] send failed:', sendErr.message);
      setError(sendErr.message);
      return false;
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
    // ONE global subscription — RLS filters to conversations we're in.
    const channel = supabase
      .channel('unread-counts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchCounts(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => fetchCounts(),
      )
      .subscribe();
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
