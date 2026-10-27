import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

(() => {
  const SUPABASE_URL = "https://dyomqhrsbyzcumxzvklw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_0B53LkSMv6sGOH7adiPjgQ_s99Vubpb";
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const style = document.createElement("style");
  style.textContent = `
    #pt-records-launch { position:fixed; z-index:2147483000; right:16px; bottom:16px; border:1px solid #454955; border-radius:10px; padding:11px 14px; background:#17191f; color:#fff; font:600 13px system-ui,sans-serif; cursor:pointer; box-shadow:0 4px 20px #0008; }
    #pt-records-panel { position:fixed; z-index:2147483001; right:16px; bottom:66px; width:min(440px,calc(100vw - 24px)); max-height:min(72vh,680px); display:none; flex-direction:column; overflow:hidden; border:1px solid #414652; border-radius:12px; background:#17191f; color:#f4f5f7; font:13px system-ui,sans-serif; box-shadow:0 12px 42px #000a; }
    #pt-records-panel * { box-sizing:border-box; }
    #pt-records-panel .pt-head { display:flex; align-items:center; gap:8px; padding:12px; border-bottom:1px solid #353943; }
    #pt-records-panel .pt-title { font-size:15px; font-weight:700; flex:1; }
    #pt-records-panel button, #pt-records-panel select { border:1px solid #454955; border-radius:7px; background:#242730; color:#f4f5f7; padding:7px 9px; font:inherit; cursor:pointer; }
    #pt-records-panel .pt-controls { display:flex; gap:8px; padding:10px 12px; border-bottom:1px solid #353943; }
    #pt-records-track { min-width:0; flex:1; }
    #pt-records-status { padding:8px 12px; color:#b7bdc8; border-bottom:1px solid #353943; }
    #pt-records-list { overflow:auto; padding:6px 10px 10px; }
    #pt-records-list .pt-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; padding:10px 3px; border-bottom:1px solid #30343d; }
    #pt-records-list .pt-name { min-width:0; overflow-wrap:anywhere; font-weight:650; }
    #pt-records-list .pt-time { font-variant-numeric:tabular-nums; font-weight:700; }
    #pt-records-list .pt-meta { color:#aeb5c1; font-size:11px; }
    #pt-records-list .pt-state { justify-self:end; font-size:10px; border:1px solid #555c68; border-radius:5px; padding:2px 5px; color:#d6dbe4; }
    #pt-records-list .pt-empty { padding:22px 8px; text-align:center; color:#b7bdc8; }
    @media(max-width:520px) { #pt-records-launch { right:10px; bottom:10px; } #pt-records-panel { right:8px; bottom:58px; max-height:75vh; width:calc(100vw - 16px); } }
  `;
  document.head.appendChild(style);

  const launch = document.createElement("button");
  launch.id = "pt-records-launch";
  launch.type = "button";
  launch.textContent = "Supabase Records";
  launch.setAttribute("aria-expanded", "false");

  const panel = document.createElement("section");
  panel.id = "pt-records-panel";
  panel.setAttribute("aria-label", "Supabase leaderboard records");
  panel.innerHTML = `
    <div class="pt-head"><div class="pt-title">Saved PolyTrack records</div><button type="button" id="pt-records-refresh">Refresh</button><button type="button" id="pt-records-close" aria-label="Close">✕</button></div>
    <div class="pt-controls"><select id="pt-records-track" aria-label="Filter by track"><option value="">All tracks</option></select></div>
    <div id="pt-records-status">Loading saved records…</div>
    <div id="pt-records-list" role="list"></div>
  `;
  const status = panel.querySelector("#pt-records-status");
  const list = panel.querySelector("#pt-records-list");
  const trackSelect = panel.querySelector("#pt-records-track");
  let records = [];
  let busy = false;

  const trackLabel = row => {
    const name = String(row.track_name || "").trim();
    if (name && !/^[a-f0-9]{64}$/i.test(name)) return name.replace(/[_-]+/g, " ");
    const slug = String(row.track_slug || name || "unknown");
    return /^[a-f0-9]{64}$/i.test(slug) ? "Track " + slug.slice(0, 8) : slug.replace(/[_-]+/g, " ");
  };
  const timeLabel = ms => {
    const seconds = Math.max(0, Number(ms) || 0) / 1000;
    const minutes = Math.floor(seconds / 60);
    return minutes ? minutes + ":" + (seconds % 60).toFixed(3).padStart(6, "0") : seconds.toFixed(3) + "s";
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };

  function render() {
    const selected = trackSelect.value;
    const shown = records.filter(row => !selected || row.track_slug === selected);
    list.replaceChildren();
    if (!shown.length) {
      list.append(el("div", "pt-empty", selected ? "No records found for this track." : "No records have been saved yet."));
      status.textContent = records.length ? "0 records for this track" : "0 saved records";
      return;
    }
    status.textContent = shown.length + " record" + (shown.length === 1 ? "" : "s") + " · includes pending review";
    for (const row of shown) {
      const item = el("div", "pt-row");
      item.setAttribute("role", "listitem");
      const who = el("div", "pt-name", row.player_name || "Anonymous");
      const time = el("div", "pt-time", timeLabel(row.time_ms));
      const meta = el("div", "pt-meta", trackLabel(row) + " · #" + row.id);
      const state = el("div", "pt-state", row.verification_status === "yes" ? "APPROVED" : row.verification_status === "no" ? "REJECTED" : "PENDING");
      item.append(who, time, meta, state);
      list.append(item);
    }
  }

  async function loadRecords() {
    if (busy) return;
    busy = true;
    status.textContent = "Loading saved records…";
    try {
      const { data, error } = await client.from("polytrack_times")
        .select("id,track_slug,track_name,player_name,time_ms,verification_status,created_at")
        .in("verification_status", ["waiting", "yes"])
        .order("time_ms", { ascending: true })
        .range(0, 999);
      if (error) throw error;
      records = data || [];
      const current = trackSelect.value;
      const tracks = new Map();
      for (const row of records) if (!tracks.has(row.track_slug)) tracks.set(row.track_slug, trackLabel(row));
      trackSelect.replaceChildren();
      trackSelect.append(new Option("All tracks", ""));
      for (const [slug, label] of [...tracks.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
        trackSelect.append(new Option(label, slug));
      }
      if ([...tracks.keys()].includes(current)) trackSelect.value = current;
      render();
      if (!records.length) status.textContent = "Connected, but no visible records were returned.";
    } catch (error) {
      console.error("Could not load Supabase records list:", error);
      records = [];
      list.replaceChildren(el("div", "pt-empty", "Could not load records. Open the browser console for the exact error, then press Refresh to retry."));
      status.textContent = "Load failed: " + String(error?.message || error).slice(0, 180);
    } finally {
      busy = false;
    }
  }

  function toggle(open) {
    const shouldOpen = open ?? panel.style.display !== "flex";
    panel.style.display = shouldOpen ? "flex" : "none";
    launch.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) loadRecords();
  }
  launch.addEventListener("click", () => toggle());
  panel.querySelector("#pt-records-close").addEventListener("click", () => toggle(false));
  panel.querySelector("#pt-records-refresh").addEventListener("click", loadRecords);
  trackSelect.addEventListener("change", render);

  function mount() {
    if (!document.body || document.getElementById("pt-records-launch")) return;
    document.body.append(launch, panel);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  console.info("PolyTrack direct Supabase records list initialized.");
})();
