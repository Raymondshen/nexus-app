-- Enable realtime for app_invites so InviteArsenal updates live when a code is claimed.
alter publication supabase_realtime add table app_invites;
