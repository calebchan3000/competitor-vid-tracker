// Client interactivity — vanilla, no build. Handles drag-and-drop upload,
// niche creation, and client-side table sorting.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // If YouTube/Google avatar URLs fail or lazy-load weirdly, replace the broken
  // image with a clean monogram instead of showing the browser's broken-image icon.
  $$(".avatar-wrap img").forEach((img) => {
    img.addEventListener("error", () => {
      const wrap = img.closest(".avatar-wrap");
      if (!wrap) return;
      const size = Number(wrap.dataset.size || img.width || 22);
      const mono = document.createElement("span");
      mono.className = "avatar avatar--mono";
      mono.style.width = `${size}px`;
      mono.style.height = `${size}px`;
      mono.style.fontSize = `${Math.round(size * 0.5)}px`;
      mono.textContent = wrap.dataset.initial || "?";
      wrap.replaceWith(mono);
    }, { once: true });
  });

  // ---- read files as data URLs ------------------------------------------
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve({ name: file.name, dataUrl: fr.result });
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // ---- dropzone ----------------------------------------------------------
  const form = $("#upload-form");
  if (form) {
    const dz = $("#dropzone");
    const input = $("#file-input");
    const preview = $("#dz-preview");
    const status = $("#dz-status");
    const btn = $("#upload-btn");
    const tabSelect = $("#tab-select");
    const sourceInput = $("#source-channel");
    const sourceList = $("#source-channel-list");
    let files = [];

    // niche slug -> your active channels, used to populate the source datalist
    let channelMap = {};
    try { channelMap = JSON.parse($("#niche-channels")?.textContent || "{}"); } catch {}

    const currentSlug = () => (tabSelect ? tabSelect.value : form.dataset.slug);

    const refreshSourceOptions = () => {
      if (!sourceList) return;
      const chans = channelMap[currentSlug()] || [];
      sourceList.innerHTML = chans.map((c) => `<option value="${c}"></option>`).join("");
      // auto-fill when there's exactly one channel for this niche
      if (chans.length === 1 && !sourceInput.value) sourceInput.value = chans[0];
    };

    const render = () => {
      preview.innerHTML = files
        .map((f, i) => `<span class="thumb" data-i="${i}"><img src="${f.dataUrl}" alt=""><button type="button" class="thumb-x" data-i="${i}">×</button></span>`)
        .join("");
      const needSource = sourceInput && !sourceInput.value.trim();
      btn.disabled = files.length === 0 || (tabSelect && !tabSelect.value) || needSource;
    };
    refreshSourceOptions();
    if (sourceInput) sourceInput.addEventListener("input", render);

    const addFiles = async (fileList) => {
      const imgs = [...fileList].filter((f) => /image\//.test(f.type));
      if (!imgs.length) return;
      status.textContent = "reading…";
      const read = await Promise.all(imgs.map(readAsDataUrl));
      files = files.concat(read);
      status.textContent = "";
      render();
    };

    dz.addEventListener("click", () => input.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
    input.addEventListener("change", (e) => addFiles(e.target.files));

    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); })
    );
    dz.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

    preview.addEventListener("click", (e) => {
      const x = e.target.closest(".thumb-x");
      if (!x) return;
      files.splice(Number(x.dataset.i), 1);
      render();
    });

    if (tabSelect) tabSelect.addEventListener("change", () => { refreshSourceOptions(); render(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const slug = currentSlug();
      if (!slug) { status.textContent = "pick a niche first"; return; }
      const sourceChannel = sourceInput ? sourceInput.value.trim() : "";
      if (!sourceChannel) { status.innerHTML = `<span class="err">which of your channels is this Audience tab from?</span>`; return; }
      if (!files.length) return;
      btn.disabled = true;
      status.textContent = `uploading ${files.length} screenshot(s) from ${sourceChannel}…`;
      try {
        const r = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, sourceChannel, images: files }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "upload failed");
        status.innerHTML = `<span class="ok">✓ Snapshot saved (${data.count} screenshot${data.count === 1 ? "" : "s"} from ${sourceChannel}). Scroll down to see it in Audience snapshots.</span>`;
        files = [];
        render();
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        status.innerHTML = `<span class="err">✕ ${err.message}</span>`;
        btn.disabled = false;
      }
    });
  }

  // ---- new niche form ----------------------------------------------------
  const newForm = $("#new-tab-form");
  if (newForm) {
    const status = $("#new-tab-status");
    newForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(newForm);
      status.textContent = "creating…";
      try {
        const r = await fetch("/api/tabs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niche: fd.get("niche"),
            portfolio: fd.get("portfolio"),
            activeChannels: (fd.get("activeChannels") || "").split(",").map((s) => s.trim()).filter(Boolean),
          }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "failed");
        status.innerHTML = `<span class="ok">✓ Created. Opening…</span>`;
        setTimeout(() => (location.href = `/tab/${data.slug}`), 600);
      } catch (err) {
        status.innerHTML = `<span class="err">✕ ${err.message}</span>`;
      }
    });
  }

  // ---- add channel to a niche (tab page) --------------------------------
  const addChanForm = $("#add-channel-form");
  if (addChanForm) {
    const status = $("#add-channel-status");
    addChanForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const handle = new FormData(addChanForm).get("handle");
      if (!handle || !String(handle).trim()) return;
      status.textContent = "adding…";
      try {
        const r = await fetch(`/api/tabs/${addChanForm.dataset.slug}/channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "failed");
        status.innerHTML = `<span class="ok">✓ added — reloading…</span>`;
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        status.innerHTML = `<span class="err">✕ ${err.message}</span>`;
      }
    });
  }

  // ---- track a competitor (YouTube pull) --------------------------------
  const trackForm = $("#track-form");
  if (trackForm) {
    const status = $("#track-status");
    trackForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const handle = new FormData(trackForm).get("handle");
      if (!handle || !String(handle).trim()) return;
      status.innerHTML = `<span class="muted">pulling ${String(handle).trim()} from YouTube…</span>`;
      try {
        const r = await fetch(`/api/tabs/${trackForm.dataset.slug}/track`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "failed");
        status.innerHTML = data.enriched
          ? `<span class="ok">✓ ${data.handle}: added ${data.added} video${data.added === 1 ? "" : "s"}${data.baselineViews ? ` · typical ${(data.baselineViews / 1000).toFixed(0)}K views` : ""}. Reloading…</span>`
          : `<span class="ok">✓ Added ${data.handle} (${data.reason || "no enrichment"}). Reloading…</span>`;
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        status.innerHTML = `<span class="err">✕ ${err.message}</span>`;
      }
    });
  }

  // ---- track ALL competitors (one YouTube pull per listed channel) -------
  const trackAllBtn = $("#track-all-btn");
  if (trackAllBtn) {
    const status = $("#track-status");
    const label = trackAllBtn.textContent;
    trackAllBtn.addEventListener("click", async () => {
      const slug = trackAllBtn.dataset.slug;
      const count = trackAllBtn.dataset.count || "";
      trackAllBtn.disabled = true;
      trackAllBtn.textContent = "Tracking…";
      status.innerHTML = `<span class="muted">Pulling ${count} competitor${count === "1" ? "" : "s"} from YouTube — this can take a minute, don't close the tab…</span>`;
      try {
        const r = await fetch(`/api/tabs/${slug}/track-all`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "failed");
        const parts = [`tracked ${data.enriched}/${data.total} channels`, `+${data.added} long-form videos into the engine`];
        if (data.shortsSkipped) parts.push(`${data.shortsSkipped} Shorts skipped`);
        if (data.quotaHit) parts.push("⚠ stopped early — YouTube quota reached");
        else if (data.skipped) parts.push(`${data.skipped} skipped`);
        status.innerHTML = `<span class="ok">✓ ${parts.join(" · ")}. Reloading…</span>`;
        setTimeout(() => location.reload(), 1400);
      } catch (err) {
        status.innerHTML = `<span class="err">✕ ${err.message}</span>`;
        trackAllBtn.disabled = false;
        trackAllBtn.textContent = label;
      }
    });
  }

  // ---- snapshot lightbox -------------------------------------------------
  const snapList = $(".snap-list");
  if (snapList) {
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img alt=""><span class="lightbox-close">×</span>`;
    box.style.display = "none";
    document.body.appendChild(box);
    const imgEl = box.querySelector("img");
    const close = () => { box.style.display = "none"; imgEl.src = ""; };
    snapList.addEventListener("click", (e) => {
      const a = e.target.closest(".snap-thumb");
      if (!a) return;
      e.preventDefault();
      imgEl.src = a.dataset.full;
      box.style.display = "flex";
    });
    box.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  // ---- channel filter for crowded niche result tables --------------------
  const channelFilter = $("#channel-filter");
  if (channelFilter) {
    const countEl = $("#channel-filter-count");
    const selected = new Set();
    const labelSelected = new Set();
    const rows = () => $$("table#engine tbody tr, table.engine-table tbody tr");
    const buttons = () => $$(".channel-filter-pill", channelFilter);
    const setFilter = () => {
      let visible = 0;
      rows().forEach((row) => {
        const channelOk = selected.size === 0 || selected.has(row.dataset.handle);
        const rowLabels = (row.dataset.labels || "").split(/\s+/).filter(Boolean);
        const labelOk = labelSelected.size === 0 || rowLabels.some((label) => labelSelected.has(label));
        const show = channelOk && labelOk;
        row.classList.toggle("is-filtered-out", !show);
        if (show) visible += 1;
      });
      buttons().forEach((btn) => {
        const handle = btn.dataset.channelFilter || "";
        const label = btn.dataset.labelFilter || "";
        if (label) btn.classList.toggle("is-active", labelSelected.has(label));
        else btn.classList.toggle("is-active", handle ? selected.has(handle) : selected.size === 0 && labelSelected.size === 0);
      });
      if (countEl) {
        const selectedLabels = [...labelSelected].map((label) => label.replace(/-/g, " ")).join(", ");
        const labelText = selectedLabels ? ` · ${selectedLabels}` : "";
        const selectedLabel = selected.size ? ` shown · ${selected.size} channel${selected.size === 1 ? "" : "s"} selected${labelText}` : labelText;
        countEl.textContent = `${visible} video${visible === 1 ? "" : "s"}${selectedLabel}`;
      }
    };
    channelFilter.addEventListener("click", (e) => {
      const btn = e.target.closest(".channel-filter-pill");
      if (!btn) return;
      const label = btn.dataset.labelFilter || "";
      if (label) {
        if (labelSelected.has(label)) labelSelected.delete(label);
        else labelSelected.add(label);
        setFilter();
        return;
      }
      const handle = btn.dataset.channelFilter || "";
      if (!handle) { selected.clear(); labelSelected.clear(); }
      else if (selected.has(handle)) selected.delete(handle);
      else selected.add(handle);
      setFilter();
    });
  }


  // ---- official inspiration checklist ------------------------------------
  document.addEventListener("change", async (e) => {
    const cb = e.target.closest?.(".inspiration-check");
    if (!cb) return;
    const slug = cb.dataset.slug;
    if (!slug) return;
    const selected = cb.checked;
    cb.disabled = true;
    try {
      const r = await fetch(`/api/tabs/${encodeURIComponent(slug)}/inspiration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected,
          video: {
            videoId: cb.dataset.videoId || "",
            title: cb.dataset.videoTitle || "",
            url: cb.dataset.videoUrl || "",
            handle: cb.dataset.videoHandle || "",
            source: cb.dataset.videoSource || "",
            section: cb.dataset.sourceSection || "",
          },
        }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "failed");
      const count = $("#inspiration-count");
      if (count) count.textContent = `${data.items.length} selected`;
      const list = $("#inspiration-list");
      if (list) {
        list.innerHTML = data.items.length
          ? data.items.map((item) => `<li><a href="${item.url}" target="_blank" rel="noopener">${item.title || item.videoId || item.url}</a>${item.handle ? ` <span class="muted">${item.handle}</span>` : ""}</li>`).join("")
          : `<li class="muted inspiration-empty">No official inspiration selected yet.</li>`;
      }
    } catch (err) {
      cb.checked = !selected;
      alert(`Could not save inspiration pick: ${err.message}`);
    } finally {
      cb.disabled = false;
    }
  });

  // ---- table sorting -----------------------------------------------------
  $$("table#engine th[data-sort], table.engine-table th[data-sort]").forEach((th) => {
    th.style.cursor = "pointer";
    let asc = false;
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      const tbody = th.closest("table").querySelector("tbody");
      const rows = [...tbody.querySelectorAll("tr")];
      asc = !asc;
      rows.sort((a, b) => {
        let av, bv;
        if (key === "title" || key === "handle") {
          const sel = key === "title" ? ".c-title" : ".c-chan";
          av = a.querySelector(sel).textContent.trim().toLowerCase();
          bv = b.querySelector(sel).textContent.trim().toLowerCase();
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        av = Number(a.dataset[key] || 0);
        bv = Number(b.dataset[key] || 0);
        return asc ? av - bv : bv - av;
      });
      rows.forEach((r) => tbody.appendChild(r));
    });
  });
})();
