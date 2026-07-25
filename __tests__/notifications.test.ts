import { routeForPayload } from '@/lib/notifications';

// Only routeForPayload is covered: it's pure, and it turns a server-controlled
// blob into a router path. Everything else in notifications.ts is expo-native
// side effects.

describe('routeForPayload', () => {
  it('routes each notification kind to its screen', () => {
    expect(routeForPayload({ kind: 'message', conversationId: 'c1' })).toBe('/chat/c1');
    expect(routeForPayload({ kind: 'gig', gigId: 'g1' })).toBe('/gig/g1');
    expect(routeForPayload({ kind: 'hangout', hangoutId: 'h1' })).toBe('/hangout/h1');
    expect(routeForPayload({ kind: 'voice', voiceId: 'v1' })).toBe('/voice/v1');
  });

  it('ignores the comment id — comments deep-link to their parent post', () => {
    expect(routeForPayload({ kind: 'gig', gigId: 'g1', commentId: 'c9' })).toBe('/gig/g1');
  });

  it('returns null for a payload with no id, rather than routing to "/gig/undefined"', () => {
    expect(routeForPayload({ kind: 'message' })).toBeNull();
    expect(routeForPayload({ kind: 'gig', gigId: null })).toBeNull();
    expect(routeForPayload({ kind: 'hangout', hangoutId: 42 })).toBeNull();
    // The wrong id field for the kind is just as missing.
    expect(routeForPayload({ kind: 'voice', gigId: 'g1' })).toBeNull();
  });

  it('returns null for unknown or absent kinds', () => {
    expect(routeForPayload({ kind: 'profile', profileId: 'p1' })).toBeNull();
    expect(routeForPayload({ conversationId: 'c1' })).toBeNull();
    expect(routeForPayload({})).toBeNull();
  });

  it('survives a payload that is not an object at all', () => {
    // expo-notifications hands us whatever the push service delivered.
    expect(routeForPayload(null)).toBeNull();
    expect(routeForPayload(undefined)).toBeNull();
    expect(routeForPayload('message')).toBeNull();
    expect(routeForPayload(7)).toBeNull();
    expect(routeForPayload([])).toBeNull();
  });
});
