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
      .carson-track-list { grid-template-columns:repeat(4,minmax(0,1fr)); gap:22px 28px; }
      .carson-native-card { overflow:hidden; min-width:0; background:#142653; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.12); }
      .carson-native-title { min-height:36px; padding:7px 5px; display:flex; align-items:center; justify-content:center; text-align:center; overflow-wrap:anywhere; background:#222f60; color:#fff; font-size:clamp(14px,1.55vw,22px); font-weight:700; }
      .carson-native-preview { display:block; width:100%; height:clamp(150px,17vw,235px); padding:12px; border:0; background:#142653; cursor:pointer; }
      .carson-native-overhead { display:flex; width:100%; height:100%; align-items:center; justify-content:center; }
      .carson-native-overhead svg { width:100%; height:100%; filter:drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
      .carson-native-record { min-height:35px; padding:7px 4px; display:flex; align-items:center; justify-content:center; text-align:center; background:#222f60; color:#fff; font-size:clamp(13px,1.35vw,19px); font-weight:700; }
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

    async function openNativeImporter(code) {
      // Use PolyTrack's own importer/parser so cards remain compatible with the game's
      // current track classes instead of constructing incomplete track objects ourselves.
      const visible = element => !!(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const buttons = [...document.querySelectorAll("button,[role=button],.button")].filter(visible);
      let importButton = buttons.find(el => /import(?:\s+track)?/i.test((el.innerText || el.textContent || "").trim()));
      if (!importButton) throw new Error("PolyTrack Import button not found");
      importButton.click();
      await new Promise(resolve => setTimeout(resolve, 350));
      const fields = [...document.querySelectorAll("textarea,input,[contenteditable=true]")].filter(visible);
      const field = fields.find(el => /track|code|paste|import/i.test((el.placeholder || "") + " " + (el.getAttribute("aria-label") || ""))) || fields.find(el => el.tagName === "TEXTAREA") || fields[fields.length - 1];
      if (!field) throw new Error("PolyTrack import field not found");
      if (field.isContentEditable) field.textContent = code;
      else {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
        if (setter) setter.call(field, code); else field.value = code;
      }
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 150));
      const dialog = field.closest('[role=dialog],.modal,.popup') || document;
      const actions = [...dialog.querySelectorAll("button,[role=button],.button")].filter(visible);
      const submit = actions.find(el => el !== importButton && /^(import|load|open|confirm)(\s+track)?$/i.test((el.innerText || el.textContent || "").trim()));
      if (!submit) throw new Error("Import field filled; confirmation button not found");
      submit.click();
    }

    async function fetchWithRetry(url, options = {}, attempts = 4) {
      let lastError;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
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
        const manifestResponse = await fetchWithRetry(MANIFEST, {}, 3);
        const manifest = await manifestResponse.json();
        const entries = Array.isArray(manifest) ? manifest : manifest.tracks;
        if (!Array.isArray(entries)) throw new Error("Carson manifest has no tracks array");

        const files = entries
          .map(entry => typeof entry === "string" ? { name: entry } : entry)
          .filter(file => file && typeof file.name === "string" &&
            file.name.toLowerCase().endsWith(".track") && file.name.toLowerCase() !== "a.track")
          .map(file => ({
            name: file.name,
            // Encode each path segment only; keep the URL rooted at this deployed PolyTrack folder.
            url: new URL("tracks/carson/" + encodeURIComponent(file.name), SITE_BASE).href
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!files.length) return { tracks: [], failures: [], fileCount: 0 };
        const results = await Promise.all(files.map(async file => {
          try {
            const response = await fetchWithRetry(file.url, {}, 3);
            const code = (await response.text()).replace(/^\\uFEFF/, "").trim();
            if (!code) throw new Error("empty response");
            if (!/^(PolyTrack|v3)/.test(code)) throw new Error("response is not a PolyTrack export");
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
      if (rendered) return; // Successful list stays cached; switching tabs never re-downloads or duplicates cards.
      list.innerHTML = '<div class="carson-track-empty">Loading Carson tracks…</div>';
      try {
        const result = await preloadTracks();
        list.replaceChildren();
        if (!result.fileCount) {
          list.innerHTML = '<div class="carson-track-empty">No Carson tracks yet.</div>';
          rendered = true;
          return;
        }

        // Use the same compact title / overhead-preview / record layout as native track cards.
        // Keep records scoped to Carson Tracks so these tracks never get added to Custom Tracks.
        const recordKey = item => "carson-track-record:" + item.file.name;
        for (const item of result.tracks) {
          const name = item.file.name.slice(0, -6).replace(/_/g, " ");
          const card = document.createElement("article");
          card.className = "track carson-native-card";
          const title = document.createElement("div");
          title.className = "carson-native-title";
          title.textContent = name;
          const preview = document.createElement("button");
          preview.type = "button";
          preview.className = "carson-native-preview";
          preview.setAttribute("aria-label", "Play " + name);
          const graphic = document.createElement("div");
          graphic.className = "carson-native-overhead";
          // Derive a stable overhead-style path from the track export, not a random icon.
          // The official TrackData thumbnail API is private in this build, so this is a deterministic
          // fallback preview rather than pretending the native renderer was available.
          let seed = 2166136261;
          for (let i = 0; i < item.code.length; i++) seed = Math.imul(seed ^ item.code.charCodeAt(i), 16777619) >>> 0;
          const points = [];
          for (let i = 0; i < 28; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const px = 12 + (seed % 76);
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const py = 12 + (seed % 76);
            points.push(px + "," + py);
          }
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 100 100");
          svg.setAttribute("role", "img");
          svg.setAttribute("aria-label", name + " track preview");
          const path = document.createElementNS(svg.namespaceURI, "polyline");
          path.setAttribute("points", points.join(" "));
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "#fff");
          path.setAttribute("stroke-width", "3.5");
          path.setAttribute("stroke-linecap", "square");
          path.setAttribute("stroke-linejoin", "miter");
          svg.appendChild(path);
          graphic.appendChild(svg);
          preview.appendChild(graphic);
          const record = document.createElement("div");
          record.className = "carson-native-record";
          record.textContent = localStorage.getItem(recordKey(item)) || "No record";
          preview.addEventListener("click", async () => {
            preview.disabled = true;
            record.textContent = "Loading…";
            try {
              await openNativeImporter(item.code);
              record.textContent = "Ready to play";
            } catch (error) {
              console.error("Could not open Carson track:", item.file.name, error);
              record.textContent = "Tap to retry";
            } finally { preview.disabled = false; }
          });
          card.append(title, preview, record);
          list.appendChild(card);
        }

        if (!list.children.length) {
          const details = result.failures.length ? result.failures.slice(0, 3).join(" • ") : "No track cards were created.";
          list.innerHTML = '<div class="carson-track-empty">Could not load any Carson tracks. ' +
            details.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
            '</div>';
        } else if (result.failures.length) {
          const note = document.createElement("div");
          note.className = "carson-track-empty";
          note.textContent = result.failures.length + " track file(s) could not be loaded.";
          list.appendChild(note);
        }
        rendered = result.tracks.length > 0;
      } catch (error) {
        console.error("Could not load Carson tracks:", error);
        list.innerHTML = '<div class="carson-track-empty">Could not load Carson tracks: ' + String(error?.message || error || "unknown error").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '. Tap Carson Tracks to retry.</div>';
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