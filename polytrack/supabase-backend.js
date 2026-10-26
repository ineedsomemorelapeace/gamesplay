/* PolyTrack shared backend. Public client only; never expose a service-role key. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

(() => {
  const SUPABASE_URL = "https://dyomqhrsbyzcumxzvklw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_0B53LkSMv6sGOH7adiPjgQ_s99Vubpb";
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 20 } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const slugify = value => String(value || "unnamed-track")
    .normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "").slice(0, 80) || "unnamed_track";
  const makePeerId = () => "p_" + (crypto.randomUUID ? crypto.randomUUID() :
    Math.random().toString(36).slice(2) + Date.now().toString(36));

  const backend = {
    client,
    slugify,

    async submitTime({ trackName, timeMs, playerName = "Anonymous", replay = null,
      customization = {}, carData = {} }) {
      const name = String(trackName || "").trim().slice(0, 120);
      const ms = Math.round(Number(timeMs));
      if (!name || !Number.isFinite(ms) || ms <= 0 || ms >= 86400000) {
        throw new Error("Track name and a valid finish time are required.");
      }
      const result = await client.from("polytrack_times").insert({
        track_slug: slugify(name),
        track_name: name,
        player_name: String(playerName || "Anonymous").trim().slice(0, 40) || "Anonymous",
        time_ms: ms,
        replay: replay == null ? null : replay,
        customization: customization && typeof customization === "object" ? customization : {},
        car_data: carData && typeof carData === "object" ? carData : {},
        verification_status: "waiting"
      }).select("id,track_slug,track_name,player_name,time_ms,verification_status,created_at").single();
      if (result.error) throw result.error;
      return result.data;
    },

    // Public leaderboard calls default to verified results only.
    async getTimes(trackName, { verifiedOnly = true, limit = 100 } = {}) {
      let query = client.from("polytrack_times")
        .select("id,track_slug,track_name,player_name,time_ms,replay,customization,car_data,verification_status,created_at")
        .eq("track_slug", slugify(trackName))
        .order("time_ms", { ascending: true })
        .limit(Math.max(1, Math.min(500, Number(limit) || 100)));
      if (verifiedOnly) query = query.eq("verification_status", "yes");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getPendingReviews({ limit = 100 } = {}) {
      const { data, error } = await client.from("polytrack_times")
        .select("*").eq("verification_status", "waiting")
        .order("created_at", { ascending: true })
        .limit(Math.max(1, Math.min(500, Number(limit) || 100)));
      if (error) throw error;
      return data || [];
    },

    // Realtime signaling transport for the existing game's WebRTC implementation.
    // Caller must pass the current game's signal/peer handlers and send its existing
    // signaling payloads via sendSignal(); this does not replace game logic itself.
    async joinRoom(roomName, handlers = {}) {
      const room = slugify(roomName);
      const peerId = makePeerId();
      const channel = client.channel("polytrack-webrtc-" + room, {
        config: { broadcast: { self: false, ack: true } }
      });
      for (const event of ["signal", "peer-join", "peer-leave"]) {
        channel.on("broadcast", { event }, message => {
          const payload = message.payload || {};
          if (payload.peerId === peerId) return;
          try { handlers[event]?.(payload); }
          catch (error) { console.error("PolyTrack signaling handler failed:", error); }
        });
      }
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Supabase Realtime subscription timed out")), 12000);
        channel.subscribe(status => {
          if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout);
            reject(new Error("Could not join signaling room: " + status));
          }
        });
      });
      await channel.send({
        type: "broadcast", event: "peer-join",
        payload: { peerId, room, at: Date.now() }
      });
      let closed = false;
      return {
        peerId,
        room,
        sendSignal: payload => {
          if (closed) throw new Error("Signaling room is closed");
          return channel.send({
            type: "broadcast", event: "signal",
            payload: { peerId, room, message: payload, at: Date.now() }
          });
        },
        leave: async () => {
          if (closed) return;
          closed = true;
          await channel.send({
            type: "broadcast", event: "peer-leave",
            payload: { peerId, room, at: Date.now() }
          });
          await client.removeChannel(channel);
        }
      };
    }
  };

  window.polytrackBackend = backend;
  window.dispatchEvent(new CustomEvent("polytrack:backend-ready", { detail: { backend } }));

  // Dispatch this from the game when a run finishes. Never marks a result verified.
  window.addEventListener("polytrack:run-finished", async event => {
    try {
      const result = await backend.submitTime(event.detail || {});
      window.dispatchEvent(new CustomEvent("polytrack:time-saved", { detail: result }));
    } catch (error) {
      console.error("Could not save PolyTrack time:", error);
      window.dispatchEvent(new CustomEvent("polytrack:time-save-error", {
        detail: { message: error?.message || "Unknown save error" }
      }));
    }
  });
})();