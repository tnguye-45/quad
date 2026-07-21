// Platform registry for the social/professional links on a profile.
// Profiles store links as a plain { label, url } array (see migration 0004),
// but the UI uses this list to offer quick-add chips and to auto-detect the
// platform when someone pastes a URL.

export type Platform = {
  id: string;
  label: string;
  emoji: string;
  // Hostnames that identify this platform on a pasted URL.
  hosts: string[];
  // Prompt shown when the user adds this platform manually.
  placeholder: string;
  // Optional: if set, prefilled when a chip is tapped (e.g. for handles like
  // "you@example.com" on a contact link). For most platforms we want the user
  // to paste their full URL so we leave this empty.
  prefill?: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    emoji: '💼',
    hosts: ['linkedin.com', 'lnkd.in'],
    placeholder: 'https://linkedin.com/in/your-handle',
  },
  {
    id: 'github',
    label: 'GitHub',
    emoji: '🐙',
    hosts: ['github.com'],
    placeholder: 'https://github.com/your-handle',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    emoji: '📸',
    hosts: ['instagram.com'],
    placeholder: 'https://instagram.com/your-handle',
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    emoji: '🐦',
    hosts: ['x.com', 'twitter.com'],
    placeholder: 'https://x.com/your-handle',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    emoji: '🎵',
    hosts: ['tiktok.com'],
    placeholder: 'https://tiktok.com/@your-handle',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    emoji: '👻',
    hosts: ['snapchat.com'],
    placeholder: 'https://snapchat.com/add/your-handle',
  },
  {
    id: 'discord',
    label: 'Discord',
    emoji: '🎮',
    hosts: ['discord.gg', 'discord.com'],
    placeholder: 'https://discord.gg/your-server  (or your handle)',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    emoji: '📺',
    hosts: ['youtube.com', 'youtu.be'],
    placeholder: 'https://youtube.com/@your-channel',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    emoji: '🎧',
    hosts: ['spotify.com', 'open.spotify.com'],
    placeholder: 'https://open.spotify.com/user/your-id',
  },
  {
    id: 'venmo',
    label: 'Venmo',
    emoji: '💸',
    hosts: ['venmo.com'],
    placeholder: 'https://venmo.com/u/your-handle',
  },
  {
    id: 'cashapp',
    label: 'Cash App',
    emoji: '💵',
    hosts: ['cash.app'],
    placeholder: 'https://cash.app/$yourcashtag',
  },
  {
    id: 'website',
    label: 'Website',
    emoji: '🌐',
    hosts: [],
    placeholder: 'https://your-portfolio.com',
  },
  {
    id: 'other',
    label: 'Other',
    emoji: '🔗',
    hosts: [],
    placeholder: 'https://…',
  },
];

const PLATFORM_BY_HOST = new Map<string, Platform>();
for (const p of PLATFORMS) {
  for (const h of p.hosts) PLATFORM_BY_HOST.set(h, p);
}

// Strip protocol/www and pull the registrable host. We don't bring in a full
// PSL parser — exact-match on the platform's hosts list is enough for v1.
function normalizeHost(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function detectPlatform(url: string): Platform | null {
  const host = normalizeHost(url);
  if (!host) return null;
  // Direct hit, then suffix match for subdomains (e.g. open.spotify.com).
  if (PLATFORM_BY_HOST.has(host)) return PLATFORM_BY_HOST.get(host)!;
  for (const [knownHost, platform] of PLATFORM_BY_HOST) {
    if (host === knownHost || host.endsWith(`.${knownHost}`)) return platform;
  }
  return null;
}

export function platformByLabel(label: string): Platform | null {
  const lower = label.trim().toLowerCase();
  return PLATFORMS.find((p) => p.label.toLowerCase() === lower) ?? null;
}

// Best-effort emoji for an existing { label, url } row — used by the profile
// display to put a marker next to each link.
export function linkEmoji(label: string, url: string): string {
  const detected = detectPlatform(url);
  if (detected) return detected.emoji;
  const labeled = platformByLabel(label);
  if (labeled) return labeled.emoji;
  return '🔗';
}

// ─────────────────────── payment handles ───────────────────────
// Venmo and Cash App get first-class handle inputs on profile setup instead of
// raw URL rows. They still persist inside the same `links` array so no schema
// change is needed — these helpers convert handle ↔ URL.

export type PaymentPlatformId = 'venmo' | 'cashapp';

export const PAYMENT_PLATFORM_IDS: PaymentPlatformId[] = ['venmo', 'cashapp'];

export function isPaymentLink(url: string): boolean {
  const p = detectPlatform(url);
  return !!p && PAYMENT_PLATFORM_IDS.includes(p.id as PaymentPlatformId);
}

// "@pete-nguyen" / "pete-nguyen" → https://venmo.com/u/pete-nguyen
// "$petenguyen" / "petenguyen"  → https://cash.app/$petenguyen
export function paymentUrlFromHandle(
  platform: PaymentPlatformId,
  raw: string,
): string | null {
  const handle = raw.trim().replace(/^[@$]/, '');
  if (!handle) return null;
  if (platform === 'venmo') {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(handle)) return null;
    return `https://venmo.com/u/${handle}`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(handle)) return null;
  return `https://cash.app/$${handle}`;
}

// Inverse of paymentUrlFromHandle, for prefilling the inputs and for display.
// Returns the handle with its conventional sigil ("@…" / "$…").
export function paymentHandleFromUrl(url: string): string | null {
  const p = detectPlatform(url);
  if (!p) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!last) return null;
    if (p.id === 'venmo') return `@${last.replace(/^@/, '')}`;
    if (p.id === 'cashapp') return `$${last.replace(/^\$/, '')}`;
    return null;
  } catch {
    return null;
  }
}
