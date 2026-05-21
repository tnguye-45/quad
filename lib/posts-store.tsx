import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from './auth-context';
import { supabase } from './supabase';

export const GIG_CATEGORIES = [
  'Tutoring',
  'Moving',
  'Rideshare',
  'Pets',
  'Creative',
  'Errands',
] as const;
export type GigCategory = (typeof GIG_CATEGORIES)[number];

export const HANGOUT_VIBES = ['Study', 'Sports', 'Food', 'Social', 'Other'] as const;
export type HangoutVibe = (typeof HANGOUT_VIBES)[number];

export const VOICE_TOPICS = ['Dining', 'Dorm', 'Class', 'Campus', 'Sports', 'Random'] as const;
export type VoiceTopic = (typeof VOICE_TOPICS)[number];

export const VOICE_TOPIC_EMOJI: Record<VoiceTopic, string> = {
  Dining: '🍕',
  Dorm: '🛏️',
  Class: '📚',
  Campus: '🏛️',
  Sports: '🏈',
  Random: '🎲',
};

const SEED_OWNER = 'seed';

export type Gig = {
  id: string;
  ownerId: string;
  anonymous: boolean;
  title: string;
  description?: string;
  payout: string;
  category: GigCategory;
  where: string;
  postedAt: number;
  postedAgo: string;
  posterName: string | null;
  posterInitials: string | null;
};

export type Hangout = {
  id: string;
  ownerId: string;
  anonymous: boolean;
  title: string;
  when: string;
  where: string;
  going: number;
  vibe: string;
  description?: string;
  postedAt: number;
  hostName: string | null;
  hostInitials: string | null;
};

export type Voice = {
  id: string;
  ownerId: string;
  anonymous: boolean;
  body: string;
  topic: VoiceTopic;
  votes: number;
  comments: number;
  postedAt: number;
  postedAgo: string;
  posterName: string | null;
  posterInitials: string | null;
};

// Seeds shown in dev mode only — when the user opts into the fake "admin"
// session on the welcome screen. Real sessions hit Supabase.
const NOW = Date.now();
const MIN = 60_000;
const HR = 60 * MIN;

const SEED_GIGS: Gig[] = [
  { id: 'seed-g-1', ownerId: SEED_OWNER, anonymous: false, title: 'Help moving a couch up 3 flights', payout: '$40', category: 'Moving', where: 'Dillon Hall · 0.4 mi', postedAt: NOW - 12 * MIN, postedAgo: '12 min ago', posterName: 'Marcus K.', posterInitials: 'MK' },
  { id: 'seed-g-2', ownerId: SEED_OWNER, anonymous: false, title: 'Need a ride to South Bend airport Sat 6am', payout: '$15', category: 'Rideshare', where: 'SBN · 4 mi', postedAt: NOW - HR, postedAgo: '1h ago', posterName: 'Priya S.', posterInitials: 'PS' },
  { id: 'seed-g-3', ownerId: SEED_OWNER, anonymous: false, title: 'MATH 10560 tutor for midterm prep', payout: '$30/hr', category: 'Tutoring', where: 'Hesburgh Library', postedAt: NOW - 2 * HR, postedAgo: '2h ago', posterName: 'Jordan L.', posterInitials: 'JL' },
  { id: 'seed-g-4', ownerId: SEED_OWNER, anonymous: false, title: 'Walk my dog this weekend', payout: '$15', category: 'Pets', where: 'Sorin College · 0.2 mi', postedAt: NOW - 3 * HR, postedAgo: '3h ago', posterName: 'Sam R.', posterInitials: 'SR' },
  { id: 'seed-g-5', ownerId: SEED_OWNER, anonymous: false, title: 'Photographer for senior portraits at the Dome', payout: '$80', category: 'Creative', where: 'Main Building · 0.6 mi', postedAt: NOW - 5 * HR, postedAgo: '5h ago', posterName: 'Aisha M.', posterInitials: 'AM' },
  { id: 'seed-g-6', ownerId: SEED_OWNER, anonymous: false, title: 'Pick up Amazon package & drop it at my dorm', payout: '$8', category: 'Errands', where: 'LaFortune · 0.3 mi', postedAt: NOW - 24 * HR, postedAgo: 'yesterday', posterName: 'Tyler J.', posterInitials: 'TJ' },
];

const SEED_HANGOUTS: Hangout[] = [
  { id: 'seed-h-1', ownerId: SEED_OWNER, anonymous: false, title: 'CSE 20110 midterm cram session', when: 'Tonight · 8:00 PM', where: 'Hesburgh Library, 2nd floor', going: 4, vibe: 'Study', postedAt: NOW - 2 * HR, hostName: 'Jordan L.', hostInitials: 'JL' },
  { id: 'seed-h-2', ownerId: SEED_OWNER, anonymous: false, title: 'Pickup basketball — all skill levels', when: 'Sat · 3:00 PM', where: 'Rolfs Sports Recreation Center', going: 8, vibe: 'Sports', postedAt: NOW - 5 * HR, hostName: 'Tyler J.', hostInitials: 'TJ' },
  { id: 'seed-h-3', ownerId: SEED_OWNER, anonymous: false, title: 'South Dining Hall dinner', when: 'Tonight · 6:30 PM', where: 'South Dining Hall', going: 3, vibe: 'Food', postedAt: NOW - 4 * HR, hostName: 'Aisha M.', hostInitials: 'AM' },
  { id: 'seed-h-4', ownerId: SEED_OWNER, anonymous: false, title: 'Coffee run @ Hagerty', when: 'Tomorrow · 4:00 PM', where: 'Hagerty Family Café, DPAC', going: 2, vibe: 'Social', postedAt: NOW - 7 * HR, hostName: 'Sam R.', hostInitials: 'SR' },
  { id: 'seed-h-5', ownerId: SEED_OWNER, anonymous: false, title: 'Sunset run around the lakes', when: 'Sun · 6:15 PM', where: "St. Joseph's Lake trail", going: 5, vibe: 'Sports', postedAt: NOW - 9 * HR, hostName: 'Priya S.', hostInitials: 'PS' },
];

const SEED_VOICES: Voice[] = [
  { id: 'seed-v-1', ownerId: SEED_OWNER, anonymous: true, body: 'south dining hall is straight up unhinged today. why is the line wrapping outside.', topic: 'Dining', votes: 142, comments: 23, postedAt: NOW - 12 * MIN, postedAgo: '12m', posterName: null, posterInitials: null },
  { id: 'seed-v-2', ownerId: SEED_OWNER, anonymous: true, body: "to whoever left their hydroflask in DeBartolo 138, i'll bring it tomorrow at 9am. don't leak my information", topic: 'Class', votes: 89, comments: 5, postedAt: NOW - 34 * MIN, postedAgo: '34m', posterName: null, posterInitials: null },
  { id: 'seed-v-3', ownerId: SEED_OWNER, anonymous: true, body: 'petition to make the leprechaun mascot scream less during football games', topic: 'Sports', votes: -12, comments: 47, postedAt: NOW - HR, postedAgo: '1h', posterName: null, posterInitials: null },
  { id: 'seed-v-4', ownerId: SEED_OWNER, anonymous: true, body: 'got asked out at the grotto today and i genuinely do not know how to feel', topic: 'Random', votes: 318, comments: 56, postedAt: NOW - 2 * HR, postedAgo: '2h', posterName: null, posterInitials: null },
  { id: 'seed-v-5', ownerId: SEED_OWNER, anonymous: true, body: 'Hesburgh 24-hour room is the realest place on campus at 3am. iykyk', topic: 'Class', votes: 204, comments: 12, postedAt: NOW - 3 * HR, postedAgo: '3h', posterName: null, posterInitials: null },
  { id: 'seed-v-6', ownerId: SEED_OWNER, anonymous: true, body: 'why does ND charge $9 for chicken tenders in the basket. it is gluttony pricing', topic: 'Dining', votes: 76, comments: 8, postedAt: NOW - 4 * HR, postedAgo: '4h', posterName: null, posterInitials: null },
];

type AddGigInput = {
  title: string;
  description?: string;
  payout: string;
  category: GigCategory;
  where: string;
  anonymous: boolean;
  ownerId: string;
  posterName: string | null;
  posterInitials: string | null;
};

type AddHangoutInput = {
  title: string;
  when: string;
  where: string;
  vibe: string;
  description?: string;
  anonymous: boolean;
  ownerId: string;
  hostName: string | null;
  hostInitials: string | null;
};

type AddVoiceInput = {
  body: string;
  topic: VoiceTopic;
  anonymous: boolean;
  ownerId: string;
  posterName: string | null;
  posterInitials: string | null;
};

type Store = {
  gigs: Gig[];
  hangouts: Hangout[];
  voices: Voice[];
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addGig: (input: AddGigInput) => Promise<void>;
  addHangout: (input: AddHangoutInput) => Promise<void>;
  addVoice: (input: AddVoiceInput) => Promise<void>;
  rsvpHangout: (id: string) => Promise<void>;
  voteVoice: (id: string, delta: 1 | -1 | 0) => Promise<void>;
};

const PostsContext = createContext<Store | null>(null);

// ─────────────────────── DB ↔ App mappers ───────────────────────

type DbProfileEmbed = { display_name: string | null; initials: string | null } | null;

function dollarsToCents(payout: string): number {
  const n = Number(payout.replace(/[^0-9.]/g, ''));
  return Math.max(1, Math.round((Number.isFinite(n) ? n : 0) * 100));
}

function centsToPayout(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars}`;
}

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

type DbGigRow = {
  id: string;
  poster_id: string;
  title: string;
  description: string | null;
  category: GigCategory;
  payout_cents: number;
  location_label: string | null;
  posted_at: string;
  anonymous: boolean;
  poster?: DbProfileEmbed;
};

function gigFromDb(row: DbGigRow): Gig {
  return {
    id: row.id,
    ownerId: row.poster_id,
    anonymous: row.anonymous,
    title: row.title,
    description: row.description ?? undefined,
    payout: centsToPayout(row.payout_cents),
    category: row.category,
    where: row.location_label ?? '',
    postedAt: new Date(row.posted_at).getTime(),
    postedAgo: timeAgo(row.posted_at),
    posterName: row.anonymous ? null : (row.poster?.display_name ?? null),
    posterInitials: row.anonymous ? null : (row.poster?.initials ?? null),
  };
}

type DbHangoutRow = {
  id: string;
  host_id: string;
  title: string;
  vibe: string | null;
  location_label: string | null;
  when_label: string | null;
  description: string | null;
  anonymous: boolean;
  created_at: string;
  host?: DbProfileEmbed;
  hangout_attendees?: { count: number }[];
};

function hangoutFromDb(row: DbHangoutRow): Hangout {
  const going =
    Array.isArray(row.hangout_attendees) && row.hangout_attendees[0]
      ? row.hangout_attendees[0].count
      : 0;
  return {
    id: row.id,
    ownerId: row.host_id,
    anonymous: row.anonymous,
    title: row.title,
    when: row.when_label ?? '',
    where: row.location_label ?? '',
    going,
    vibe: row.vibe ?? 'Other',
    description: row.description ?? undefined,
    postedAt: new Date(row.created_at).getTime(),
    hostName: row.anonymous ? null : (row.host?.display_name ?? null),
    hostInitials: row.anonymous ? null : (row.host?.initials ?? null),
  };
}

type DbVoiceRow = {
  id: string;
  author_id: string;
  anonymous: boolean;
  body: string;
  topic: VoiceTopic;
  posted_at: string;
  vote_score: number;
  author?: DbProfileEmbed;
};

function voiceFromDb(row: DbVoiceRow): Voice {
  return {
    id: row.id,
    ownerId: row.author_id,
    anonymous: row.anonymous,
    body: row.body,
    topic: row.topic,
    votes: row.vote_score,
    comments: 0,
    postedAt: new Date(row.posted_at).getTime(),
    postedAgo: timeAgo(row.posted_at),
    posterName: row.anonymous ? null : (row.author?.display_name ?? null),
    posterInitials: row.anonymous ? null : (row.author?.initials ?? null),
  };
}

const GIG_SELECT =
  '*, poster:profiles!gigs_poster_id_fkey(display_name, initials)';
const HANGOUT_SELECT =
  '*, host:profiles!hangouts_host_id_fkey(display_name, initials), hangout_attendees(count)';
const VOICE_SELECT =
  '*, author:profiles!voices_author_id_fkey(display_name, initials)';

// ─────────────────────── Provider ───────────────────────

export function PostsProvider({ children }: { children: ReactNode }) {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;

  const [gigs, setGigs] = useState<Gig[]>([]);
  const [hangouts, setHangouts] = useState<Hangout[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track per-user vote choices so we can update voice_votes correctly.
  const myVoteRef = useRef<Map<string, 1 | -1>>(new Map());

  const fetchAll = useCallback(async () => {
    if (!realSession) {
      // Dev / unauthenticated: use seeds so the UI is non-empty.
      setGigs(SEED_GIGS);
      setHangouts(SEED_HANGOUTS);
      setVoices(SEED_VOICES);
      setHydrated(true);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [gigsRes, hangoutsRes, voicesRes, votesRes] = await Promise.all([
        supabase.from('gigs').select(GIG_SELECT).order('posted_at', { ascending: false }),
        supabase.from('hangouts').select(HANGOUT_SELECT).order('created_at', { ascending: false }),
        supabase.from('voices').select(VOICE_SELECT).order('posted_at', { ascending: false }),
        supabase.from('voice_votes').select('voice_id, value').eq('user_id', session!.user.id),
      ]);
      if (gigsRes.error) throw gigsRes.error;
      if (hangoutsRes.error) throw hangoutsRes.error;
      if (voicesRes.error) throw voicesRes.error;
      setGigs(((gigsRes.data ?? []) as DbGigRow[]).map(gigFromDb));
      setHangouts(((hangoutsRes.data ?? []) as DbHangoutRow[]).map(hangoutFromDb));
      setVoices(((voicesRes.data ?? []) as DbVoiceRow[]).map(voiceFromDb));
      const voteMap = new Map<string, 1 | -1>();
      for (const v of votesRes.data ?? []) {
        voteMap.set(v.voice_id, v.value === 1 ? 1 : -1);
      }
      myVoteRef.current = voteMap;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load posts.';
      console.warn('[posts-store] fetchAll failed:', msg);
      setError(msg);
    } finally {
      setHydrated(true);
      setLoading(false);
    }
  }, [realSession, session]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: refetch the row when something new lands. Cheap and correct
  // (single-row roundtrip with the join applied).
  useEffect(() => {
    if (!realSession) return;
    const channel = supabase
      .channel('posts-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gigs' },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const { data } = await supabase
            .from('gigs')
            .select(GIG_SELECT)
            .eq('id', id)
            .maybeSingle();
          if (data) {
            const fresh = gigFromDb(data as DbGigRow);
            setGigs((cur) => [fresh, ...cur.filter((g) => g.id !== fresh.id)]);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hangouts' },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const { data } = await supabase
            .from('hangouts')
            .select(HANGOUT_SELECT)
            .eq('id', id)
            .maybeSingle();
          if (data) {
            const fresh = hangoutFromDb(data as DbHangoutRow);
            setHangouts((cur) => [fresh, ...cur.filter((h) => h.id !== fresh.id)]);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'voices' },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const { data } = await supabase
            .from('voices')
            .select(VOICE_SELECT)
            .eq('id', id)
            .maybeSingle();
          if (data) {
            const fresh = voiceFromDb(data as DbVoiceRow);
            setVoices((cur) => [fresh, ...cur.filter((v) => v.id !== fresh.id)]);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'voices' },
        (payload) => {
          const row = payload.new as { id: string; vote_score: number };
          setVoices((cur) =>
            cur.map((v) => (v.id === row.id ? { ...v, votes: row.vote_score } : v)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [realSession]);

  // ─────────────────────── mutations ───────────────────────

  async function addGigImpl(input: AddGigInput) {
    if (!realSession) {
      const now = Date.now();
      const optimistic: Gig = {
        id: `local-g-${now}`,
        ownerId: input.ownerId,
        anonymous: input.anonymous,
        title: input.title,
        description: input.description,
        payout: input.payout,
        category: input.category,
        where: input.where,
        postedAt: now,
        postedAgo: 'just now',
        posterName: input.anonymous ? null : input.posterName,
        posterInitials: input.anonymous ? null : input.posterInitials,
      };
      setGigs((cur) => [optimistic, ...cur]);
      return;
    }
    const { data, error: insertErr } = await supabase
      .from('gigs')
      .insert({
        poster_id: input.ownerId,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        payout_cents: dollarsToCents(input.payout),
        location_label: input.where,
        anonymous: input.anonymous,
      })
      .select(GIG_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addGig failed:', insertErr.message);
      setError(insertErr.message);
      return;
    }
    if (data) {
      const fresh = gigFromDb(data as DbGigRow);
      setGigs((cur) => [fresh, ...cur.filter((g) => g.id !== fresh.id)]);
    }
  }

  async function addHangoutImpl(input: AddHangoutInput) {
    if (!realSession) {
      const now = Date.now();
      const optimistic: Hangout = {
        id: `local-h-${now}`,
        ownerId: input.ownerId,
        anonymous: input.anonymous,
        title: input.title,
        when: input.when,
        where: input.where,
        vibe: input.vibe,
        description: input.description,
        going: 1,
        postedAt: now,
        hostName: input.anonymous ? null : input.hostName,
        hostInitials: input.anonymous ? null : input.hostInitials,
      };
      setHangouts((cur) => [optimistic, ...cur]);
      return;
    }
    const { data, error: insertErr } = await supabase
      .from('hangouts')
      .insert({
        host_id: input.ownerId,
        title: input.title,
        vibe: input.vibe,
        location_label: input.where,
        when_label: input.when,
        description: input.description ?? null,
        anonymous: input.anonymous,
      })
      .select(HANGOUT_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addHangout failed:', insertErr.message);
      setError(insertErr.message);
      return;
    }
    // Host is implicitly RSVP'd — insert into attendees so going count = 1.
    if (data) {
      await supabase
        .from('hangout_attendees')
        .insert({ hangout_id: (data as DbHangoutRow).id, user_id: input.ownerId })
        .then(() => undefined, () => undefined);
      const fresh = hangoutFromDb({
        ...(data as DbHangoutRow),
        hangout_attendees: [{ count: 1 }],
      });
      setHangouts((cur) => [fresh, ...cur.filter((h) => h.id !== fresh.id)]);
    }
  }

  async function addVoiceImpl(input: AddVoiceInput) {
    if (!realSession) {
      const now = Date.now();
      const optimistic: Voice = {
        id: `local-v-${now}`,
        ownerId: input.ownerId,
        anonymous: input.anonymous,
        body: input.body,
        topic: input.topic,
        votes: 0,
        comments: 0,
        postedAt: now,
        postedAgo: 'just now',
        posterName: input.anonymous ? null : input.posterName,
        posterInitials: input.anonymous ? null : input.posterInitials,
      };
      setVoices((cur) => [optimistic, ...cur]);
      return;
    }
    const { data, error: insertErr } = await supabase
      .from('voices')
      .insert({
        author_id: input.ownerId,
        anonymous: input.anonymous,
        body: input.body,
        topic: input.topic,
      })
      .select(VOICE_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addVoice failed:', insertErr.message);
      setError(insertErr.message);
      return;
    }
    if (data) {
      const fresh = voiceFromDb(data as DbVoiceRow);
      setVoices((cur) => [fresh, ...cur.filter((v) => v.id !== fresh.id)]);
    }
  }

  async function rsvpHangoutImpl(id: string) {
    if (!realSession) {
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
      );
      return;
    }
    // join_hangout RPC handles attendee insert + group conversation membership
    // atomically. Idempotent via on-conflict in SQL.
    const { error: rsvpErr } = await supabase.rpc('join_hangout', {
      p_hangout_id: id,
    });
    if (rsvpErr) {
      console.warn('[posts-store] rsvp failed:', rsvpErr.message);
      setError(rsvpErr.message);
      return;
    }
    setHangouts((cur) =>
      cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
    );
  }

  async function voteVoiceImpl(id: string, delta: 1 | -1 | 0) {
    // Optimistic local update for the score.
    setVoices((cur) =>
      cur.map((v) => (v.id === id ? { ...v, votes: v.votes + delta } : v)),
    );
    if (!realSession || delta === 0) return;
    const previous = myVoteRef.current.get(id);
    // Apply the delta as a target absolute vote.
    const next: 1 | -1 | null =
      previous === 1 && delta === -1 ? null :
      previous === -1 && delta === 1 ? null :
      delta === 1 ? 1 :
      delta === -1 ? -1 :
      previous ?? null;
    if (next === null) {
      myVoteRef.current.delete(id);
      await supabase
        .from('voice_votes')
        .delete()
        .eq('voice_id', id)
        .eq('user_id', session!.user.id);
    } else {
      myVoteRef.current.set(id, next);
      await supabase
        .from('voice_votes')
        .upsert({ voice_id: id, user_id: session!.user.id, value: next });
    }
  }

  const value = useMemo<Store>(
    () => ({
      gigs,
      hangouts,
      voices,
      hydrated,
      loading,
      error,
      refresh: fetchAll,
      addGig: addGigImpl,
      addHangout: addHangoutImpl,
      addVoice: addVoiceImpl,
      rsvpHangout: rsvpHangoutImpl,
      voteVoice: voteVoiceImpl,
    }),
    // We intentionally don't depend on the mutation functions; they read state via closures
    // but only state-bound effects (gigs, hangouts, voices) need to drive re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigs, hangouts, voices, hydrated, loading, error, fetchAll],
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const ctx = useContext(PostsContext);
  if (!ctx) throw new Error('usePosts must be used inside <PostsProvider>');
  return ctx;
}

// Anonymous posts are intentionally included — the owner can always see their
// own history even if the public feed hides their name.
export function useMyPosts(userId: string | null | undefined) {
  const { gigs, hangouts, voices } = usePosts();
  return useMemo(() => {
    if (!userId) return { gigs: [], hangouts: [], voices: [] };
    return {
      gigs: gigs.filter((g) => g.ownerId === userId),
      hangouts: hangouts.filter((h) => h.ownerId === userId),
      voices: voices.filter((v) => v.ownerId === userId),
    };
  }, [gigs, hangouts, voices, userId]);
}
