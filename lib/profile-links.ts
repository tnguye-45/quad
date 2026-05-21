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
