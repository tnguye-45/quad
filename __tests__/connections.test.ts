import type { Profile } from '@/lib/auth-context';
import { buildOrbitGraph, type OrbitSources } from '@/lib/connections';

// Only buildOrbitGraph is covered here: it's pure, and it's the half of
// connections.ts that decides who is rendered on another student's orbit map.
// fetchOrbitSources talks to PostgREST and is left to the contract check.

function profile(id: string, over: Partial<Profile> = {}): Profile {
  return {
    id,
    display_name: id.toUpperCase(),
    initials: id.slice(0, 2).toUpperCase(),
    year: null,
    major: null,
    dorm: null,
    avatar_url: null,
    bio: null,
    links: [],
    verified_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function sources(over: Partial<OrbitSources> = {}): OrbitSources {
  return {
    profiles: [],
    hangoutGroups: [],
    gigChatIds: [],
    workedIds: [],
    blockedIds: [],
    ...over,
  };
}

const me = profile('me', { dorm: 'Dillon Hall', major: 'Computer Science', year: 3 });

const byId = (graph: { nodes: { id: string }[] }) => graph.nodes.map((n) => n.id);

describe('buildOrbitGraph — ring assignment', () => {
  it('puts anyone with a behavioural tie in ring 1, however weak the overlap', () => {
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: [profile('a')], hangoutGroups: [['a']] }),
    );
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].ring).toBe(1);
    expect(graph.nodes[0].ties.map((t) => t.kind)).toEqual(['hungout']);
  });

  it('treats gig work as behavioural too', () => {
    const graph = buildOrbitGraph(me, sources({ profiles: [profile('a')], workedIds: ['a'] }));
    expect(graph.nodes[0].ring).toBe(1);
  });

  it('needs two attribute overlaps for ring 2, one for ring 3', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [
          profile('two', { dorm: 'Dillon Hall', major: 'Computer Science' }),
          profile('one', { year: 3 }),
        ],
      }),
    );
    const ring = Object.fromEntries(graph.nodes.map((n) => [n.id, n.ring]));
    expect(ring).toEqual({ two: 2, one: 3 });
  });

  it('drops people with no tie at all rather than rendering an unexplained dot', () => {
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: [profile('stranger', { dorm: 'Sorin College', year: 1 })] }),
    );
    expect(graph.nodes).toEqual([]);
  });

  it('compares dorm and major case- and whitespace-insensitively', () => {
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: [profile('a', { dorm: '  dillon hall ', major: 'COMPUTER SCIENCE' })] }),
    );
    expect(graph.nodes[0].ties.map((t) => t.kind).sort()).toEqual(['dorm', 'major']);
  });

  it('never ties on a field the current user has not filled in', () => {
    const blank = profile('me', { dorm: null, major: null, year: null });
    const graph = buildOrbitGraph(
      blank,
      sources({ profiles: [profile('a', { dorm: 'Dillon Hall', year: 3 })] }),
    );
    expect(graph.nodes).toEqual([]);
  });

  it('counts repeat hangouts and labels them', () => {
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: [profile('a')], hangoutGroups: [['a'], ['a'], ['a']] }),
    );
    const tie = graph.nodes[0].ties.find((t) => t.kind === 'hungout')!;
    expect(tie.weight).toBe(3);
    expect(tie.label).toBe('hung out ×3');
  });

  it('does not double-count a member listed twice in one group', () => {
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: [profile('a')], hangoutGroups: [['a', 'a', 'a']] }),
    );
    expect(graph.nodes[0].ties[0].weight).toBe(1);
    expect(graph.nodes[0].ties[0].label).toBe('hung out');
  });

  it('ranks behavioural ties above pure attribute overlap', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [
          profile('overlap', { dorm: 'Dillon Hall', major: 'Computer Science', year: 3 }),
          profile('worked'),
        ],
        workedIds: ['worked'],
      }),
    );
    expect(byId(graph)).toEqual(['worked', 'overlap']);
  });
});

describe('buildOrbitGraph — exclusions', () => {
  it('excludes blocked people even when the tie is behavioural', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [profile('blocked'), profile('ok')],
        hangoutGroups: [['blocked', 'ok']],
        workedIds: ['blocked'],
        blockedIds: ['blocked'],
      }),
    );
    expect(byId(graph)).toEqual(['ok']);
  });

  it('leaves no peer edge behind a blocked node', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [profile('blocked'), profile('a'), profile('b')],
        hangoutGroups: [['blocked', 'a', 'b']],
        blockedIds: ['blocked'],
      }),
    );
    expect(graph.peerEdges).toEqual([{ a: 'a', b: 'b', kind: 'hungout' }]);
  });

  it('never includes the current user, even if they appear in the sources', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [profile('me'), profile('a')],
        hangoutGroups: [['me', 'a']],
        workedIds: ['me'],
        gigChatIds: ['me'],
      }),
    );
    expect(byId(graph)).toEqual(['a']);
  });
});

describe('buildOrbitGraph — peer edges', () => {
  it('emits one undirected edge per pair regardless of ordering', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [profile('a'), profile('b')],
        // Same pair, opposite order, twice over.
        hangoutGroups: [['a', 'b'], ['b', 'a']],
      }),
    );
    expect(graph.peerEdges).toHaveLength(1);
  });

  it('does not duplicate an edge that both a hangout and a dorm would produce', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [
          profile('a', { dorm: 'Dillon Hall' }),
          profile('b', { dorm: 'Dillon Hall' }),
        ],
        hangoutGroups: [['a', 'b']],
      }),
    );
    expect(graph.peerEdges).toEqual([{ a: 'a', b: 'b', kind: 'hungout' }]);
  });

  it('links a dorm clique up to the cutoff and draws nothing beyond it', () => {
    const dorm = { dorm: 'Dillon Hall' };
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => profile(id, dorm));
    // 5 people = C(5,2) = 10 edges, still legible.
    expect(buildOrbitGraph(me, sources({ profiles: five })).peerEdges).toHaveLength(10);

    // 6 crosses MAX_DORM_CLIQUE: the whole clique is dropped rather than
    // partially drawn, so the map doesn't imply some pairs are special.
    const six = [...five, profile('f', dorm)];
    expect(buildOrbitGraph(me, sources({ profiles: six })).peerEdges).toEqual([]);
  });

  it('keeps dorm cliques separate', () => {
    const graph = buildOrbitGraph(
      me,
      sources({
        profiles: [
          profile('a', { dorm: 'Dillon Hall' }),
          profile('b', { dorm: 'Dillon Hall' }),
          profile('c', { dorm: 'Sorin College', year: 3 }),
        ],
      }),
    );
    // c has no dorm tie to a/b — its only edge candidate would cross dorms.
    expect(graph.peerEdges).toEqual([{ a: 'a', b: 'b', kind: 'dorm' }]);
  });

  it('never emits an edge to someone who fell outside the node cap', () => {
    // 60 dorm-mates: only 40 nodes are kept, and no edge may reference the 20
    // that were cut.
    const many = Array.from({ length: 60 }, (_, i) =>
      profile(`p${i}`, { dorm: 'Dillon Hall' }),
    );
    const graph = buildOrbitGraph(
      me,
      sources({ profiles: many, hangoutGroups: [many.map((p) => p.id)] }),
    );
    const kept = new Set(byId(graph));
    expect(kept.size).toBe(40);
    for (const e of graph.peerEdges) {
      expect(kept.has(e.a)).toBe(true);
      expect(kept.has(e.b)).toBe(true);
    }
    expect(graph.peerEdges.length).toBeLessThanOrEqual(60);
  });
});
