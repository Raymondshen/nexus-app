-- Bulk drag-to-reorder persistence (VibesPlaylistSheet) — reorderNotesAction previously
-- fired one parallel `.update()` per note (N round trips per reorder). This RPC does the
-- same renumbering in a single statement/round trip.
--
-- security invoker (the default — stated explicitly for clarity) means this runs as the
-- calling user, so the existing "note creators can update notes" RLS policy still applies;
-- the explicit created_by = auth.uid() below is redundant with that policy but kept for
-- readability and defense-in-depth in case this function's security model ever changes.
create or replace function public.reorder_notes(p_ids uuid[])
returns void
language sql
security invoker
as $$
  update public.notes n
  set position = v.pos - 1
  from unnest(p_ids) with ordinality as v(id, pos)
  where n.id = v.id and n.created_by = auth.uid();
$$;

grant execute on function public.reorder_notes(uuid[]) to authenticated;
