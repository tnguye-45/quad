import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-context';
import { supabase } from './supabase';

export type CommentTargetType = 'gig' | 'hangout' | 'voice';

export type Comment = {
  id: string;
  body: string;
  anonymous: boolean;
  authorId: string;
  authorName: string | null;
  authorInitials: string | null;
  authorAvatarUrl: string | null;
  postedAt: number;
};

// All comment READS go through the comments_feed security-barrier view (0027):
// author columns arrive already nulled for other people's anonymous comments,
// and the two-way block filter is applied server-side. The `anonymous` checks
// in the mapper are display sugar, not the defense.
type CommentRow = {
  id: string;
  target_type: CommentTargetType;
  target_id: string;
  author_id: string | null;
  anonymous: boolean;
  body: string;
  created_at: string;
  author_display_name: string | null;
  author_initials: string | null;
  author_avatar_url: string | null;
};

const COMMENT_SELECT =
  'id, target_type, target_id, author_id, anonymous, body, created_at, ' +
  'author_display_name, author_initials, author_avatar_url';

function fromRow(row: CommentRow): Comment {
  return {
    id: row.id,
    body: row.body,
    anonymous: row.anonymous,
    // Null for someone else's anonymous comment — '' keeps the type stable and
    // never matches a real user id in "my comment" checks.
    authorId: row.author_id ?? '',
    authorName: row.anonymous ? null : row.author_display_name,
    authorInitials: row.anonymous ? null : row.author_initials,
    authorAvatarUrl: row.anonymous ? null : row.author_avatar_url,
    postedAt: new Date(row.created_at).getTime(),
  };
}

// Channel topics must be unique per hook instance: realtime-js hands back the
// EXISTING channel for a duplicate topic, so two stacked detail screens on the
// same target would share one channel and either screen's cleanup would kill
// the other's subscription.
let channelSeq = 0;

export function useComments(
  targetType: CommentTargetType | undefined,
  targetId: string | undefined,
): {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  /** Resolves true when the comment reached the server. */
  send: (body: string, opts?: { anonymous?: boolean }) => Promise<boolean>;
  remove: (commentId: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = async () => {
    if (!realSession || !targetType || !targetId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('comments_feed')
        .select(COMMENT_SELECT)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true });
      if (e) throw e;
      if (!mountedRef.current) return;
      setComments(((data ?? []) as unknown as CommentRow[]).map(fromRow));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load comments.';
      console.warn('[comments] fetch failed:', msg);
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (!realSession || !targetType || !targetId) return;
    // Realtime (CLIENT_CONTRACT.md §2): the comments table left the realtime
    // publication, so the signal is feed_events — filtered server-side to this
    // thread via comment_target_id. On insert we hydrate the row through
    // comments_feed (masked author + block filter: a blocked author's comment
    // comes back as no row and is dropped); on delete we drop locally.
    const channel = supabase
      .channel(`comments:${targetType}:${targetId}:${++channelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'feed_events',
          filter: `comment_target_id=eq.${targetId}`,
        },
        async (payload) => {
          const ev = payload.new as {
            kind: string;
            op: 'insert' | 'update' | 'delete';
            target_id: string;
            comment_target_type: string | null;
          };
          if (ev.kind !== 'comment' || ev.comment_target_type !== targetType) return;
          if (ev.op === 'delete') {
            if (!mountedRef.current) return;
            setComments((cur) => cur.filter((c) => c.id !== ev.target_id));
            return;
          }
          const { data } = await supabase
            .from('comments_feed')
            .select(COMMENT_SELECT)
            .eq('id', ev.target_id)
            .maybeSingle();
          if (!mountedRef.current || !data) return;
          const fresh = fromRow(data as unknown as CommentRow);
          setComments((cur) => {
            if (cur.some((c) => c.id === fresh.id)) return cur;
            return [...cur, fresh];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, targetType, targetId, session?.user.id]);

  const send = async (body: string, opts?: { anonymous?: boolean }): Promise<boolean> => {
    if (!realSession || !targetType || !targetId) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    const { error: e } = await supabase.from('comments').insert({
      target_type: targetType,
      target_id: targetId,
      author_id: session!.user.id,
      body: trimmed,
      anonymous: !!opts?.anonymous,
    });
    if (e) {
      console.warn('[comments] insert failed:', e.message);
      setError(e.message);
      return false;
    }
    return true;
  };

  const remove = async (commentId: string) => {
    if (!realSession) return;
    // Optimistic: drop locally; rely on realtime DELETE to reconcile peers.
    setComments((cur) => cur.filter((c) => c.id !== commentId));
    const { error: e } = await supabase.from('comments').delete().eq('id', commentId);
    if (e) {
      console.warn('[comments] delete failed:', e.message);
      setError(e.message);
      // Reconcile if the delete was denied.
      fetchAll();
    }
  };

  return useMemo(
    () => ({ comments, loading, error, send, remove, refresh: fetchAll }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, loading, error],
  );
}
