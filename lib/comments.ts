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

type ProfileEmbed = {
  display_name: string | null;
  initials: string | null;
  avatar_url: string | null;
} | null;

type CommentRow = {
  id: string;
  target_type: CommentTargetType;
  target_id: string;
  author_id: string;
  anonymous: boolean;
  body: string;
  created_at: string;
  author?: ProfileEmbed;
};

const COMMENT_SELECT =
  'id, target_type, target_id, author_id, anonymous, body, created_at, ' +
  'author:profiles!comments_author_id_fkey(display_name, initials, avatar_url)';

function fromRow(row: CommentRow): Comment {
  return {
    id: row.id,
    body: row.body,
    anonymous: row.anonymous,
    authorId: row.author_id,
    authorName: row.anonymous ? null : (row.author?.display_name ?? null),
    authorInitials: row.anonymous ? null : (row.author?.initials ?? null),
    authorAvatarUrl: row.anonymous ? null : (row.author?.avatar_url ?? null),
    postedAt: new Date(row.created_at).getTime(),
  };
}

export function useComments(
  targetType: CommentTargetType | undefined,
  targetId: string | undefined,
): {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  send: (body: string, opts?: { anonymous?: boolean }) => Promise<void>;
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
        .from('comments')
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
    // Realtime: hydrate the row on insert so we get the joined author profile;
    // drop locally on delete. Filter scopes the channel to this single target
    // so other detail screens don't get cross-talk.
    const channel = supabase
      .channel(`comments:${targetType}:${targetId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `target_id=eq.${targetId}`,
        },
        async (payload) => {
          const row = payload.new as CommentRow;
          if (row.target_type !== targetType) return;
          const { data } = await supabase
            .from('comments')
            .select(COMMENT_SELECT)
            .eq('id', row.id)
            .maybeSingle();
          if (!mountedRef.current || !data) return;
          const fresh = fromRow(data as unknown as CommentRow);
          setComments((cur) => {
            if (cur.some((c) => c.id === fresh.id)) return cur;
            return [...cur, fresh];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comments',
          filter: `target_id=eq.${targetId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row?.id || !mountedRef.current) return;
          setComments((cur) => cur.filter((c) => c.id !== row.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSession, targetType, targetId, session?.user.id]);

  const send = async (body: string, opts?: { anonymous?: boolean }) => {
    if (!realSession || !targetType || !targetId) return;
    const trimmed = body.trim();
    if (!trimmed) return;
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
    }
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
