// Obsidian for Spicetify – animated contour background (same engine as the Discord ObsidianBackground plugin)
(function obsidian() {
  // Settings
  const OPTS = {
    opacity: 0.6,      // canvas opacity
    size: 13,          // character size (px)
    speed: 0.045,      // animation speed
    spotlight: true,   // light cone that follows the mouse
    coverHeader: true  // blurred cover behind playlist/album headers (look: --obs-cover-* in user.css)
  };

  /* User settings: profile picture menu → "Obsidian-Einstellungen". Stored in localStorage, applied live.
     The defaults reproduce the stock theme exactly (CSS variables are only overridden when a value differs). */
  const DEFAULTS = {
    fps: 30,             // background fps while Spotify has focus
    blurFps: 4,          // background fps without focus (0 = pause)
    bg: "#09090b",       // base background colour
    line: "#615c6b",     // contour lines
    accentLine: "#9d4ff0", // every 5th contour line
    accent: "#8a2be2",   // general accent colour (buttons, progress bar, highlights)
    listAlpha: 62,       // opacity of the library / main view / right panel in % (0 = fully see-through)
    listBlur: 16,        // backdrop blur of those panels in px (0 = no blur)
    motion: true,        // home gradient and blurred cover headers drift slowly
    motionStrength: 100, // amplitude of that drift in % (100 = stock)
    wallpaper: false     // take bg/line/accentLine/accent from the desktop wallpaper (needs wallpaper-sync.ps1)
  };
  const settings = (() => {
    const KEY = "obsidian:settings";
    let cur;
    try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { cur = { ...DEFAULTS }; }
    return {
      get: () => ({ ...cur }),
      set(p) {
        cur = { ...cur, ...p };
        try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
        applySettings(cur);
      },
      reset() { this.set({ ...DEFAULTS }); wallpaper.enable(false); }
    };
  })();

  /* Wallpaper colours. Spotify's page (https://xpui.app.spotify.com) cannot read local files, but it serves
     %APPDATA%\Spotify\Apps\xpui live. wallpaper-sync.ps1 (autostart) drops a small copy of the desktop wallpaper there
     (obsidian-wallpaper.jpg + obsidian-wallpaper.json with a version stamp); this reads the dominant hue from it.
     Every 15 s while Wallpaper Engine runs, otherwise every 60 s (stamp only) plus on focus and when switched on. */
  const wallpaper = (() => {
    const KEY = "obsidian:wallpaper", ALGO = 2; // bump ALGO when extract() changes, cached palettes are then recomputed
    const HELPER_PORT = 47139;                   // must match $port in wallpaper-sync.ps1
    let state = null, status = "idle", busy = false, timer = 0;
    try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
    const listeners = new Set();
    const notify = () => listeners.forEach(f => f());

    const hsl = (h, s, l) => {
      const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
      return rgbHex([f(0), f(8), f(4)]);
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function extract(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error("wallpaper image failed"));
        img.onload = () => {
          const W = 96, H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, W, H);
          const d = ctx.getImageData(0, 0, W, H).data;
          // hue histogram (10° bins), weighted by chroma; dark and grey pixels do not vote
          const bw = new Float64Array(36), br = new Float64Array(36), bgc = new Float64Array(36), bb = new Float64Array(36);
          let total = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
            if (max < 0.08 || c < 0.02) continue;   // near-black and pure grey pixels do not vote; faint tints do
            let h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
            h = (h * 60 + 360) % 360;
            const k = Math.floor(h / 10) % 36;
            bw[k] += c; br[k] += r * c; bgc[k] += g * c; bb[k] += b * c; total += c;
          }
          const px = d.length / 4;
          // almost no colour in the picture: neutral greys, keep the stock accent
          if (total / px < 0.004) return resolve({ bg: "#0a0a0b", line: "#5f5f66", accentLine: DEFAULTS.accentLine, accent: DEFAULTS.accent });
          let best = 0, bestW = -1;
          for (let k = 0; k < 36; k++) {
            const w = bw[(k + 35) % 36] * 0.5 + bw[k] + bw[(k + 1) % 36] * 0.5;
            if (w > bestW) { bestW = w; best = k; }
          }
          let R = 0, G = 0, B = 0, Wt = 0;
          for (const k of [(best + 35) % 36, best, (best + 1) % 36]) { R += br[k]; G += bgc[k]; B += bb[k]; Wt += bw[k]; }
          R /= Wt; G /= Wt; B /= Wt;
          const max = Math.max(R, G, B), min = Math.min(R, G, B), c = max - min, l = (max + min) / 2;
          const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
          let h = c === 0 ? 0 : max === R ? ((G - B) / c) % 6 : max === G ? (B - R) / c + 2 : (R - G) / c + 4;
          h = (h * 60 + 360) % 360;
          // same lightness/saturation structure as the stock palette, only the hue (and a bit of the saturation) follows the wallpaper
          resolve({
            bg: hsl(h, 0.2, 0.045),
            line: hsl(h, 0.1, 0.39),
            accentLine: hsl(h, clamp(s, 0.55, 0.85), 0.62),
            accent: hsl(h, clamp(s, 0.5, 0.8), 0.5)
          });
        };
        img.src = url;
      });
    }

    // askHelper: ask wallpaper-sync.ps1 to re-read the wallpaper first (switching the option on, Spotify start).
    // Without Wallpaper Engine the helper does not poll, so this is how a new Windows wallpaper gets picked up.
    async function check(askHelper = false) {
      if (busy || !settings.get().wallpaper || (!askHelper && document.hidden)) return;
      busy = true;
      if (status === "idle") { status = "loading"; notify(); }
      let helper = true;
      if (askHelper) {
        try { await fetch(`http://127.0.0.1:${HELPER_PORT}/sync`, { cache: "no-store", signal: AbortSignal.timeout(8000) }); }
        catch { helper = false; }
      }
      try {
        const r = await fetch("/obsidian-wallpaper.json", { cache: "no-store" });
        if (!r.ok) throw new Error("no wallpaper info");
        const info = await r.json();
        if (state?.v !== info.v || state.algo !== ALGO || !state.palette) {
          const palette = await extract(`/${info.file}?v=${encodeURIComponent(info.v)}`);
          state = { v: info.v, algo: ALGO, palette };
          try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
          applySettings(settings.get());
        }
        // Wallpaper Engine can switch at any time: every 15 s. Otherwise the helper is idle and a static wallpaper is
        // read on request; a slow look at the stamp (60 s) only notices Wallpaper Engine starting again.
        live = info.we === true;
        const every = live ? 15000 : 60000;
        if (timerEvery !== every) { clearInterval(timer); timer = setInterval(() => check(), every); timerEvery = every; }
        status = helper ? "ok" : "missing";
      } catch { status = "missing"; }
      busy = false;
      notify();
    }
    let live = false, timerEvery = 0;
    function enable(on) {
      clearInterval(timer); timer = 0; timerEvery = 0;
      if (!on) { status = "idle"; notify(); return; }
      check(true);
    }
    // a cheap look at the version stamp on focus, so a freshly started Wallpaper Engine is noticed
    addEventListener("focus", () => check());
    return {
      palette: () => state?.palette || null,
      status: () => status,
      live: () => live,
      enable,
      onChange(f) { listeners.add(f); return () => listeners.delete(f); }
    };
  })();
  // colours actually shown: the wallpaper palette replaces the manual colours while the option is on
  const effective = s => (s.wallpaper && wallpaper.palette() ? { ...s, ...wallpaper.palette() } : s);

  /* Topo background: contour lines of an animated 3D simplex noise field, drawn as monospace characters.
     topo(canvas, options) – the canvas sits fixed behind the content, the mouse creates a light cone.
     Plugin version: returns a stop function and pauses while the window is hidden. */
  function topo(canvas, opt) {
    const o = Object.assign({
      font: '"JetBrains Mono", ui-monospace, monospace', size: 13, cellW: 0.95, cellH: 1.4,
      chars: "abcdefghijklmnopqrstuvwxyz0123456789",
      color: "#5e5a68", accent: "#8a2be2",
      scale: 0.0011, stretch: 0.65, levels: 5, speed: 0.045, every: 5,
      line: 0.75, accentLine: 0.9, minor: 0, width: 0.95,
      dust: 0.12, dustAlpha: 0.035, flicker: 0.004,
      spot: 170, spotGain: 0.45, fps: 30, idleFps: 12, blurFps: 4, seed: 7
    }, opt);
    const ctx = canvas.getContext("2d");
    const noise = simplex3(o.seed);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const nch = o.chars.length;
    let W, H, dpr, cw, ch, cols, rows, N, V, C, M, atlas, gw, gh;
    let t = o.seed * 3.7, last = 0, raf = 0;
    let mx = 0, my = 0, sx = 0, sy = 0, son = 0, si = 0;

    function buildAtlas() {
      gw = Math.ceil(cw * dpr); gh = Math.ceil(ch * dpr);
      atlas = document.createElement("canvas");
      atlas.width = gw * nch; atlas.height = gh * 2;
      const a = atlas.getContext("2d");
      a.font = `${o.size * dpr}px ${o.font}`; a.textAlign = "center"; a.textBaseline = "middle";
      [o.color, o.accent].forEach((col, row) => {
        a.fillStyle = col;
        for (let i = 0; i < nch; i++) a.fillText(o.chars[i], i * gw + gw / 2, row * gh + gh / 2);
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      cw = o.size * o.cellW; ch = o.size * o.cellH;
      // one cell of margin on each side, so the gradient is right at the image edge too
      cols = Math.ceil(W / cw) + 2; rows = Math.ceil(H / ch) + 2; N = cols * rows;
      V = new Float32Array(N); C = new Uint8Array(N); M = new Float32Array(N);
      for (let i = 0; i < N; i++) { C[i] = Math.random() * nch | 0; M[i] = Math.random(); }
      buildAtlas();
      render();
    }

    function render() {
      // x scaled less: lines run more horizontally and look denser in the character grid
      const s = o.scale, s2 = s * 2.3, kx = o.stretch, lv = o.levels, z = t;
      for (let r = 0; r < rows; r++) {
        const py = (r - 1) * ch + ch / 2;
        for (let c = 0; c < cols; c++) {
          const px = ((c - 1) * cw + cw / 2) * kx;
          V[r * cols + c] = (noise(px * s, py * s, z) * 0.78 + noise(px * s2 + 31.7, py * s2 - 11.3, z * 1.4) * 0.22) * lv;
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const half = o.width * ch, R = o.spot * si, R2 = R * R, ev = o.every;
      for (let r = 1; r < rows - 1; r++) {
        const y = (r - 1) * ch, dy = y + ch / 2 - sy, dy2 = dy * dy;
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c, v = V[i];
          const gx = (V[i + 1] - V[i - 1]) / (2 * cw), gy = (V[i + cols] - V[i - cols]) / (2 * ch);
          const g = Math.sqrt(gx * gx + gy * gy) + 1e-6;
          const k = Math.round(v), d = Math.abs(v - k) / g;
          let a = 0, row = 0, on = false;
          if (d < half) {
            const q = 1 - d / half, acc = ev && ((k % ev) + ev) % ev === 0;
            a = q * q * (acc ? o.accentLine : o.line); row = acc ? 1 : 0; on = true;
          } else {
            const dm = Math.abs(v - Math.floor(v) - 0.5) / g;
            if (dm < half * 0.8) a = (1 - dm / (half * 0.8)) * o.minor;
            else if (M[i] < o.dust) a = o.dustAlpha;
          }
          const x = (c - 1) * cw;
          if (R > 1) {
            const dx = x + cw / 2 - sx, dd = dx * dx + dy2;
            if (dd < R2) { const f = 1 - Math.sqrt(dd) / R; a += f * f * o.spotGain * (on ? 1 : 0.4); }
          }
          if (a < 0.015) continue;
          ctx.globalAlpha = a > 1 ? 1 : a;
          ctx.drawImage(atlas, C[i] * gw, row * gh, gw, gh, Math.round(x * dpr), Math.round(y * dpr), gw, gh);
        }
      }
    }

    // Frame rate: full fps only while the spotlight moves, otherwise idleFps, and blurFps while the window has no focus.
    // A timer waits for the next frame, so the page does not wake up on every vsync (165 Hz) just to skip it.
    let timer = 0;
    function currentFps() {
      if (!document.hasFocus()) return o.blurFps; // 0 = paused until focus comes back
      const moving = si > 0.02 && (Math.abs(mx - sx) > 0.5 || Math.abs(my - sy) > 0.5 || Math.abs(son - si) > 0.01);
      return moving ? o.fps : o.idleFps;
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(now - last, 250) / 1000;
      last = now;
      t += dt * o.speed;
      const k = Math.min(dt * 30, 1); // smoothing per 30 fps frame, independent of the current frame rate
      si += (son - si) * 0.12 * k;
      sx += (mx - sx) * 0.2 * k; sy += (my - sy) * 0.2 * k;
      for (let n = N * o.flicker * k; n > 0; n--) C[Math.random() * N | 0] = Math.random() * nch | 0;
      render();
      o.onFrame?.(now);
      schedule();
    }
    function schedule() {
      if (reduce.matches || document.hidden || raf || timer || ac.signal.aborted) return;
      const fps = currentFps();
      if (!(fps > 0)) return;
      const wait = Math.max(0, 1000 / fps - (performance.now() - last) - 4);
      timer = setTimeout(() => { timer = 0; if (!document.hidden && !ac.signal.aborted) raf = requestAnimationFrame(frame); }, wait);
    }
    // wake up early when the mouse comes back, instead of waiting for the slow idle frame
    function wake() { if (timer) { clearTimeout(timer); timer = 0; } schedule(); }

    const ac = new AbortController(), signal = ac.signal;
    if (o.spot) {
      addEventListener("pointermove", e => {
        if (si < 0.02) { sx = e.clientX; sy = e.clientY; }
        mx = e.clientX; my = e.clientY;
        if (!son || performance.now() - last > 1000 / o.fps) { son = 1; wake(); }
      }, { passive: true, signal });
      addEventListener("pointerup", e => { if (e.pointerType !== "mouse") son = 0; }, { signal });
      document.documentElement.addEventListener("mouseleave", () => { son = 0; }, { signal });
    }
    let rt;
    // Observe the canvas itself: catches late CSS, zoom changes and window resizes
    const ro = new ResizeObserver(() => {
      if (canvas.clientWidth === W && canvas.clientHeight === H) return;
      clearTimeout(rt); rt = setTimeout(resize, 120);
    });
    ro.observe(canvas);
    signal.addEventListener("abort", () => ro.disconnect());
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); }, { signal });
    reduce.addEventListener?.("change", schedule, { signal });
    document.addEventListener("visibilitychange", () => { last = performance.now(); schedule(); }, { signal });
    addEventListener("focus", wake, { signal });
    resize();
    schedule();
    if (document.fonts) document.fonts.load(`${o.size}px ${o.font}`).then(() => { if (!signal.aborted) { buildAtlas(); render(); } });

    return {
      stop() { ac.abort(); clearTimeout(rt); clearTimeout(timer); if (raf) cancelAnimationFrame(raf); raf = 0; timer = 0; },
      // change options live (fps, colours); new colours need a new glyph atlas
      set(p) {
        const recolor = p.color !== undefined && p.color !== o.color || p.accent !== undefined && p.accent !== o.accent;
        Object.assign(o, p);
        if (recolor && atlas) { buildAtlas(); render(); }
        wake();
      }
    };
  }

  /* 3D simplex noise after Stefan Gustavson, with a seed */
  function simplex3(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 255; i > 0; i--) { const j = rnd() * (i + 1) | 0; const x = p[i]; p[i] = p[j]; p[j] = x; }
    const perm = new Uint8Array(512), pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12 * 3; }
    const g = [1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1];
    const F = 1 / 3, G = 1 / 6;
    const corner = (x, y, z, gi) => {
      let t = 0.6 - x * x - y * y - z * z;
      if (t < 0) return 0;
      t *= t;
      return t * t * (g[gi] * x + g[gi + 1] * y + g[gi + 2] * z);
    };
    return (x, y, z) => {
      const s = (x + y + z) * F;
      const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
      const t = (i + j + k) * G;
      const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const ii = i & 255, jj = j & 255, kk = k & 255;
      return 32 * (
        corner(x0, y0, z0, pm[ii + perm[jj + perm[kk]]]) +
        corner(x0 - i1 + G, y0 - j1 + G, z0 - k1 + G, pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]) +
        corner(x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G, pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]) +
        corner(x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G, pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]));
    };
  }

  function start() {
    if (document.getElementById("obs-topo")) return;
    if (!document.body || !document.getElementById("main")) return setTimeout(start, 300);
    const canvas = document.createElement("canvas");
    canvas.id = "obs-topo";
    canvas.setAttribute("aria-hidden", "true");
    // Inline layout so the canvas has its size before user.css is applied
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none";
    canvas.style.opacity = String(OPTS.opacity);
    document.body.prepend(canvas);
    const s = effective(settings.get());
    topoCtl = topo(canvas, {
      font: '"Geist Mono", ui-monospace, monospace', size: OPTS.size,
      color: s.line, accent: s.accentLine, every: 5,
      spot: OPTS.spotlight ? 180 : 0, spotGain: 0.5,
      speed: OPTS.speed, fps: s.fps, idleFps: s.fps, blurFps: s.blurFps, seed: 3,
      onFrame: bgMotion
    });
  }

  // Moving backgrounds. Everything moves only inside the topo frame, so the glass panels re-blur no more often than
  // before, and the transform-only changes need no repaint. Paused with the topo (no focus + blurFps 0, reduced motion).
  // Home page: the colour block behind the shortcut grid (absolute, z-index -1, 256px, no children) gets two soft blobs.
  // Pages with a cover (playlist, album, artist, profile): the blurred cover canvas drifts and zooms slightly;
  // user.css scales it from the top centre, so its edges never come into view.
  let wave = null;
  function bgMotion(now) {
    const s = settings.get();
    if (!s.motion) return;
    const t = now / 1000, k = Math.min(2, Math.max(0, Number(s.motionStrength) / 100 || 0));
    const host = document.querySelector('#main-view main > div > div:first-child[style*="background-color"]');
    if (host) {
      if (!wave || wave.parentElement !== host) {
        wave = document.createElement("div");
        wave.id = "obs-home-wave";
        wave.setAttribute("aria-hidden", "true");
        wave.innerHTML = "<i></i><i></i>";
        host.appendChild(wave);
      }
      const w = host.clientWidth, [a, b] = wave.children;
      a.style.transform = `translate3d(${(w * (0.18 + 0.1 * k * Math.sin(t * 0.21))).toFixed(1)}px, ${(16 * k * Math.sin(t * 0.33)).toFixed(1)}px, 0) scale(${(1 + 0.12 * k * Math.sin(t * 0.17)).toFixed(3)})`;
      b.style.transform = `translate3d(${(w * (0.62 + 0.12 * k * Math.sin(t * 0.15 + 2))).toFixed(1)}px, ${(20 * k * Math.sin(t * 0.27 + 1)).toFixed(1)}px, 0) scale(${(1 + 0.15 * k * Math.sin(t * 0.23 + 4)).toFixed(3)})`;
    }
    const cv = document.querySelector("#obs-cover-bg > canvas");
    if (cv) {
      // scale ≥ 1.16 leaves 8 % on each side for the ±6 % drift; translateY ≤ 0 keeps the top edge above the page
      const sc = 1.16 + 0.06 * k * (0.5 + 0.5 * Math.sin(t * 0.23));
      cv.style.transform = `translate3d(${(6 * k * Math.sin(t * 0.19)).toFixed(2)}%, ${(-3 * k * (0.5 + 0.5 * Math.sin(t * 0.29 + 1))).toFixed(2)}%, 0) scale(${sc.toFixed(3)})`;
    }
  }
  function stopMotion() {
    wave?.remove(); wave = null;
    document.querySelectorAll("#obs-cover-bg > canvas").forEach(c => c.style.transform = "");
  }
  // ---------------------------------------------------------------- settings: apply
  let topoCtl = null;
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgbHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mix = (h, to, f) => { const a = hexRgb(h), b = hexRgb(to); return rgbHex(a.map((v, i) => v + (b[i] - v) * f)); };
  const isHex = v => /^#[0-9a-f]{6}$/i.test(v);

  function applySettings(raw) {
    const s = effective(raw);
    const root = document.documentElement.style;
    const put = (vars, on) => {
      for (const [k, v] of Object.entries(vars)) {
        if (!on) { root.removeProperty(k); continue; }
        root.setProperty(k, v);
        if (k.startsWith("--spice-")) root.setProperty(k.replace("--spice-", "--spice-rgb-"), hexRgb(v).join(","));
      }
    };
    // Accent: every violet in user.css and color.ini derives from these (shades match the stock palette for #8a2be2)
    const a = isHex(s.accent) ? s.accent : DEFAULTS.accent;
    const light = mix(a, "#ffffff", 0.3), hi = mix(a, "#ffffff", 0.75);
    put({
      "--obs-accent-fill": a, "--obs-accent": light, "--obs-accent-hi": hi,
      "--obs-accent-hover": mix(a, "#ffffff", 0.1), "--obs-accent-press": mix(a, "#000000", 0.12),
      "--spice-button": light, "--spice-button-active": a, "--spice-notification": a, "--spice-selected-row": hi,
      // header palette for pages without a cover colour (home gradient, fallbacks); stock values are the plum #1c1030/#33205a/#b9aed0
      "--obs-header": mix(a, "#09090b", 0.82), "--obs-header-top": mix(a, "#09090b", 0.65), "--obs-header-sub": mix(a, "#d0d0d8", 0.8)
    }, a.toLowerCase() !== DEFAULTS.accent);
    const bg = isHex(s.bg) ? s.bg : DEFAULTS.bg;
    put({ "--obs-bg-color": bg, "--spice-main": bg, "--spice-sidebar": bg, "--spice-player": bg }, bg.toLowerCase() !== DEFAULTS.bg);
    const la = Math.min(100, Math.max(0, Number(s.listAlpha))), lb = Math.min(40, Math.max(0, Number(s.listBlur)));
    put({ "--obs-list-alpha": String(la / 100) }, Number.isFinite(la) && la !== DEFAULTS.listAlpha);
    put({ "--obs-list-blur": lb + "px" }, Number.isFinite(lb) && lb !== DEFAULTS.listBlur);
    if (!s.motion) stopMotion();
    topoCtl?.set({
      fps: s.fps, idleFps: s.fps, blurFps: s.blurFps,
      color: isHex(s.line) ? s.line : DEFAULTS.line, accent: isHex(s.accentLine) ? s.accentLine : DEFAULTS.accentLine
    });
  }

  // ---------------------------------------------------------------- settings: profile menu + dialog
  function settingsMenu(tries = 0) {
    const S = window.Spicetify;
    if (!S?.Menu?.Item || !S?.PopupModal) { if (tries < 120) setTimeout(() => settingsMenu(tries + 1), 500); return; }
    const icon = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H12a3 3 0 0 0 3-3C15 3.6 11.9 1 8 1zM4 8.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
    new S.Menu.Item("Obsidian-Einstellungen", false, openSettings, icon).register();
  }

  function openSettings() {
    const s = settings.get();
    const el = document.createElement("div");
    el.id = "obs-settings";
    const color = (key, label, hint, presets = []) => `
      <div class="obs-row" data-color>
        <div class="obs-label"><span>${label}</span><small>${hint}</small></div>
        <div class="obs-color">
          ${presets.map(p => `<button type="button" class="obs-swatch" data-key="${key}" data-val="${p}" style="--c:${p}" aria-label="${p}"></button>`).join("")}
          <label class="obs-pick" style="--c:${s[key]}"><input type="color" data-key="${key}" value="${s[key]}"></label>
          <input type="text" class="obs-hex" data-key="${key}" value="${s[key]}" maxlength="7" spellcheck="false">
        </div>
      </div>`;
    const range = (key, label, hint, min, max, unit = "") => `
      <div class="obs-row">
        <div class="obs-label"><span>${label}</span><small>${hint}</small></div>
        <div class="obs-range">
          <input type="range" data-key="${key}" min="${min}" max="${max}" step="1" value="${s[key]}">
          <output data-for="${key}" data-unit="${unit}">${s[key]}${unit}</output>
        </div>
      </div>`;
    el.innerHTML = `
      <h3>Hintergrund-Animation</h3>
      ${range("fps", "FPS mit Fokus", "Spotify ist das aktive Fenster", 1, 60)}
      ${range("blurFps", "FPS ohne Fokus", "anderes Fenster aktiv · 0 = pausiert", 0, 30)}
      <h3>Panels</h3>
      ${range("listAlpha", "Deckkraft", "Bibliothek, Lieder, rechtes Panel · 0 = ganz durchsichtig", 0, 100, " %")}
      ${range("listBlur", "Unschärfe", "Blur hinter den Panels · 0 = aus", 0, 40, " px")}
      <h3>Bewegung</h3>
      <div class="obs-row">
        <div class="obs-label"><span>Bewegter Hintergrund</span><small>Verlauf auf der Startseite und Cover-Hintergrund von Playlists, Alben, Künstlern, Profilen</small></div>
        <label class="obs-switch"><input type="checkbox" data-key="motion"><span></span></label>
      </div>
      <div class="obs-motion-opts">
      ${range("motionStrength", "Stärke", "wie weit sich der Hintergrund bewegt", 10, 200, " %")}
      </div>
      <h3>Wallpaper</h3>
      <div class="obs-row">
        <div class="obs-label"><span>Farben aus Wallpaper</span><small class="obs-wp-status"></small></div>
        <label class="obs-switch"><input type="checkbox" data-key="wallpaper"><span></span></label>
      </div>
      <h3>Hintergrund-Farben</h3>
      ${color("bg", "Grundfarbe", "Fläche hinter Linien und Panels", ["#09090b", "#0b0d12", "#0d0a12", "#0f0b0b"])}
      ${color("line", "Linien", "Höhenlinien", ["#615c6b", "#5a6478", "#6b6b6b"])}
      ${color("accentLine", "Akzentlinien", "jede 5. Linie", ["#9d4ff0", "#4f8cf0", "#2bc4b0", "#f04f9d"])}
      <h3>Farbe allgemein</h3>
      ${color("accent", "Akzentfarbe", "Buttons, Fortschrittsbalken, Markierungen", ["#8a2be2", "#3b6fe0", "#0fa3a3", "#1db954", "#e0457b", "#e05a2b"])}
      <div class="obs-actions"><button type="button" class="obs-reset">Standard wiederherstellen</button></div>`;

    const sync = (key, val) => {
      if (typeof val === "boolean") { el.querySelectorAll(`input[data-key="${key}"]`).forEach(i => i.checked = val); return; }
      el.querySelectorAll(`[data-key="${key}"]:not(.obs-swatch)`).forEach(i => { if (i.value !== String(val)) i.value = val; });
      el.querySelectorAll(`.obs-pick input[data-key="${key}"]`).forEach(i => i.parentElement.style.setProperty("--c", val));
      el.querySelectorAll(`output[data-for="${key}"]`).forEach(o => o.textContent = val + (o.dataset.unit || ""));
      el.querySelectorAll(`.obs-swatch[data-key="${key}"]`).forEach(b => b.classList.toggle("on", b.dataset.val.toLowerCase() === String(val).toLowerCase()));
    };
    // everything shown comes from the effective values (wallpaper colours while that option is on)
    const STATUS = {
      off: "Grundfarbe, Linien und Akzentfarbe folgen dem Desktop-Hintergrund",
      idle: "wird gelesen …", loading: "wird gelesen …",
      ok: "aktiv · Windows-Wallpaper · nach einem Wechsel aus- und wieder einschalten",
      live: "aktiv · folgt Wallpaper Engine automatisch",
      missing: "Wallpaper-Helfer läuft nicht · wallpaper-sync.ps1 -Install ausführen"
    };
    const refresh = () => {
      const cur = settings.get(), eff = effective(cur);
      Object.keys(DEFAULTS).forEach(k => sync(k, eff[k]));
      el.classList.toggle("wp-on", cur.wallpaper);
      el.classList.toggle("motion-off", !cur.motion);
      const st = el.querySelector(".obs-wp-status");
      st.textContent = cur.wallpaper ? STATUS[wallpaper.status() === "ok" && wallpaper.live() ? "live" : wallpaper.status()] : STATUS.off;
      st.classList.toggle("warn", cur.wallpaper && wallpaper.status() === "missing");
    };
    const off = wallpaper.onChange(() => { if (!el.isConnected) return off(); refresh(); });
    const commit = (key, raw) => {
      const t = typeof DEFAULTS[key];
      const val = t === "number" ? Number(raw) : t === "boolean" ? !!raw : String(raw).trim().toLowerCase();
      if (t === "string" && !isHex(val)) return;
      settings.set({ [key]: val });
      if (key === "wallpaper") wallpaper.enable(val);
      refresh();
    };
    refresh();
    el.addEventListener("input", e => {
      const k = e.target.dataset.key;
      if (!k) return;
      if (e.target.type === "checkbox") commit(k, e.target.checked);
      else if (e.target.classList.contains("obs-hex")) { const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value; if (isHex(v)) commit(k, v); }
      else commit(k, e.target.value);
    });
    el.addEventListener("click", e => {
      const sw = e.target.closest(".obs-swatch");
      if (sw) commit(sw.dataset.key, sw.dataset.val);
      if (e.target.closest(".obs-reset")) { settings.reset(); refresh(); }
    });
    Spicetify.PopupModal.display({ title: "Obsidian-Einstellungen", content: el, isLarge: true });
  }
  // Blurred cover behind entity headers. CSS cannot read the <img> src, so copy it into a layer
  // (#obs-cover-bg) at the top of the page section; user.css makes the colour layers transparent around it.
  function coverHeader() {
    const view = document.getElementById("main-view");
    if (!view) return setTimeout(coverHeader, 500);
    let queued = false;
    const update = () => {
      queued = false;
      const page = view.querySelector("[data-testid$=\"-page\"]");
      const img = page?.querySelector("[data-testid=\"entity-header\"] img");
      const src = img && (img.currentSrc || img.src);
      view.querySelectorAll("#obs-cover-bg").forEach(el => { if (el.parentElement !== page || !src) el.remove(); });
      if (!page || !src) return;
      let bg = page.querySelector(":scope > #obs-cover-bg");
      if (!bg) {
        bg = document.createElement("div");
        bg.id = "obs-cover-bg";
        bg.setAttribute("aria-hidden", "true");
        page.prepend(bg);
      }
      if (bg.dataset.src !== src) {
        bg.dataset.src = src;
        paintCover(bg, src);
      }
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    // Repaint when the panel width changes (the bitmap is drawn for one size)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const bg = e.target;
        if (bg.isConnected && bg.dataset.src && Math.abs(bg.clientWidth - (bg._obsW || 0)) > 24) paintCover(bg, bg.dataset.src);
      }
    });
    const observed = new WeakSet();

    // Blur, darkening and the fade-out are baked into a small canvas once. CSS mask-image (and the live 60px filter)
    // on this layer made Spotify's compositor draw black streaks over the rows below the header (2026-10-30).
    function paintCover(bg, src) {
      if (!observed.has(bg)) { observed.add(bg); ro.observe(bg); }
      const img = new Image();
      img.onload = () => {
        if (bg.dataset.src !== src || !bg.isConnected) return;
        const cs = getComputedStyle(bg);
        const num = (name, def) => parseFloat(cs.getPropertyValue(name)) || def;
        const blur = num("--obs-cover-blur", 60), sat = num("--obs-cover-saturate", 1.3), bright = num("--obs-cover-brightness", 0.6);
        const W = bg.clientWidth || 800, H = bg.clientHeight || 560, f = 0.25; // a quarter of the size is plenty after the blur
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(W * f)); cv.height = Math.max(1, Math.round(H * f));
        const ctx = cv.getContext("2d");
        // background-size: cover over the area plus the blur margin, so the edges do not fade out
        const m = blur * 2 * f, aw = cv.width + 2 * m, ah = cv.height + 2 * m;
        const s = Math.max(aw / img.naturalWidth, ah / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        ctx.filter = `blur(${blur * f}px) saturate(${sat}) brightness(${bright})`;
        ctx.drawImage(img, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
        ctx.filter = "none";
        // darken towards the bottom so the title and the action bar stay readable
        let g = ctx.createLinearGradient(0, 0, 0, cv.height);
        g.addColorStop(0, "rgba(9, 9, 11, .15)"); g.addColorStop(1, "rgba(9, 9, 11, .55)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
        // Brightness floor: nearly black pixels at about half transparency make Spotify's compositor draw black/white
        // streaks over the rows (very dark artist photos, 2026-10-30); a floor of 20 is invisible and fixes it
        ctx.globalCompositeOperation = "lighten";
        ctx.fillStyle = "rgb(20, 20, 24)"; ctx.fillRect(0, 0, cv.width, cv.height);
        // fade out: opaque for the first 40 %, then to transparent
        ctx.globalCompositeOperation = "destination-in";
        g = ctx.createLinearGradient(0, 0, 0, cv.height);
        g.addColorStop(0.4, "#000"); g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
        bg._obsW = W;
        bg.replaceChildren(cv);
      };
      img.src = src;
    }
    new MutationObserver(schedule).observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
    schedule();
  }

  // Window buttons: Spotify draws minimize/maximize/close natively with a dark backdrop that CSS cannot reach.
  // Hide the native ones through Spotify's DesktopUpdateUi service and draw transparent HTML buttons
  // (#obs-winctl) that call the DesktopWindowState service. If anything is missing, the native buttons stay.
  function windowControls(tries = 0) {
    const retry = () => { if (tries < 120) setTimeout(() => windowControls(tries + 1), 500); };
    const key = ["rspackChunk", "rspackChunkclient_web", "webpackChunkclient_web"].find(k => window[k]);
    if (!key || !document.body || !window.Spicetify?.Platform) return retry();

    // Esperanto clients take a transport with callSingle; every Platform client carries one
    const seen = new Set();
    const findTransport = (o, d) => {
      if (!o || typeof o !== "object" || seen.has(o) || d > 4) return null;
      seen.add(o);
      if (typeof o.transport?.callSingle === "function") return o.transport;
      let ks; try { ks = Object.keys(o); } catch { return null; }
      for (const k of ks) { let v; try { v = o[k]; } catch { continue; } const t = findTransport(v, d + 1); if (t) return t; }
      return null;
    };
    const transport = findTransport(Spicetify.Platform, 0);
    if (!transport) return retry();

    const req = window[key].push([[Symbol()], {}, r => r]);
    const mods = req.c
      ? Object.values(req.c).map(m => m?.exports)
      : Object.keys(req.m || {}).map(id => { try { return req(id); } catch { return null; } });
    let WindowState, UpdateUi;
    for (const exp of mods) {
      if (!exp || (typeof exp !== "object" && typeof exp !== "function")) continue;
      let values; try { values = Object.values(exp); } catch { continue; }
      for (const v of values) {
        if (typeof v !== "function") continue;
        let id; try { id = v.SERVICE_ID; } catch { continue; }
        if (id === "spotify.desktop.window_state_esperanto.proto.DesktopWindowState") WindowState = v;
        if (id === "spotify.desktop.update_ui_esperanto.proto.DesktopUpdateUi") UpdateUi = v;
      }
      if (WindowState && UpdateUi) break;
    }
    if (!WindowState || !UpdateUi) return console.warn("[Obsidian] window services not found, keeping native window buttons");

    const ws = new WindowState(transport), ui = new UpdateUi(transport);
    const NORMAL = 1, MAXIMIZED = 2, MINIMIZED = 3;
    const svg = d => `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
    const ICON = {
      min: svg("M0 5.5h10"),
      max: svg("M.5 .5h9v9h-9z"),
      restore: svg("M2.5 .5h7v7M.5 2.5h7v7h-7z"),
      close: svg("M.5 .5l9 9M9.5 .5l-9 9")
    };

    const bar = document.createElement("div");
    bar.id = "obs-winctl";
    bar.innerHTML =
      `<button type="button" data-act="min" aria-label="Minimieren">${ICON.min}</button>` +
      `<button type="button" data-act="max" aria-label="Maximieren">${ICON.max}</button>` +
      `<button type="button" data-act="close" aria-label="Schließen">${ICON.close}</button>`;
    const maxBtn = bar.querySelector("[data-act=max]");
    let state = NORMAL;
    const setState = s => {
      state = s;
      const max = s === MAXIMIZED;
      maxBtn.innerHTML = max ? ICON.restore : ICON.max;
      maxBtn.setAttribute("aria-label", max ? "Wiederherstellen" : "Maximieren");
    };
    bar.addEventListener("click", e => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "min") ws.setWindowState({ state: MINIMIZED });
      else if (act === "max") ws.setWindowState({ state: state === MAXIMIZED ? NORMAL : MAXIMIZED });
      else if (act === "close") ws.closeWindow({});
    });
    document.body.appendChild(bar);
    ws.getWindowState({}).then(r => setState(r.state), () => {});
    try { ws.subscribeWindowState({}, r => { if (r.state !== MINIMIZED) setState(r.state); }); } catch {}

    // Spotify toggles its native buttons itself (fullscreen, cinema mode): keep them hidden and mirror the wish on ours
    const orig = UpdateUi.prototype.setButtonsVisibility;
    UpdateUi.prototype.setButtonsVisibility = function (msg, opts) {
      bar.hidden = msg?.showButtons === false;
      return orig.call(this, { ...msg, showButtons: false }, opts);
    };
    ui.setButtonsVisibility({ showButtons: !document.fullscreenElement });
  }

  applySettings(settings.get());
  start();
  settingsMenu();
  wallpaper.enable(settings.get().wallpaper);
  windowControls();
  if (OPTS.coverHeader) coverHeader();
})();
