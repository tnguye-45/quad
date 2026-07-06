import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Gig, Hangout } from './posts-store';

// ─────────────────────────────────────────────────────────────────────────
// Dev-mode conversation store.
//
// The real messaging path (lib/messaging.ts, useThread/useConversations) is
// backed by Supabase and only runs for a real @nd.edu session. In dev mode
// (the "enter as admin" shortcut on the welcome screen) there is no backend,
// so conversations lived only as a hard-coded MOCK_CONVOS map that could never
// grow. This store makes the demo actually interactive: you can start a chat
// from a gig, join a hangout's group chat, and send messages that persist for
// the session and surface on the Messages tab — all client-side, no network.
// ─────────────────────────────────────────────────────────────────────────

export type DevMessage = {
  id: string;
  from: 'me' | 'them';
  text: string;
  sentAt: number;
  senderName?: string; // for group chats, who "them" is
};

export type DevConversation = {
  id: string;
  kind: 'dm' | 'gig' | 'hangout';
  name: string; // partner display name, or group title
  initials: string;
  context: string; // "Re: Help moving a couch · $40" / "Hangout · 4 going"
  online: boolean;
  messages: DevMessage[];
  unread: boolean;
};

const NOW = Date.now();
const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

// Seed threads — same content that used to live in chat/[id].tsx MOCK_CONVOS,
// now with real timestamps so ordering + clustering behave like the live path.
const SEED_CONVERSATIONS: DevConversation[] = [
  {
    id: 'marcus',
    kind: 'gig',
    name: 'Marcus K.',
    initials: 'MK',
    context: 'Re: Help moving a couch · $40',
    online: true,
    unread: true,
    messages: [
      { id: 'm1', from: 'them', text: 'hey! is the couch still up for moving this afternoon?', sentAt: NOW - 18 * MIN },
      { id: 'm2', from: 'me', text: 'yeah! how does 3pm work?', sentAt: NOW - 17 * MIN },
      { id: 'm3', from: 'them', text: "perfect. it's a 2-seater leather, going from Dillon Hall up to Sorin 4th floor", sentAt: NOW - 16 * MIN },
      { id: 'm4', from: 'me', text: "cool. I'll bring my friend Tyler so it's faster, $40 split is fine", sentAt: NOW - 15 * MIN },
      { id: 'm5', from: 'them', text: 'works for me 🙏', sentAt: NOW - 13 * MIN },
      { id: 'm6', from: 'them', text: 'Sounds good! See you at 3', sentAt: NOW - 12 * MIN },
    ],
  },
  {
    id: 'priya',
    kind: 'gig',
    name: 'Priya S.',
    initials: 'PS',
    context: 'Re: SBN airport ride · $15',
    online: true,
    unread: true,
    messages: [
      { id: 'p1', from: 'them', text: 'are you still doing the SBN ride saturday?', sentAt: NOW - 70 * MIN },
      { id: 'p2', from: 'me', text: 'yes! 6am pickup at the front circle?', sentAt: NOW - 66 * MIN },
      { id: 'p3', from: 'them', text: 'I can grab you from Dillon', sentAt: NOW - 60 * MIN },
    ],
  },
  {
    id: 'jordan',
    kind: 'gig',
    name: 'Jordan L.',
    initials: 'JL',
    context: 'Re: MATH 10560 tutor · $30/hr',
    online: true,
    unread: false,
    messages: [
      { id: 'j1', from: 'me', text: 'hey, saw your tutoring post — could you help me prep for the midterm?', sentAt: NOW - 3 * HR - 20 * MIN },
      { id: 'j2', from: 'them', text: "for sure. what's tripping you up?", sentAt: NOW - 3 * HR - 10 * MIN },
      { id: 'j3', from: 'me', text: 'mostly series convergence and integration by parts', sentAt: NOW - 3 * HR - 6 * MIN },
      { id: 'j4', from: 'them', text: 'Want to meet at Hesburgh tonight?', sentAt: NOW - 3 * HR },
    ],
  },
  {
    id: 'cse-cram',
    kind: 'hangout',
    name: 'CSE 20110 cram',
    initials: 'CS',
    context: 'Hangout · 4 going',
    online: true,
    unread: false,
    messages: [
      { id: 'c1', from: 'them', text: 'who needs to review proof by induction lol', sentAt: NOW - 5 * HR - 12 * MIN, senderName: 'Jordan L.' },
      { id: 'c2', from: 'me', text: 'me 😅', sentAt: NOW - 5 * HR - 10 * MIN },
      { id: 'c3', from: 'them', text: 'same', sentAt: NOW - 5 * HR - 8 * MIN, senderName: 'Aisha M.' },
      { id: 'c4', from: 'them', text: 'Bringing snacks 🥨', sentAt: NOW - 5 * HR, senderName: 'Jordan L.' },
    ],
  },
  {
    id: 'aisha',
    kind: 'gig',
    name: 'Aisha M.',
    initials: 'AM',
    context: 'Re: Senior portraits · $80',
    online: false,
    unread: false,
    messages: [
      { id: 'a1', from: 'them', text: 'hey! got time to chat about your shoot?', sentAt: NOW - DAY - 2 * HR },
      { id: 'a2', from: 'me', text: 'yes — thinking late afternoon for golden hour at the Dome', sentAt: NOW - DAY - 1 * HR },
      { id: 'a3', from: 'them', text: 'perfect time. I can do this Friday or Sunday', sentAt: NOW - DAY - 30 * MIN },
      { id: 'a4', from: 'them', text: 'Sent you a few sample shots 📸', sentAt: NOW - DAY },
    ],
  },
  {
    id: 'sam',
    kind: 'gig',
    name: 'Sam R.',
    initials: 'SR',
    context: 'Re: Dog walk · $15',
    online: false,
    unread: false,
    messages: [
      { id: 's1', from: 'me', text: 'all done — Bagel had a great time at the lakes!', sentAt: NOW - 2 * DAY - 1 * HR },
      { id: 's2', from: 'them', text: 'omg the photo is so cute, ty', sentAt: NOW - 2 * DAY - 30 * MIN },
      { id: 's3', from: 'them', text: 'Thanks again — Bagel loved it', sentAt: NOW - 2 * DAY },
    ],
  },
];

// Canned replies so a freshly-started thread feels two-way in the demo. Chosen
// deterministically by how many replies the partner has already sent (no RNG),
// so behavior is stable across renders.
const GIG_REPLIES = [
  'hey! yeah this is still open — what works for you?',
  'sounds good, I can do that 👍',
  "perfect. I'll be there.",
  'appreciate it! see you then',
];
const HANGOUT_REPLIES = [
  'nice, glad you\'re coming! 🎉',
  'we\'re meeting right there — see you!',
  'bring a friend if you want, the more the merrier',
  'see you there!',
];

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

type DevConversationsApi = {
  conversations: DevConversation[];
  getConversation: (id: string) => DevConversation | undefined;
  /** Start (or reuse) a 1:1 chat with a gig's poster. Returns the conv id. */
  startGigConversation: (gig: Gig) => string;
  /** Join (or reuse) a hangout's group chat. Returns the conv id. */
  joinHangoutConversation: (hangout: Hangout) => string;
  /** Append a message from "me" and schedule a canned reply. */
  sendMessage: (conversationId: string, text: string) => void;
  markRead: (conversationId: string) => void;
};

const DevConversationsContext = createContext<DevConversationsApi | null>(null);

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function DevConversationsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<DevConversation[]>(SEED_CONVERSATIONS);
  const replyTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const startGigConversation = useCallback((gig: Gig): string => {
    const id = `gig-${gig.id}`;
    setConversations((cur) => {
      if (cur.some((c) => c.id === id)) return cur;
      const name = gig.posterName ?? 'Student';
      const convo: DevConversation = {
        id,
        kind: 'gig',
        name,
        initials: gig.posterInitials ?? '?',
        context: `Re: ${gig.title} · ${gig.payout}`,
        online: true,
        unread: false,
        messages: [
          {
            id: nextId('seed'),
            from: 'them',
            text: `hey! thanks for reaching out about "${gig.title}". what did you have in mind?`,
            sentAt: Date.now(),
          },
        ],
      };
      return [convo, ...cur];
    });
    return id;
  }, []);

  const joinHangoutConversation = useCallback((hangout: Hangout): string => {
    const id = `hangout-${hangout.id}`;
    setConversations((cur) => {
      if (cur.some((c) => c.id === id)) return cur;
      const host = hangout.hostName ?? 'Host';
      const convo: DevConversation = {
        id,
        kind: 'hangout',
        name: hangout.title,
        initials: hangout.hostInitials ?? '··',
        context: `Hangout · ${hangout.going + 1} going`,
        online: true,
        unread: false,
        messages: [
          {
            id: nextId('seed'),
            from: 'them',
            text: `you're in for "${hangout.title}" — ${hangout.when} at ${hangout.where}. see you there! 🎉`,
            sentAt: Date.now(),
            senderName: host,
          },
        ],
      };
      return [convo, ...cur];
    });
    return id;
  }, []);

  const markRead = useCallback((conversationId: string) => {
    setConversations((cur) =>
      cur.map((c) => (c.id === conversationId && c.unread ? { ...c, unread: false } : c)),
    );
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setConversations((cur) =>
      cur.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              unread: false,
              messages: [
                ...c.messages,
                { id: nextId('me'), from: 'me' as const, text: trimmed, sentAt: Date.now() },
              ],
            }
          : c,
      ),
    );

    // Schedule one canned reply so the thread reads as a live back-and-forth.
    if (replyTimers.current[conversationId]) {
      clearTimeout(replyTimers.current[conversationId]);
    }
    replyTimers.current[conversationId] = setTimeout(() => {
      setConversations((cur) =>
        cur.map((c) => {
          if (c.id !== conversationId) return c;
          const theirCount = c.messages.filter((m) => m.from === 'them').length;
          const pool = c.kind === 'hangout' ? HANGOUT_REPLIES : GIG_REPLIES;
          const reply = pool[Math.min(theirCount, pool.length - 1)];
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: nextId('them'),
                from: 'them' as const,
                text: reply,
                sentAt: Date.now(),
                senderName: c.kind === 'hangout' ? firstName(c.name) : undefined,
              },
            ],
          };
        }),
      );
      delete replyTimers.current[conversationId];
    }, 1100);
  }, []);

  const value = useMemo<DevConversationsApi>(
    () => ({
      conversations,
      getConversation,
      startGigConversation,
      joinHangoutConversation,
      sendMessage,
      markRead,
    }),
    [conversations, getConversation, startGigConversation, joinHangoutConversation, sendMessage, markRead],
  );

  return (
    <DevConversationsContext.Provider value={value}>
      {children}
    </DevConversationsContext.Provider>
  );
}

export function useDevConversations(): DevConversationsApi {
  const ctx = useContext(DevConversationsContext);
  if (!ctx) {
    throw new Error('useDevConversations must be used inside <DevConversationsProvider>');
  }
  return ctx;
}
