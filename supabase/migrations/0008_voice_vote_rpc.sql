-- quad — Phase 2.5: atomic voice vote RPC
--
-- Why this exists:
--   * The client previously called supabase.from('voice_votes').delete() OR
--     .upsert() to register a vote change. On rapid up→down taps that issued
--     two independent requests — a DELETE followed by an UPSERT — which can
--     reorder server-side and leave the row in the wrong final state (or fail
--     the upsert because the delete from the next click already ran). The
--     trigger recomputes vote_score per row change, so a reorder can also
--     leave the cached score out of sync until the next refresh.
--   * One RPC, one transaction, one trigger fire — no reorder possible.

create or replace function public.set_voice_vote(p_voice_id uuid, p_value smallint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_value not in (-1, 0, 1) then
    raise exception 'value must be -1, 0, or 1' using errcode = '22023';
  end if;

  if p_value = 0 then
    delete from public.voice_votes
     where voice_id = p_voice_id and user_id = v_me;
  else
    insert into public.voice_votes (voice_id, user_id, value)
    values (p_voice_id, v_me, p_value)
    on conflict (voice_id, user_id) do update
      set value = excluded.value;
  end if;
end;
$$;

grant execute on function public.set_voice_vote(uuid, smallint) to authenticated;
