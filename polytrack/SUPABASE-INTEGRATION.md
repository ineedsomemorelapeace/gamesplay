# PolyTrack Supabase backend

Project URL: `https://dyomqhrsbyzcumxzvklw.supabase.co`

## Multiplayer

`index.html` loads `supabase-backend.js` before `main.bundle.js`. The backend installs a compatibility bridge for the original PolyTrack 0.6 multiplayer signaling WebSockets. The game still uses its original multiplayer UI, WebRTC peer connections, data channels, simulation, and player synchronization. Invite creation and the exchange of offers, answers, and ICE candidates are relayed through Supabase Realtime broadcasts; the old signaling WebSocket and ICE-server endpoint are not used.

No Node.js server is required. Supabase Realtime is the signaling transport; the public Supabase key is intended for browser use. The bridge supplies public Google STUN servers. Some restrictive NAT/firewall combinations may require TURN relay service, so peer connectivity is not guaranteed on every network.

## Leaderboard data

The `public.polytrack_times` table stores submissions, replay JSON, customization, car data, and review status. New submissions are always `waiting`; approved times use `yes`, rejected times use `no`. Rows are not automatically deleted. The public browser client cannot update review status or delete rows.

The backend exposes:
- `window.polytrackBackend.submitTime({trackName,timeMs,playerName,replay,customization,carData})`
- `window.polytrackBackend.getTimes(trackName,{verifiedOnly:true})`
- `window.polytrackBackend.getPendingReviews()`

The game still needs to dispatch `polytrack:run-finished` with those values for finish times to be recorded; the multiplayer signaling bridge does not infer race finishes on its own.

## Admin review

Run the SQL in `supabase-admin-queries.sql` in Supabase Dashboard -> SQL Editor to inspect waiting submissions and approve or reject a row. Do not expose a service-role key or provide an unauthenticated admin page.
