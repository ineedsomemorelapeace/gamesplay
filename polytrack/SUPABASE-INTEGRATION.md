# PolyTrack Supabase backend

Project URL: `https://dyomqhrsbyzcumxzvklw.supabase.co`

## Enable the client helper

In `polytrack/index.html`, add this line after the existing `main.bundle.js` script and before `carson-tracks.js`:

```html
<script type="module" src="supabase-backend.js"></script>
```

It must be `type="module"` because it imports Supabase JS. After the page reloads, the helper is available as `window.polytrackBackend`.

## Save a finish time (integration hook)

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

The helper stores submissions as `waiting`; it never approves a player's own submission. To read only approved times, call `window.polytrackBackend.getTimes("Summer 1", { verifiedOnly: true })`.

## Multiplayer signaling API

`window.polytrackBackend.joinRoom(roomName, handlers)` subscribes to a Supabase Realtime broadcast channel and returns `sendSignal(payload)` and `leave()`. This is signaling transport only: the existing game's multiplayer code must call it when its old room assignment/signaling client is created. Merely loading this file does not automatically replace the compiled game's current signaling backend.

The multiplayer transport needs the game code to send its existing signaling messages through `sendSignal` and process incoming `signal` messages using its existing WebRTC logic. Keep the game's current simulation, player synchronization, and UI unchanged.

## Admin review

Use the SQL snippets in `supabase-admin-queries.sql` from Supabase Dashboard -> SQL Editor to approve or reject submissions. Rejected and approved rows are retained. Do not expose a service-role key or create an unauthenticated admin page; that would let anyone falsify leaderboard verification.
