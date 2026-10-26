/* Carson Tracks extension for the PolyTrack selection screen. */
(() => {
  const API = "https://api.github.com/repos/ineedsomemorelapeace/gamesplay/contents/polytrack/tracks/carson";
  const FORM = "https://forms.gle/yFXbuVSDimBbD9fz5";
  if (!document.querySelector("#carson-tracks-style")) {
    const style = document.createElement("style");
    style.id = "carson-tracks-style";
    style.textContent = `
      .button.carson { position:relative; background-size:cover; background-position:center; }
      .button.carson .cover { position:absolute; inset:0; background-size:cover!important; background-position:center!important; }
      .button.carson > span { position:relative; z-index:1; }
      .carson-tracks-container { display:none; }
      .carson-tracks-container.open { display:block; }
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
    if (!community || !custom || containers.length < 3) return;
    const customContainer = containers[2];
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
    customContainer.parentElement.insertBefore(container, customContainer);
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
    custom.addEventListener("click", () => container.classList.remove("open"));
    community.addEventListener("click", () => container.classList.remove("open"));
    installed = true;

    async function loadTracks() {
      list.innerHTML = '<div class="carson-track-empty">Loading Carson tracks…</div>';
      try {
        const response = await fetch(API, { cache: "no-store" });
        if (!response.ok) throw new Error("Track folder not available yet");
        const files = (await response.json())
          .filter(f => f.type === "file" && f.name.toLowerCase().endsWith(".track") && f.name.toLowerCase() !== "a.track" && f.size > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        list.replaceChildren();
        if (!files.length) {
          list.innerHTML = '<div class="carson-track-empty">No Carson tracks yet.</div>';
          return;
        }
        if (typeof window.__carsonParseTrack !== "function" || typeof window.__carsonTrackRender !== "function") {
          list.innerHTML = '<div class="carson-track-empty">PolyTrack is still initializing. Reopen Carson Tracks to retry.</div>';
          return;
        }
        const failures = [];
        for (const file of files) {
          try {
            let exported;
            try {
              const fileResponse = await fetch(file.download_url, { cache: "no-store" });
              if (!fileResponse.ok) throw new Error("Direct download failed (" + fileResponse.status + ")");
              exported = await fileResponse.text();
            } catch (directError) {
              // Safari/content filters can fail on raw.githubusercontent.com even when api.github.com works.
              const apiResponse = await fetch(API + "/" + encodeURIComponent(file.name), {
                cache: "no-store",
                headers: { Accept: "application/vnd.github+json" }
              });
              if (!apiResponse.ok) throw new Error("Direct download and GitHub API fallback failed (" + apiResponse.status + ")");
              const apiFile = await apiResponse.json();
              if (!apiFile.content || apiFile.encoding !== "base64") {
                throw new Error("GitHub API returned no base64 file content");
              }
              const binary = atob(apiFile.content.replace(/\s/g, ""));
              const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
              exported = new TextDecoder("utf-8").decode(bytes);
            }
            exported = exported.replace(/^\uFEFF/, "").trim();
            const parsed = window.__carsonParseTrack(exported);
            if (!parsed || !parsed.trackMetadata || !parsed.trackData) {
              throw new Error("PolyTrack did not recognize this export format");
            }
            const name = file.name.replace(/\.track$/i, "").replace(/_/g, " ");
            try { parsed.trackMetadata.name = name; } catch (_) {}
            const stableId = "carson-" + file.name.replace(/\.track$/i, "").toLowerCase();
            try {
              Object.defineProperty(parsed.trackData, "getId", { configurable: true, value: () => stableId });
            } catch (_) {
              try { parsed.trackData.getId = () => stableId; } catch (_) {}
            }
            if (typeof parsed.trackData.getId !== "function" ||
                typeof parsed.trackData.createThumbnail !== "function") {
              throw new Error("Export is missing required track methods");
            }
            const before = list.children.length;
            window.__carsonTrackRender(parsed.trackMetadata, parsed.trackData.environment ?? 0, parsed.trackData, list);
            if (list.children.length === before) throw new Error("PolyTrack did not create a track card");
          } catch (error) {
            console.error("Could not load Carson track:", file.name, error);
            failures.push(file.name + ": " + (error?.message || "unknown error"));
          }
        }
        if (!list.children.length) {
          const details = failures.length ? failures.slice(0, 3).join(" • ") : "No track cards were created.";
          list.innerHTML = '<div class="carson-track-empty">Could not load any Carson tracks. ' +
            details.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
            '</div>';
        } else if (failures.length) {
          const note = document.createElement("div");
          note.className = "carson-track-empty";
          note.textContent = failures.length + " track file(s) could not be loaded.";
          list.appendChild(note);
        }
      } catch (error) {
        console.error("Could not load Carson tracks:", error);
        list.innerHTML = '<div class="carson-track-empty">Could not load Carson tracks. Try again later.</div>';
      }
    }
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  install();
})();