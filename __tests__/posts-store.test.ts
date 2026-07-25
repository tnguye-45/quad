import {
  centsToPayout,
  dollarsToCents,
  gigFilterIsActive,
  gigFromFeed,
  gigMatchesFilter,
  gigSearchFilter,
  hangoutFromFeed,
  hangoutIsLive,
  keysetOlderThan,
  timeAgo,
  voiceFromFeed,
  type DbGigFeedRow,
  type DbHangoutFeedRow,
  type DbVoiceFeedRow,
  type Gig,
  type Hangout,
} from '@/lib/posts-store';

// Fixed instant so nothing here depends on the wall clock. Everything that
// reads Date.now() takes it as an injectable argument instead.
const NOW = Date.parse('2026-07-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('dollarsToCents', () => {
  it('accepts the shapes the composer actually produces', () => {
    expect(dollarsToCents('$40')).toBe(4000);
    expect(dollarsToCents('40')).toBe(4000);
    expect(dollarsToCents('$1,250')).toBe(125000);
    expect(dollarsToCents(' $8 ')).toBe(800);
  });

  it('keeps cents when they are given', () => {
    expect(dollarsToCents('$12.50')).toBe(1250);
    expect(dollarsToCents('$12.5')).toBe(1250);
    expect(dollarsToCents('$12.05')).toBe(1205);
  });

  it('ignores a trailing rate suffix rather than rejecting the whole entry', () => {
    // Hourly rates aren't modelled; "$30/hr" has always stored 30 dollars and
    // re-rendered as "$30". Locked in so the lossy step stays a deliberate one.
    expect(dollarsToCents('$30/hr')).toBe(3000);
    expect(centsToPayout(dollarsToCents('$30/hr')!)).toBe('$30');
  });

  it('rejects input it cannot represent instead of inventing a number', () => {
    // The old implementation ran Number('1.5.5') → NaN → floored to 1 cent and
    // silently shipped a $0.01 gig.
    expect(dollarsToCents('1.5.5')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('$')).toBeNull();
    expect(dollarsToCents('-40')).toBeNull();
    expect(dollarsToCents('.50')).toBeNull();
  });

  it('refuses amounts outside the DB check on payout_cents', () => {
    expect(dollarsToCents('$0')).toBeNull();
    expect(dollarsToCents('$0.00')).toBeNull();
    expect(dollarsToCents('$10000')).toBe(1_000_000);
    expect(dollarsToCents('$10001')).toBeNull();
  });
});

describe('centsToPayout', () => {
  it('renders whole dollars', () => {
    expect(centsToPayout(4000)).toBe('$40');
    expect(centsToPayout(1)).toBe('$0');
  });

  it('rounds sub-dollar precision away — the round-trip is lossy by contract', () => {
    expect(centsToPayout(1250)).toBe('$13');
    expect(centsToPayout(1249)).toBe('$12');
    expect(dollarsToCents(centsToPayout(1250))).toBe(1300);
  });
});

describe('timeAgo', () => {
  const ago = (ms: number) => timeAgo(new Date(NOW - ms).toISOString(), NOW);

  it('walks the whole ladder', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59_000)).toBe('just now');
    expect(ago(60_000)).toBe('1m ago');
    expect(ago(59 * 60_000)).toBe('59m ago');
    expect(ago(HOUR)).toBe('1h ago');
    expect(ago(23 * HOUR)).toBe('23h ago');
    expect(ago(24 * HOUR)).toBe('yesterday');
    expect(ago(47 * HOUR)).toBe('yesterday');
    expect(ago(48 * HOUR)).toBe('2d ago');
    expect(ago(30 * 24 * HOUR)).toBe('30d ago');
  });

  it('clamps a future timestamp to "just now" instead of counting backwards', () => {
    // Clock skew between the phone and Postgres routinely produces these.
    expect(timeAgo(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe('just now');
  });
});

describe('keysetOlderThan', () => {
  it('quotes both cursor values', () => {
    // `+` and `:` in an ISO offset, and any `,`, are PostgREST .or() syntax —
    // unquoted they truncate the filter and the page silently comes back with
    // the wrong rows rather than an error.
    expect(keysetOlderThan('posted_at', '2026-07-24T12:00:00.123456+00:00', 'abc-123')).toBe(
      'posted_at.lt."2026-07-24T12:00:00.123456+00:00",' +
        'and(posted_at.eq."2026-07-24T12:00:00.123456+00:00",id.lt."abc-123")',
    );
  });

  it('always pairs a strict-older clause with an id tiebreak at the same instant', () => {
    // Seed rows are bulk-inserted and share a posted_at; without the tiebreak
    // every row past the first at that timestamp is skipped forever.
    const filter = keysetOlderThan('created_at', '2026-01-01T00:00:00+00:00', 'id-1');
    expect(filter).toContain('created_at.lt.');
    expect(filter).toContain('and(created_at.eq.');
    expect(filter).toContain('id.lt."id-1"');
  });
});

describe('gigSearchFilter', () => {
  it('searches title, location and category', () => {
    expect(gigSearchFilter('couch')).toBe(
      'title.ilike."*couch*",location_label.ilike."*couch*",category.ilike."*couch*"',
    );
  });

  it('quotes the term so spaces and commas cannot break out of the .or()', () => {
    const filter = gigSearchFilter('hesburgh, 2nd floor')!;
    expect(filter).toContain('title.ilike."*hesburgh, 2nd floor*"');
  });

  it('strips the characters that could escape the quote or smuggle a wildcard', () => {
    expect(gigSearchFilter('a"b')).toBe(
      'title.ilike."*a b*",location_label.ilike."*a b*",category.ilike."*a b*"',
    );
    expect(gigSearchFilter('50%')).toContain('title.ilike."*50*"');
    expect(gigSearchFilter('a\\b')).toContain('title.ilike."*a b*"');
  });

  it('returns null when nothing searchable survives — "%%" would match everything', () => {
    expect(gigSearchFilter('')).toBeNull();
    expect(gigSearchFilter('   ')).toBeNull();
    expect(gigSearchFilter('"%"')).toBeNull();
  });
});

describe('gigFilterIsActive / gigMatchesFilter', () => {
  const gig = (over: Partial<Gig> = {}): Gig => ({
    id: 'g1',
    ownerId: 'u1',
    anonymous: false,
    title: 'MATH 10560 tutor for midterm prep',
    payout: '$30',
    category: 'Tutoring',
    where: 'Hesburgh Library',
    postedAt: NOW,
    postedAgo: 'just now',
    posterName: 'Jordan L.',
    posterInitials: 'JL',
    posterAvatarUrl: null,
    comments: 0,
    ...over,
  });

  it('treats only a category or a non-blank query as a filter', () => {
    expect(gigFilterIsActive({ category: null, query: '' })).toBe(false);
    expect(gigFilterIsActive({ category: null, query: '   ' })).toBe(false);
    expect(gigFilterIsActive({ category: 'Pets', query: '' })).toBe(true);
    expect(gigFilterIsActive({ category: null, query: 'couch' })).toBe(true);
  });

  it('ANDs the category with the search, matching the server query', () => {
    expect(gigMatchesFilter(gig(), { category: 'Tutoring', query: 'hesburgh' })).toBe(true);
    expect(gigMatchesFilter(gig(), { category: 'Moving', query: 'hesburgh' })).toBe(false);
    expect(gigMatchesFilter(gig(), { category: 'Tutoring', query: 'airport' })).toBe(false);
  });

  it('matches title, location and category case-insensitively', () => {
    expect(gigMatchesFilter(gig(), { category: null, query: 'MIDTERM' })).toBe(true);
    expect(gigMatchesFilter(gig(), { category: null, query: 'library' })).toBe(true);
    expect(gigMatchesFilter(gig(), { category: null, query: 'tutor' })).toBe(true);
    expect(gigMatchesFilter(gig(), { category: null, query: 'nonsense' })).toBe(false);
  });

  it('lets everything through when the filter is empty', () => {
    expect(gigMatchesFilter(gig(), { category: null, query: '  ' })).toBe(true);
  });
});

describe('hangoutIsLive', () => {
  const at = (startsAt: number | null): Hangout => ({
    id: 'h1',
    ownerId: 'u1',
    anonymous: false,
    title: 'Pickup basketball',
    when: 'Tonight',
    where: 'Rolfs',
    going: 2,
    vibe: 'Sports',
    postedAt: NOW,
    startsAt,
    hostName: null,
    hostInitials: null,
    hostAvatarUrl: null,
    comments: 0,
  });

  it('keeps an event through the 2-hour grace window and drops it after', () => {
    expect(hangoutIsLive(at(NOW + HOUR), NOW)).toBe(true);
    expect(hangoutIsLive(at(NOW), NOW)).toBe(true);
    expect(hangoutIsLive(at(NOW - HOUR), NOW)).toBe(true);
    // Exactly on the boundary is expired: the predicate is strictly greater.
    expect(hangoutIsLive(at(NOW - 2 * HOUR), NOW)).toBe(false);
    expect(hangoutIsLive(at(NOW - 2 * HOUR + 1), NOW)).toBe(true);
    expect(hangoutIsLive(at(NOW - 3 * HOUR), NOW)).toBe(false);
  });

  it('never expires a legacy row that has no start time to judge it by', () => {
    expect(hangoutIsLive(at(null), NOW)).toBe(true);
    expect(hangoutIsLive({ ...at(null), startsAt: undefined }, NOW)).toBe(true);
  });
});

describe('gigFromFeed', () => {
  const row = (over: Partial<DbGigFeedRow> = {}): DbGigFeedRow => ({
    id: 'g1',
    anonymous: false,
    title: 'Help moving a couch',
    description: 'Third floor, no elevator',
    category: 'Moving',
    payout_cents: 4000,
    location_label: 'Dillon Hall',
    posted_at: new Date(NOW - HOUR).toISOString(),
    comment_count: 3,
    poster_id: 'u1',
    poster_display_name: 'Marcus K.',
    poster_initials: 'MK',
    poster_avatar_url: 'https://cdn.example/a.png',
    ...over,
  });

  it('maps an identified row straight through', () => {
    const g = gigFromFeed(row());
    expect(g.ownerId).toBe('u1');
    expect(g.posterName).toBe('Marcus K.');
    expect(g.payout).toBe('$40');
    expect(g.where).toBe('Dillon Hall');
    expect(g.comments).toBe(3);
    expect(g.rawPostedAt).toBe(row().posted_at);
    expect(g.postedAt).toBe(NOW - HOUR);
  });

  it('masks the author of an anonymous row even if identity columns leaked in', () => {
    // The *_feed views null these server-side; the mapper is the second line
    // of defence, and a regression here de-anonymises a post.
    const g = gigFromFeed(row({ anonymous: true }));
    expect(g.posterName).toBeNull();
    expect(g.posterInitials).toBeNull();
    expect(g.posterAvatarUrl).toBeNull();
  });

  it('turns a nulled poster_id into "" — never a value that matches a real user', () => {
    const g = gigFromFeed(row({ anonymous: true, poster_id: null }));
    expect(g.ownerId).toBe('');
    expect(g.ownerId).not.toBe('u1');
  });

  it('substitutes defaults for the nullable display columns', () => {
    const g = gigFromFeed(row({ description: null, location_label: null, comment_count: null }));
    expect(g.description).toBeUndefined();
    expect(g.where).toBe('');
    expect(g.comments).toBe(0);
  });
});

describe('hangoutFromFeed', () => {
  const row = (over: Partial<DbHangoutFeedRow> = {}): DbHangoutFeedRow => ({
    id: 'h1',
    anonymous: false,
    title: 'Study session',
    vibe: 'Study',
    location_label: 'Hesburgh',
    when_label: 'Tonight · 8:00 PM',
    starts_at: new Date(NOW + HOUR).toISOString(),
    description: null,
    created_at: new Date(NOW - HOUR).toISOString(),
    comment_count: null,
    going_count: 4,
    host_id: 'u1',
    host_display_name: 'Jordan L.',
    host_initials: 'JL',
    host_avatar_url: null,
    ...over,
  });

  it('parses starts_at into epoch ms and leaves it null when absent', () => {
    expect(hangoutFromFeed(row()).startsAt).toBe(NOW + HOUR);
    expect(hangoutFromFeed(row({ starts_at: null })).startsAt).toBeNull();
  });

  it('masks the host of an anonymous row', () => {
    const h = hangoutFromFeed(row({ anonymous: true }));
    expect(h.hostName).toBeNull();
    expect(h.hostInitials).toBeNull();
    expect(h.hostAvatarUrl).toBeNull();
  });

  it('falls back for the nullable columns', () => {
    const h = hangoutFromFeed(
      row({ vibe: null, when_label: null, location_label: null, going_count: null, host_id: null }),
    );
    expect(h.vibe).toBe('Other');
    expect(h.when).toBe('');
    expect(h.where).toBe('');
    expect(h.going).toBe(0);
    expect(h.comments).toBe(0);
    expect(h.ownerId).toBe('');
  });
});

describe('voiceFromFeed', () => {
  const row = (over: Partial<DbVoiceFeedRow> = {}): DbVoiceFeedRow => ({
    id: 'v1',
    anonymous: true,
    body: 'south dining hall is unhinged today',
    topic: 'Dining',
    posted_at: new Date(NOW - 12 * 60_000).toISOString(),
    vote_score: 142,
    comment_count: 23,
    author_id: 'u1',
    author_display_name: 'Marcus K.',
    author_initials: 'MK',
    author_avatar_url: 'https://cdn.example/a.png',
    ...over,
  });

  it('masks the author of an anonymous voice — the default for this feed', () => {
    const v = voiceFromFeed(row());
    expect(v.posterName).toBeNull();
    expect(v.posterInitials).toBeNull();
    expect(v.posterAvatarUrl).toBeNull();
    expect(v.votes).toBe(142);
    expect(v.comments).toBe(23);
  });

  it('keeps the author on a signed voice', () => {
    const v = voiceFromFeed(row({ anonymous: false }));
    expect(v.posterName).toBe('Marcus K.');
    expect(v.ownerId).toBe('u1');
  });

  it('preserves a negative score rather than clamping it', () => {
    expect(voiceFromFeed(row({ vote_score: -12 })).votes).toBe(-12);
  });
});
