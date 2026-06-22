create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  crew_id         uuid not null references public.crews(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  url             text not null,
  og_title        text,
  og_image_url    text,
  source_domain   text,
  created_at      timestamptz not null default now()
);

create index notes_crew_id_created_at on public.notes (crew_id, created_at desc);

alter table public.notes enable row level security;

-- any crew member can read notes for their crew
create policy "crew members can view notes"
  on public.notes for select
  using (
    exists (
      select 1 from public.crew_members cm
      where cm.crew_id = notes.crew_id
        and cm.user_id = auth.uid()
    )
  );

-- crew members can insert notes into their own crew
create policy "crew members can insert notes"
  on public.notes for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.crew_members cm
      where cm.crew_id = notes.crew_id
        and cm.user_id = auth.uid()
    )
  );

-- only the creator can delete their own notes
create policy "creators can delete own notes"
  on public.notes for delete
  using (created_by = auth.uid());
