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
  /** The gig category/search filter, applied SERVER-SIDE. See GigFeedSlice. */
  gigFeed: GigFeedSlice;
  setGigFilter: (next: GigFilter) => void;
  /** Next page of the filtered gig feed. Same keyset machinery as loadMore,
   *  with its own cursor and generation counter. */
  loadMoreGigFeed: () => Promise<void>;
  /** Resolves `true` when the post reached the server (or dev store) —
   *  compare with `=== true`, the failure values are truthy strings. Callers
   *  use this to decide whether to close the compose screen. */
  addGig: (input: AddGigInput) => Promise<AddResult>;
  addHangout: (input: AddHangoutInput) => Promise<AddResult>;
  addVoice: (input: AddVoiceInput) => Promise<AddResult>;
  /** One-shot fetch of a single post through its feed view, merged into the
   *  store. Detail screens use this when a deep link / push tap points at a
   *  post older than the pages loaded so far — without it, anything past the
   *  first page renders a false "404 · gone". */
  fetchPostById: (kind: 'gig' | 'hangout' | 'voice', id: string) => Promise<PostLookup>;
  rsvpHangout: (id: string) => Promise<RsvpResult>;
  /** Undo an RSVP. Backed by the `leave_hangout` RPC, which removes the attendee
   *  row AND the group-conversation membership — the two must go together, which
   *  is why 0038 revoked the direct-delete policy on hangout_attendees. */
  leaveHangout: (id: string) => Promise<LeaveResult>;
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

/** Result of fetchPostById: 'missing' means the server says it's gone (or
 *  masked/blocked out of the view); 'error' means we couldn't ask — screens
 *  should offer retry, not claim the post was deleted. */
export type PostLookup = 'found' | 'missing' | 'error';

/** Failure detail for the composers: 'rate_limited' is the 0036 per-author
 *  insert cap (errcode 54000) and deserves its own copy — "check your
 *  connection" would be a lie. */
export type AddResult = true | 'rate_limited' | 'error';

/** Result of rsvpHangout. Mutation outcomes are returned to the caller (and
 *  surfaced next to the button that was tapped) instead of being funneled
 *  into the store-wide `error`, which the feed tabs render as a misleading
 *  "Couldn't load" banner. */
export type RsvpResult =
  | { status: 'ok' | 'already'; conversationId: string | null }
  | { status: 'full' | 'blocked' | 'not_found' | 'error'; conversationId: null };

/** Result of leaveHangout. 'host' is the server refusing to let a host abandon
 *  their own hangout (errcode 22023) — they have to cancel it instead. */
export type LeaveResult = 'ok' | 'host' | 'not_found' | 'error';

/** Category chip + search box on the Gigs tab. Both are pushed down into the
 *  gigs_feed query rather than applied to the loaded pages: filtering client-
 *  side meant `loadMore` was disabled under a filter, so a category whose
 *  posts were all older than page 1 rendered as empty — and the empty state
 *  then asserted "no tutoring gigs in the feed yet", which was false. */
export type GigFilter = { category: GigCategory | null; query: string };

export const NO_GIG_FILTER: GigFilter = { category: null, query: '' };

export function gigFilterIsActive(f: GigFilter): boolean {
  return f.category !== null || f.query.trim().length > 0;
}

/** Server-filtered gig feed. `rows` is null while no filter is applied — the
 *  Gigs tab renders the unfiltered `gigs` then. Deliberately a separate list
 *  rather than narrowing `gigs` itself: the map screen and the "your posts"
 *  history both read `gigs`, and neither should shrink because someone tapped
 *  a category chip.
 *
 *  Known gap: realtime feed_events and the optimistic insert in addGig patch
 *  `gigs` only. A gig posted by someone else while a filter is on appears on
 *  the next filter change or pull-to-refresh, not instantly. */
export type GigFeedSlice = {
  filter: GigFilter;
  rows: Gig[] | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
};

/** Client-side equivalent of the server filter, for the dev/demo session
 *  whose seeds only exist in memory. Kept in step with gigSearchFilter below:
 *  same three columns, same substring semantics. */
export function gigMatchesFilter(gig: Gig, filter: GigFilter): boolean {
  if (filter.category && gig.category !== filter.category) return false;
  const q = filter.query.trim().toLowerCase();
  if (!q) return true;
  return [gig.title, gig.where, gig.category].some((field) =>
    field.toLowerCase().includes(q),
  );
}

/** How many rows to fetch per page on initial load + each loadMore call. */
const PAGE_SIZE = 20;

const PostsContext = createContext<Store | null>(null);

// ─────────────────────── DB ↔ App mappers ───────────────────────
// Everything from here to the end of this section is pure and exported for
// __tests__/posts-store.test.ts — these are the functions a refactor is most
// likely to break silently (money rounding, cursor quoting, expiry windows).

/** Payout entry is a free-text field, so this is deliberately a NARROW
 *  contract, not a best-effort parser: whole dollars only, `$` and commas
 *  ignored, everything else rejected. Returns null for input it cannot
 *  represent so the caller can say so instead of storing a number the user
 *  never typed. The old behaviour floored junk to 1 cent, which turned a
 *  fat-fingered "1.5.5" into a $0.01 gig; "$30/hr" still stores 3000 (and
 *  re-renders as "$30") because cents/hourly rates aren't modelled at all. */
export function dollarsToCents(payout: string): number | null {
  const digits = payout.replace(/[$,\s]/g, '');
  // A leading number optionally followed by non-numeric suffix text ("/hr").
  const m = digits.match(/^(\d+)(?:\.(\d{1,2}))?(?:[^\d.].*)?$/);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
  // Mirrors the DB check on gigs.payout_cents (> 0, capped at $10,000) so an
  // out-of-range value is refused here rather than as an opaque 23514.
  if (cents <= 0 || cents > 1_000_000) return null;
  return cents;
}

/** Inverse of dollarsToCents, lossy by design: sub-dollar precision is
 *  rounded away because every surface renders whole dollars. */
export function centsToPayout(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars}`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
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
export function keysetOlderThan(tsCol: string, ts: string, id: string): string {
  return `${tsCol}.lt."${ts}",and(${tsCol}.eq."${ts}",id.lt."${id}")`;
}

// Free-text gig search as a PostgREST `.or()` over the three columns the old
// client-side filter matched. The term is double-quoted so spaces, commas and
// parens in "hesburgh, 2nd floor" can't be read as .or() syntax, and the
// characters that could close that quote (or smuggle in a wildcard) are
// stripped: `*` becomes `%` server-side, so a literal `%` would silently
// widen the match. Returns null when nothing searchable survives — an empty
// pattern is `%%`, which matches every row.
export function gigSearchFilter(query: string): string | null {
  const term = query.replace(/["\\%]/g, ' ').trim();
  if (!term) return null;
  return ['title', 'location_label', 'category']
    .map((col) => `${col}.ilike."*${term}*"`)
    .join(',');
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

export type DbGigFeedRow = {
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

export function gigFromFeed(row: DbGigFeedRow): Gig {
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

export type DbHangoutFeedRow = {
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

export function hangoutFromFeed(row: DbHangoutFeedRow): Hangout {
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

export type DbVoiceFeedRow = {
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

export function voiceFromFeed(row: DbVoiceFeedRow): Voice {
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
export const HANGOUT_GRACE_MS = 2 * 60 * 60 * 1000;

export function hangoutIsLive(h: Hangout, now: number = Date.now()): boolean {
  return h.startsAt == null || h.startsAt > now - HANGOUT_GRACE_MS;
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

  // ── server-side gig filter ──
  // Its own cursor, in-flight guard and generation counter, mirroring the
  // unfiltered feed's. They must stay separate: a page fetched under
  // "Tutoring" appended to a list that has since switched to "Moving" would
  // show the wrong rows, and sharing fetchGenRef would make a plain refresh
  // silently invalidate filtered pages (and vice versa).
  const [gigFilter, setGigFilterState] = useState<GigFilter>(NO_GIG_FILTER);
  const [filteredGigs, setFilteredGigs] = useState<Gig[] | null>(null);
  const [filteredGigsLoading, setFilteredGigsLoading] = useState(false);
  const [filteredGigsError, setFilteredGigsError] = useState<string | null>(null);
  const [hasMoreFilteredGigs, setHasMoreFilteredGigs] = useState(false);
  const filterGenRef = useRef(0);
  const filterCursorRef = useRef<{ ts: string; id: string } | undefined>(undefined);
  const filterLoadingMoreRef = useRef(false);
  // Late-bound so fetchAll (pull-to-refresh, realtime re-subscribe) can also
  // refresh the filtered list without taking gigFilter as a dependency — that
  // would rebuild fetchAll on every keystroke and re-fetch all three feeds.
  const refreshFilteredGigsRef = useRef<() => void>(() => {});

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
      refreshFilteredGigsRef.current();
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
      // Arrow wrapper, not a bare reference: Array.filter passes the index as
      // the second argument, which hangoutIsLive would read as `now`.
      setHangouts(hangoutsData.map(hangoutFromFeed).filter((h) => hangoutIsLive(h)));
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
        // A pull-to-refresh under an active filter must refresh what the user
        // is actually looking at, not just the list behind it.
        refreshFilteredGigsRef.current();
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
          const added = rows.map(hangoutFromFeed).filter((h) => hangoutIsLive(h));
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

  // One page of gigs_feed under the active filter. Shared by the initial
  // filtered fetch and loadMoreGigFeed so the two can never drift apart on
  // which predicates they apply — PostgREST ANDs successive .or() calls, so
  // the keyset window and the search window compose correctly.
  const gigFilterPage = useCallback(
    (filter: GigFilter, cursor?: { ts: string; id: string }) => {
      let q = supabase.from('gigs_feed').select(GIG_FEED_SELECT);
      if (filter.category) q = q.eq('category', filter.category);
      const search = gigSearchFilter(filter.query);
      if (search) q = q.or(search);
      if (cursor) q = q.or(keysetOlderThan('posted_at', cursor.ts, cursor.id));
      return q
        .order('posted_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
    },
    [],
  );

  // Identity-stable: the Gigs tab re-pushes its filter on every render pass of
  // the debounce, and a new-but-equal object would re-run the whole query.
  const setGigFilter = useCallback((next: GigFilter) => {
    setGigFilterState((cur) =>
      cur.category === next.category && cur.query === next.query ? cur : next,
    );
  }, []);

  const fetchFilteredGigs = useCallback(async () => {
    const gen = ++filterGenRef.current;
    filterCursorRef.current = undefined;
    // Dev/demo sessions have no backend; gigMatchesFilter runs over the
    // in-memory list in the gigFeed memo below, so there's nothing to fetch.
    if (!gigFilterIsActive(gigFilter) || !realSession) {
      setFilteredGigs(null);
      setFilteredGigsLoading(false);
      setFilteredGigsError(null);
      setHasMoreFilteredGigs(false);
      return;
    }
    setFilteredGigsLoading(true);
    setFilteredGigsError(null);
    try {
      const { data, error: err } = await gigFilterPage(gigFilter);
      if (err) throw err;
      if (filterGenRef.current !== gen) return;
      const rows = (data ?? []) as unknown as DbGigFeedRow[];
      const last = rows[rows.length - 1];
      filterCursorRef.current = last ? { ts: last.posted_at, id: last.id } : undefined;
      setFilteredGigs(rows.map(gigFromFeed));
      setHasMoreFilteredGigs(rows.length === PAGE_SIZE);
    } catch (e: unknown) {
      if (filterGenRef.current !== gen) return;
      const msg = e instanceof Error ? e.message : 'Failed to load gigs.';
      console.warn('[posts-store] filtered gig fetch failed:', msg);
      // Leave `rows` null and report the error: an empty array here would
      // render the "nothing in this category" empty state, which is exactly
      // the false claim this whole change exists to remove.
      setFilteredGigs(null);
      setFilteredGigsError(msg);
      setHasMoreFilteredGigs(false);
    } finally {
      if (filterGenRef.current === gen) setFilteredGigsLoading(false);
    }
  }, [gigFilter, realSession, gigFilterPage]);

  useEffect(() => {
    void fetchFilteredGigs();
    refreshFilteredGigsRef.current = () => {
      void fetchFilteredGigs();
    };
  }, [fetchFilteredGigs]);

  const loadMoreGigFeed = useCallback(async () => {
    if (!realSession || !gigFilterIsActive(gigFilter)) return;
    if (filterLoadingMoreRef.current || !hasMoreFilteredGigs) return;
    const cursor = filterCursorRef.current;
    if (!cursor) return;
    const gen = filterGenRef.current;
    filterLoadingMoreRef.current = true;
    try {
      const { data, error: err } = await gigFilterPage(gigFilter, cursor);
      if (err) throw err;
      // The filter changed (or the list was refreshed) while this page was in
      // flight — appending it now would splice rows from the old query into
      // the new list and leave a permanent hole in the keyset range.
      if (filterGenRef.current !== gen) return;
      const rows = (data ?? []) as unknown as DbGigFeedRow[];
      if (rows.length === 0) {
        setHasMoreFilteredGigs(false);
        return;
      }
      const last = rows[rows.length - 1];
      filterCursorRef.current = { ts: last.posted_at, id: last.id };
      const added = rows.map(gigFromFeed);
      setFilteredGigs((cur) => {
        const curSeen = new Set((cur ?? []).map((g) => g.id));
        return [...(cur ?? []), ...added.filter((g) => !curSeen.has(g.id))];
      });
      setHasMoreFilteredGigs(rows.length === PAGE_SIZE);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load more.';
      console.warn('[posts-store] loadMoreGigFeed failed:', msg);
    } finally {
      filterLoadingMoreRef.current = false;
    }
  }, [realSession, gigFilter, hasMoreFilteredGigs, gigFilterPage]);

  const gigFeed = useMemo<GigFeedSlice>(() => {
    if (!gigFilterIsActive(gigFilter)) {
      return { filter: gigFilter, rows: null, loading: false, error: null, hasMore: false };
    }
    if (!realSession) {
      return {
        filter: gigFilter,
        rows: gigs.filter((g) => gigMatchesFilter(g, gigFilter)),
        loading: false,
        error: null,
        hasMore: false,
      };
    }
    return {
      filter: gigFilter,
      rows: filteredGigs,
      loading: filteredGigsLoading,
      error: filteredGigsError,
      hasMore: hasMoreFilteredGigs,
    };
  }, [
    gigFilter,
    realSession,
    gigs,
    filteredGigs,
    filteredGigsLoading,
    filteredGigsError,
    hasMoreFilteredGigs,
  ]);

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
      .subscribe((status) => {
        // Fires on every (re)join, not just the first — same pattern as the
        // messaging hooks. Feed events that fired while the socket was down
        // (backgrounded phone, laptop lid closed) would otherwise leave the
        // feed frozen on a stale snapshot until a manual pull-to-refresh.
        // fetchAll's generation counter makes the extra mount-time call safe.
        if (status === 'SUBSCRIBED') void fetchAll();
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession]);

  // One-shot lookup for deep links / push taps pointing past the loaded
  // pages. Merges the row into the store (replace if present, else append —
  // appending keeps keyset pagination untouched since cursors come from raw
  // fetched pages, not state). 'missing' is only returned when the server
  // answered and the view has no such row (deleted, or the author is blocked).
  async function fetchPostByIdImpl(
    kind: 'gig' | 'hangout' | 'voice',
    id: string,
  ): Promise<PostLookup> {
    if (!realSession) return 'missing'; // dev/seed data is fully in memory
    function merge<T extends { id: string }>(
      setter: (fn: (cur: T[]) => T[]) => void,
      fresh: T,
    ) {
      setter((cur) =>
        cur.some((x) => x.id === id)
          ? cur.map((x) => (x.id === id ? fresh : x))
          : [...cur, fresh],
      );
    }
    try {
      if (kind === 'gig') {
        const { data, error: e } = await supabase
          .from('gigs_feed')
          .select(GIG_FEED_SELECT)
          .eq('id', id)
          .maybeSingle();
        if (e) return 'error';
        if (!data) return 'missing';
        merge(setGigs, gigFromFeed(data as unknown as DbGigFeedRow));
        return 'found';
      }
      if (kind === 'hangout') {
        const { data, error: e } = await supabase
          .from('hangouts_feed')
          .select(HANGOUT_FEED_SELECT)
          .eq('id', id)
          .maybeSingle();
        if (e) return 'error';
        if (!data) return 'missing';
        // No hangoutIsLive gate: someone following a link to an expired
        // hangout should see what it was, not a false "deleted".
        merge(setHangouts, hangoutFromFeed(data as unknown as DbHangoutFeedRow));
        return 'found';
      }
      const { data, error: e } = await supabase
        .from('voices_feed')
        .select(VOICE_FEED_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (e) return 'error';
      if (!data) return 'missing';
      merge(setVoices, voiceFromFeed(data as unknown as DbVoiceFeedRow));
      return 'found';
    } catch {
      return 'error';
    }
  }

  // ─────────────────────── mutations ───────────────────────

  async function addGigImpl(input: AddGigInput): Promise<AddResult> {
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
    // app/post-gig.tsx already normalizes the payout to "$N" within the DB's
    // range, so null here means a new caller passed something the whole-dollar
    // contract can't represent. Refuse rather than store a mangled amount —
    // the old code floored unparseable input to 1 cent and shipped a $0.01 gig.
    const payoutCents = dollarsToCents(input.payout);
    if (payoutCents === null) {
      console.warn('[posts-store] addGig rejected unparseable payout:', input.payout);
      return 'error';
    }
    const { data, error: insertErr } = await supabase
      .from('gigs')
      .insert({
        poster_id: input.ownerId,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        payout_cents: payoutCents,
        location_label: input.where,
        anonymous: input.anonymous,
      })
      .select(GIG_RETURN_SELECT)
      .single();
    if (insertErr) {
      console.warn('[posts-store] addGig failed:', insertErr.message);
      return insertErr.code === '54000' ? 'rate_limited' : 'error';
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

  async function addHangoutImpl(input: AddHangoutInput): Promise<AddResult> {
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
      return insertErr.code === '54000' ? 'rate_limited' : 'error';
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

  async function addVoiceImpl(input: AddVoiceInput): Promise<AddResult> {
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
      return insertErr.code === '54000' ? 'rate_limited' : 'error';
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

  async function rsvpHangoutImpl(id: string): Promise<RsvpResult> {
    // The RPC is idempotent server-side (ON CONFLICT DO NOTHING), so a repeat
    // tap never inserts a row — but the optimistic +1 used to fire every time.
    // Only count the join when we know it's the first one.
    if (myRsvps[id]) return { status: 'already', conversationId: null };
    if (rsvpInFlightRef.current.has(id)) return { status: 'already', conversationId: null };
    if (!realSession) {
      setMyRsvps((cur) => ({ ...cur, [id]: true }));
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
      );
      return { status: 'ok', conversationId: null };
    }
    rsvpInFlightRef.current.add(id);
    try {
      // join_hangout RPC handles attendee insert + group conversation
      // membership atomically, and returns the group conversation id.
      const { data, error: rsvpErr } = await supabase.rpc('join_hangout', {
        p_hangout_id: id,
      });
      if (rsvpErr) {
        console.warn('[posts-store] rsvp failed:', rsvpErr.message);
        // Contract §3: 23514 = capacity, 42501 = blocked vs host, P0002 =
        // hangout gone. Returned to the caller — NOT setError, which the feed
        // tabs would render as a false "Couldn't load hangouts" banner.
        return {
          status:
            rsvpErr.code === '23514'
              ? 'full'
              : rsvpErr.code === '42501'
                ? 'blocked'
                : rsvpErr.code === 'P0002'
                  ? 'not_found'
                  : 'error',
          conversationId: null,
        };
      }
      setMyRsvps((cur) => ({ ...cur, [id]: true }));
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: h.going + 1 } : h)),
      );
      return { status: 'ok', conversationId: (data as string) ?? null };
    } finally {
      rsvpInFlightRef.current.delete(id);
    }
  }

  async function leaveHangoutImpl(id: string): Promise<LeaveResult> {
    // Not going in the first place — nothing to undo. Also absorbs the
    // double-tap that would otherwise fire a second RPC and a second -1.
    if (!myRsvps[id]) return 'ok';
    // Shares rsvpInFlightRef with the join path on purpose: a join and a leave
    // for the same hangout must never be in flight together, or the optimistic
    // +1/-1 land in an order that doesn't match what the server did.
    if (rsvpInFlightRef.current.has(id)) return 'ok';

    const dropLocal = () => {
      setMyRsvps((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setHangouts((cur) =>
        cur.map((h) => (h.id === id ? { ...h, going: Math.max(0, h.going - 1) } : h)),
      );
    };

    if (!realSession) {
      dropLocal();
      return 'ok';
    }
    rsvpInFlightRef.current.add(id);
    try {
      const { error: leaveErr } = await supabase.rpc('leave_hangout', {
        p_hangout_id: id,
      });
      if (leaveErr) {
        console.warn('[posts-store] leave failed:', leaveErr.message);
        // Contract §3: 22023 = the host cannot leave their own hangout, P0002 =
        // the hangout is gone. Returned to the caller so the button that was
        // tapped can explain — NOT setError, which every feed tab renders as a
        // false "Couldn't load hangouts" banner.
        return leaveErr.code === '22023'
          ? 'host'
          : leaveErr.code === 'P0002'
            ? 'not_found'
            : 'error';
      }
      dropLocal();
      return 'ok';
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
          // Server truth visibly snaps the arrow/score back — that IS the
          // failure feedback. Setting the store-wide error here made all
          // three feed tabs show a false "Couldn't load" banner.
          await reconcileVoteFromServer(id);
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
      gigFeed,
      setGigFilter,
      loadMoreGigFeed,
      addGig: addGigImpl,
      addHangout: addHangoutImpl,
      addVoice: addVoiceImpl,
      fetchPostById: fetchPostByIdImpl,
      rsvpHangout: rsvpHangoutImpl,
      leaveHangout: leaveHangoutImpl,
      myRsvps,
      myVotes,
      voteVoice: voteVoiceImpl,
    }),
    // We intentionally don't depend on the mutation functions; they read state via closures
    // but only state-bound effects (gigs, hangouts, voices) need to drive re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      gigs,
      hangouts,
      voices,
      hydrated,
      loading,
      error,
      hasMore,
      myRsvps,
      myVotes,
      fetchAll,
      loadMore,
      gigFeed,
      setGigFilter,
      loadMoreGigFeed,
    ],
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
