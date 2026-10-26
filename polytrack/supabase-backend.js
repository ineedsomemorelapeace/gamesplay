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
      this.__polyTrackLeaderboardRequest = isLeaderboardUrl(url);
      this.__polyTrackMethod = method;
      this.__polyTrackUrl = url;
      if (!this.__polyTrackIceRequest && !this.__polyTrackLeaderboardRequest) return super.open(method, url, ...rest);
    }
    send(body) {
      if (!this.__polyTrackIceRequest && !this.__polyTrackLeaderboardRequest) return super.send(body);
      const xhr = this;
      if (this.__polyTrackLeaderboardRequest) {
        Promise.resolve().then(async () => {
          try {
            const result = await handleLeaderboardRequest(this.__polyTrackUrl, this.__polyTrackMethod, bodyToText(body));
            const text = JSON.stringify(result.body);
            for (const [key, value] of Object.entries({
              readyState: 4, status: result.status, statusText: result.status === 200 ? "OK" : "Error",
              responseText: text, response: xhr.responseType === "json" ? result.body : text
            })) {
              try { Object.defineProperty(xhr, key, { configurable: true, value }); } catch {}
            }
            xhr.onreadystatechange?.();
            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.onload?.(new Event("load"));
            xhr.dispatchEvent(new Event("load"));
            xhr.onloadend?.(new Event("loadend"));
            xhr.dispatchEvent(new Event("loadend"));
          } catch (error) {
            console.error("PolyTrack Supabase leaderboard request failed:", error);
            for (const [key, value] of Object.entries({
              readyState: 4, status: 500, statusText: "Error", responseText: "{}", response: {}
            })) {
              try { Object.defineProperty(xhr, key, { configurable: true, value }); } catch {}
            }
            xhr.onreadystatechange?.();
            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.onerror?.(new Event("error"));
            xhr.dispatchEvent(new Event("error"));
            xhr.onloadend?.(new Event("loadend"));
            xhr.dispatchEvent(new Event("loadend"));
          }
        });
        return;
      }
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

  // Import local saved bests only when a stored replay can be matched to this exact track.
  // No guessed time is uploaded; a successful import is marked locally to prevent duplicates.
  const importedLocalBestKeys = new Set();
  const scannedLocalBestKeys = new Set();
  function collectLocalRecordCandidates(root, path, wanted, candidates) {
    const stack = [{ value: root, path, depth: 0 }];
    while (stack.length) {
      const item = stack.pop();
      if (!item.value || typeof item.value !== "object" || item.depth > 7) continue;
      const value = item.value;
      const frames = Number(value.frames ?? value.bestFrames ?? value.timeFrames);
      const replay = value.recording ?? value.replay;
      let identity = "";
      try { identity = JSON.stringify(value); } catch {}
      const matchesTrack = item.path.includes(wanted) || identity.includes(wanted);
      if (matchesTrack && Number.isFinite(frames) && frames > 0 && frames <= 5999999 &&
          typeof replay === "string" && replay.length > 0 && replay.length < 10000) {
        candidates.push({ frames, replay, name: value.name || value.playerName || "Anonymous", carColors: value.carColors || "" });
      }
      for (const [childKey, child] of Object.entries(value)) {
        if (child && typeof child === "object") stack.push({ value: child, path: item.path + "/" + childKey, depth: item.depth + 1 });
      }
    }
  }
  async function scanIndexedDbForLocalBest(wanted, candidates) {
    if (!window.indexedDB || typeof indexedDB.databases !== "function") return;
    let databases = [];
    try { databases = await indexedDB.databases(); } catch { return; }
    for (const info of databases) {
      if (!info.name) continue;
      let db;
      try {
        db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(info.name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("IndexedDB open blocked"));
        });
        for (const storeName of Array.from(db.objectStoreNames)) {
          const records = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const valuesRequest = store.getAll();
            const keysRequest = store.getAllKeys();
            tx.oncomplete = () => resolve({ values: valuesRequest.result || [], keys: keysRequest.result || [] });
            tx.onerror = () => reject(tx.error);
            valuesRequest.onerror = () => reject(valuesRequest.error);
            keysRequest.onerror = () => reject(keysRequest.error);
          });
          for (let i = 0; i < records.values.length; i++) {
            collectLocalRecordCandidates(
              records.values[i],
              info.name + "/" + storeName + "/" + String(records.keys[i] ?? i),
              wanted,
              candidates
            );
          }
        }
      } catch (error) {
        console.debug("Could not scan local PolyTrack database:", info.name, error);
      } finally {
        try { db?.close(); } catch {}
      }
    }
  }
  async function importLocalBestForTrack(trackId) {
    const wanted = String(trackId || "");
    if (!wanted) return;
    const marker = "polytrack-supabase-imported:" + slugify(wanted);
    if (importedLocalBestKeys.has(marker) || scannedLocalBestKeys.has(marker)) return;
    try { if (localStorage.getItem(marker)) { scannedLocalBestKeys.add(marker); return; } } catch {}
    scannedLocalBestKeys.add(marker);
    const candidates = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        let raw;
        try { raw = localStorage.getItem(key); } catch { continue; }
        if (!raw || (!key.includes(wanted) && !raw.includes(wanted))) continue;
        try { collectLocalRecordCandidates(JSON.parse(raw), key, wanted, candidates); } catch {}
      }
      await scanIndexedDbForLocalBest(wanted, candidates);
    } catch (error) { console.debug("Local PolyTrack record scan skipped:", error); }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.frames - b.frames);
    const best = candidates[0];
    try {
      const { error } = await client.from("polytrack_times").insert({
        track_slug: slugify(wanted), track_name: wanted.slice(0, 120),
        player_name: String(best.name || "Anonymous").slice(0, 40) || "Anonymous",
        time_ms: Math.round(best.frames * 1000 / 60), replay: best.replay,
        customization: {}, car_data: { carColors: /^[a-f0-9]{24}$/i.test(best.carColors) ? best.carColors : "ffffffffffffffffffffffff" },
        verification_status: "waiting"
      });
      if (error) throw error;
      importedLocalBestKeys.add(marker);
      try { localStorage.setItem(marker, "1"); } catch {}
      console.info("Imported saved PolyTrack personal best for", wanted);
    } catch (error) {
      scannedLocalBestKeys.delete(marker);
      console.warn("Could not import saved PolyTrack personal best:", error);
    }
  }

  // Bridge PolyTrack's legacy leaderboard API to Supabase.
  // The bridge accepts absolute and relative endpoint URLs and never requires a login.
  function isLeaderboardUrl(value) {
    try { return new URL(String(value), location.href).pathname.replace(/\/$/, "").endsWith("/leaderboard"); }
    catch { return false; }
  }

  function bodyToText(body) {
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body && typeof body === "object" && !(body instanceof FormData)) {
      try { return new URLSearchParams(body).toString(); } catch {}
    }
    return "";
  }

  async function handleLeaderboardRequest(url, method, bodyText = "") {
    const parsedUrl = new URL(String(url), location.href);
    const params = parsedUrl.searchParams;
    const methodUpper = String(method || "GET").toUpperCase();

    if (methodUpper === "GET") {
      const trackId = params.get("trackId");
      if (!trackId) return { status: 400, body: { error: "Missing trackId" } };
      await importLocalBestForTrack(trackId);
      const skip = Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0);
      const amount = Math.max(1, Math.min(100, Number.parseInt(params.get("amount") || "10", 10) || 10));
      const { data, error, count } = await client.from("polytrack_times")
        .select("id,track_slug,track_name,player_name,time_ms,car_data,verification_status,created_at", { count: "exact" })
        .eq("track_slug", slugify(trackId))
        // RLS exposes only pending + approved rows; rejected/fake rows are excluded server-side.
        .in("verification_status", ["waiting", "yes"])
        .order("time_ms", { ascending: true })
        .range(skip, skip + amount - 1);
      if (error) throw error;
      const entries = (data || []).map(row => ({
        id: Number(row.id) || 0,
        userId: "",
        name: row.player_name || "Anonymous",
        frames: Math.max(1, Math.round(Number(row.time_ms) * 60 / 1000)),
        carColors: /^[a-f0-9]{24}$/i.test(row.car_data?.carColors || "")
          ? row.car_data.carColors : "ffffffffffffffffffffffff"
      }));
      return { status: 200, body: { total: Number(count) || 0, entries } };
    }

    if (methodUpper === "POST") {
      const form = new URLSearchParams(bodyText);
      let payload = null;
      if (!form.has("trackId") && bodyText.trim().startsWith("{")) {
        try { payload = JSON.parse(bodyText); } catch {}
      }
      const get = key => form.has(key) ? form.get(key) : payload?.[key];
      const trackId = get("trackId");
      const frames = Number(get("frames"));
      const playerName = String(get("name") || "Anonymous").trim().slice(0, 40) || "Anonymous";
      const timeMs = Math.round(frames * 1000 / 60);
      if (!trackId || !Number.isFinite(frames) || frames <= 0 || frames > 5999999 ||
          !Number.isSafeInteger(timeMs) || timeMs <= 0 || timeMs >= 86400000) {
        return { status: 400, body: { error: "Invalid leaderboard submission" } };
      }
      const carColors = String(get("carColors") || "");
      const recording = get("recording");
      const { data, error } = await client.from("polytrack_times").insert({
        track_slug: slugify(trackId),
        track_name: String(trackId).slice(0, 120),
        player_name: playerName,
        time_ms: timeMs,
        replay: typeof recording === "string" && recording ? recording : null,
        customization: {},
        car_data: { carColors: /^[a-f0-9]{24}$/i.test(carColors) ? carColors : "ffffffffffffffffffffffff" },
        verification_status: "waiting"
      }).select("id").single();
      if (error) throw error;
      return { status: 200, body: Number(data.id) || null };
    }

    return { status: 405, body: { error: "Method not supported" } };
  }

  const NativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    if (url && isLeaderboardUrl(url)) {
      try {
        const method = init.method || input?.method || "GET";
        let body = bodyToText(init.body);
        if (!body && typeof Request !== "undefined" && input instanceof Request && method.toUpperCase() === "POST") {
          body = await input.clone().text();
        }
        const response = await handleLeaderboardRequest(url, method, body);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("PolyTrack Supabase leaderboard request failed:", error);
        return new Response(JSON.stringify({ error: error?.message || "Leaderboard request failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return NativeFetch(input, init);
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