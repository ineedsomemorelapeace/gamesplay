# PolyTrack Supabase backend

Project URL: `https://dyomqhrsbyzcumxzvklw.supabase.co`

## Files and current status

- `supabase-backend.js`: Supabase database API and Realtime signaling-room helper.
- `supabase-test.html`: interactive test for database submissions and cross-tab Realtime signaling.
- `supabase-admin-queries.sql`: SQL for approving/rejecting submitted times.
- `index.html` already loads `supabase-backend.js` as a module.

## Test it

Open `supabase-test.html` from the deployed GitHub Pages site. Submit a test time; it must be stored as `waiting`. Open the test page in two tabs, join the same room name in both, and send a message from one tab. The other tab should receive it. Test times remain in the database until an admin reviews them.

## Finish-time event contract

When the game detects a completed run, dispatch:

```js
window.dispatchEvent(new CustomEvent("polytrack:run-finished", {
  detail: {
    trackName: "Summer 1",
    timeMs: 64231,
    playerName: "Anonymous",
    replay: null,
    customization: {},
    carData: {}
  }
}));
```

The helper stores the submission as `waiting`; players cannot approve their own times through the public client. The public leaderboard API defaults to verified-only results:

```js
const times = await window.polytrackBackend.getTimes("Summer 1");
```

## Important multiplayer integration status

The Realtime room helper is working as a signaling transport API, but the compiled `main.bundle.js` multiplayer code has not yet been changed to call it. Loading the helper alone does not replace PolyTrack's existing room assignment/signaling service. To preserve the original gameplay correctly, the existing multiplayer room/peer signaling calls inside the game need to be adapted to `joinRoom(roomName, handlers)`, `sendSignal(payload)`, and `leave()`, while leaving the game's WebRTC and simulation handlers intact.

## Admin review

Use `supabase-admin-queries.sql` from Supabase Dashboard -> SQL Editor to approve (`yes`) or reject (`no`) submissions. Records are retained; no public UPDATE or DELETE permission is granted. Do not expose a service-role key or create an unauthenticated admin page, since that would let anyone falsify leaderboard verification.
