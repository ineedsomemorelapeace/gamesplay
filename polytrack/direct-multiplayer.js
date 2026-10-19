/* PolyTrack direct multiplayer helper.
 * Peer-to-peer WebRTC mesh with copy/paste signaling codes. No room server.
 * The game bundle must call PolyTrackDirect.send(type, payload) and subscribe
 * to PolyTrackDirect.onMessage(callback) to route actual race state through it.
 */
(() => {
  "use strict";
  if (window.PolyTrackDirect) return;

  const peers = new Map();
  const listeners = new Set();
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
    channel.onmessage = e => {
      try {
        const packet = JSON.parse(e.data);
        emit(packet.type || "message", packet.data, id);
      } catch { /* Ignore malformed packets. */ }
    };
    pc.ondatachannel = e => {
      const p = peers.get(id);
      if (p && p.channel !== e.channel) {
        p.channel = e.channel;
        e.channel.onopen = () => emit("peer-joined", { name: p.name }, id);
        e.channel.onclose = () => { peers.delete(id); emit("peer-left", { name: p.name }, id); };
        e.channel.onmessage = ev => {
          try { const packet = JSON.parse(ev.data); emit(packet.type || "message", packet.data, id); } catch {}
        };
      }
    };
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
    const packet = JSON.stringify({ type, data, from: localName, at: Date.now() });
    let sent = 0;
    for (const p of peers.values()) {
      if (p.channel && p.channel.readyState === "open") { p.channel.send(packet); sent++; }
    }
    return sent;
  }
  function sendTo(peerId, type, data) {
    const p = peers.get(peerId);
    if (!p || !p.channel || p.channel.readyState !== "open") return false;
    p.channel.send(JSON.stringify({ type, data, from: localName, at: Date.now() }));
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

  function installPanel() {
    if (!document.body || document.getElementById("pt-direct-panel")) return;
    const style = document.createElement("style");
    style.textContent = `
      #pt-direct-launch{position:fixed;z-index:99990;right:14px;bottom:14px;border:1px solid #5c7cff;background:#151923;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px system-ui;box-shadow:0 6px 25px #0008}
      #pt-direct-panel{position:fixed;z-index:99999;inset:0;background:#07090de8;display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui;color:#f4f6ff}
      #pt-direct-panel *{box-sizing:border-box} #pt-direct-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:#151923;border:1px solid #343b50;border-radius:18px;padding:22px;box-shadow:0 20px 80px #000a}
      #pt-direct-card h2{margin:0 0 8px;font-size:22px} #pt-direct-card p{color:#b6bed2;line-height:1.45}
      #pt-direct-card label{display:block;margin:14px 0 6px;color:#cbd2e6}
      #pt-direct-card input,#pt-direct-card textarea{width:100%;background:#0b0e15;border:1px solid #394258;border-radius:9px;padding:11px;color:#fff;font:13px ui-monospace,monospace}
      #pt-direct-card textarea{min-height:90px;resize:vertical;overflow-wrap:anywhere}
      #pt-direct-card .pt-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
      #pt-direct-card button{border:1px solid #48536d;background:#242b3c;color:white;border-radius:9px;padding:10px 12px;font-weight:600}
      #pt-direct-card button.pt-primary{background:#536dfe;border-color:#536dfe} #pt-direct-status{white-space:pre-wrap;color:#bfcaff;margin-top:12px}
      #pt-direct-peers{padding:10px;background:#0b0e15;border-radius:9px;color:#cbd2e6;min-height:38px}
    `;
    document.head.appendChild(style);
    const launch = document.createElement("button");
    launch.id = "pt-direct-launch"; launch.textContent = "↗ Direct Multiplayer";
    launch.onclick = open;
    document.body.appendChild(launch);
    function open() {
      if (document.getElementById("pt-direct-panel")) return;
      const panel = document.createElement("div"); panel.id = "pt-direct-panel";
      panel.innerHTML = `<section id="pt-direct-card" role="dialog" aria-modal="true" aria-label="Direct multiplayer">
        <h2>PolyTrack · Direct Multiplayer</h2><p>Connect racers without a room server. Share codes privately. Every player can create an invite so groups can form a peer mesh.</p>
        <label for="pt-direct-name">Your racer name</label><input id="pt-direct-name" maxlength="24" value="Racer">
        <div class="pt-actions"><button class="pt-primary" id="pt-direct-create">Create invite code</button><button id="pt-direct-close">Close</button></div>
        <label for="pt-direct-code">Paste an invite code to join</label><textarea id="pt-direct-code" placeholder="PT-..."></textarea>
        <div class="pt-actions"><button class="pt-primary" id="pt-direct-join">Create answer code</button><button id="pt-direct-accept">Accept answer (invite creator)</button><button id="pt-direct-copy">Copy output</button></div>
        <label for="pt-direct-output">Your generated code</label><textarea id="pt-direct-output" readonly placeholder="Generated connection code appears here"></textarea>
        <label>Connected racers</label><div id="pt-direct-peers">No peer connections yet.</div><div id="pt-direct-status" role="status">Ready. Codes contain connection metadata; they do not contain gameplay data.</div>
        <p><small>For 3+ racers, each connected racer can create an invite and share it with the others. Direct WebRTC may fail on restrictive networks without a TURN relay. The game must route its race-state messages through this connection module for live races to synchronize.</small></p>
      </section>`;
      document.body.appendChild(panel);
      const $ = id => panel.querySelector("#pt-direct-" + id);
      const status = message => { $("status").textContent = message; };
      const refresh = () => {
        const list = window.PolyTrackDirect.getPeers();
        $("peers").textContent = list.length ? list.map(p => p.name + " — " + p.state).join("\n") : "No peer connections yet.";
      };
      $("name").onchange = () => PolyTrackDirect.setName($("name").value);
      $("name").oninput = () => PolyTrackDirect.setName($("name").value);
      $("close").onclick = () => panel.remove();
      $("create").onclick = async () => {
        try { PolyTrackDirect.setName($("name").value); status("Gathering network details…"); $("output").value = await PolyTrackDirect.createInvite(); status("Invite ready. Send it to one racer, then paste their answer code here and select Accept answer."); }
        catch (e) { status(e.message || String(e)); }
      };
      $("join").onclick = async () => {
        try { PolyTrackDirect.setName($("name").value); status("Creating peer answer…"); $("output").value = await PolyTrackDirect.answerInvite($("code").value); status("Answer ready. Send it back to the person who created the invite."); refresh(); }
        catch (e) { status(e.message || String(e)); }
      };
      $("accept").onclick = async () => {
        try { await PolyTrackDirect.acceptAnswer($("code").value); status("Answer accepted. Waiting for peer connection…"); refresh(); }
        catch (e) { status(e.message || String(e)); }
      };
      $("copy").onclick = async () => {
        try { await navigator.clipboard.writeText($("output").value); status("Code copied."); }
        catch { $("output").focus(); $("output").select(); status("Clipboard unavailable; code selected for copying."); }
      };
      PolyTrackDirect.onMessage(refresh);
      setInterval(() => { if (panel.isConnected) refresh(); }, 1500);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installPanel, { once: true });
  else installPanel();
})();