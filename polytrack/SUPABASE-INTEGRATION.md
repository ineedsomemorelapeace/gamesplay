# PolyTrack Supabase backend

Project URL: `https://dyomqhrsbyzcumxzvklw.supabase.co`

## Multiplayer

`index.html` loads `supabase-backend.js` before `main.bundle.js`. The backend installs a compatibility bridge for the original PolyTrack 0.6 multiplayer signaling WebSockets. The game still uses its original multiplayer UI, WebRTC peer connections, data channels, simulation, and player synchronization. Invite creation and the exchange of offers, answers, and ICE candidates are relayed through Supabase Realtime broadcasts; the old signaling WebSocket and ICE-server endpoint are not used.

No Node.js server is required. Supabase Realtime is the signaling transport; the public Supabase key is intended for browser use. The bridge supplies public Google STUN servers. Some restrictive NAT/firewall combinations may require TURN relay service, so peer connectivity is not guaranteed on every network.

## Leaderboard data

The `public.polytrack_times` table stores submissions, replay data, customization, car data, and review status. New submissions are always `waiting`; approved times use `yes`, rejected/fake times use `no`. The anonymous Supabase role can read pending and approved rows and insert pending rows without an account. Rejected rows are hidden from public reads. Public clients cannot update review status or delete rows; records are retained unless an admin manually removes them.

The backend exposes:
- `window.polytrackBackend.submitTime({trackName,timeMs,playerName,replay,customization,carData})`
- `window.polytrackBackend.getTimes(trackName,{verifiedOnly:false})` (includes pending and approved times by default)
- `window.polytrackBackend.getPendingReviews()`

The legacy leaderboard API is intercepted for both reads and submissions. Submissions are stored as pending, and the leaderboard shows pending + approved records while hiding rejected records. Before returning the leaderboard, the bridge makes a best-effort scan of localStorage and IndexedDB for a saved replay/time matching that track and imports it once as pending. This only works when the browser's saved record contains a matching track identifier, frame count, and replay string. The optional `polytrack:run-finished` event remains available for integrations outside the legacy API.

## Admin review

Run the SQL in `supabase-admin-queries.sql` in Supabase Dashboard -> SQL Editor to inspect waiting submissions and approve or reject a row. Do not expose a service-role key or provide an unauthenticated admin page.
