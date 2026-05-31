-- =============================================================================
-- Nexus — Initial Schema
-- Phase 1: Prove The Loop
-- =============================================================================

-- 1. Extensions
-- =============================================================================
create extension if not exists "uuid-ossp";


-- 2. Utility: auto-update updated_at
-- =============================================================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- 3. Tables
-- =============================================================================

-- profiles ---------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  avatar_class text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();


-- crews ------------------------------------------------------------------
create table crews (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique,
  level        integer not null default 1,
  total_xp     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger crews_updated_at
  before update on crews
  for each row execute function handle_updated_at();


-- crew_members ------------------------------------------------------------
create table crew_members (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  class      text,
  joined_at  timestamptz not null default now(),
  unique (crew_id, user_id)
);


-- messages ----------------------------------------------------------------
create table messages (
  id            uuid primary key default gen_random_uuid(),
  crew_id       uuid not null references crews(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  content       text not null,
  message_type  text not null default 'text'
                  check (message_type in ('text', 'voice', 'image', 'reaction', 'system')),
  element_type  text
                  check (element_type in ('fire', 'water', 'lightning', 'nature', 'shadow', 'arcane')),
  xp_awarded    integer default 0,
  created_at    timestamptz not null default now()
);


-- crew_xp_log -------------------------------------------------------------
create table crew_xp_log (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  xp_amount  integer not null,
  source     text not null,
  created_at timestamptz not null default now()
);


-- bosses ------------------------------------------------------------------
create table bosses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null
                 check (type in ('void', 'ghost', 'flood', 'scheduled')),
  max_hp       integer not null,
  weak_element text
                 check (weak_element in ('fire', 'water', 'lightning', 'nature', 'shadow', 'arcane')),
  description  text,
  created_at   timestamptz not null default now()
);


-- active_raids ------------------------------------------------------------
create table active_raids (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references crews(id) on delete cascade,
  boss_id     uuid not null references bosses(id) on delete cascade,
  current_hp  integer not null,
  max_hp      integer not null,
  phase       integer not null default 1,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  defeated_at timestamptz,
  mvp_user_id uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger active_raids_updated_at
  before update on active_raids
  for each row execute function handle_updated_at();


-- artifacts ---------------------------------------------------------------
create table artifacts (
  id             uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references crews(id) on delete cascade,
  name           text not null,
  rarity         text not null
                   check (rarity in ('common', 'rare', 'epic', 'legendary')),
  source_boss_id uuid not null references bosses(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  mvp_user_id    uuid not null references profiles(id) on delete cascade,
  asset_type     text not null,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);


-- 4. Auto-create profile on signup
-- =============================================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- 5. Indexes
-- =============================================================================
create index messages_crew_id_created_at on messages(crew_id, created_at);
create index crew_members_crew_id        on crew_members(crew_id);
create index crew_members_user_id        on crew_members(user_id);
create index active_raids_crew_id        on active_raids(crew_id);
create index artifacts_crew_id           on artifacts(crew_id);


-- 6. Row Level Security
-- =============================================================================
alter table profiles     enable row level security;
alter table crews        enable row level security;
alter table crew_members enable row level security;
alter table messages     enable row level security;
alter table crew_xp_log  enable row level security;
alter table bosses       enable row level security;
alter table active_raids enable row level security;
alter table artifacts    enable row level security;


-- 7. RLS Policies
-- =============================================================================

-- Helper: is the calling user a member of a given crew?
create or replace function is_crew_member(p_crew_id uuid)
returns boolean as $$
  select exists (
    select 1 from crew_members
    where crew_id = p_crew_id
      and user_id = auth.uid()
  );
$$ language sql security definer stable;


-- profiles -------------------------------------------------------------------
create policy "profiles: anyone can read"
  on profiles for select
  using (true);

create policy "profiles: owner can update"
  on profiles for update
  using (id = auth.uid());


-- crews ----------------------------------------------------------------------
create policy "crews: members can read"
  on crews for select
  using (is_crew_member(id));

create policy "crews: members can update"
  on crews for update
  using (is_crew_member(id));

create policy "crews: authenticated users can insert"
  on crews for insert
  with check (auth.uid() is not null);


-- crew_members ---------------------------------------------------------------
create policy "crew_members: members can read their crew"
  on crew_members for select
  using (is_crew_member(crew_id));

create policy "crew_members: users can join a crew"
  on crew_members for insert
  with check (user_id = auth.uid());


-- messages -------------------------------------------------------------------
create policy "messages: crew members can read"
  on messages for select
  using (is_crew_member(crew_id));

create policy "messages: crew members can insert"
  on messages for insert
  with check (
    user_id = auth.uid()
    and is_crew_member(crew_id)
  );


-- crew_xp_log ----------------------------------------------------------------
create policy "crew_xp_log: crew members can read"
  on crew_xp_log for select
  using (is_crew_member(crew_id));

-- Inserts come from Edge Functions via the service role; no insert policy needed
-- (service role bypasses RLS by design)


-- bosses ---------------------------------------------------------------------
create policy "bosses: public read"
  on bosses for select
  using (true);


-- active_raids ---------------------------------------------------------------
create policy "active_raids: crew members can read"
  on active_raids for select
  using (is_crew_member(crew_id));

-- Inserts and updates come from Edge Functions via the service role


-- artifacts ------------------------------------------------------------------
create policy "artifacts: crew members can read"
  on artifacts for select
  using (is_crew_member(crew_id));

-- Inserts come from Edge Functions via the service role


-- 8. Seed data — bosses reference table
-- =============================================================================
insert into bosses (name, type, max_hp, weak_element, description)
values (
  'The Void',
  'void',
  1000,
  'fire',
  'Silence feeds it. Chaos defeats it.'
);


-- 9. artifact_templates table
--    Stores reusable reference designs for artifacts before they are assigned
--    to a specific crew. The live artifacts table requires crew_id and
--    mvp_user_id (both NOT NULL), so templates must live here, not there.
-- =============================================================================
create table artifact_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rarity     text not null
               check (rarity in ('common', 'rare', 'epic', 'legendary')),
  boss_id    uuid references bosses(id) on delete set null,
  asset_type text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table artifact_templates enable row level security;

create policy "artifact_templates: anyone can read"
  on artifact_templates for select
  using (true);


-- 10. Additional boss + template seed data
-- =============================================================================

-- Insert The Sage's Trial and its artifact template in a single CTE so the
-- boss id is captured and referenced without a second round-trip.
with sage_trial as (
  insert into bosses (name, type, max_hp, weak_element, description)
  values (
    'The Sage''s Trial',
    'scheduled',
    1500,
    'arcane',
    'Ancient knowledge made manifest. Only deep thought can unravel it.'
  )
  returning id
)
insert into artifact_templates (name, rarity, boss_id, asset_type, metadata)
select
  'Arcane Codex of the First Sage',
  'legendary',
  sage_trial.id,
  'sprite',
  jsonb_build_object(
    'class',          'sage',
    'description',    'Carried by the one who broke the silence with a single thought. The crew that earns this speaks less and says more.',
    'sprite_ref',     'SageMage',
    'passive_bonus',  'Long messages deal 25% bonus arcane damage',
    'active_bonus',   'Deep Cut cooldown reduced by 30%',
    'visual', jsonb_build_object(
      'glow_color',       '#bf5fff',
      'frame_style',      'arcane',
      'particle_effect',  'arcane_orb',
      'rarity_color',     '#e8b4ff'
    ),
    'lore', 'Found in the ruins of a chat that once went 47 days without a single dry reply. The crew that left it behind is still out there. Somewhere.'
  )
from sage_trial;
