/* Carson Tracks extension for the PolyTrack selection screen. */
(() => {
  const API = "https://api.github.com/repos/ineedsomemorelapeace/gamesplay/contents/polytrack/tracks/carson";
  const RAW = "https://raw.githubusercontent.com/ineedsomemorelapeace/gamesplay/main/polytrack/tracks/carson/";
  const FORM = "https://forms.gle/yFXbuVSDimBbD9fz5";
  const style = document.createElement("style");
  style.textContent = `
    .button.carson .cover { background-image: url("images/official_tracks.jpg"); }
    .carson-tracks-container { display:none; }
    .carson-tracks-container.open { display:block; }
    .carson-tracks-toolbar { display:flex; align-items:center; justify-content:flex-end; gap:12px; padding:12px 0; }
    .carson-tracks-submit { border:1px solid var(--ui-color,#aaa); border-radius:6px; padding:9px 14px; color:inherit; background:rgba(255,255,255,.08); font:inherit; cursor:pointer; }
    .carson-tracks-submit:hover { background:rgba(255,255,255,.16); }
    .carson-track-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
    .carson-track-card { padding:0; overflow:hidden; border:0; border-radius:8px; background:rgba(255,255,255,.06); color:inherit; text-align:left; font:inherit; }
    .carson-track-card img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
    .carson-track-card span { display:block; padding:10px; }
    .carson-track-empty { opacity:.75; padding:20px; }
  `;
  document.head.appendChild(style);
  let installed = false;
  function install() {
    if (installed) return;
    const community = document.querySelector(".button.community");
    const custom = document.querySelector(".button.custom");
    const containers = [...document.querySelectorAll(".tracks-container")];
    if (!community || !custom || containers.length < 3) return;
    installed = true;
    const customContainer = containers[2];
    const tabs = custom.parentElement;
    const button = document.createElement("button");
    button.className = "button carson";
    button.innerHTML = '<span>Carson Tracks</span>';
    const cover = document.createElement("div");
    cover.className = "cover";
    button.prepend(cover);
    tabs.insertBefore(button, custom);
    const container = document.createElement("div");
    container.className = "tracks-container no-group-containers carson-tracks-container";
    customContainer.parentElement.insertBefore(container, customContainer);
    const toolbar = document.createElement("div");
    toolbar.className = "carson-tracks-toolbar";
    const heading = document.createElement("strong");
    heading.textContent = "Carson Tracks";
    heading.style.marginRight = "auto";
    const submit = document.createElement("button");
    submit.className = "carson-tracks-submit";
    submit.textContent = "Add your own track!";
    submit.addEventListener("click", () => window.open(FORM, "_blank", "noopener"));
    toolbar.append(heading, submit);
    const list = document.createElement("div");
    list.className = "carson-track-list";
    container.append(toolbar, list);
    const allContainers = [...document.querySelectorAll(".tracks-container")];
    button.addEventListener("click", () => {
      document.querySelectorAll(".button.official,.button.community,.button.custom,.button.carson").forEach(b => b.classList.toggle("selected", b === button));
      allContainers.forEach(c => c.classList.toggle("open", c === container));
      loadTracks();
    });
    custom.addEventListener("click", () => container.classList.remove("open"));
    community.addEventListener("click", () => container.classList.remove("open"));
    const official = document.querySelector(".button.official");
    if (official) official.addEventListener("click", () => container.classList.remove("open"));
    async function loadTracks() {
      list.innerHTML = '<div class="carson-track-empty">Loading Carson tracks…</div>';
      try {
        const response = await fetch(API, { cache: "no-store" });
        if (!response.ok) throw new Error("Track folder not available yet");
        const files = (await response.json()).filter(f => f.type === "file" && f.name.endsWith(".track")).sort((a,b) => a.name.localeCompare(b.name));
        list.replaceChildren();
        if (!files.length) {
          list.innerHTML = '<div class="carson-track-empty">No Carson tracks yet.</div>';
          return;
        }
        for (const file of files) {
          const card = document.createElement("div");
          card.className = "carson-track-card";
          const img = document.createElement("img");
          img.alt = "";
          img.src = "images/official_tracks.jpg";
          const title = document.createElement("span");
          title.textContent = file.name.replace(/\.track$/i, "").replace(/_/g, " ");
          card.append(img, title);
          card.title = "Track file detected. Track loading will be available when connected to the game's track parser.";
          list.appendChild(card);
        }
      } catch (error) {
        list.innerHTML = '<div class="carson-track-empty">Could not load Carson tracks. Try again later.</div>';
      }
    }
  }
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  install();
})();