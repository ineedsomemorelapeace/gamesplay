-- CarsonGames PolyTrack leaderboard: admin review queries
-- Run these in Supabase Dashboard -> SQL Editor.
-- Public players can INSERT only with verification_status='waiting'.
-- There is deliberately no public UPDATE/DELETE policy.

-- Pending submissions, oldest first:
select id, track_name, player_name, time_ms, created_at, replay, customization, car_data
from public.polytrack_times
where verification_status = 'waiting'
order by created_at asc;

-- Approve one submission (replace 123 with its id):
update public.polytrack_times
set verification_status = 'yes'
where id = 123 and verification_status = 'waiting';

-- Reject one submission (records are retained, never deleted):
update public.polytrack_times
set verification_status = 'no'
where id = 123 and verification_status = 'waiting';

-- Verified leaderboard for one track (replace summer_1):
select player_name, time_ms, replay, customization, car_data, created_at
from public.polytrack_times
where track_slug = 'summer_1' and verification_status = 'yes'
order by time_ms asc
limit 100;
