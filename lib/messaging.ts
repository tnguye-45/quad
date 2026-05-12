import { useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth-context';
import { supabase } from './supabase';

export type ConversationSummary = {
  id: string;
  contextLabel: string;     // "Re: Help moving a couch · $40" or "Hangout · 4 people"
  partnerName: string;      // counterpart's display name (or "Group · N")
  partnerInitials: string;
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
};

type ProfileEmbed = { display_name: string | null; initials: string | null } | null;

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
  body: string;
  sent_at: string;
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
          .select('id, conversation_id, sender_id, body, sent_at')
          .in('conversation_id', convIds)
          .order('sent_at', { ascending: false }),
        // Other members of each conversation (everyone except me, with name).
        supabase
          .from('conversation_members')
          .select(
            'conversation_id, user_id, user:profiles!conversation_members_user_id_fkey(display_name, initials)',
          )
          .in('conversation_id', convIds)
          .neq('user_id', me),
      ]);
      if (latestRes.error) throw latestRes.error;
      if (partnerRes.error) throw partnerRes.error;

      const lastByConv = new Map<string, { body: string; sent_at: string; sender_id: string }>();
      for (const m of latestRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) {
          lastByConv.set(m.conversation_id, {
            body: m.body,
            sent_at: m.sent_at,
            sender_id: m.sender_id,
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
        if (partners.length > 1) {
          partnerName = `Group · ${partners.length + 1} people`;
          partnerInitials = '··';
        }
        const lastReadAt = new Date(m.last_read_at).getTime();
        const lastMsgAt = last ? new Date(last.sent_at).getTime() : 0;
        return {
          id: m.conversation_id,
          contextLabel: contextLabelFor(conv),
          partnerName,
          partnerInitials,
          preview: last?.body ?? 'No messages yet — say hi.',
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

export function useThread(conversationId: string | undefined): {
  conversation: ConversationRow | null;
  partnerName: string;
  partnerInitials: string;
  messages: Message[];
  loading: boolean;
  error: string | null;
  send: (body: string) => Promise<void>;
} {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerName, setPartnerName] = useState('Conversation');
  const [partnerInitials, setPartnerInitials] = useState('?');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!realSession || !conversationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
              'id, conversation_id, sender_id, body, sent_at, sender:profiles!messages_sender_id_fkey(display_name, initials)',
            )
            .eq('conversation_id', conversationId)
            .order('sent_at', { ascending: true }),
          supabase
            .from('conversation_members')
            .select(
              'user_id, user:profiles!conversation_members_user_id_fkey(display_name, initials)',
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
            body: m.body,
            sent_at: new Date(m.sent_at).getTime(),
            sender_id: m.sender_id,
            sender_name: m.sender?.display_name ?? null,
            sender_initials: m.sender?.initials ?? null,
          })),
        );
        const partner = (partnerRes.data ?? [])[0] as unknown as
          | { user: ProfileEmbed }
          | undefined;
        if (partner?.user) {
          setPartnerName(partner.user.display_name ?? 'Unknown');
          setPartnerInitials(partner.user.initials ?? '?');
        }
        // Mark as read.
        await supabase
          .from('conversation_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .eq('user_id', session!.user.id);
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : 'Failed to load thread.';
        console.warn('[messaging] useThread failed:', msg);
        setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`thread:${conversationId}`)
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
            .select('display_name, initials')
            .eq('id', row.sender_id)
            .maybeSingle();
          if (!mounted) return;
          setMessages((cur) => {
            if (cur.some((m) => m.id === row.id)) return cur;
            return [
              ...cur,
              {
                id: row.id,
                body: row.body,
                sent_at: new Date(row.sent_at).getTime(),
                sender_id: row.sender_id,
                sender_name: senderRes?.display_name ?? null,
                sender_initials: senderRes?.initials ?? null,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, conversationId, session?.user.id]);

  const send = async (body: string) => {
    if (!realSession || !conversationId) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    const { error: sendErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: session!.user.id,
      body: trimmed,
    });
    if (sendErr) {
      console.warn('[messaging] send failed:', sendErr.message);
      setError(sendErr.message);
    }
  };

  return useMemo(
    () => ({
      conversation,
      partnerName,
      partnerInitials,
      messages,
      loading,
      error,
      send,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversation, partnerName, partnerInitials, messages, loading, error],
  );
}

// Find an existing conversation between `me` and `targetUserId` tied to this
// gig, or create one. Returns the conversation id. Used by the gig detail
// "Message poster" button.
export async function findOrCreateGigConversation(args: {
  meId: string;
  gigId: string;
  posterId: string;
}): Promise<string | null> {
  if (args.meId === args.posterId) return null;
  // First, see if I'm already in a conversation for this gig.
  const { data: mine, error: e1 } = await supabase
    .from('conversation_members')
    .select('conversation_id, conversation:conversations(id, gig_id)')
    .eq('user_id', args.meId);
  if (e1) {
    console.warn('[messaging] findOrCreateGigConversation lookup failed:', e1.message);
    return null;
  }
  const match = (mine ?? []).find(
    (m) => (m.conversation as unknown as { gig_id: string | null } | null)?.gig_id === args.gigId,
  );
  if (match) return match.conversation_id;

  // Otherwise create one. The poster_id needs to exist as a profile (the
  // trigger guarantees this for any real user).
  const { data: convRow, error: e2 } = await supabase
    .from('conversations')
    .insert({ gig_id: args.gigId })
    .select('id')
    .single();
  if (e2 || !convRow) {
    console.warn('[messaging] create conversation failed:', e2?.message);
    return null;
  }
  // Add both members. RLS allows authenticated users to insert their own row
  // and to insert other rows so long as they're authenticated; the policy in
  // 0002 has `with check (user_id = auth.uid())`, which would block adding the
  // poster. We instead rely on the poster being added when *they* open the
  // conversation. For now, add only ourselves; the poster sees it via their
  // own future check, OR — better — we add a tiny RPC.
  //
  // For Phase 2, we add only the viewer here. The poster gets added on first
  // open of the conversation if missing. (See join helper below.)
  const { error: e3 } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: convRow.id, user_id: args.meId });
  if (e3) {
    console.warn('[messaging] add self failed:', e3.message);
  }
  return convRow.id;
}

// Add the current user as a conversation member if they're not already. Useful
// because the gig detail "Message poster" path can only add the viewer; the
// poster is added the first time they open the thread.
export async function ensureSelfMembership(args: {
  conversationId: string;
  meId: string;
}): Promise<void> {
  const { data: existing } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', args.conversationId)
    .eq('user_id', args.meId)
    .maybeSingle();
  if (existing) return;
  await supabase
    .from('conversation_members')
    .insert({ conversation_id: args.conversationId, user_id: args.meId })
    .then(() => undefined, () => undefined);
}
