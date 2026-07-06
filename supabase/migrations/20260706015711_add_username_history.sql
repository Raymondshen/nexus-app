-- Records every past username so @mentions in old messages can resolve to a
-- crew member's current username at render time (mentions are stored as plain
-- @username text in messages.content, never a stable user id).
create table if not exists username_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  old_username text not null,
  changed_at timestamptz not null default now()
);

create index if not exists username_history_user_id_idx on username_history (user_id);
create index if not exists username_history_old_username_ci_idx on username_history (lower(old_username));

alter table username_history enable row level security;

-- Any signed-in user can read history (needed to resolve @mentions of any
-- crew member client-side); only the service role writes to it.
create policy "username_history_select_authenticated"
  on username_history for select
  to authenticated
  using (true);
