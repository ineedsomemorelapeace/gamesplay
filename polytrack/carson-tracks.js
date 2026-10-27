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

    // Same-origin static file URLs: no GitHub API calls and no cross-origin raw-file requests.
    function preloadTracks() {
      if (preloadPromise) return preloadPromise;
      preloadPromise = (async () => {
        // Manifest and track contents are served by this GitHub Pages site.
        // The browser never calls GitHub's API or raw.githubusercontent.com.
        // Prefer live directory discovery so adding a .track file needs no manifest edit.
        // If the school filter blocks the GitHub API, fall back to the checked-in manifest.
        let entries;
        try {
          const directoryResponse = await fetchWithRetry(DIRECTORY_API, {
            headers: { Accept: "application/vnd.github+json" }
          }, 2);
          const directory = await directoryResponse.json();
          if (!Array.isArray(directory)) throw new Error("GitHub directory response was not an array");
          entries = directory
            .filter(entry => entry.type === "file" && entry.name.toLowerCase().endsWith(".track"))
            .map(entry => ({ name: entry.name }));
        } catch (directoryError) {
          console.warn("Carson directory discovery unavailable; using manifest:", directoryError);
          const manifestResponse = await fetchWithRetry(MANIFEST, {}, 3);
          const manifest = await manifestResponse.json();
          entries = Array.isArray(manifest) ? manifest : manifest.tracks;
        }
        if (!Array.isArray(entries)) throw new Error("Carson track list is not an array");
        const files = entries
          .map(entry => typeof entry === "string" ? { name: entry } : entry)
          .filter(file => file && typeof file.name === "string" &&
            file.name.toLowerCase().endsWith(".track") && file.name.toLowerCase() !== "a.track")
          .map(file => ({
            name: file.name,
            download_url: new URL("tracks/carson/" + encodeURIComponent(file.name), SITE_BASE).href
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

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

        // Parse exports with PolyTrack's real TrackData class and use its native
        // card renderer/click handler. Carson tracks are NOT imported into Custom Tracks.
        const waitForNative = async () => {
          for (let attempt = 0; attempt < 100; attempt++) {
            if (typeof window.__carsonTrackParser?.fromExportString === "function" &&
                typeof window.__carsonTrackRender === "function") return;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error("PolyTrack native track renderer/parser did not become available");
        };
        await waitForNative();
        for (const item of result.tracks) {
          try {
            const parsed = window.__carsonTrackParser.fromExportString(item.code);
            if (!parsed?.trackMetadata || !parsed?.trackData) {
              console.warn("Invalid Carson track export:", item.file.name);
              continue;
            }
            const { trackMetadata, trackData } = parsed;
            const metadata = { ...trackMetadata, name: item.file.name.slice(0, -6).replace(/_/g, " ") };
            window.__carsonTrackRender(metadata, trackData.environment, trackData, list);
          } catch (error) {
            console.error("Could not render native Carson track:", item.file.name, error);
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