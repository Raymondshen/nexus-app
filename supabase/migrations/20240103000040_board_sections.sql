-- board_sections: per-crew named groupings for the link board
create table public.board_sections (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references public.crews(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index board_sections_crew_id_idx
  on public.board_sections (crew_id, position, created_at);

alter table public.board_sections enable row level security;

create policy "crew members can view sections"
  on public.board_sections for select
  using (
    exists (
      select 1 from public.crew_members cm
      where cm.crew_id = board_sections.crew_id
        and cm.user_id = auth.uid()
    )
  );

create policy "crew members can create sections"
  on public.board_sections for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.crew_members cm
      where cm.crew_id = board_sections.crew_id
        and cm.user_id = auth.uid()
    )
  );

create policy "creators can delete sections"
  on public.board_sections for delete
  using (created_by = auth.uid());

-- Add section_id FK on notes; null = unsorted
alter table public.notes
  add column section_id uuid references public.board_sections(id) on delete set null;

-- Allow note creators to update section_id (move between sections)
create policy "note creators can update notes"
  on public.notes for update
  using  (created_by = auth.uid())
  with check (created_by = auth.uid());
