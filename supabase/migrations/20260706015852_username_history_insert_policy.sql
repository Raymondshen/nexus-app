-- Lets a user record their own username-change history (updateUsername() in
-- profile/actions.ts inserts via the cookie-scoped client, not the service role).
create policy "username_history_insert_self"
  on username_history for insert
  to authenticated
  with check (user_id = auth.uid());
