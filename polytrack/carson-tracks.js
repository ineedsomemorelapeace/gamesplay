/* Carson Tracks extension for the PolyTrack selection screen. */
(() => {
  // GitHub's API is used only to discover filenames. Actual track contents are fetched
  // from this GitHub Pages origin, avoiding raw.githubusercontent.com (blocked by Securely).
  const API = "https://api.github.com/repos/ineedsomemorelapeace/gamesplay/contents/polytrack/tracks/carson";
  const FORM = "https://forms.gle/yFXbuVSDimBbD9fz5";
  if (!document.querySelector("#carson-tracks-style")) {
    const style = document.createElement("style");
    style.id = "carson-tracks-style";
    style.textContent = `
      .button.carson { position:relative; background-size:cover; background-position:center; }
      .button.carson .cover { position:absolute; inset:0; background-size:cover!important; background-position:center!important; }
      .button.carson > span { position:relative; z-index:1; }
      .carson-tracks-container { display:none; width:100%; box-sizing:border-box; grid-column:1 / -1; }
      .carson-tracks-container.open { display:block; }
      .carson-tracks-container .carson-track-list { width:100%; box-sizing:border-box; }
      .carson-tracks-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:22px 4px 12px; border-bottom:4px solid rgba(180,198,232,.48); margin:0 4px 22px; }
      .carson-tracks-heading { margin:0; color:#f4f7ff; text-shadow:0 2px 3px rgba(0,0,0,.45); font-size:clamp(22px,2.2vw,34px); font-weight:700; line-height:1.2; }
      .carson-tracks-submit { display:inline-flex; align-items:center; justify-content:center; gap:9px; flex:0 0 auto; border:0; border-radius:0; min-height:42px; padding:7px 15px; color:#f7f8ff; background:#17254f; box-shadow:inset 0 0 0 1px rgba(190,210,255,.12); font:inherit; font-size:clamp(16px,1.6vw,24px); font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,.5); cursor:pointer; clip-path:polygon(8% 0,100% 0,92% 100%,0 100%); }
      .carson-tracks-submit::before { content:"⇧"; font-family:Arial,sans-serif; font-size:1.25em; line-height:1; }
      .carson-tracks-submit:hover { background:#263d78; }
      .carson-track-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:18px; padding:0 4px 24px; }
      .carson-track-empty { grid-column:1/-1; padding:16px 4px; font-size:16px; opacity:.85; }
      .carson-tracks-container .track { cursor:pointer; }
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

    const community = document.querySelector(".button.community");
    const custom = document.querySelector(".button.custom");
    const containers = [...document.querySelectorAll(".tracks-container:not(.carson-tracks-container)")];
    if (!community || !custom || containers.length < 1) return;
    // Anchor to the native Custom section; the game can expose a different number of containers during startup.
    const customContainer = containers[containers.length - 1];
    const tracksParent = customContainer.parentElement;
    const tabs = custom.parentElement;
    const button = document.createElement("button");
    button.className = "button carson";
    button.innerHTML = '<span>Carson Tracks</span>';
    const cover = document.createElement("div");
    cover.className = "cover";
    const official = document.querySelector(".button.official");
    const officialCover = official && official.querySelector(".cover");
    if (officialCover) {
      const cs = getComputedStyle(officialCover);
      cover.style.backgroundImage = cs.backgroundImage;
      cover.style.backgroundPosition = cs.backgroundPosition;
      cover.style.backgroundSize = cs.backgroundSize;
    } else if (official) {
      const cs = getComputedStyle(official);
      button.style.backgroundImage = cs.backgroundImage;
      button.style.backgroundPosition = cs.backgroundPosition;
      button.style.backgroundSize = cs.backgroundSize;
    }
    button.prepend(cover);
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

    button.addEventListener("click", () => {
      document.querySelectorAll(".button.official,.button.community,.button.custom,.button.carson").forEach(b => b.classList.toggle("selected", b === button));
      document.querySelectorAll(".tracks-container").forEach(c => c.classList.toggle("open", c === container));
      loadTracks();
    });
    // Delegate tab changes so returning from gameplay/recreated menus cannot leave stale handlers.
    tabs.addEventListener("click", event => {
      const tab = event.target.closest(".button.official,.button.community,.button.custom,.button.carson");
      if (!tab) return;
      if (tab !== button) container.classList.remove("open");
    });
    installed = true;

    let rendered = false;
    let preloadPromise = null;

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
      const exported = (await response.text()).replace(/^\\uFEFF/, "").trim();
      if (!exported) throw new Error("Track file is empty");

      const parsed = window.__carsonParseTrack(exported);
      if (!parsed || !parsed.trackMetadata || !parsed.trackData) {
        throw new Error("PolyTrack did not recognize this export format");
      }

      const name = file.name.replace(/\\.track$/i, "").replace(/_/g, " ");
      try { parsed.trackMetadata.name = name; } catch (_) {}
      const stableName = file.name.replace(/\\.track$/i, "").normalize("NFKD").toLowerCase()
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const stableId = "carson-" + (stableName || "unnamed-track");
      try {
        Object.defineProperty(parsed.trackData, "getId", { configurable: true, value: () => stableId });
      } catch (_) {
        try { parsed.trackData.getId = () => stableId; } catch (_) {}
      }
      if (typeof parsed.trackData.getId !== "function" ||
          typeof parsed.trackData.createThumbnail !== "function") {
        throw new Error("Export is missing required track methods");
      }
      return { file, parsed };
    }

    // Same-origin static file URLs: no GitHub API calls and no cross-origin raw-file requests.
    function preloadTracks() {
      if (preloadPromise) return preloadPromise;
      preloadPromise = (async () => {
        const listingResponse = await fetchWithRetry(API + "?ref=main", {}, 5);
        const files = (await listingResponse.json())
          .filter(file => file.type === "file" && file.name.toLowerCase().endsWith(".track") &&
            file.name.toLowerCase() !== "a.track" && file.size > 0)
          .map(file => ({
            name: file.name,
            size: file.size,
            // Use the same origin as the game for the actual file download.
            download_url: new URL("tracks/carson/" + encodeURIComponent(file.name), document.baseURI).href
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const hookDeadline = Date.now() + 30000;
        while ((typeof window.__carsonParseTrack !== "function" ||
                typeof window.__carsonTrackRender !== "function") && Date.now() < hookDeadline) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (typeof window.__carsonParseTrack !== "function" || typeof window.__carsonTrackRender !== "function") {
          throw new Error("PolyTrack track hooks did not initialize");
        }

        const results = new Array(files.length);
        let nextIndex = 0;
        async function worker() {
          while (nextIndex < files.length) {
            const index = nextIndex++;
            const file = files[index];
            let lastError;
            for (let attempt = 0; attempt < 4; attempt++) {
              try {
                results[index] = { ok: true, value: await downloadTrack(file) };
                lastError = null;
                break;
              } catch (error) {
                lastError = error;
                console.warn("Carson track attempt " + (attempt + 1) + " failed:", file.name, error);
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              }
            }
            if (lastError) {
              console.error("Could not preload Carson track:", file.name, lastError);
              results[index] = { ok: false, error: file.name + ": " + (lastError?.message || "unknown error") };
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(2, files.length) }, () => worker()));
        const output = {
          tracks: results.filter(result => result?.ok).map(result => result.value),
          failures: results.filter(result => result && !result.ok).map(result => result.error),
          fileCount: files.length
        };
        if (output.failures.length) preloadPromise = null;
        return output;
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

        for (const item of result.tracks) {
          const { parsed } = item;
          const before = list.children.length;
          try {
            window.__carsonTrackRender(parsed.trackMetadata, parsed.trackData.environment ?? 0, parsed.trackData, list);
            if (list.children.length === before) {
              result.failures.push(item.file.name + ": PolyTrack did not create a track card");
            }
          } catch (error) {
            console.error("Could not render Carson track:", item.file.name, error);
            result.failures.push(item.file.name + ": " + (error?.message || "render failed"));
          }
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
        rendered = result.failures.length === 0;
      } catch (error) {
        console.error("Could not load Carson tracks:", error);
        list.innerHTML = '<div class="carson-track-empty">Could not load Carson tracks after retries. Tap Carson Tracks to try again.</div>';
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