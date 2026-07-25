import {
  detectPlatform,
  isPaymentLink,
  linkEmoji,
  paymentHandleFromUrl,
  paymentUrlFromHandle,
  platformByLabel,
} from '@/lib/profile-links';

describe('detectPlatform', () => {
  it('matches the registered host exactly', () => {
    expect(detectPlatform('https://github.com/pete')?.id).toBe('github');
    expect(detectPlatform('https://linkedin.com/in/pete')?.id).toBe('linkedin');
    expect(detectPlatform('https://cash.app/$pete')?.id).toBe('cashapp');
  });

  it('matches subdomains of a registered host but not lookalikes', () => {
    expect(detectPlatform('https://open.spotify.com/user/pete')?.id).toBe('spotify');
    // Suffix matching must be on a label boundary — `notgithub.com` shares the
    // trailing characters of `github.com` but is a different site entirely.
    expect(detectPlatform('https://notgithub.com/pete')).toBeNull();
    expect(detectPlatform('https://github.com.evil.example/pete')).toBeNull();
  });

  it('tolerates a missing scheme and a www prefix', () => {
    expect(detectPlatform('github.com/pete')?.id).toBe('github');
    expect(detectPlatform('www.instagram.com/pete')?.id).toBe('instagram');
    expect(detectPlatform('  https://x.com/pete  ')?.id).toBe('twitter');
  });

  it('returns null for junk rather than throwing', () => {
    expect(detectPlatform('')).toBeNull();
    expect(detectPlatform('   ')).toBeNull();
    expect(detectPlatform('not a url at all')).toBeNull();
    expect(detectPlatform('http://')).toBeNull();
  });

  it('does not claim a platform for an unregistered host', () => {
    expect(detectPlatform('https://petenguyen.dev')).toBeNull();
  });
});

describe('platformByLabel / linkEmoji', () => {
  it('resolves a label case-insensitively', () => {
    expect(platformByLabel('github')?.id).toBe('github');
    expect(platformByLabel('  X / Twitter ')?.id).toBe('twitter');
    expect(platformByLabel('nonsense')).toBeNull();
  });

  it('prefers the URL over the label, then falls back to a generic link', () => {
    // A row whose label was hand-edited should still show the real platform.
    expect(linkEmoji('My portfolio', 'https://github.com/pete')).toBe('🐙');
    expect(linkEmoji('GitHub', 'https://petenguyen.dev')).toBe('🐙');
    expect(linkEmoji('Portfolio', 'https://petenguyen.dev')).toBe('🔗');
  });
});

describe('isPaymentLink', () => {
  it('is true only for the two payment platforms', () => {
    expect(isPaymentLink('https://venmo.com/u/pete')).toBe(true);
    expect(isPaymentLink('https://cash.app/$pete')).toBe(true);
    expect(isPaymentLink('https://github.com/pete')).toBe(false);
    expect(isPaymentLink('nonsense')).toBe(false);
  });
});

describe('paymentUrlFromHandle', () => {
  it('strips the conventional sigil before building the URL', () => {
    expect(paymentUrlFromHandle('venmo', '@pete-nguyen')).toBe(
      'https://venmo.com/u/pete-nguyen',
    );
    expect(paymentUrlFromHandle('venmo', 'pete-nguyen')).toBe(
      'https://venmo.com/u/pete-nguyen',
    );
    expect(paymentUrlFromHandle('cashapp', '$petenguyen')).toBe(
      'https://cash.app/$petenguyen',
    );
    expect(paymentUrlFromHandle('cashapp', 'petenguyen')).toBe(
      'https://cash.app/$petenguyen',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(paymentUrlFromHandle('venmo', '  @pete  ')).toBe('https://venmo.com/u/pete');
  });

  it('rejects handles that would produce a broken or hostile URL', () => {
    expect(paymentUrlFromHandle('venmo', '')).toBeNull();
    expect(paymentUrlFromHandle('venmo', '@')).toBeNull();
    expect(paymentUrlFromHandle('venmo', 'pete nguyen')).toBeNull();
    expect(paymentUrlFromHandle('venmo', 'pete/../../evil')).toBeNull();
    expect(paymentUrlFromHandle('venmo', 'a'.repeat(31))).toBeNull();
    expect(paymentUrlFromHandle('venmo', 'a'.repeat(30))).toBe(
      `https://venmo.com/u/${'a'.repeat(30)}`,
    );
  });

  it('requires a cashtag to start with a letter and stay within 20 chars', () => {
    expect(paymentUrlFromHandle('cashapp', '1pete')).toBeNull();
    expect(paymentUrlFromHandle('cashapp', '$1pete')).toBeNull();
    expect(paymentUrlFromHandle('cashapp', 'p'.repeat(21))).toBeNull();
    expect(paymentUrlFromHandle('cashapp', 'p'.repeat(20))).toBe(
      `https://cash.app/$${'p'.repeat(20)}`,
    );
  });
});

describe('paymentHandleFromUrl', () => {
  it('returns the handle with its sigil', () => {
    expect(paymentHandleFromUrl('https://venmo.com/u/pete-nguyen')).toBe('@pete-nguyen');
    expect(paymentHandleFromUrl('https://cash.app/$petenguyen')).toBe('$petenguyen');
  });

  it('does not double the sigil when the stored path already carries one', () => {
    // Venmo profile URLs are stored without the @, but a hand-pasted link can
    // include it — the display must not come back as "@@pete".
    expect(paymentHandleFromUrl('https://venmo.com/u/@pete')).toBe('@pete');
    expect(paymentHandleFromUrl('https://cash.app/$pete')).toBe('$pete');
  });

  it('returns null for non-payment or path-less URLs', () => {
    expect(paymentHandleFromUrl('https://github.com/pete')).toBeNull();
    expect(paymentHandleFromUrl('https://venmo.com')).toBeNull();
    expect(paymentHandleFromUrl('https://venmo.com/')).toBeNull();
    expect(paymentHandleFromUrl('nonsense')).toBeNull();
  });
});

describe('payment handle round-trip', () => {
  // profile-setup splits payment links out of the saved `links` array into
  // handle inputs on every edit, so any asymmetry here silently rewrites a
  // student's payment handle each time they touch an unrelated profile field.
  const cases: [Parameters<typeof paymentUrlFromHandle>[0], string, string][] = [
    ['venmo', '@pete-nguyen', '@pete-nguyen'],
    ['venmo', 'pete_nguyen', '@pete_nguyen'],
    ['venmo', 'Pete99', '@Pete99'],
    ['cashapp', '$petenguyen', '$petenguyen'],
    ['cashapp', 'pete-nguyen', '$pete-nguyen'],
  ];

  it.each(cases)('%s: %s survives handle → url → handle', (platform, input, expected) => {
    const url = paymentUrlFromHandle(platform, input);
    expect(url).not.toBeNull();
    expect(isPaymentLink(url!)).toBe(true);
    expect(paymentHandleFromUrl(url!)).toBe(expected);
    // And the second pass is a fixed point.
    expect(paymentUrlFromHandle(platform, paymentHandleFromUrl(url!)!)).toBe(url);
  });
});
