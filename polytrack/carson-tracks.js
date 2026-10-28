/* Carson Tracks extension for the PolyTrack selection screen. */
(() => {
  // Resolve assets from this script's own folder, not the page's possibly altered base URI.
  const SCRIPT_URL = document.currentScript?.src ||
    [...document.scripts].map(script => script.src).find(src => /carson-tracks\.js(?:\?|$)/.test(src)) ||
    location.href;
  const SITE_BASE = new URL("./", SCRIPT_URL);
  const MANIFEST = new URL("tracks/carson/manifest.json", SITE_BASE).href;
  const DIRECTORY_API = "https://api.github.com/repos/ineedsomemorelapeace/gamesplay/contents/polytrack/tracks/carson";
  const FORM = "https://forms.gle/yFXbuVSDimBbD9fz5";
  if (!document.querySelector("#carson-tracks-style")) {
    const style = document.createElement("style");
    style.id = "carson-tracks-style";
    style.textContent = `
      .button.carson { }
      .carson-tracks-container { display:none; width:100%; box-sizing:border-box; grid-column:1 / -1; }
      .carson-tracks-container.open { display:block; }
      .carson-tracks-container .carson-track-list { width:100%; box-sizing:border-box; }
      .tracks-container.carson-extension-hidden { display:none!important; }
      .carson-tracks-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:22px 4px 12px; border-bottom:4px solid rgba(180,198,232,.48); margin:0 4px 22px; }
      .carson-tracks-heading { margin:0; color:#f4f7ff; text-shadow:0 2px 3px rgba(0,0,0,.45); font-size:clamp(22px,2.2vw,34px); font-weight:700; line-height:1.2; }
      .carson-tracks-submit { display:inline-flex; align-items:center; justify-content:center; gap:9px; flex:0 0 auto; border:0; border-radius:0; min-height:42px; padding:7px 15px; color:#f7f8ff; background:#17254f; box-shadow:inset 0 0 0 1px rgba(190,210,255,.12); font:inherit; font-size:clamp(16px,1.6vw,24px); font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,.5); cursor:pointer; clip-path:polygon(8% 0,100% 0,92% 100%,0 100%); }
      .carson-tracks-submit::before { content:"⇧"; font-family:Arial,sans-serif; font-size:1.25em; line-height:1; }
      .carson-tracks-submit:hover { background:#263d78; }
      .carson-track-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:18px; padding:0 4px 24px; }
      .carson-track-empty { grid-column:1/-1; padding:16px 4px; font-size:16px; opacity:.85; }
      .carson-tracks-container .track { cursor:pointer; }
      .carson-track-list { grid-template-columns:repeat(5,minmax(0,1fr)); gap:16px 22px; }
      .carson-native-card { overflow:hidden; min-width:0; background:#142653; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.12); }
      .carson-native-title { min-height:36px; padding:7px 5px; display:flex; align-items:center; justify-content:center; text-align:center; overflow-wrap:anywhere; background:#222f60; color:#fff; font-size:clamp(14px,1.55vw,22px); font-weight:700; }
      .carson-native-preview { display:block; width:100%; height:clamp(150px,17vw,235px); padding:12px; border:0; background:#142653; cursor:pointer; }
      .carson-native-overhead { display:flex; width:100%; height:100%; align-items:center; justify-content:center; }
      .carson-native-overhead svg { width:100%; height:100%; filter:drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
      .carson-native-record { min-height:35px; padding:7px 4px; display:flex; align-items:center; justify-content:center; text-align:center; background:#222f60; color:#fff; font-size:clamp(13px,1.35vw,19px); font-weight:700; }
      @media(max-width:900px) { .carson-track-list { grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px 18px; } }
      @media(max-width:700px) { .carson-track-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .carson-native-preview { height:155px; } }
      @media(max-width:600px) { .carson-tracks-toolbar { align-items:flex-start; flex-wrap:wrap; } .carson-track-list { grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:10px; } }
    `;
    document.head.appendChild(style);
  }

  let installed = false;
  function install() {
    const oldButton = document.querySelector(".button.carson");
    const oldContainer = document.querySelector(".carson-tracks-container");
    if (installed && oldButton?.isConnected && oldContainer?.isConnected) return;
    installed = false;
    if (oldButton) oldButton.remove();
    if (oldContainer) oldContainer.remove();

    const official = document.querySelector(".button.official");
    const community = document.querySelector(".button.community");
    const custom = document.querySelector(".button.custom");
    const containers = [...document.querySelectorAll(".tracks-container:not(.carson-tracks-container)")];
    if (!community || !custom || containers.length < 1) return;
    // Anchor to the native Custom section; the game can expose a different number of containers during startup.
    const customContainer = containers[containers.length - 1];
    const tracksParent = customContainer.parentElement;
    const tabs = custom.parentElement;
    const button = official?.cloneNode(true) || document.createElement("button");
    button.className = "button carson";
    button.querySelector(".cover")?.remove();
    const label = button.querySelector("span, p, .title");
    if (label) label.textContent = "Carson Tracks";
    else button.textContent = "Carson Tracks";
    tabs.insertBefore(button, custom);

    const container = document.createElement("div");
    container.className = "tracks-container no-group-containers carson-tracks-container";
    // Keep Carson Tracks in the same shared track-list area as Official/Community/Custom.
    tracksParent.insertBefore(container, customContainer);
    const toolbar = document.createElement("div");
    toolbar.className = "carson-tracks-toolbar";
    const heading = document.createElement("h2");
    heading.className = "carson-tracks-heading";
    heading.textContent = "Carson Tracks";
    const submit = document.createElement("button");
    submit.className = "carson-tracks-submit";
    submit.textContent = "Add your own track!";
    submit.addEventListener("click", () => window.open(FORM, "_blank", "noopener"));
    toolbar.append(heading, submit);
    const list = document.createElement("div");
    list.className = "carson-track-list";
    container.append(toolbar, list);

    function showCarsonOnly() {
      document.querySelectorAll(".tracks-container:not(.carson-tracks-container)").forEach(c => c.classList.add("carson-extension-hidden"));
      container.classList.add("open");
    }
    function restoreNativeLists() {
      document.querySelectorAll(".tracks-container.carson-extension-hidden").forEach(c => c.classList.remove("carson-extension-hidden"));
      container.classList.remove("open");
    }
    button.addEventListener("click", () => {
      document.querySelectorAll(".button.official,.button.community,.button.custom,.button.carson").forEach(b => b.classList.toggle("selected", b === button));
      showCarsonOnly();
      loadTracks();
    });
    // Restore the game-owned list visibility whenever a native tab is selected.
    tabs.addEventListener("click", event => {
      const tab = event.target.closest(".button.official,.button.community,.button.custom,.button.carson");
      if (tab && tab !== button) restoreNativeLists();
    }, true);
    installed = true;

    let rendered = false;
    let preloadPromise = null;


    async function fetchWithRetry(url, options = {}, attempts = 2, timeoutMs = 9000) {
      let lastError;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response;
        } catch (error) {
          lastError = error;
          if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(1500 * (attempt + 1), 5000)));
        } finally {
          clearTimeout(timeout);
        }
      }
      throw new Error("Request failed after " + attempts + " attempts: " + (lastError?.message || "network error"));
    }

    async function downloadTrack(file) {
      const response = await fetchWithRetry(file.download_url, {}, 5);
      const code = (await response.text()).replace(/^\\uFEFF/, "").trim();
      if (!code) throw new Error("Track file is empty");
      return { file, code };
    }

    // Load the checked-in manifest first. GitHub's API is often rate-limited or blocked
    // by school filters, and is unnecessary for files hosted on the same GitHub Pages site.
    async function preloadTracks() {
      if (preloadPromise) return preloadPromise;
      preloadPromise = (async () => {
        // GitHub Pages cannot enumerate directories. Query the repository's live folder
        // first so adding a .track file requires no manifest or JavaScript edits.
        let files = [];
        try {
          const response = await fetchWithRetry(DIRECTORY_API + "?ref=main", {}, 1, 6000);
          const listing = await response.json();
          if (!Array.isArray(listing)) throw new Error("GitHub folder listing was not an array");
          files = listing
            .filter(entry => entry && entry.type === "file" &&
              typeof entry.name === "string" &&
              entry.name.toLowerCase().endsWith(".track") &&
              entry.name.toLowerCase() !== "a.track")
            .map(entry => ({
              name: entry.name,
              url: new URL("tracks/carson/" + entry.name.split("/").map(encodeURIComponent).join("/"), SITE_BASE).href
            }));
        } catch (apiError) {
          console.warn("Carson live directory lookup failed; trying manifest fallback:", apiError);
        }

        // The checked-in manifest remains a fallback for networks that block api.github.com.
        if (!files.length) {
          const manifestResponse = await fetchWithRetry(MANIFEST, {}, 2, 7000);
          const manifest = await manifestResponse.json();
          const entries = Array.isArray(manifest) ? manifest : manifest.tracks;
          if (!Array.isArray(entries)) throw new Error("Carson manifest has no tracks array");
          files = entries
            .map(entry => typeof entry === "string" ? { name: entry } : entry)
            .filter(file => file && typeof file.name === "string" &&
              file.name.toLowerCase().endsWith(".track") && file.name.toLowerCase() !== "a.track")
            .map(file => ({
              name: file.name,
              url: new URL("tracks/carson/" + file.name.split("/").map(encodeURIComponent).join("/"), SITE_BASE).href
            }));
        }

        // De-duplicate and sort consistently; no hard-coded track list or version ordering.
        const unique = new Map();
        for (const file of files) unique.set(file.name, file);
        files = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
        const results = await Promise.all(files.map(async file => {
          try {
            const response = await fetchWithRetry(file.url, {}, 2, 9000);
            const code = (await response.text()).replace(/^\\uFEFF/, "").trim();
            if (!code) throw new Error("empty response");
            if (!/^PolyTrack/i.test(code)) throw new Error("file is not a PolyTrack export");
            return { ok: true, value: { file, code } };
          } catch (error) {
            console.error("Carson track fetch failed:", file.name, file.url, error);
            return { ok: false, error: file.name + ": " + (error?.message || "fetch failed") };
          }
        }));
        return {
          tracks: results.filter(result => result.ok).map(result => result.value),
          failures: results.filter(result => !result.ok).map(result => result.error),
          fileCount: files.length
        };
      })().catch(error => {
        preloadPromise = null;
        throw error;
      });
      return preloadPromise;
    }

    async function loadTracks() {
      if (rendered) return;
      list.innerHTML = '<div class="carson-track-empty">Loading Carson tracks…</div>';
      try {
        const result = await preloadTracks();
        list.replaceChildren();
        if (!result.fileCount) {
          list.innerHTML = '<div class="carson-track-empty">No Carson tracks yet.</div>';
          rendered = true;
          return;
        }

        // Wait for PolyTrack's own parser and card renderer, exposed by main.bundle.js.
        // These are the same TrackData objects, thumbnails, selection callbacks, and record
        // handling used by Official/Community tracks; never fake a track object or use Import.
        const waitForNative = async () => {
          for (let attempt = 0; attempt < 120; attempt++) {
            // PolyTrack exposes its real export parser independently of the card renderer.
            // __carsonTrackParser is only assigned after the first native card is created,
            // so requiring that alias here can deadlock track loading on an empty list.
            if ((typeof window.__carsonParseTrack === "function" ||
                 typeof window.__carsonTrackParser?.fromExportString === "function") &&
                typeof window.__carsonTrackRender === "function") return;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error("Native PolyTrack track parser/renderer did not become available");
        };
        await waitForNative();

        let added = 0;
        const failures = [...result.failures];
        for (const item of result.tracks) {
          try {
            const parsed = typeof window.__carsonParseTrack === "function"
              ? window.__carsonParseTrack(item.code)
              : window.__carsonTrackParser.fromExportString(item.code);
            if (!parsed?.trackMetadata || !parsed?.trackData ||
                typeof parsed.trackData.getId !== "function" ||
                typeof parsed.trackData.createThumbnail !== "function") {
              throw new Error("PolyTrack rejected this track export");
            }

            // Preserve the native metadata/data instances. Only replace the displayed name
            // with the filename, so filenames control labels and duplicate embedded names
            // cannot overwrite each other's native records.
            const metadata = {
              ...parsed.trackMetadata,
              name: item.file.name.slice(0, -6).replace(/_/g, " ")
            };
            const before = list.childElementCount;
            window.__carsonTrackRender(
              metadata,
              parsed.trackData.environment,
              parsed.trackData,
              list
            );
            if (list.childElementCount <= before) throw new Error("Native track card was not created");
            added++;
          } catch (error) {
            console.error("Could not parse/render Carson track:", item.file.name, error);
            failures.push(item.file.name + ": " + (error?.message || "native rendering failed"));
          }
        }

        if (!added) {
          const details = failures.slice(0, 3).join(" • ") || "No valid track exports were found.";
          const message = document.createElement("div");
          message.className = "carson-track-empty";
          message.textContent = "Could not load Carson tracks. " + details + " Tap Carson Tracks to retry.";
          list.replaceChildren(message);
          rendered = false;
          return;
        }

        if (failures.length) {
          const note = document.createElement("div");
          note.className = "carson-track-empty";
          note.textContent = failures.length + " track file(s) could not be loaded.";
          list.appendChild(note);
        }
        rendered = true;
      } catch (error) {
        console.error("Could not load Carson tracks:", error);
        list.innerHTML = '<div class="carson-track-empty">Could not load Carson tracks: ' +
          String(error?.message || error || "unknown error").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
          '. Tap Carson Tracks to retry.</div>';
        rendered = false;
      }
    }

    // Reset stale UI after PolyTrack returns from gameplay. Re-render cached track data
    // into the current container; never depend on DOM nodes from the previous menu.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !container.isConnected) {
        installed = false;
        install();
      }
    });

    // Begin the network work during startup, not when Carson Tracks is opened.
    preloadTracks().catch(error => console.warn("Carson track preload will retry when opened:", error));
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  install();
})();