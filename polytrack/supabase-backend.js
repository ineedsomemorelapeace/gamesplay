/* PolyTrack Supabase backend + compatibility bridge for the original 0.6 multiplayer.
   Signaling uses Supabase Realtime; WebRTC data channels/gameplay remain the original code.
   Never put a Supabase service-role key in browser code. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

(() => {
  const SUPABASE_URL = "https://dyomqhrsbyzcumxzvklw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_0B53LkSMv6sGOH7adiPjgQ_s99Vubpb";
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 30 } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const NativeWebSocket = window.WebSocket;
  const HOST_PATH = "/v6/multiplayer/host";
  const JOIN_PATH = "/v6/multiplayer/join";
  const BACKEND_HOST = "pt0-6-0b1-mp-backend.htmlpolytrack.workers.dev";
  const slugify = value => String(value || "unnamed-track").normalize("NFKD")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unnamed_track";
  const id = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const inviteCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)),
    n => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");

  async function openChannel(code, handlers, peerId) {
    const channel = client.channel("polytrack-mp-" + code, {
      config: { broadcast: { self: false, ack: true }, presence: { key: peerId } }
    });
    for (const [event, handler] of Object.entries(handlers)) {
      channel.on("broadcast", { event }, message => {
        try { handler(message.payload || {}); }
        catch (error) { console.error("PolyTrack signaling message error:", error); }
      });
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Supabase Realtime connection timed out")), 15000);
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer); reject(new Error("Supabase Realtime failed: " + status));
        }
      });
    });
    try { await channel.track({ peerId, role: handlers["join-request"] ? "host" : "player" }); } catch {}
    return channel;
  }

  class SupabaseSignalSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = 0;
      this.bufferedAmount = 0;
      this.extensions = "";
      this.protocol = "";
      this.binaryType = "blob";
      this.onopen = this.onmessage = this.onerror = this.onclose = null;
      this.role = this.url.includes(HOST_PATH) ? "host" : "join";
      this.peerId = id();
      this.code = null;
      this.channel = null;
      this.closed = false;
      this.sessionPeers = new Map();
      this.peerSessions = new Map();
      this.pendingJoinMessages = new Map();
      this.pendingSends = [];
      this.session = null;
      queueMicrotask(() => {
        if (this.closed) return;
        this.readyState = 1;
        this.emit("open");
      });
    }
    addEventListener(type, listener, options) { return super.addEventListener(type, listener, options); }
    removeEventListener(type, listener, options) { return super.removeEventListener(type, listener, options); }
    emit(type, data) {
      let event;
      if (type === "message") event = new MessageEvent(type, { data });
      else if (type === "close") event = new CloseEvent(type, { wasClean: true, code: 1000, reason: "" });
      else event = new Event(type);
      this.dispatchEvent(event);
      const handler = this["on" + type];
      if (typeof handler === "function") { try { handler.call(this, event); } catch (e) { console.error(e); } }
    }
    deliver(data) {
      if (this.closed) return;
      this.emit("message", JSON.stringify(data));
    }
    fail(error) {
      console.error("PolyTrack Supabase signaling:", error);
      if (!this.closed) this.deliver({ version: "0.6.0", type: "error", error: "ServerConnection" });
      this.close();
    }
    async setupHost(message) {
      if (this.channel) return;
      this.code = inviteCode();
      this.hostKey = message.key;
      this.channel = await openChannel(this.code, {
        "join-request": payload => this.receiveJoin(payload),
        "join-message": payload => this.receiveJoinMessage(payload)
      }, this.peerId);
      this.deliver({
        version: "0.6.0", type: "createInvite", inviteCode: this.code,
        key: typeof this.hostKey === "string" ? this.hostKey : "",
        timeoutMilliseconds: null, censoredNickname: null
      });
    }
    async setupJoin(message) {
      if (this.channel) return;
      this.code = String(message.inviteCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!this.code) throw new Error("Invite code is missing");
      this.channel = await openChannel(this.code, {
        "host-message": payload => {
          if (payload.to !== this.peerId) return;
          const data = payload.data || {};
          if (data.session) this.session = data.session;
          this.deliver(data);
        }
      }, this.peerId);
      await this.channel.send({
        type: "broadcast", event: "join-request",
        payload: { peerId: this.peerId, data: message, at: Date.now() }
      });
      for (const payload of this.pendingSends.splice(0)) await this.sendJoinMessage(payload);
    }
    async receiveJoin(payload) {
      if (this.role !== "host" || !payload.peerId || !payload.data) return;
      const data = payload.data;
      const session = id();
      this.sessionPeers.set(session, payload.peerId);
      this.peerSessions.set(payload.peerId, session);
      this.deliver({
        version: "0.6.0", type: "joinInvite", session,
        offer: data.offer, mods: Array.isArray(data.mods) ? data.mods : [],
        isModsVanillaCompatible: data.isModsVanillaCompatible !== false,
        nickname: typeof data.nickname === "string" ? data.nickname : "Player",
        countryCode: typeof data.countryCode === "string" ? data.countryCode : null,
        carStyle: data.carStyle ?? null
      });
      for (const queued of this.pendingJoinMessages.get(payload.peerId) || []) {
        this.deliver({ version: "0.6.0", type: "iceCandidate", session, candidate: queued.candidate });
      }
      this.pendingJoinMessages.delete(payload.peerId);
    }
    receiveJoinMessage(payload) {
      if (this.role !== "host" || !payload.peerId || !payload.data) return;
      const session = this.peerSessions.get(payload.peerId);
      if (!session) {
        const queued = this.pendingJoinMessages.get(payload.peerId) || [];
        queued.push(payload.data);
        this.pendingJoinMessages.set(payload.peerId, queued);
        return;
      }
      const data = payload.data;
      if (data.type === "joinDisconnect") {
        this.deliver({ version: "0.6.0", type: "joinDisconnect", session });
        this.peerSessions.delete(payload.peerId);
        this.sessionPeers.delete(session);
      } else {
        this.deliver({ version: "0.6.0", type: "iceCandidate", session, candidate: data.candidate ?? null });
      }
    }
    async sendJoinMessage(data) {
      if (!this.channel) { this.pendingSends.push(data); return; }
      await this.channel.send({
        type: "broadcast", event: "join-message",
        payload: { peerId: this.peerId, data, at: Date.now() }
      });
    }
    async send(data) {
      if (this.readyState !== 1 || this.closed) throw new Error("WebSocket is not open");
      let message;
      try { message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)); }
      catch { throw new Error("PolyTrack signaling message must be JSON"); }
      if (this.role === "host") {
        if (message.type === "createInvite") return this.setupHost(message).catch(e => this.fail(e));
        if (!this.channel) return this.fail(new Error("Host invite channel is not ready"));
        const session = message.session;
        const target = session ? this.sessionPeers.get(session) : null;
        if (!target) {
          if (message.type === "joinDisconnect") return;
          return;
        }
        return this.channel.send({
          type: "broadcast", event: "host-message",
          payload: { to: target, data: message, at: Date.now() }
        });
      }
      if (!this.channel) {
        if (message.inviteCode) {
          if (!this.code) this.code = String(message.inviteCode).toUpperCase().replace(/[^A-Z0-9]/g, "");
          return this.setupJoin(message).catch(e => this.fail(e));
        }
        if (this.code) { this.pendingSends.push(message); return; }
        return this.fail(new Error("Join invite code missing"));
      }
      return this.sendJoinMessage(message);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      const channel = this.channel;
      this.channel = null;
      if (channel && this.role === "join") {
        channel.send({
          type: "broadcast", event: "join-message",
          payload: { peerId: this.peerId, data: { type: "joinDisconnect" }, at: Date.now() }
        }).catch(() => {}).finally(() => client.removeChannel(channel).catch(() => {}));
      } else if (channel) {
        client.removeChannel(channel).catch(() => {});
      }
      this.emit("close");
    }
  }
  SupabaseSignalSocket.CONNECTING = 0;
  SupabaseSignalSocket.OPEN = 1;
  SupabaseSignalSocket.CLOSING = 2;
  SupabaseSignalSocket.CLOSED = 3;

  function PatchedWebSocket(url, protocols) {
    const value = String(url);
    if (value.includes(BACKEND_HOST) && (value.includes(HOST_PATH) || value.includes(JOIN_PATH))) {
      return new SupabaseSignalSocket(value);
    }
    return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
  }
  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    Object.defineProperty(PatchedWebSocket, key, { value: NativeWebSocket[key] });
  }
  window.WebSocket = PatchedWebSocket;

  // Keep ICE negotiation independent of the old backend's ICE-server endpoint.
  // Public STUN helps many peers connect; networks requiring TURN relay may still fail.
  const NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = class PolyTrackXHR extends NativeXHR {
    open(method, url, ...rest) {
      this.__polyTrackIceRequest = String(url).includes(BACKEND_HOST) && String(url).includes("/iceServers");
      if (!this.__polyTrackIceRequest) return super.open(method, url, ...rest);
      this.__polyTrackIceMethod = method;
      this.__polyTrackIceUrl = url;
    }
    send(body) {
      if (!this.__polyTrackIceRequest) return super.send(body);
      const xhr = this;
      queueMicrotask(() => {
        try {
          for (const [key, value] of Object.entries({
            readyState: 4, status: 200, statusText: "OK",
            responseText: JSON.stringify([{ urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302",
              "stun:stun2.l.google.com:19302"
            ] }])
          })) {
            try { Object.defineProperty(xhr, key, { configurable: true, value }); } catch {}
          }
          xhr.onreadystatechange?.();
          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.dispatchEvent(new Event("load"));
          xhr.dispatchEvent(new Event("loadend"));
        } catch (error) {
          console.error("Could not provide STUN settings:", error);
        }
      });
    }
  };

  const backend = {
    client, slugify,
    async submitTime({ trackName, timeMs, playerName = "Anonymous", replay = null, customization = {}, carData = {} }) {
      const name = String(trackName || "").trim().slice(0, 120);
      const ms = Math.round(Number(timeMs));
      if (!name || !Number.isFinite(ms) || ms <= 0 || ms >= 86400000) throw new Error("Track name and a valid finish time are required.");
      const { data, error } = await client.from("polytrack_times").insert({
        track_slug: slugify(name), track_name: name,
        player_name: String(playerName || "Anonymous").trim().slice(0, 40) || "Anonymous",
        time_ms: ms, replay, customization: customization && typeof customization === "object" ? customization : {},
        car_data: carData && typeof carData === "object" ? carData : {}, verification_status: "waiting"
      }).select("id,track_slug,track_name,player_name,time_ms,verification_status,created_at").single();
      if (error) throw error;
      return data;
    },
    async getTimes(trackName, { verifiedOnly = true, limit = 100 } = {}) {
      let query = client.from("polytrack_times").select("id,track_slug,track_name,player_name,time_ms,replay,customization,car_data,verification_status,created_at")
        .eq("track_slug", slugify(trackName)).order("time_ms", { ascending: true }).limit(Math.max(1, Math.min(500, Number(limit) || 100)));
      if (verifiedOnly) query = query.eq("verification_status", "yes");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    async getPendingReviews({ limit = 100 } = {}) {
      const { data, error } = await client.from("polytrack_times").select("*").eq("verification_status", "waiting")
        .order("created_at", { ascending: true }).limit(Math.max(1, Math.min(500, Number(limit) || 100)));
      if (error) throw error;
      return data || [];
    }
  };
  window.polytrackBackend = backend;
  window.dispatchEvent(new CustomEvent("polytrack:backend-ready", { detail: { backend } }));
  window.addEventListener("polytrack:run-finished", async event => {
    try {
      const result = await backend.submitTime(event.detail || {});
      window.dispatchEvent(new CustomEvent("polytrack:time-saved", { detail: result }));
    } catch (error) {
      console.error("Could not save PolyTrack time:", error);
      window.dispatchEvent(new CustomEvent("polytrack:time-save-error", { detail: { message: error?.message || "Unknown save error" } }));
    }
  });
})();