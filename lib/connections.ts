// Data layer for the Obsidian map (app/connections.tsx): an ego graph of the
// current user's campus orbit. Nodes are people; edges are either BEHAVIORAL
// (things that actually happened on quad — shared hangout group chats, gig
// work) or AMBIENT profile overlap (same dorm / major / year).
//
// Contract notes (supabase/CLIENT_CONTRACT.md, 0023–0032):
//   * hangout_attendees is own-rows-only now, so co-attendance comes from
//     conversation_members of MY conversations — which RLS already scopes to
//     me, giving exactly ego-graph semantics for free. Groups from ANONYMOUS
//     hangouts are dropped: their membership list names the masked host (0038).
//   * gig work ties read gigs_feed (accepted_by is granted; poster_id arrives
//     pre-masked, so an anonymous poster can never leak into the graph).
//   * profiles is an open directory (0002), so ambient overlap filters it
//     server-side; my outgoing blocks are removed client-side. Incoming
//     blocks need the phase-2 profiles view — known gap.

import type { Profile } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export type OrbitTieKind = "hungout" | "gig" | "dorm" | "major" | "year";

export type OrbitTie = {
  kind: OrbitTieKind;
  label: string;
  weight: number;
};

export type OrbitNode = {
  id: string;
  name: string | null;
  initials: string | null;
  avatarUrl: string | null;
  dorm: string | null;
  major: string | null;
  year: number | null;
  bio: string | null;
  /** 1 = behavioral tie, 2 = strong overlap (2+ reasons), 3 = weak overlap. */
  ring: 1 | 2 | 3;
  /** Ties to the current user, strongest first. */
  ties: OrbitTie[];
  strength: number;
};

/** Faint edge between two non-me nodes (shared hangout chat or same dorm). */
export type OrbitPeerEdge = {
  a: string;
  b: string;
  kind: "hungout" | "dorm";
};

export type OrbitGraph = {
  nodes: OrbitNode[];
  peerEdges: OrbitPeerEdge[];
};

/** Raw inputs the graph is built from — kept as plain data so the builder is
 *  pure and the dev/demo path can synthesize it without a backend. */
export type OrbitSources = {
  /** Candidate people (never includes the current user). */
  profiles: Profile[];
  /** Member ids (me excluded) per hangout group chat I'm in. */
  hangoutGroups: string[][];
  /** Counterparts from 1:1 gig threads I'm in. */
  gigChatIds: string[];
  /** Confirmed gig work counterparts (accepted_by pairs). */
  workedIds: string[];
  /** People I've blocked — never rendered. */
  blockedIds: string[];
};

const MAX_ORBIT_NODES = 40;
const MAX_PEER_EDGES = 60;
/** Dorm peer-cliques above this size render as no edges (a 12-person dorm
 *  would add 66 lines of noise; hub nodes are the phase-3 answer). */
const MAX_DORM_CLIQUE = 5;

const PROFILE_COLS =
  "id, display_name, initials, year, major, dorm, avatar_url, bio, links, verified_at, created_at, updated_at";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Values interpolated into a PostgREST .or() must be double-quoted (dorm
 *  names contain spaces); embedded quotes would break out of the literal. A
 *  trailing backslash escapes the CLOSING quote and breaks out the same way, so
 *  strip both characters — profile text has no legitimate use for either. */
function orLiteral(value: string): string {
  return `"${value.replace(/["\\]/g, "")}"`;
}

function normalizeProfile(row: Profile): Profile {
  return { ...row, links: Array.isArray(row.links) ? row.links : [] };
}

// ─────────────────────── graph builder (pure) ───────────────────────

export function buildOrbitGraph(me: Profile, sources: OrbitSources): OrbitGraph {
  const blocked = new Set(sources.blockedIds);

  // Behavioral tallies keyed by user id.
  const hungoutWeight = new Map<string, number>();
  for (const group of sources.hangoutGroups) {
    for (const id of new Set(group)) {
      if (id === me.id) continue;
      hungoutWeight.set(id, (hungoutWeight.get(id) ?? 0) + 1);
    }
  }
  const gigWeight = new Map<string, number>();
  for (const id of sources.workedIds) {
    if (id !== me.id) gigWeight.set(id, (gigWeight.get(id) ?? 0) + 2);
  }
  for (const id of sources.gigChatIds) {
    if (id !== me.id) gigWeight.set(id, (gigWeight.get(id) ?? 0) + 1);
  }

  const nodes: OrbitNode[] = [];
  for (const raw of sources.profiles) {
    const p = normalizeProfile(raw);
    if (p.id === me.id || blocked.has(p.id)) continue;

    const ties: OrbitTie[] = [];
    const hungout = hungoutWeight.get(p.id) ?? 0;
    if (hungout > 0) {
      ties.push({
        kind: "hungout",
        label: hungout > 1 ? `hung out ×${hungout}` : "hung out",
        weight: hungout,
      });
    }
    const gig = gigWeight.get(p.id) ?? 0;
    if (gig > 0) {
      ties.push({ kind: "gig", label: "gig together", weight: gig });
    }
    if (me.dorm && p.dorm && normalize(me.dorm) === normalize(p.dorm)) {
      ties.push({ kind: "dorm", label: "same dorm", weight: 1 });
    }
    if (me.major && p.major && normalize(me.major) === normalize(p.major)) {
      ties.push({ kind: "major", label: "same major", weight: 1 });
    }
    if (me.year && p.year && me.year === p.year) {
      ties.push({ kind: "year", label: "same year", weight: 1 });
    }
    if (ties.length === 0) continue;

    const behavioral = hungout > 0 || gig > 0;
    const attributeCount = ties.filter(
      (t) => t.kind !== "hungout" && t.kind !== "gig",
    ).length;
    const strength = ties.reduce(
      (sum, t) =>
        sum + (t.kind === "hungout" || t.kind === "gig" ? 3 * t.weight : 1),
      0,
    );
    nodes.push({
      id: p.id,
      name: p.display_name,
      initials: p.initials,
      avatarUrl: p.avatar_url,
      dorm: p.dorm,
      major: p.major,
      year: p.year,
      bio: p.bio,
      ring: behavioral ? 1 : attributeCount >= 2 ? 2 : 3,
      ties,
      strength,
    });
  }

  nodes.sort(
    (a, b) =>
      b.strength - a.strength || (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const kept = nodes.slice(0, MAX_ORBIT_NODES);
  const keptIds = new Set(kept.map((n) => n.id));

  // Peer edges give the map its constellation feel: faint lines between
  // people who share a hangout chat or a dorm, independent of me.
  const peerEdges: OrbitPeerEdge[] = [];
  const seen = new Set<string>();
  const addPeer = (a: string, b: string, kind: OrbitPeerEdge["kind"]) => {
    if (peerEdges.length >= MAX_PEER_EDGES) return;
    if (a === b || !keptIds.has(a) || !keptIds.has(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    peerEdges.push({ a, b, kind });
  };
  for (const group of sources.hangoutGroups) {
    const members = [...new Set(group)].filter((id) => keptIds.has(id));
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        addPeer(members[i], members[j], "hungout");
      }
    }
  }
  const byDorm = new Map<string, string[]>();
  for (const n of kept) {
    const dorm = normalize(n.dorm);
    if (!dorm) continue;
    const list = byDorm.get(dorm) ?? [];
    list.push(n.id);
    byDorm.set(dorm, list);
  }
  for (const ids of byDorm.values()) {
    if (ids.length < 2 || ids.length > MAX_DORM_CLIQUE) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPeer(ids[i], ids[j], "dorm");
      }
    }
  }

  return { nodes: kept, peerEdges };
}

// ─────────────────────── source fetching (real session) ───────────────────────

export async function fetchOrbitSources(me: Profile): Promise<OrbitSources> {
  // 1) My conversations (RLS: members only) split by kind, their other
  //    members, my outgoing blocks, and confirmed gig work — in parallel.
  const [convRes, blocksRes, postedRes, workedRes] = await Promise.all([
    supabase.from("conversations").select("id, gig_id, hangout_id"),
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", me.id),
    supabase
      .from("gigs_feed")
      .select("id, accepted_by")
      .eq("poster_id", me.id)
      .not("accepted_by", "is", null),
    // My own rows always carry identity in the view; someone ELSE's anonymous
    // gig comes back with poster_id null and is skipped below.
    supabase
      .from("gigs_feed")
      .select("id, poster_id")
      .eq("accepted_by", me.id),
  ]);
  if (convRes.error) throw convRes.error;
  // The block list gates who may appear on the orbit graph. If it fails we must
  // NOT silently fall back to an empty list — that would surface a blocked user
  // as a node. Fail the whole graph instead (the caller shows a retry).
  if (blocksRes.error) throw blocksRes.error;

  const convs = (convRes.data ?? []) as {
    id: string;
    gig_id: string | null;
    hangout_id: string | null;
  }[];
  const convIds = convs.map((c) => c.id);

  let memberRows: { conversation_id: string; user_id: string }[] = [];
  if (convIds.length > 0) {
    const { data, error } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", me.id);
    if (error) throw error;
    memberRows = (data ?? []) as { conversation_id: string; user_id: string }[];
  }

  const membersByConv = new Map<string, string[]>();
  for (const row of memberRows) {
    const list = membersByConv.get(row.conversation_id) ?? [];
    list.push(row.user_id);
    membersByConv.set(row.conversation_id, list);
  }

  // 0038 stops anonymous hangouts from forming a group conversation at all, but
  // conversations created before it can still exist — and their membership list
  // contains the anonymous host. Rendering that group would put the host on their
  // own attendee's map, by name, tagged "hung out": exactly the leak 0027's masking
  // exists to prevent. Identify those hangouts through hangouts_feed, where
  // host_id is NULL precisely when the row is anonymous and not the caller's own.
  const hangoutIds = [
    ...new Set(convs.map((c) => c.hangout_id).filter((id): id is string => !!id)),
  ];
  const maskedHangoutIds = new Set<string>();
  if (hangoutIds.length > 0) {
    const { data, error } = await supabase
      .from("hangouts_feed")
      .select("id, anonymous, host_id")
      .in("id", hangoutIds);
    // Fail the whole graph rather than degrade: without the anonymity flags we
    // cannot tell a safe group from a leaking one, and guessing wrong publishes a
    // name that was promised to stay hidden.
    if (error) throw error;
    const rows = (data ?? []) as {
      id: string;
      anonymous: boolean;
      host_id: string | null;
    }[];
    for (const h of rows) {
      if (h.anonymous && h.host_id === null) maskedHangoutIds.add(h.id);
    }
    // A hangout the view didn't return at all (deleted, or its host is blocked) is
    // an unknown, and an unknown is treated as masked.
    const returned = new Set(rows.map((h) => h.id));
    for (const id of hangoutIds) if (!returned.has(id)) maskedHangoutIds.add(id);
  }

  const hangoutGroups: string[][] = [];
  const gigChatIds: string[] = [];
  for (const conv of convs) {
    const members = membersByConv.get(conv.id) ?? [];
    if (members.length === 0) continue;
    if (conv.hangout_id) {
      if (maskedHangoutIds.has(conv.hangout_id)) continue;
      hangoutGroups.push(members);
    } else if (conv.gig_id) gigChatIds.push(...members);
  }

  const workedIds: string[] = [];
  for (const row of (postedRes.data ?? []) as { accepted_by: string | null }[]) {
    if (row.accepted_by) workedIds.push(row.accepted_by);
  }
  for (const row of (workedRes.data ?? []) as { poster_id: string | null }[]) {
    if (row.poster_id) workedIds.push(row.poster_id);
  }

  const blockedIds = ((blocksRes.data ?? []) as { blocked_id: string }[]).map(
    (r) => r.blocked_id,
  );

  // 2) Ambient overlap, filtered server-side instead of "newest 20 profiles".
  const orParts: string[] = [];
  if (me.dorm?.trim()) orParts.push(`dorm.eq.${orLiteral(me.dorm.trim())}`);
  if (me.major?.trim()) orParts.push(`major.eq.${orLiteral(me.major.trim())}`);
  if (me.year) orParts.push(`year.eq.${me.year}`);

  let profiles: Profile[] = [];
  if (orParts.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .or(orParts.join(","))
      .neq("id", me.id)
      .limit(60);
    if (error) throw error;
    profiles = ((data ?? []) as unknown as Profile[]).map(normalizeProfile);
  }

  // 3) Behavioral contacts may not overlap on any attribute — fetch whichever
  //    profiles are still missing so their nodes can render.
  const have = new Set(profiles.map((p) => p.id));
  const behavioralIds = [
    ...new Set([...hangoutGroups.flat(), ...gigChatIds, ...workedIds]),
  ].filter((id) => id !== me.id && !have.has(id));
  if (behavioralIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .in("id", behavioralIds);
    if (error) throw error;
    profiles = profiles.concat(
      ((data ?? []) as unknown as Profile[]).map(normalizeProfile),
    );
  }

  return { profiles, hangoutGroups, gigChatIds, workedIds, blockedIds };
}

// ─────────────────────── dev/demo sources ───────────────────────

/** Synthesizes behavioral ties over the demo roster so the dev-mode graph
 *  shows every edge kind: first two profiles share a hangout chat with me
 *  (and each other), the third is a gig thread. */
export function demoOrbitSources(profiles: Profile[]): OrbitSources {
  const ids = profiles.map((p) => p.id);
  return {
    profiles,
    hangoutGroups: ids.length >= 2 ? [[ids[0], ids[1]]] : [],
    gigChatIds: ids.length >= 3 ? [ids[2]] : [],
    workedIds: [],
    blockedIds: [],
  };
}
