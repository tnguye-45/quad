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
  /** Exact server timestamp (microsecond precision) used as the keyset
   *  pagination cursor. Absent for dev-seed rows, which never paginate. */
  rawPostedAt?: string;
  postedAgo: string;
  posterName: string | null;
  posterInitials: string | null;
  posterAvatarUrl: string | null;
  comments: number;
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
  rawPostedAt?: string;
  /** Epoch ms of the event start, when the row carries a real starts_at.
   *  Null/absent for legacy when_label-only rows and dev seeds. */
  startsAt?: number | null;
  hostName: string | null;
  hostInitials: string | null;
  hostAvatarUrl: string | null;
  comments: number;
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
  rawPostedAt?: string;
  postedAgo: string;
  posterName: string | null;
  posterInitials: string | null;
  posterAvatarUrl: string | null;
};

// Seeds shown in dev mode only — when the user opts into the fake "admin"
// session on the welcome screen. Real sessions hit Supabase.
const NOW = Date.now();
const MIN = 60_000;
const HR = 60 * MIN;

const SEED_GIGS: Gig[] = [
  { id: 'seed-g-1', ownerId: SEED_OWNER, anonymous: false, title: 'Help moving a couch up 3 flights', payout: '$40', category: 'Moving', where: 'Dillon Hall · 0.4 mi', postedAt: NOW - 12 * MIN, postedAgo: '12 min ago', posterName: 'Marcus K.', posterInitials: 'MK', posterAvatarUrl: null, comments: 0 },
  { id: 'seed-g-2', ownerId: SEED_OWNER, anonymous: false, title: 'Need a ride to South Bend airport Sat 6am', payout: '$15', category: 'Rideshare', where: 'SBN · 4 mi', postedAt: NOW - HR, postedAgo: '1h ago', posterName: 'Priya S.', posterInitials: 'PS', posterAvatarUrl: null, comments: 0 },
  { id: 'seed-g-3', ownerId: SEED_OWNER, anonymous: false, title: 'MATH 10560 tutor for midterm prep', payout: '$30/hr', category: 'Tutoring', where: 'Hesburgh Library', postedAt: NOW - 2 * HR, postedAgo: '2h ago', posterName: 'Jordan L.', posterInitials: 'JL', posterAvatarUrl: null, comments: 0 },
  { id: 'seed-g-4', ownerId: SEED_OWNER, anonymous: false, title: 'Walk my dog this weekend', payout: '$15', category: 'Pets', where: 'Sorin College · 0.2 mi', postedAt: NOW - 3 * HR, postedAgo: '3h ago', posterName: 'Sam R.', posterInitials: 'SR', posterAvatarUrl: null, comments: 0 },
  { id: 'seed-g-5', ownerId: SEED_OWNER, anonymous: false, title: 'Photographer for senior portraits at the Dome', payout: '$80', category: 'Creative', where: 'Main Building · 0.6 mi', postedAt: NOW - 5 * HR, postedAgo: '5h ago', posterName: 'Aisha M.', posterInitials: 'AM', posterAvatarUrl: null, comments: 0 },
  { id: 'seed-g-6', ownerId: SEED_OWNER, anonymous: false, title: 'Pick up Amazon package & drop it at my dorm', payout: '$8', category: 'Errands', where: 'LaFortune · 0.3 mi', postedAt: NOW - 24 * HR, postedAgo: 'yesterday', posterName: 'Tyler J.', posterInitials: 'TJ', posterAvatarUrl: null, comments: 0 },
];

const SEED_HANGOUTS: Hangout[] = [
  { id: 'seed-h-1', ownerId: SEED_OWNER, anonymous: false, title: 'CSE 20110 midterm cram session', when: 'Tonight · 8:00 PM', where: 'Hesburgh Library, 2nd floor', going: 4, vibe: 'Study', postedAt: NOW - 2 * HR, hostName: 'Jordan L.', hostInitials: 'JL', hostAvatarUrl: null, comments: 0 },
  { id: 'seed-h-2', ownerId: SEED_OWNER, anonymous: false, title: 'Pickup basketball — all skill levels', when: 'Sat · 3:00 PM', where: 'Rolfs Sports Recreation Center', going: 8, vibe: 'Sports', postedAt: NOW - 5 * HR, hostName: 'Tyler J.', hostInitials: 'TJ', hostAvatarUrl: null, comments: 0 },
  { id: 'seed-h-3', ownerId: SEED_OWNER, anonymous: false, title: 'South Dining Hall dinner', when: 'Tonight · 6:30 PM', where: 'South Dining Hall', going: 3, vibe: 'Food', postedAt: NOW - 4 * HR, hostName: 'Aisha M.', hostInitials: 'AM', hostAvatarUrl: null, comments: 0 },
  { id: 'seed-h-4', ownerId: SEED_OWNER, anonymous: false, title: 'Coffee run @ Hagerty', when: 'Tomorrow · 4:00 PM', where: 'Hagerty Family Café, DPAC', going: 2, vibe: 'Social', postedAt: NOW - 7 * HR, hostName: 'Sam R.', hostInitials: 'SR', hostAvatarUrl: null, comments: 0 },
  { id: 'seed-h-5', ownerId: SEED_OWNER, anonymous: false, title: 'Sunset run around the lakes', when: 'Sun · 6:15 PM', where: "St. Joseph's Lake trail", going: 5, vibe: 'Sports', postedAt: NOW - 9 * HR, hostName: 'Priya S.', hostInitials: 'PS', hostAvatarUrl: null, comments: 0 },
];

const SEED_VOICES: Voice[] = [
  { id: 'seed-v-1', ownerId: SEED_OWNER, anonymous: true, body: 'south dining hall is straight up unhinged today. why is the line wrapping outside.', topic: 'Dining', votes: 142, comments: 23, postedAt: NOW - 12 * MIN, postedAgo: '12m', posterName: null, posterInitials: null, posterAvatarUrl: null },
  { id: 'seed-v-2', ownerId: SEED_OWNER, anonymous: true, body: "to whoever left their hydroflask in DeBartolo 138, i'll bring it tomorrow at 9am. don't leak my information", topic: 'Class', votes: 89, comments: 5, postedAt: NOW - 34 * MIN, postedAgo: '34m', posterName: null, posterInitials: null, posterAvatarUrl: null },
  { id: 'seed-v-3', ownerId: SEED_OWNER, anonymous: true, body: 'petition to make the leprechaun mascot scream less during football games', topic: 'Sports', votes: -12, comments: 47, postedAt: NOW - HR, postedAgo: '1h', posterName: null, posterInitials: null, posterAvatarUrl: null },
  { id: 'seed-v-4', ownerId: SEED_OWNER, anonymous: true, body: 'got asked out at the grotto today and i genuinely do not know how to feel', topic: 'Random', votes: 318, comments: 56, postedAt: NOW - 2 * HR, postedAgo: '2h', posterName: null, posterInitials: null, posterAvatarUrl: null },
  { id: 'seed-v-5', ownerId: SEED_OWNER, anonymous: true, body: 'Hesburgh 24-hour room is the realest place on campus at 3am. iykyk', topic: 'Class', votes: 204, comments: 12, postedAt: NOW - 3 * HR, postedAgo: '3h', posterName: null, posterInitials: null, posterAvatarUrl: null },
  { id: 'seed-v-6', ownerId: SEED_OWNER, anonymous: true, body: 'why does ND charge $9 for chicken tenders in the basket. it is gluttony pricing', topic: 'Dining', votes: 76, comments: 8, postedAt: NOW - 4 * HR, postedAgo: '4h', posterName: null, posterInitials: null, posterAvatarUrl: null },
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
  posterAvatarUrl: string | null;
};

type AddHangoutInput = {
  title: string;
  when: string;
  /** ISO timestamp of the event start. Written to hangouts.starts_at so the
   *  feed can expire dead events; `when` stays the human label. */
  startsAt?: string;
  where: string;
  vibe: string;
  description?: string;
  anonymous: boolean;
  ownerId: string;
  hostName: string | null;
  hostInitials: string | null;
  hostAvatarUrl: string | null;
};

type AddVoiceInput = {
  body: string;
  topic: VoiceTopic;
  anonymous: boolean;
  ownerId: string;
  posterName: string | null;
  posterInitials: string | null;
  posterAvatarUrl: string | null;
};

type Store = {
  gigs: Gig[];
  hangouts: Hangout[];
  voices: Voice[];
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  /** True when there's another page of data on the server. Set per-kind. */
  hasMore: { gigs: boolean; hangouts: boolean; voices: boolean };
  refresh: () => Promise<void>;
  /** Cursor-based pagination on posted_at / created_at. Idempotent: a no-op
   *  while a load is already in flight for that kind. */
  loadMore: (kind: 'gigs' | 'hangouts' | 'voices') => Promise<void>;
  /** Resolves true when the post reached the server (or dev store). Callers
   *  use this to decide whether to close the compose screen. */
  addGig: (input: AddGigInput) => Promise<boolean>;
  addHangout: (input: AddHangoutInput) => Promise<boolean>;
  addVoice: (input: AddVoiceInput) => Promise<boolean>;
  rsvpHangout: (id: string) => Promise<void>;
  /** Hangout ids the current user has already joined (including hangouts they
   *  host). rsvpHangout no-ops for these so a quick double-tap can't inflate
   *  the going count. */
  myRsvps: Record<string, true>;
  /** The current user's vote on each voice (1, -1, or absent). Single source
   *  of truth for the up/down highlight — shared across the list and detail. */
  myVotes: Record<string, 1 | -1>;
  /** Tap the up (+1) or down (-1) arrow. Tapping the already-active arrow
   *  clears the vote. Optimistic, single atomic RPC, rolls back on failure. */
  voteVoice: (id: string, arrow: 1 | -1) => Promise<void>;
};

/** How many rows to fetch per page on initial load + each loadMore call. */
const PAGE_SIZE = 20;

const PostsContext = createContext<Store | null>(null);

// ─────────────────────── DB ↔ App mappers ───────────────────────

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

// Compound keyset cursor for `(tsCol desc, id desc)` ordering. Returns the
// PostgREST `.or()` expression selecting rows strictly older than the
// (timestamp, id) cursor. Using id as a tiebreak is essential: seeded rows are
// bulk-inserted in one statement and therefore share an identical posted_at, so
// a plain `.lt(posted_at)` would silently drop every row past the first at that
// timestamp. Timestamp/id values are double-quoted so `+`/`:` in the timestamp
// don't confuse the filter parser.
function keysetOlderThan(tsCol: string, ts: string, id: string): string {
  return `${tsCol}.lt."${ts}",and(${tsCol}.eq."${ts}",id.lt."${id}")`;
}

// INSERT returns (CLIENT_CONTRACT.md §1): identity columns are structurally
// unreadable on the base tables, so `returning *` / author embeds fail with
// 42501. Inserts select back only granted columns; the caller's own identity
// (it's their post) is grafted on from the compose input.
const GIG_RETURN_SELECT =
  'id, anonymous, title, description, category, payout_cents, location_label, posted_at, comment_count';
const HANGOUT_RETURN_SELECT =
  'id, anonymous, title, vibe, location_label, when_label, starts_at, description, created_at, comment_count';
const VOICE_RETURN_SELECT =
  'id, anonymous, body, topic, posted_at, vote_score, comment_count';

// ─────────────── Feed views (0027) — identity-safe reads ───────────────
// All feed READS go through the *_feed security-barrier views, which null the
// author columns for other people's anonymous rows and fold in the two-way
// block filter. The client-side masking in the mappers is now display sugar,
// not the defense.

type DbGigFeedRow = {
  id: string;
  anonymous: boolean;
  title: string;
  description: string | null;
  category: GigCategory;
  payout_cents: number;
  location_label: string | null;
  posted_at: string;
  comment_count: number | null;
  poster_id: string | null;
  poster_display_name: string | null;
  poster_initials: string | null;
  poster_avatar_url: string | null;
};

const GIG_FEED_SELECT =
  'id, anonymous, title, description, category, payout_cents, location_label, ' +
  'posted_at, comment_count, poster_id, poster_display_name, poster_initials, poster_avatar_url';

function gigFromFeed(row: DbGigFeedRow): Gig {
  return {
    id: row.id,
    // Null for someone else's anonymous gig — '' keeps the Gig type stable and
    // never matches a real user id in useMyPosts / "message poster" checks.
    ownerId: row.poster_id ?? '',
    anonymous: row.anonymous,
    title: row.title,
    description: row.description ?? undefined,
    payout: centsToPayout(row.payout_cents),
    category: row.category,
    where: row.location_label ?? '',
    postedAt: new Date(row.posted_at).getTime(),
    rawPostedAt: row.posted_at,
    postedAgo: timeAgo(row.posted_at),
    posterName: row.anonymous ? null : row.poster_display_name,
    posterInitials: row.anonymous ? null : row.poster_initials,
    posterAvatarUrl: row.anonymous ? null : row.poster_avatar_url,
    comments: row.comment_count ?? 0,
  };
}

type DbHangoutFeedRow = {
  id: string;
  anonymous: boolean;
  title: string;
  vibe: string | null;
  location_label: string | null;
  when_label: string | null;
  starts_at: string | null;
  description: string | null;
  created_at: string;
  comment_count: number | null;
  going_count: number | null;
  host_id: string | null;
  host_display_name: string | null;
  host_initials: string | null;
  host_avatar_url: string | null;
};

const HANGOUT_FEED_SELECT =
  'id, anonymous, title, vibe, location_label, when_label, starts_at, description, ' +
  'created_at, comment_count, going_count, host_id, host_display_name, host_initials, host_avatar_url';

function hangoutFromFeed(row: DbHangoutFeedRow): Hangout {
  return {
    id: row.id,
    ownerId: row.host_id ?? '',
    anonymous: row.anonymous,
    title: row.title,
    when: row.when_label ?? '',
    where: row.location_label ?? '',
    going: row.going_count ?? 0,
    vibe: row.vibe ?? 'Other',
    description: row.description ?? undefined,
    postedAt: new Date(row.created_at).getTime(),
    rawPostedAt: row.created_at,
    startsAt: row.starts_at ? new Date(row.starts_at).getTime() : null,
    hostName: row.anonymous ? null : row.host_display_name,
    hostInitials: row.anonymous ? null : row.host_initials,
    hostAvatarUrl: row.anonymous ? null : row.host_avatar_url,
    comments: row.comment_count ?? 0,
  };
}

type DbVoiceFeedRow = {
  id: string;
  anonymous: boolean;
  body: string;
  topic: VoiceTopic;
  posted_at: string;
  vote_score: number;
  comment_count: number | null;
  author_id: string | null;
  author_display_name: string | null;
  author_initials: string | null;
  author_avatar_url: string | null;
};

const VOICE_FEED_SELECT =
  'id, anonymous, body, topic, posted_at, vote_score, comment_count, ' +
  'author_id, author_display_name, author_initials, author_avatar_url';

function voiceFromFeed(row: DbVoiceFeedRow): Voice {
  return {
    id: row.id,
    ownerId: row.author_id ?? '',
    anonymous: row.anonymous,
    body: row.body,
    topic: row.topic,
    votes: row.vote_score,
    comments: row.comment_count ?? 0,
    postedAt: new Date(row.posted_at).getTime(),
    rawPostedAt: row.posted_at,
    postedAgo: timeAgo(row.posted_at),
    posterName: row.anonymous ? null : row.author_display_name,
    posterInitials: row.anonymous ? null : row.author_initials,
    posterAvatarUrl: row.anonymous ? null : row.author_avatar_url,
  };
}

// A hangout stays in the feed until 2 hours after its start; when_label-only
// rows (no starts_at) never expire because there's nothing to judge them by.
const HANGOUT_GRACE_MS = 2 * 60 * 60 * 1000;

function hangoutIsLive(h: Hangout): boolean {
  return h.startsAt == null || h.startsAt > Date.now() - HANGOUT_GRACE_MS;
}

// Server-side half of the same rule, ANDed with the keyset filter — dead
// events shouldn't burn page slots. The timestamp is double-quoted so `+`/`:`
// don't confuse the .or() parser.
function hangoutLiveFilter(): string {
  const cutoff = new Date(Date.now() - HANGOUT_GRACE_MS).toISOString();
  return `starts_at.is.null,starts_at.gt."${cutoff}"`;
}

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
  const [hasMore, setHasMore] = useState<{ gigs: boolean; hangouts: boolean; voices: boolean }>({
    gigs: true,
    hangouts: true,
    voices: true,
  });
  // The current user's vote per voice. State (not a ref) so the up/down
  // highlight re-renders reactively and both the list and detail screens read
  // the same source of truth.
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  // Hangouts the user has already joined — rsvpHangout no-ops for these.
  const [myRsvps, setMyRsvps] = useState<Record<string, true>>({});
  const rsvpInFlightRef = useRef<Set<string>>(new Set());
  // Per-voice vote serialization: only one set_voice_vote RPC is in flight per
  // voice at a time, and the latest desired target is remembered so rapid
  // up→clear taps can't land server-side out of order.
  const voteSyncingRef = useRef<Set<string>>(new Set());
  const voteTargetRef = useRef<Map<string, 1 | -1 | 0>>(new Map());
  // Guards so a fast-flick on a FlatList doesn't fire overlapping loadMore
  // round-trips — onEndReached fires multiple times per scroll on iOS.
  const loadingMoreRef = useRef<{ gigs: boolean; hangouts: boolean; voices: boolean }>({
    gigs: false,
    hangouts: false,
    voices: false,
  });
  // Generation counter: bumped by every fetchAll (pull-to-refresh). A loadMore
  // that was in flight when the refresh started must throw away its page —
  // appending a stale page after the list was reset drops the range between
  // page 1 and that page permanently.
  const fetchGenRef = useRef(0);
  // Keyset cursors come from the last RAW row of each fetched page, not from
  // component state — the hangout expiry filter can drop rows from state, and
  // a cursor built from filtered state would re-fetch or skip ranges.
  const cursorRef = useRef<{
    gigs?: { ts: string; id: string };
    hangouts?: { ts: string; id: string };
    voices?: { ts: string; id: string };
  }>({});

  const fetchAll = useCallback(async () => {
    if (!realSession) {
      // Dev / unauthenticated: use seeds so the UI is non-empty.
      setGigs(SEED_GIGS);
      setHangouts(SEED_HANGOUTS);
      setVoices(SEED_VOICES);
      setHydrated(true);
      setLoading(false);
      setError(null);
      setHasMore({ gigs: false, hangouts: false, voices: false });
      return;
    }
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const me = session!.user.id;
      const [gigsRes, hangoutsRes, voicesRes, votesRes, rsvpRes] = await Promise.all([
        supabase
          .from('gigs_feed')
          .select(GIG_FEED_SELECT)
          .order('posted_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('hangouts_feed')
          .select(HANGOUT_FEED_SELECT)
          .or(hangoutLiveFilter())
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('voices_feed')
          .select(VOICE_FEED_SELECT)
          .order('posted_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(PAGE_SIZE),
        supabase.from('voice_votes').select('voice_id, value').eq('user_id', me),
        supabase.from('hangout_attendees').select('hangout_id').eq('user_id', me),
      ]);
      if (gigsRes.error) throw gigsRes.error;
      if (hangoutsRes.error) throw hangoutsRes.error;
      if (voicesRes.error) throw voicesRes.error;
      const gigsData = (gigsRes.data ?? []) as unknown as DbGigFeedRow[];
      const hangoutsData = (hangoutsRes.data ?? []) as unknown as DbHangoutFeedRow[];
      const voicesData = (voicesRes.data ?? []) as unknown as DbVoiceFeedRow[];
      if (fetchGenRef.current !== gen) return;
      const lastGig = gigsData[gigsData.length - 1];
      const lastHangout = hangoutsData[hangoutsData.length - 1];
      const lastVoice = voicesData[voicesData.length - 1];
      cursorRef.current = {
        gigs: lastGig ? { ts: lastGig.posted_at, id: lastGig.id } : undefined,
        hangouts: lastHangout ? { ts: lastHangout.created_at, id: lastHangout.id } : undefined,
        voices: lastVoice ? { ts: lastVoice.posted_at, id: lastVoice.id } : undefined,
      };
      setGigs(gigsData.map(gigFromFeed));
      setHangouts(hangoutsData.map(hangoutFromFeed).filter(hangoutIsLive));
      setVoices(voicesData.map(voiceFromFeed));
      setHasMore({
        gigs: gigsData.length === PAGE_SIZE,
        hangouts: hangoutsData.length === PAGE_SIZE,
        voices: voicesData.length === PAGE_SIZE,
      });
      // votes/rsvps are secondary to the feed, so a failure here shouldn't blank
      // the feed — but it also must not overwrite the existing highlight maps
      // with {}. Skip the update on error and keep what we had; the RSVP guard
      // (myRsvps) and vote highlights survive a flaky refresh.
      if (votesRes.error) {
        console.warn('[posts-store] vote fetch failed:', votesRes.error.message);
      } else {
        const voteMap: Record<string, 1 | -1> = {};
        for (const v of votesRes.data ?? []) {
          voteMap[v.voice_id] = v.value === 1 ? 1 : -1;
        }
        setMyVotes(voteMap);
      }
      if (rsvpRes.error) {
        console.warn('[posts-store] rsvp fetch failed:', rsvpRes.error.message);
      } else {
        const rsvpMap: Record<string, true> = {};
        for (const r of (rsvpRes.data ?? []) as { hangout_id: string }[]) {
          rsvpMap[r.hangout_id] = true;
        }
        setMyRsvps(rsvpMap);
      }
    } catch (e: unknown) {
      if (fetchGenRef.current !== gen) return;
      const msg = e instanceof Error ? e.message : 'Failed to load posts.';
      console.warn('[posts-store] fetchAll failed:', msg);
      setError(msg);
    } finally {
      if (fetchGenRef.current === gen) {
        setHydrated(true);
        setLoading(false);
      }
    }
  }, [realSession, session]);

  // Cursor-based pagination. We sort by posted_at/created_at desc; the cursor
  // is the (timestamp, id) of the oldest RAW row fetched so far (cursorRef).
  // Every page is tagged with the generation it started under — if a refresh
  // lands mid-flight, the stale page is discarded instead of appended.
  const loadMore = useCallback(
    async (kind: 'gigs' | 'hangouts' | 'voices') => {
      if (!realSession) return;
      if (loadingMoreRef.current[kind]) return;
      if (!hasMore[kind]) return;
      const gen = fetchGenRef.current;
      const cursor = cursorRef.current[kind];
      if (!cursor) return;
      loadingMoreRef.current[kind] = true;
      try {
        if (kind === 'gigs') {
          const { data, error: err } = await supabase
            .from('gigs_feed')
            .select(GIG_FEED_SELECT)
            .or(keysetOlderThan('posted_at', cursor.ts, cursor.id))
            .order('posted_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(PAGE_SIZE);
          if (err) throw err;
          if (fetchGenRef.current !== gen) return;
          const rows = (data ?? []) as unknown as DbGigFeedRow[];
          if (rows.length === 0) {
            setHasMore((h) => ({ ...h, gigs: false }));
            return;
          }
          const last = rows[rows.length - 1];
          cursorRef.current.gigs = { ts: last.posted_at, id: last.id };
          const added = rows.map(gigFromFeed);
          setGigs((cur) => {
            const curSeen = new Set(cur.map((g) => g.id));
            return [...cur, ...added.filter((g) => !curSeen.has(g.id))];
          });
          setHasMore((h) => ({ ...h, gigs: rows.length === PAGE_SIZE }));
        } else if (kind === 'hangouts') {
          const { data, error: err } = await supabase
            .from('hangouts_feed')
            .select(HANGOUT_FEED_SELECT)
            .or(keysetOlderThan('created_at', cursor.ts, cursor.id))
            // Second .or() is ANDed with the first by PostgREST.
            .or(hangoutLiveFilter())
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(PAGE_SIZE);
          if (err) throw err;
          const rows = (data ?? []) as unknown as DbHangoutFeedRow[];
          if (fetchGenRef.current !== gen) return;
          if (rows.length === 0) {
            setHasMore((h) => ({ ...h, hangouts: false }));
            return;
          }
          const last = rows[rows.length - 1];
          cursorRef.current.hangouts = { ts: last.created_at, id: last.id };
          const added = rows.map(hangoutFromFeed).filter(hangoutIsLive);
          setHangouts((cur) => {
            const curSeen = new Set(cur.map((h) => h.id));
            return [...cur, ...added.filter((h) => !curSeen.has(h.id))];
          });
          setHasMore((h) => ({ ...h, hangouts: rows.length === PAGE_SIZE }));
        } else {
          const { data, error: err } = await supabase
            .from('voices_feed')
            .select(VOICE_FEED_SELECT)
            .or(keysetOlderThan('posted_at', cursor.ts, cursor.id))
            .order('posted_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(PAGE_SIZE);
          if (err) throw err;
          if (fetchGenRef.current !== gen) return;
          const rows = (data ?? []) as unknown as DbVoiceFeedRow[];
          if (rows.length === 0) {
            setHasMore((h) => ({ ...h, voices: false }));
            return;
          }
          const last = rows[rows.length - 1];
          cursorRef.current.voices = { ts: last.posted_at, id: last.id };
          const added = rows.map(voiceFromFeed);
          setVoices((cur) => {
            const curSeen = new Set(cur.map((v) => v.id));
            return [...cur, ...added.filter((v) => !curSeen.has(v.id))];
          });
          setHasMore((h) => ({ ...h, voices: rows.length === PAGE_SIZE }));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load more.';
        console.warn(`[posts-store] loadMore(${kind}) failed:`, msg);
      } finally {
        loadingMoreRef.current[kind] = false;
      }
    },
    [realSession, hasMore],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime (CLIENT_CONTRACT.md §2): the content tables left the realtime
  // publication — their full-row payloads leaked author ids. The only signal
  // is feed_events (kind + op + target id, no identity); on each event we
  // refetch the affected row through its *_feed view, so author columns
  // arrive pre-masked and a blocked author's post comes back as no row.
  //
  // Comment count bumps ride the parent's own 'update' event (the count
  // trigger updates the parent row), so kind:'comment' events are ignored
  // here — they exist for thread screens.
  useEffect(() => {
    if (!realSession) return;

    type FeedEvent = {
      kind: 'gig' | 'hangout' | 'voice' | 'comment';
      op: 'insert' | 'update' | 'delete';
      target_id: string;
    };

    // Shared apply semantics: insert prepends (or replaces, if the row is
    // already present from the optimistic path); update patches in place and
    // drops rows the view no longer returns; delete removes.
    function applyRow<T extends { id: string }>(
      setter: (fn: (cur: T[]) => T[]) => void,
      id: string,
      op: 'insert' | 'update',
      fresh: T | null,
    ) {
      if (!fresh) {
        if (op === 'update') setter((cur) => cur.filter((x) => x.id !== id));
        return;
      }
      setter((cur) => {
        const exists = cur.some((x) => x.id === id);
        if (!exists) {
          return op === 'insert' ? [fresh, ...cur] : cur;
        }
        return cur.map((x) => (x.id === id ? fresh : x));
      });
    }

    const handleEvent = async (ev: FeedEvent) => {
      if (ev.kind === 'comment') return;
      if (ev.op === 'delete') {
        if (ev.kind === 'gig') setGigs((cur) => cur.filter((g) => g.id !== ev.target_id));
        else if (ev.kind === 'hangout')
          setHangouts((cur) => cur.filter((h) => h.id !== ev.target_id));
        else setVoices((cur) => cur.filter((v) => v.id !== ev.target_id));
        return;
      }
      if (ev.kind === 'gig') {
        const { data } = await supabase
          .from('gigs_feed')
          .select(GIG_FEED_SELECT)
          .eq('id', ev.target_id)
          .maybeSingle();
        applyRow(setGigs, ev.target_id, ev.op, data ? gigFromFeed(data as unknown as DbGigFeedRow) : null);
      } else if (ev.kind === 'hangout') {
        const { data } = await supabase
          .from('hangouts_feed')
          .select(HANGOUT_FEED_SELECT)
          .eq('id', ev.target_id)
          .maybeSingle();
        const fresh = data ? hangoutFromFeed(data as unknown as DbHangoutFeedRow) : null;
        if (fresh && ev.op === 'insert' && !hangoutIsLive(fresh)) return;
        applyRow(setHangouts, ev.target_id, ev.op, fresh);
      } else {
        const { data } = await supabase
          .from('voices_feed')
          .select(VOICE_FEED_SELECT)
          .eq('id', ev.target_id)
          .maybeSingle();
        applyRow(setVoices, ev.target_id, ev.op, data ? voiceFromFeed(data as unknown as DbVoiceFeedRow) : null);
      }
    };

    const channel = supabase
      .channel('posts-feed-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feed_events' },
        (payload) => {
          void handleEvent(payload.new as FeedEvent);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [realSession]);

  // ─────────────────────── mutations ───────────────────────

  async function addGigImpl(input: AddGigInput): Promise<boolean> {
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
        posterAvatarUrl: input.anonymous ? null : input.posterAvatarUrl,
        comments: 0,
      };
      setGigs((cur) => [optimistic, ...cur]);
      return true;
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
      .select(GIG_RETURN_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addGig failed:', insertErr.message);
      setError(insertErr.message);
      return false;
    }
    if (data) {
      // The base table can't return identity columns — it's our own post, so
      // graft the caller's identity onto the returned row.
      const fresh = gigFromFeed({
        ...(data as unknown as DbGigFeedRow),
        poster_id: input.ownerId,
        poster_display_name: input.posterName,
        poster_initials: input.posterInitials,
        poster_avatar_url: input.posterAvatarUrl,
      });
      setGigs((cur) => [fresh, ...cur.filter((g) => g.id !== fresh.id)]);
    }
    return true;
  }

  async function addHangoutImpl(input: AddHangoutInput): Promise<boolean> {
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
        startsAt: input.startsAt ? new Date(input.startsAt).getTime() : null,
        hostName: input.anonymous ? null : input.hostName,
        hostInitials: input.anonymous ? null : input.hostInitials,
        hostAvatarUrl: input.anonymous ? null : input.hostAvatarUrl,
        comments: 0,
      };
      setHangouts((cur) => [optimistic, ...cur]);
      setMyRsvps((cur) => ({ ...cur, [optimistic.id]: true }));
      return true;
    }
    const { data, error: insertErr } = await supabase
      .from('hangouts')
      .insert({
        host_id: input.ownerId,
        title: input.title,
        vibe: input.vibe,
        location_label: input.where,
        when_label: input.when,
        starts_at: input.startsAt ?? null,
        description: input.description ?? null,
        anonymous: input.anonymous,
      })
      .select(HANGOUT_RETURN_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addHangout failed:', insertErr.message);
      setError(insertErr.message);
      return false;
    }
    // Host is implicitly RSVP'd — insert into attendees so going count = 1.
    if (data) {
      const row = data as unknown as DbHangoutFeedRow;
      await supabase
        .from('hangout_attendees')
        .insert({ hangout_id: row.id, user_id: input.ownerId })
        .then(() => undefined, () => undefined);
      const fresh = hangoutFromFeed({
        ...row,
        going_count: 1,
        host_id: input.ownerId,
        host_display_name: input.hostName,
        host_initials: input.hostInitials,
        host_avatar_url: input.hostAvatarUrl,
      });
      setHangouts((cur) => [fresh, ...cur.filter((h) => h.id !== fresh.id)]);
      setMyRsvps((cur) => ({ ...cur, [fresh.id]: true }));
    }
    return true;
  }

  async function addVoiceImpl(input: AddVoiceInput): Promise<boolean> {
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
        posterAvatarUrl: input.anonymous ? null : input.posterAvatarUrl,
      };
      setVoices((cur) => [optimistic, ...cur]);
      return true;
    }
    const { data, error: insertErr } = await supabase
      .from('voices')
      .insert({
        author_id: input.ownerId,
        anonymous: input.anonymous,
        body: input.body,
        topic: input.topic,
      })
      .select(VOICE_RETURN_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addVoice failed:', insertErr.message);
      setError(insertErr.message);
      return false;
    }
    if (data) {
      const fresh = voiceFromFeed({
        ...(data as unknown as DbVoiceFeedRow),
        author_id: input.ownerId,
        author_display_name: input.posterName,
        author_initials: input.posterInitials,
        author_avatar_url: input.posterAvatarUrl,
      });
      setVoices((cur) => [fresh, ...cur.filter((v) => v.id !== fresh.id)]);
    }
    return true;
  }

  async function rsvpHangoutImpl(id: string) {
    // The RPC is idempotent server-side (ON CONFLICT DO NOTHING), so a repeat
    // tap never inserts a row — but the optimistic +1 used to fire every time.
    // Only count the join when we know it's the first one.
    if (myRsvps[id]) return;
    if (rsvpInFlightRef.current.has(id)) return;
    if (!realSession) {
      setMyRsvps((cur) => ({ ...cur, [id]: true }));
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
      );
      return;
    }
    rsvpInFlightRef.current.add(id);
    try {
      // join_hangout RPC handles attendee insert + group conversation
      // membership atomically.
      const { error: rsvpErr } = await supabase.rpc('join_hangout', {
        p_hangout_id: id,
      });
      if (rsvpErr) {
        console.warn('[posts-store] rsvp failed:', rsvpErr.message);
        // Contract error codes: 23514 = capacity, 42501 = blocked vs host.
        setError(
          rsvpErr.code === '23514'
            ? 'This hangout is full.'
            : rsvpErr.code === '42501'
              ? "You can't join this hangout."
              : rsvpErr.message,
        );
        return;
      }
      setMyRsvps((cur) => ({ ...cur, [id]: true }));
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
      );
    } finally {
      rsvpInFlightRef.current.delete(id);
    }
  }

  async function voteVoiceImpl(id: string, arrow: 1 | -1) {
    const previous = (myVotes[id] ?? 0) as 1 | -1 | 0;
    // Tapping the already-active arrow clears the vote; otherwise the arrow
    // becomes the new absolute vote. `delta` is the exact score change.
    const target: 1 | -1 | 0 = previous === arrow ? 0 : arrow;
    const delta = target - previous;

    // Optimistic: apply the score delta and the new highlight.
    setVoices((cur) =>
      cur.map((v) => (v.id === id ? { ...v, votes: v.votes + delta } : v)),
    );
    setMyVotes((cur) => {
      const nextMap = { ...cur };
      if (target === 0) delete nextMap[id];
      else nextMap[id] = target;
      return nextMap;
    });

    if (!realSession) return;

    // Record the desired end-state and serialize the server sync per voice.
    // set_voice_vote is atomic on its own, but two overlapping RPCs (up, then
    // up-again-to-clear) could still commit out of order and leave the server
    // at the wrong value. Draining one-at-a-time to the LATEST target prevents
    // that; a tap that arrives mid-flight just updates the target the running
    // loop will send next.
    voteTargetRef.current.set(id, target);
    if (voteSyncingRef.current.has(id)) return;
    voteSyncingRef.current.add(id);
    try {
      while (voteTargetRef.current.has(id)) {
        const desired = voteTargetRef.current.get(id)!;
        voteTargetRef.current.delete(id);
        const { error: voteErr } = await supabase.rpc('set_voice_vote', {
          p_voice_id: id,
          p_value: desired,
        });
        if (voteErr) {
          console.warn('[posts-store] voteVoice failed:', voteErr.message);
          // Reconcile from server truth rather than replaying an inverse delta
          // — after several taps the delta no longer describes the divergence.
          voteTargetRef.current.delete(id);
          await reconcileVoteFromServer(id);
          setError(voteErr.message);
          break;
        }
      }
    } finally {
      voteSyncingRef.current.delete(id);
    }
  }

  async function reconcileVoteFromServer(id: string) {
    if (!session) return;
    const me = session.user.id;
    const [voteRes, feedRes] = await Promise.all([
      supabase.from('voice_votes').select('value').eq('user_id', me).eq('voice_id', id).maybeSingle(),
      supabase.from('voices_feed').select('vote_score').eq('id', id).maybeSingle(),
    ]);
    const serverValue = (voteRes.data as { value: number } | null)?.value;
    setMyVotes((cur) => {
      const nextMap = { ...cur };
      if (serverValue === 1) nextMap[id] = 1;
      else if (serverValue === -1) nextMap[id] = -1;
      else delete nextMap[id];
      return nextMap;
    });
    const score = (feedRes.data as { vote_score: number } | null)?.vote_score;
    if (typeof score === 'number') {
      setVoices((cur) => cur.map((v) => (v.id === id ? { ...v, votes: score } : v)));
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
      hasMore,
      refresh: fetchAll,
      loadMore,
      addGig: addGigImpl,
      addHangout: addHangoutImpl,
      addVoice: addVoiceImpl,
      rsvpHangout: rsvpHangoutImpl,
      myRsvps,
      myVotes,
      voteVoice: voteVoiceImpl,
    }),
    // We intentionally don't depend on the mutation functions; they read state via closures
    // but only state-bound effects (gigs, hangouts, voices) need to drive re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigs, hangouts, voices, hydrated, loading, error, hasMore, myRsvps, myVotes, fetchAll, loadMore],
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
