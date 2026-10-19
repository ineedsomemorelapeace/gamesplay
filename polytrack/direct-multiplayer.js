/* PolyTrack serverless multiplayer bridge.
 * Replaces PolyTrack's host/join signaling WebSockets and ICE-server lookup
 * with manually exchanged, readable offer/answer codes. The original game
 * still owns the WebRTC data channels and race-state protocol.
 */
(() => {
  "use strict";
  if (window.PolyTrackDirect) return;

  const peers = new Map();
  const listeners = new Set();
  const seenPackets = new Set();
  let localName = "Racer";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const enc = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const dec = value => JSON.parse(decodeURIComponent(escape(atob(value.replace(/-/g, "+").replace(/_/g, "/")))));
  const short = value => value.match(/.{1,5}/g)?.join("-") || value;
  const normalize = value => value.trim().replace(/^PT\s*/i, "").replace(/[^A-Za-z0-9_-]/g, "").replace(/-/g, "");
  const readCode = code => {
    const raw = normalize(code);
    if (!raw || raw.length > 30000) throw new Error("That connection code is invalid.");
    try { return dec(raw); } catch { throw new Error("Code could not be read. Copy the entire code."); }
  };
  const makeCode = data => "PT-" + short(enc(data));

  function emit(type, data, peerId) {
    for (const fn of listeners) {
      try { fn({ type, data, peerId, peers: peers.size }); } catch (e) { console.error(e); }
    }
  }
  function wire(id, pc, channel, name) {
    peers.set(id, { pc, channel, name: name || "Racer" });
    const update = () => {
      const p = peers.get(id);
      if (p) p.name = name || p.name;
      emit("peer-state", { state: pc.connectionState, name: name || "Racer" }, id);
    };
    pc.onconnectionstatechange = update;
    channel.onopen = () => emit("peer-joined", { name: name || "Racer" }, id);
    channel.onclose = () => { peers.delete(id); emit("peer-left", { name: name || "Racer" }, id); };
    channel.onmessage = e => receivePacket(e.data, id);
    pc.ondatachannel = e => {
      const p = peers.get(id);
      if (p && p.channel !== e.channel) {
        p.channel = e.channel;
        e.channel.onopen = () => emit("peer-joined", { name: p.name }, id);
        e.channel.onclose = () => { peers.delete(id); emit("peer-left", { name: p.name }, id); };
        e.channel.onmessage = ev => receivePacket(ev.data, id);
      }
    };
  }
  function receivePacket(raw, fromPeerId) {
    try {
      const packet = JSON.parse(raw);
      if (!packet || typeof packet !== "object" || typeof packet.type !== "string") return;
      const packetId = packet.id || (packet.id = Math.random().toString(36).slice(2) + Date.now().toString(36));
      if (seenPackets.has(packetId)) return;
      seenPackets.add(packetId);
      if (seenPackets.size > 1500) seenPackets.clear();
      emit(packet.type || "message", packet.data, fromPeerId);
      const forwarded = JSON.stringify(packet);
      for (const [peerId, peer] of peers) {
        if (peerId !== fromPeerId && peer.channel && peer.channel.readyState === "open") {
          try { peer.channel.send(forwarded); } catch {}
        }
      }
    } catch { /* Ignore malformed packets. */ }
  }
  function rtc() {
    return new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }]
    });
  }
  async function gather(pc) {
    await new Promise((resolve, reject) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const timeout = setTimeout(() => reject(new Error("Network gathering timed out. Try again.")), 18000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function createInvite() {
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const pc = rtc();
    const channel = pc.createDataChannel("polytrack-direct", { ordered: true });
    wire(id, pc, channel, localName);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gather(pc);
    return makeCode({ v: 1, kind: "offer", id, name: localName, sdp: pc.localDescription });
  }
  async function answerInvite(code) {
    const invite = readCode(code);
    if (invite.v !== 1 || invite.kind !== "offer" || !invite.sdp || !invite.id) throw new Error("This isn't a PolyTrack invite code.");
    const pc = rtc();
    const id = invite.id + ":" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    pc.ondatachannel = e => {
      const channel = e.channel;
      wire(id, pc, channel, invite.name);
    };
    await pc.setRemoteDescription(invite.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gather(pc);
    return makeCode({ v: 1, kind: "answer", id: invite.id, name: localName, sdp: pc.localDescription });
  }
  async function acceptAnswer(code) {
    const answer = readCode(code);
    if (answer.v !== 1 || answer.kind !== "answer" || !answer.sdp || !answer.id) throw new Error("This isn't a PolyTrack answer code.");
    const entry = [...peers.entries()].find(([id, p]) => id === answer.id && p.pc.signalingState === "have-local-offer");
    if (!entry) throw new Error("No pending invite matches this answer. Create a fresh invite and try again.");
    await entry[1].pc.setRemoteDescription(answer.sdp);
    entry[1].name = answer.name || "Racer";
    return true;
  }
  function send(type, data) {
    const packetId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    seenPackets.add(packetId);
    const packet = JSON.stringify({ id: packetId, type, data, from: localName, at: Date.now() });
    let sent = 0;
    for (const p of peers.values()) {
      if (p.channel && p.channel.readyState === "open") { p.channel.send(packet); sent++; }
    }
    return sent;
  }
  function sendTo(peerId, type, data) {
    const p = peers.get(peerId);
    if (!p || !p.channel || p.channel.readyState !== "open") return false;
    const packetId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    seenPackets.add(packetId);
    p.channel.send(JSON.stringify({ id: packetId, type, data, from: localName, at: Date.now() }));
    return true;
  }
  function close() {
    for (const p of peers.values()) { try { p.pc.close(); } catch {} }
    peers.clear(); emit("closed", {});
  }
  window.PolyTrackDirect = {
    setName(name) { localName = String(name || "Racer").slice(0, 24); },
    createInvite, answerInvite, acceptAnswer, send, sendTo, close,
    onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getPeers() { return [...peers.entries()].map(([id, p]) => ({ id, name: p.name, state: p.pc.connectionState })); }
  };

  // Intercept only PolyTrack's multiplayer signaling endpoints. All other
  // networking remains untouched; room negotiation is exchanged as pasteable codes.
  const NativeWebSocket = window.WebSocket;
  const NativeXHR = window.XMLHttpRequest;
  const joinSockets = new Map();
  let hostSocket = null;
  let roomCode = null;
  let roomSession = null;
  let activeGuestId = null;
  let lastRtcPc = null;
  const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  const fireMessage = (socket, payload) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  function waitForIce(pc) {
    return new Promise(resolve => {
      if (!pc || pc.iceGatheringState === "complete") return resolve();
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        pc.removeEventListener("icegatheringstatechange", check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => { if (pc.iceGatheringState === "complete") done(); };
      const timer = setTimeout(done, 16000);
      pc.addEventListener("icegatheringstatechange", check);
    });
  }
  class PolyTrackCodeSocket extends EventTarget {
    constructor(role) {
      super();
      this.role = role;
      this.readyState = 0;
      this.currentGuestId = null;
      if (role === "host") hostSocket = this;
      setTimeout(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }, 0);
    }
    send(raw) {
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      if (this.role === "host" && data.type === "createInvite") {
        roomCode = "PTD" + randomId().replace(/-/g, "").slice(0, 8).toUpperCase();
        roomSession = randomId();
        setTimeout(() => fireMessage(this, { version: "0.6.0", type: "createInvite", inviteCode: roomCode, timeoutMilliseconds: null, censoredNickname: null, key: "direct" }), 0);
        showStatus("Direct room created. Share the room code shown by PolyTrack. No multiplayer server is used.");
        return;
      }
      if (this.role === "join" && data.inviteCode && data.offer) {
        const guestId = randomId();
        joinSockets.set(guestId, this);
        this.guestId = guestId;
        (async () => {
          await waitForIce(lastRtcPc);
          const offer = lastRtcPc && lastRtcPc.localDescription ? lastRtcPc.localDescription.sdp : data.offer;
          const code = makeCode({ v: 1, kind: "game-offer", roomCode: data.inviteCode, guestId, offer, nickname: data.nickname || "Racer", countryCode: data.countryCode ?? null, carStyle: data.carStyle || "" });
          setOutput(code);
          showStatus("Offer code generated. Send it to the room host; the host pastes it into this panel and forwards it to the game.");
        })().catch(e => showStatus("Could not prepare offer: " + (e.message || e)));
        return;
      }
      if (this.role === "host" && data.type === "acceptJoin") {
        const guestId = this.currentGuestId || activeGuestId;
        (async () => {
          await waitForIce(lastRtcPc);
          const answer = lastRtcPc && lastRtcPc.localDescription ? lastRtcPc.localDescription.sdp : data.answer;
          setOutput(makeCode({ v: 1, kind: "game-answer", roomCode, guestId, answer, mods: [], isModsVanillaCompatible: true, clientId: data.clientId, session: data.session }));
          showStatus("Answer code generated. Send it to the matching player who gave you the offer code.");
        })().catch(e => showStatus("Could not prepare answer: " + (e.message || e)));
        return;
      }
      // ICE candidates are embedded in the completed SDP codes, so trickle
      // candidate messages do not need to leave this browser.
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event("close")); }
  }
  window.WebSocket = class PolyTrackWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      const value = String(url);
      if (value.includes("/v6/multiplayer/host")) return new PolyTrackCodeSocket("host");
      if (value.includes("/v6/multiplayer/join")) return new PolyTrackCodeSocket("join");
      return protocols === undefined ? super(url) : super(url, protocols);
    }
  };
  const OriginalPeerConnection = window.RTCPeerConnection;
  if (OriginalPeerConnection) {
    window.RTCPeerConnection = class PolyTrackTrackedPeerConnection extends OriginalPeerConnection {
      constructor(...args) { super(...args); lastRtcPc = this; }
    };
  }
  // The stock game requests ICE servers from its backend. STUN is public and
  // the complete SDP is exchanged manually, so answer with an empty ICE list.
  window.XMLHttpRequest = class PolyTrackXHR extends NativeXHR {
    open(method, url, ...rest) {
      this.__ptLocalIce = String(url).includes("/v6/iceServers");
      if (!this.__ptLocalIce) return super.open(method, url, ...rest);
      this.__ptIceMethod = method;
      this.__ptIceUrl = url;
    }
    send(body) {
      if (!this.__ptLocalIce) return super.send(body);
      Object.defineProperty(this, "readyState", { configurable: true, get: () => 4 });
      Object.defineProperty(this, "status", { configurable: true, get: () => 200 });
      Object.defineProperty(this, "responseText", { configurable: true, get: () => '[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302","stun:stun2.l.google.com:19302"]}]' });
      setTimeout(() => this.onreadystatechange && this.onreadystatechange(), 0);
    }
  };
  function decodeGameCode(value) {
    const data = readCode(value);
    if (!data || data.v !== 1) throw new Error("That isn't a valid PolyTrack direct code.");
    return data;
  }
  let lastOutput = "";
  let lastStatus = "Ready. Create or join a room in PolyTrack, then reopen this panel to exchange codes.";
  function showStatus(message) {
    lastStatus = String(message);
    const node = document.getElementById("pt-direct-status");
    if (node) node.textContent = lastStatus;
  }
  function setOutput(value) {
    lastOutput = String(value || "");
    const node = document.getElementById("pt-direct-output");
    if (node) node.value = lastOutput;
  }
  function deliverOffer() {
    try {
      const code = decodeGameCode(document.getElementById("pt-direct-code").value);
      if (code.kind !== "game-offer") throw new Error("Paste a player's offer code here.");
      if (!hostSocket || !roomCode) throw new Error("Create a PolyTrack room first, then paste the offer here.");
      if (code.roomCode !== roomCode) throw new Error("This offer belongs to a different room code.");
      activeGuestId = code.guestId;
      hostSocket.currentGuestId = code.guestId;
      fireMessage(hostSocket, { version: "0.6.0", type: "joinInvite", session: roomSession, offer: code.offer, mods: [], isModsVanillaCompatible: true, nickname: code.nickname || "Racer", countryCode: code.countryCode ?? null, carStyle: code.carStyle || "" });
      showStatus("Offer delivered to PolyTrack. Wait for the answer code to appear here.");
    } catch (e) { showStatus(e.message || String(e)); }
  }
  function deliverAnswer() {
    try {
      const code = decodeGameCode(document.getElementById("pt-direct-code").value);
      if (code.kind !== "game-answer") throw new Error("Paste the host's answer code here.");
      const socket = joinSockets.get(code.guestId);
      if (!socket) throw new Error("This answer is for another player or this page's join attempt has expired.");
      fireMessage(socket, { version: "0.6.0", type: "acceptJoin", answer: code.answer, mods: code.mods || [], isModsVanillaCompatible: code.isModsVanillaCompatible !== false, clientId: code.clientId });
      showStatus("Answer delivered to PolyTrack. Waiting for the peer-to-peer connection to establish.");
    } catch (e) { showStatus(e.message || String(e)); }
  }
  function installPanel() {
    if (!document.body || document.getElementById("pt-direct-panel")) return;
    const style = document.createElement("style");
    style.textContent = [
      "#pt-direct-launch{position:fixed;z-index:99990;right:14px;bottom:14px;border:1px solid #5c7cff;background:#151923;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px system-ui;box-shadow:0 6px 25px #0008}",
      "#pt-direct-panel{position:fixed;z-index:99999;inset:0;background:#07090de8;display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui;color:#f4f6ff}",
      "#pt-direct-card{width:min(650px,100%);max-height:90vh;overflow:auto;background:#151923;border:1px solid #343b50;border-radius:18px;padding:22px;box-shadow:0 20px 80px #000a}",
      "#pt-direct-card h2{margin:0 0 8px;font-size:22px}#pt-direct-card p{color:#b6bed2;line-height:1.45}",
      "#pt-direct-card label{display:block;margin:14px 0 6px;color:#cbd2e6}",
      "#pt-direct-card textarea{width:100%;background:#0b0e15;border:1px solid #394258;border-radius:9px;padding:11px;color:#fff;font:12px ui-monospace,monospace;min-height:100px;resize:vertical;overflow-wrap:anywhere;box-sizing:border-box}",
      "#pt-direct-card .pt-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      "#pt-direct-card button{border:1px solid #48536d;background:#242b3c;color:white;border-radius:9px;padding:10px 12px;font-weight:600}",
      "#pt-direct-card button.pt-primary{background:#536dfe;border-color:#536dfe}#pt-direct-status{white-space:pre-wrap;color:#bfcaff;margin-top:12px}"
    ].join("\n");
    document.head.appendChild(style);
    const launch = document.createElement("button");
    launch.id = "pt-direct-launch"; launch.textContent = "↗ Direct Multiplayer Codes";
    launch.onclick = open;
    document.body.appendChild(launch);
    function open() {
      if (document.getElementById("pt-direct-panel")) return;
      const panel = document.createElement("div"); panel.id = "pt-direct-panel";
      panel.innerHTML = '<section id="pt-direct-card" role="dialog" aria-modal="true" aria-label="Direct multiplayer">' +
        '<h2>PolyTrack / Direct Connection</h2>' +
        '<p>Create or join a room using PolyTrack’s normal multiplayer menu. The host shares the room code. After a player joins, their connection code appears here automatically. Paste that code on the host screen; it is checked and forwarded automatically. The host must send the generated reply code back to that player to finish the direct connection.</p>' +
        '<div class="pt-actions"><button id="pt-direct-close">Close</button><button id="pt-direct-copy" class="pt-primary">Copy code</button></div>' +
        '<label for="pt-direct-code">Enter code from the other player</label><textarea id="pt-direct-code" placeholder="Paste a PolyTrack connection code here"></textarea>' +
        '<label for="pt-direct-output">Your connection code</label><textarea id="pt-direct-output" readonly placeholder="Your code appears here automatically"></textarea>' +
        '<div id="pt-direct-status" role="status">Ready. Host: create a room and share its room code. Player: join that room; your connection code will appear here.</div>' +
        '<p><small>Codes are exchanged manually because no signaling server is used. Each player needs one reply code from the host. Direct connections can still fail on restrictive networks without a TURN relay.</small></p>' +
        '</section>';
      document.body.appendChild(panel);
      const $ = id => panel.querySelector("#pt-direct-" + id);
      $("output").value = lastOutput;
      $("status").textContent = lastStatus;
      $("close").onclick = () => panel.remove();
      let inputTimer = null;
      const processCode = () => {
        const field = $("code");
        if (!field.value.trim()) return;
        try {
          const data = decodeGameCode(field.value);
          if (data.kind === "game-offer") deliverOffer();
          else if (data.kind === "game-answer") deliverAnswer();
          else showStatus("This code type is not used by the PolyTrack room bridge.");
        } catch (e) { if (field.value.trim().length > 80) showStatus(e.message || String(e)); }
      };
      $("code").addEventListener("paste", () => setTimeout(processCode, 80));
      $("code").addEventListener("input", () => { clearTimeout(inputTimer); inputTimer = setTimeout(processCode, 450); });
      $("copy").onclick = async () => {
        try { await navigator.clipboard.writeText($("output").value); showStatus("Code copied. Send it to the other player."); }
        catch { $("output").focus(); $("output").select(); showStatus("Clipboard unavailable; code selected for copying."); }
      };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installPanel, { once: true });
  else installPanel();
})();