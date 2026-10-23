const FAITH_CLIENT_VERSION = "107-mic-organic-cyan-pink-gradient-editing";

// Transport rule (hard-won, 2026-10-22, proven by the v6 tab test): the image
// backend (image-generation.perchance.org) sends
//   frame-ancestors 'self' https://*.perchance.org https://perchance.org
// and the text-to-image plugin generates INSIDE a nested iframe on that host.
// So generation can only complete when every ancestor of the bridge page is a
// perchance.org page. From this Ruby host (localhost/file) a hidden bridge
// frame loads and answers "ready" fine, but its backend iframe is refused and
// the job hangs forever — while a top-level painter TAB (pure perchance.org
// ancestry) paints fine (v6: READY at 20s, image back in 33s). Hence: TAB
// FIRST here; the frame is only used when this page itself runs on
// *.perchance.org.
// Wrapper wrinkle: the bridge URL serves a WRAPPER page (top-level viewers
// are bounced to canonical), so the bridge always runs nested in a frame
// inside the painter tab. Its messages come from that inner frame, NOT from
// the tab window itself — so the tab path matches answers by origin + jobId
// (never e.source === tab) and SENDS by broadcasting to the tab plus every
// frame in it (tab.frames[i].postMessage works cross-origin).
// Batch + resolution (v95): one bridge job carries count (1-32, generated
// with bounded concurrency, streamed back per image) and an optional target
// size. The backend only renders 512/768px natively; larger sizes are
// canvas-upscaled in the painter tab and labeled with native→delivered dims.
function frameTransportCanGenerate() {
  try { return /\.perchance\.org$/i.test(String(location.hostname || "")); } catch (_) { return false; }
}

// Shared Art Style dropdown for image generation. The selected style is sent
// as "art_style" with /api/imagegen (and the /api/chat fallback) and applied
// server-side in server.rb. "No style" = legacy unstyled behavior.
const FAITH_ART_STYLES = [
  "No style",
  "Painted Anime",
  "Casual Photo",
  "Cinematic",
  "Digital Painting",
  "Concept Art",
  "3D Disney Character",
  "2D Disney Character",
  "Disney Sketch",
  "Concept Sketch",
  "Painterly",
  "Oil Painting",
  "Oil Painting - Realism",
  "Oil Painting - Old",
  "Oil Painting - 70s Pulp",
  "Professional Photo",
  "Anime",
  "Drawn Anime",
  "Anime Screencap",
  "Cute Anime",
  "Soft Anime",
  "Fantasy Painting",
  "Fantasy Landscape",
  "Fantasy Portrait",
  "Studio Ghibli",
  "50s Enamel Sign",
  "Vintage Comic",
  "Franco-Belgian Comic",
  "Tintin Comic",
  "Medieval",
  "Pixel Art",
  "Furry - Oil",
  "Furry - Cinematic",
  "Furry - Painted",
  "Furry - Drawn",
  "Cute Figurine",
  "3D Emoji",
  "Illustration",
  "Cute Illustration",
  "Flat Illustration",
  "Watercolor",
  "1990s Photo",
  "1980s Photo",
  "1970s Photo",
  "1960s Photo",
  "1950s Photo",
  "1940s Photo",
  "1930s Photo",
  "1920s Photo",
  "Vintage Pulp Art",
  "50s Infomercial Anime",
  "3D Pokemon",
  "Painted Pokemon",
  "2D Pokemon",
  "Vintage Anime",
  "Neon Vintage Anime",
  "Manga",
  "Fantasy World Map",
  "Fantasy City Map",
  "Old World Map",
  "3D Isometric Icon",
  "Flat Style Icon",
  "Flat Style Logo",
  "Game Art Icon",
  "Digital Painting Icon",
  "Concept Art Icon",
  "Cute 3D Icon",
  "Cute 3D Icon Set",
  "Crayon Drawing",
  "Pencil",
  "Tattoo Design",
  "Waifu",
  "YuGiOh Art",
  "Traditional Japanese",
  "Nihonga Painting",
  "Claymation",
  "Cartoon",
  "Cursed Photo",
  "MTG Card",
];
const FAITH_ART_STYLE_KEY = "faithArtStyle";

function getFaithArtStyle() {
  try {
    const saved = localStorage.getItem(FAITH_ART_STYLE_KEY);
    if (saved && FAITH_ART_STYLES.includes(saved)) return saved;
  } catch (_) {}
  return "No style";
}

function setFaithArtStyle(name) {
  const style = FAITH_ART_STYLES.includes(name) ? name : "No style";
  try {
    localStorage.setItem(FAITH_ART_STYLE_KEY, style);
  } catch (_) {}
  const select = document.getElementById("art-style-select");
  if (select && select.value !== style) select.value = style;
  return style;
}

function initFaithArtStyleSelect() {
  const select = document.getElementById("art-style-select");
  if (!select) return;
  if (!select.options.length) {
    FAITH_ART_STYLES.forEach((style) => {
      const option = document.createElement("option");
      option.value = style;
      option.textContent = (style === "No style" ? "No style" : "🎨 " + style);
      select.appendChild(option);
    });
  }
  select.value = getFaithArtStyle();
  if (!select.dataset.faithHooked) {
    select.dataset.faithHooked = "true";
    select.addEventListener("change", () => setFaithArtStyle(select.value));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFaithArtStyleSelect);
} else {
  initFaithArtStyleSelect();
}

// How-many selector for generated images. One bridge job paints the whole
// batch (bounded parallel generations, streamed back per image) — NOT N
// sequential jobs. Persisted in localStorage like Art Style.
const FAITH_IMAGE_COUNTS = [1, 2, 3, 4, 8, 16, 32];
const FAITH_IMAGE_COUNT_KEY = "faithImageCount";

function getFaithImageCount() {
  try {
    const saved = parseInt(localStorage.getItem(FAITH_IMAGE_COUNT_KEY), 10);
    if (FAITH_IMAGE_COUNTS.includes(saved)) return saved;
  } catch (_) {}
  return 1;
}

function setFaithImageCount(count) {
  const n = FAITH_IMAGE_COUNTS.includes(count) ? count : 1;
  try {
    localStorage.setItem(FAITH_IMAGE_COUNT_KEY, String(n));
  } catch (_) {}
  const select = document.getElementById("image-count-select");
  if (select && select.value !== String(n)) select.value = String(n);
  return n;
}

function initFaithImageCountSelect() {
  const select = document.getElementById("image-count-select");
  if (!select) return;
  if (!select.options.length) {
    FAITH_IMAGE_COUNTS.forEach((n) => {
      const option = document.createElement("option");
      option.value = String(n);
      option.textContent = n === 1 ? "1 image" : n + " images";
      select.appendChild(option);
    });
  }
  select.value = String(getFaithImageCount());
  if (!select.dataset.faithHooked) {
    select.dataset.faithHooked = "true";
    select.addEventListener("change", () => setFaithImageCount(parseInt(select.value, 10)));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFaithImageCountSelect);
} else {
  initFaithImageCountSelect();
}

// Output-size selector. "Native *" delivers backend pixels untouched (fastest,
// smallest). Larger sizes generate at the closest native aspect, then upscale
// in the painter tab; captions always show the delivered size + native size.
// "Custom…" reveals W×H inputs (64–8192px; big batches share a megapixel
// budget so 32 huge images cannot OOM the tab — the bridge reports when it
// sizes down). Persisted in localStorage like Art Style + How-many.
const FAITH_IMAGE_SIZES = [
  { id: "n512", label: "Native 512²", w: 512, h: 512, isNative: true },
  { id: "np", label: "Native portrait 512×768", w: 512, h: 768, isNative: true },
  { id: "nl", label: "Native landscape 768×512", w: 768, h: 512, isNative: true },
  { id: "n768", label: "Native 768²", w: 768, h: 768, isNative: true },
  { id: "1s", label: "1K □ 1024²", w: 1024, h: 1024 },
  { id: "1p", label: "1K ▯ 683×1024", w: 683, h: 1024 },
  { id: "1l", label: "1K ▭ 1024×683", w: 1024, h: 683 },
  { id: "2s", label: "2K □ 2048²", w: 2048, h: 2048 },
  { id: "2p", label: "2K ▯ 1365×2048", w: 1365, h: 2048 },
  { id: "2l", label: "2K ▭ 2048×1365", w: 2048, h: 1365 },
  { id: "4s", label: "4K □ 4096²", w: 4096, h: 4096 },
  { id: "4p", label: "4K ▯ 2731×4096", w: 2731, h: 4096 },
  { id: "4l", label: "4K ▭ 4096×2731", w: 4096, h: 2731 },
  { id: "8p", label: "8K ▯ 5120×7680", w: 5120, h: 7680 },
  { id: "8l", label: "8K ▭ 7680×5120", w: 7680, h: 5120 },
  { id: "custom", label: "Custom…", custom: true }
];
const FAITH_IMAGE_SIZE_KEY = "faithImageSize";
const FAITH_IMAGE_CUSTOM_W_KEY = "faithImageCustomW";
const FAITH_IMAGE_CUSTOM_H_KEY = "faithImageCustomH";

function getFaithImageCustomDims() {
  let w = 1024, h = 1536;
  try {
    const wEl = document.getElementById("image-width-input");
    const hEl = document.getElementById("image-height-input");
    if (wEl) { const v = parseInt(wEl.value, 10); if (isFinite(v)) w = v; }
    if (hEl) { const v = parseInt(hEl.value, 10); if (isFinite(v)) h = v; }
  } catch (_) {}
  w = Math.max(64, Math.min(8192, w || 1024));
  h = Math.max(64, Math.min(8192, h || 1536));
  return { w, h };
}

function getFaithImageSize() {
  let id = "np";
  try { id = localStorage.getItem(FAITH_IMAGE_SIZE_KEY) || "np"; } catch (_) {}
  const found = FAITH_IMAGE_SIZES.find((s) => s.id === id) || FAITH_IMAGE_SIZES[1];
  if (found.custom) {
    const d = getFaithImageCustomDims();
    return { id: "custom", label: `Custom ${d.w}×${d.h}`, w: d.w, h: d.h, isNative: false, custom: true };
  }
  return found;
}

// Nearest legacy backend resolution string for a size (used when no upscale
// is requested, so the proven single-image path is taken verbatim).
function faithSizeToLegacy(size) {
  const w = size.w || 512, h = size.h || 768;
  if (Math.max(w, h) <= 512) return "512x512";
  const a = w / h;
  if (a >= 1.15) return "768x512";
  if (a <= 0.87) return "512x768";
  return "768x768";
}

function syncFaithCustomDimInputs() {
  let custom = false;
  try { custom = (localStorage.getItem(FAITH_IMAGE_SIZE_KEY) || "np") === "custom"; } catch (_) {}
  try {
    const wEl = document.getElementById("image-width-input");
    const hEl = document.getElementById("image-height-input");
    const xEl = document.getElementById("image-dim-x");
    if (wEl) wEl.hidden = !custom;
    if (hEl) hEl.hidden = !custom;
    if (xEl) xEl.hidden = !custom;
  } catch (_) {}
}

function setFaithImageSize(id) {
  const found = FAITH_IMAGE_SIZES.find((s) => s.id === id) || FAITH_IMAGE_SIZES[1];
  try {
    localStorage.setItem(FAITH_IMAGE_SIZE_KEY, found.id);
    if (found.custom) {
      const d = getFaithImageCustomDims();
      localStorage.setItem(FAITH_IMAGE_CUSTOM_W_KEY, String(d.w));
      localStorage.setItem(FAITH_IMAGE_CUSTOM_H_KEY, String(d.h));
    }
  } catch (_) {}
  const select = document.getElementById("image-size-select");
  if (select && select.value !== found.id) select.value = found.id;
  syncFaithCustomDimInputs();
  return getFaithImageSize();
}

function initFaithImageSizeSelect() {
  const select = document.getElementById("image-size-select");
  if (select && !select.options.length) {
    FAITH_IMAGE_SIZES.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.label;
      select.appendChild(option);
    });
  }
  let savedId = "np", savedW = 1024, savedH = 1536;
  try {
    savedId = localStorage.getItem(FAITH_IMAGE_SIZE_KEY) || "np";
    savedW = parseInt(localStorage.getItem(FAITH_IMAGE_CUSTOM_W_KEY), 10) || 1024;
    savedH = parseInt(localStorage.getItem(FAITH_IMAGE_CUSTOM_H_KEY), 10) || 1536;
  } catch (_) {}
  try {
    const wEl = document.getElementById("image-width-input");
    const hEl = document.getElementById("image-height-input");
    if (wEl && !wEl.value) wEl.value = String(Math.max(64, Math.min(8192, savedW)));
    if (hEl && !hEl.value) hEl.value = String(Math.max(64, Math.min(8192, savedH)));
  } catch (_) {}
  if (select) select.value = FAITH_IMAGE_SIZES.find((s) => s.id === savedId) ? savedId : "np";
  syncFaithCustomDimInputs();
  if (select && !select.dataset.faithHooked) {
    select.dataset.faithHooked = "true";
    select.addEventListener("change", () => setFaithImageSize(select.value));
  }
  const persistCustom = () => {
    try {
      const d = getFaithImageCustomDims();
      localStorage.setItem(FAITH_IMAGE_CUSTOM_W_KEY, String(d.w));
      localStorage.setItem(FAITH_IMAGE_CUSTOM_H_KEY, String(d.h));
    } catch (_) {}
  };
  ["image-width-input", "image-height-input"].forEach((elId) => {
    const el = document.getElementById(elId);
    if (el && !el.dataset.faithHooked) {
      el.dataset.faithHooked = "true";
      el.addEventListener("change", persistCustom);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFaithImageSizeSelect);
} else {
  initFaithImageSizeSelect();
}

// Prewarm the paint frame with the page (no click gesture needed for an
// iframe) so the first paint usually finds a warm frame. Also re-arms after
// the 5-minute frame-failure cooldown expires.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", prewarmBridgeFrame);
} else {
  prewarmBridgeFrame();
}

// Faith paint backend: Perchance-backend pixels for a localhost Faith.
//
// Two transports, same bridge protocol (faith-bridge-job in, dataUrl out;
// batch jobs stream faith-bridge-image per image + a finished summary).
//   1. hidden iframe (primary) — the bridge generator framed from this page.
//      Parent/child postMessage cannot be severed the way a popup tab's
//      opener link can, needs no click gesture, and is never popup-blocked.
//   2. top-level painter TAB (fallback) — opened in the user's Send click
//      (see submitQuestion) so the browser cannot block it as a popup.
// The generator's own Art Style list + backend do the painting; sequential
// jobs matched by unguessable jobIds.
const FAITH_IMAGE_BRIDGE_URL_DEFAULT = "https://null.perchance.org/faith-image-bridge";
const FAITH_IMAGE_BRIDGE_URL_KEY = "faithImageBridgeUrl";

function getFaithImageBridgeUrl() {
  try {
    const saved = (localStorage.getItem(FAITH_IMAGE_BRIDGE_URL_KEY) || "").trim();
    if (saved && /^https:\/\/[^/]+\.perchance\.org\//.test(saved)) return saved;
  } catch (_) {}
  return FAITH_IMAGE_BRIDGE_URL_DEFAULT;
}

let faithPainterPopup = null;
let faithPainterReady = false;
let faithPainterOrigin = "";
const faithPainterPending = {};
const faithPainterReadyWaiters = [];
let faithPainterListening = false;

// Persistent warm paint frame (primary transport). ONE hidden iframe to the
// bridge, created once in the background and REUSED for every paint — a fresh
// frame per paint would replay the generator's full 20s+ cold load every time
// (that cold load per image is what made paints take over a minute). The frame
// stays warm across paints and across the images of one paint request, so jobs
// are posted straight to it with zero handshake wait.
let faithBridgeFrame = null;
let faithBridgeFrameReady = false;
let faithBridgeFrameCoolUntil = 0; // skip the frame while a block/failure is fresh
const faithBridgeFrameWaiters = [];

function bridgeFrameCoolMs() { return Date.now() < faithBridgeFrameCoolUntil; }

function noteBridgeFrameBroken(reason) {
  console.warn("[Faith Images] Paint frame unavailable (" + reason + "); using the painter tab for a while.");
  faithBridgeFrameReady = false;
  try { if (faithBridgeFrame && faithBridgeFrame.parentNode) faithBridgeFrame.parentNode.removeChild(faithBridgeFrame); } catch (_) {}
  faithBridgeFrame = null;
  // 5-minute cooldown: environments whose framing policy blocks the embed
  // stop paying a dead ready-timeout on every single paint; after the
  // cooldown the next paint warms a fresh frame in the background again.
  faithBridgeFrameCoolUntil = Date.now() + 5 * 60 * 1000;
  const waiters = faithBridgeFrameWaiters.splice(0, faithBridgeFrameWaiters.length);
  waiters.forEach((fn) => { try { fn(new Error("paint frame unavailable")); } catch (_) {} });
}

function onBridgeFrameReadyEvent() {
  if (!faithBridgeFrameReady) {
    faithBridgeFrameReady = true;
    console.info("[Faith Images] Paint frame warm.");
  }
  const waiters = faithBridgeFrameWaiters.splice(0, faithBridgeFrameWaiters.length);
  waiters.forEach((fn) => { try { fn(null); } catch (_) {} });
}

function ensureBridgeFrame() {
  installFaithPainterListener(); // single shared message router (tab + frame)
  const wantUrl = getFaithImageBridgeUrl();
  try {
    if (faithBridgeFrame && document.contains(faithBridgeFrame) && faithBridgeFrame.contentWindow &&
        faithBridgeFrame.dataset.bridgeUrl === wantUrl) return faithBridgeFrame;
  } catch (_) {}
  try { if (faithBridgeFrame && faithBridgeFrame.parentNode) faithBridgeFrame.parentNode.removeChild(faithBridgeFrame); } catch (_) {}
  faithBridgeFrame = null;
  faithBridgeFrameReady = false;
  const frame = document.createElement("iframe");
  frame.setAttribute("data-faith-paint", "frame");
  frame.dataset.bridgeUrl = wantUrl;
  frame.style.cssText = "position:fixed;left:0;top:0;width:10px;height:10px;opacity:0;pointer-events:none;";
  frame.src = wantUrl;
  document.body.appendChild(frame);
  faithBridgeFrame = frame;
  try {
    if (!frame.contentWindow) noteBridgeFrameBroken("blocked by CSP/extension");
  } catch (_) {}
  return frame;
}

// Background prewarm: start loading the frame with the page so it is already
// warm by the time the user paints. Needs no click gesture (unlike the tab).
// Skipped entirely where the frame can never generate (see above) — no point
// paying a page load for a transport that the backend's framing policy blocks.
function prewarmBridgeFrame() {
  if (!frameTransportCanGenerate()) return;
  if (bridgeFrameCoolMs()) return;
  try {
    if (!faithBridgeFrame || !document.contains(faithBridgeFrame)) ensureBridgeFrame();
  } catch (_) {}
}

function installFaithPainterListener() {
  if (faithPainterListening) return;
  faithPainterListening = true;
  window.addEventListener("message", (event) => {
    if (typeof event.origin !== "string" || !/\.perchance\.org$/.test(event.origin)) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "faith-bridge-ready") {
      // Warm-frame announcement from the persistent hidden iframe.
      try {
        if (faithBridgeFrame && event.source === faithBridgeFrame.contentWindow) { onBridgeFrameReadyEvent(); return; }
      } catch (_) {}
      // Painter-tab announcement. The bridge runs nested inside the wrapper
      // tab, so the READY source is the inner frame, never the tab window —
      // accept it whenever our tab is open (origin already filtered above).
      try {
        if (!faithPainterPopup || faithPainterPopup.closed) return;
      } catch (_) { return; }
      faithPainterReady = true;
      faithPainterOrigin = event.origin;
      const waiters = faithPainterReadyWaiters.splice(0, faithPainterReadyWaiters.length);
      waiters.forEach((fn) => { try { fn(); } catch (_) {} });
      return;
    }
    // Streaming batch images: routed to the job's onImage/onImageError
    // callbacks WITHOUT settling the job (the finished summary settles it).
    if ((msg.type === "faith-bridge-image" || msg.type === "faith-bridge-image-error") && typeof msg.jobId === "string" && msg.jobId) {
      const streamEntry = faithPainterPending[msg.jobId];
      if (!streamEntry) return;
      try {
        if (msg.type === "faith-bridge-image") { if (streamEntry.onImage) streamEntry.onImage(msg); }
        else if (streamEntry.onImageError) streamEntry.onImageError(msg);
      } catch (_) {}
      return;
    }
    if (typeof msg.jobId !== "string" || !msg.jobId) return;
    const entry = faithPainterPending[msg.jobId];
    if (!entry) return;
    delete faithPainterPending[msg.jobId];
    if (msg.type === "faith-bridge-finished") {
      if (entry.streaming) entry.resolve({ completed: msg.completed || 0, failed: msg.failed || 0, provider: msg.provider || "Perchance" });
      else if (!msg.dataUrl) entry.reject(new Error("The image bridge returned an empty result."));
      else entry.resolve({ url: msg.dataUrl, provider: msg.provider || "Perchance" });
    } else if (msg.type === "faith-bridge-error") {
      entry.reject(new Error(String(msg.message || "The image bridge reported a failure.")));
    }
  });
}

// Must run inside the user's click/keypress gesture (called from the sync
// part of submitQuestion) or the browser blocks the tab as a popup. Reuses
// the named tab across paints. Returns the tab, or null when blocked.
function openFaithPainterPopup() {
  try {
    if (faithPainterPopup && !faithPainterPopup.closed) return faithPainterPopup;
  } catch (_) {}
  faithPainterReady = false;
  faithPainterOrigin = "";
  let popup = null;
  try { popup = window.open(getFaithImageBridgeUrl(), "faith-painter"); } catch (_) { popup = null; }
  if (popup) {
    faithPainterPopup = popup;
    installFaithPainterListener();
    return popup;
  }
  return null;
}

// The bridge runs in a frame inside the wrapper tab, so jobs and pings must
// be broadcast to the tab window AND every frame in it (cross-origin
// postMessage to popup.frames[i] is allowed; each post is fenced so one
// blocked frame cannot break the rest). Returns a short delivery summary.
function postToPainterTab(obj) {
  let popup = null;
  try { popup = (faithPainterPopup && !faithPainterPopup.closed) ? faithPainterPopup : null; } catch (_) { popup = null; }
  if (!popup) return "no open tab";
  let n = 0;
  const problems = [];
  try { popup.postMessage(obj, "*"); n++; } catch (err) { problems.push("tab: " + (err && err.message)); }
  let len = 0, lenOk = false;
  try { len = popup.frames.length; lenOk = true; } catch (err) { problems.push("frames.length blocked"); }
  if (lenOk) {
    for (let i = 0; i < len; i++) {
      try { popup.frames[i].postMessage(obj, "*"); n++; }
      catch (err) { problems.push("frame" + i + " blocked"); }
    }
  }
  return "posted to " + n + " window(s)" + (problems.length ? " [" + problems.join("; ") + "]" : "");
}

// Resolves once the painter tab announces itself. Fresh tabs announce on
// load; reused tabs answer the ping (the bridge implements both). Always
// re-verified so a tab the user navigated elsewhere cannot swallow a job.
function ensurePainterReady(timeoutMs, bridgeUrl) {
  try {
    // Warm tab: already handshaked and still open — no ping roundtrip.
    if (faithPainterPopup && !faithPainterPopup.closed && faithPainterReady && faithPainterOrigin) return Promise.resolve();
    if (faithPainterPopup && !faithPainterPopup.closed) faithPainterReady = false;
    else throw new Error("painter tab is not open");
  } catch (err) {
    return Promise.reject(new Error("Faith's painter tab is not open. Allow popups for this page, then send your paint request again."));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = faithPainterReadyWaiters.indexOf(done);
      if (i !== -1) faithPainterReadyWaiters.splice(i, 1);
      reject(new Error("Faith's painter tab did not answer. Open " + bridgeUrl + " in a tab — it should show the bridge page. If a painter tab opened but shows the wrong page, close it and paint again."));
    }, timeoutMs);
    function done() { clearTimeout(timer); resolve(); }
    faithPainterReadyWaiters.push(done);
    try {
      if (faithPainterPopup && !faithPainterPopup.closed) postToPainterTab({ type: "faith-bridge-ping" });
    } catch (_) {}
  });
}

// Paint job over the persistent warm frame. The frame is created once and
// reused (never destroyed here): a warm frame takes the job immediately with
// no handshake wait; a cold (still loading) frame resolves the job as soon as
// its honest-ready arrives. Never touches the tab flow.
function runBridgeFrameJob(spec, jobTimeoutMs, bridgeUrl) {
  const question = (spec && (spec.question || spec.visual || spec.prompt) ? String(spec.question || spec.visual || spec.prompt) : "").slice(0, 1500);
  if (!question.trim()) return Promise.reject(new Error("Faith did not build an image prompt."));
  const artStyle = (spec && spec.artStyle) ? String(spec.artStyle) : "No style";
  const resolution = (spec && spec.resolution) ? String(spec.resolution) : "512x768";
  if (bridgeFrameCoolMs()) return Promise.reject(new Error("Paint frame cooling down after a failure."));
  return new Promise((resolve, reject) => {
    let settled = false;
    const t0 = Date.now();
    const jobId = "faith" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    let frameEl = null;
    try { frameEl = ensureBridgeFrame(); } catch (_) { frameEl = null; }
    if (!frameEl) { reject(new Error("Paint frame unavailable.")); return; }
    let readyTimer = null;
    let jobTimer = null;
    let posted = false;
    function finishOk(value) {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      if (jobTimer) clearTimeout(jobTimer);
      window.removeEventListener("message", onMessage);
      console.info("[Faith Images] Paint frame job " + jobId + " done (" + (Date.now() - t0) + "ms).");
      resolve(value);
    }
    function finishErr(err, markBroken) {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      if (jobTimer) clearTimeout(jobTimer);
      window.removeEventListener("message", onMessage);
      if (markBroken) noteBridgeFrameBroken(err && err.message ? err.message : "no answer");
      reject(err);
    }
    function postJob() {
      // The bridge announces ready twice per load (boot + post-load re-announce
      // for late attachers); send the job exactly once.
      if (posted) return;
      posted = true;
      console.info("[Faith Images] Paint frame job " + jobId + " sending (" + artStyle + ", " + resolution + ").");
      jobTimer = setTimeout(() => {
        finishErr(new Error("The embedded paint frame timed out."), false);
      }, jobTimeoutMs);
      try {
        frameEl.contentWindow.postMessage({ type: "faith-bridge-job", jobId: jobId, question: question, artStyle: artStyle, resolution: resolution }, "*");
      } catch (_) {
        finishErr(new Error("Could not talk to the embedded paint frame."), true);
      }
    }
    function onMessage(event) {
      if (typeof event.origin !== "string" || !/\.perchance\.org$/.test(event.origin)) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
      try { if (event.source !== frameEl.contentWindow) return; } catch (_) { return; }
      if (msg.type === "faith-bridge-ready") {
        if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
        postJob();
        return;
      }
      if (msg.jobId !== jobId) return;
      if (msg.type === "faith-bridge-finished") {
        if (!msg.dataUrl) finishErr(new Error("The embedded paint frame returned an empty result."), false);
        else finishOk({ url: msg.dataUrl, provider: msg.provider || "Perchance" });
      } else if (msg.type === "faith-bridge-error") {
        finishErr(new Error(String(msg.message || "The embedded paint frame reported a failure.")), false);
      }
    }
    window.addEventListener("message", onMessage);
    if (faithBridgeFrameReady) {
      postJob(); // warm frame: straight to generation, no handshake
    } else {
      readyTimer = setTimeout(() => {
        finishErr(new Error("The embedded paint frame did not answer (" + bridgeUrl + ")."), true);
      }, 30000);
    }
  });
}

// Frame-vs-tab race. The warm frame gets a head start (it is fastest when
// healthy); if it stays silent past the head start, the same job is ALSO sent
// to the already-open painter tab and the first answer wins. This is for
// browsers where framed generation never resolves while top-level pages paint
// fine: without the race every paint would burn the full frame timeout before
// the tab is even tried. The loser is ignored and cleaned up; the extra
// backend spend only happens when the frame is already effectively dead.
const FAITH_FRAME_HEAD_START_MS = 60000;

function existingPainterPopup() {
  try { return (faithPainterPopup && !faithPainterPopup.closed) ? faithPainterPopup : null; } catch (_) { return null; }
}

function raceBridgeTransports(spec, jobTimeoutMs, bridgeUrl, raceState) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let frameFinished = false, tabStarted = false, tabFinished = false;
    let frameError = null, tabError = null;
    let tabTimer = null, tabClosedPoll = null, tabJobId = null;
    function cleanupTab() {
      if (tabTimer) { clearTimeout(tabTimer); tabTimer = null; }
      if (tabClosedPoll) { clearInterval(tabClosedPoll); tabClosedPoll = null; }
      if (tabJobId && faithPainterPending[tabJobId]) delete faithPainterPending[tabJobId];
      tabJobId = null;
    }
    function win(value) {
      if (settled) return;
      settled = true;
      clearTimeout(headTimer);
      cleanupTab();
      resolve(value);
    }
    function maybeLose() {
      if (settled) return;
      if (frameFinished && (!tabStarted || tabFinished)) {
        settled = true;
        clearTimeout(headTimer);
        cleanupTab();
        reject(tabError || frameError || new Error("Paint bridge failed."));
      }
    }
    // Frame leg: full timeout, self-cleaning listener.
    runBridgeFrameJob(spec, jobTimeoutMs, bridgeUrl).then(
      (v) => { frameFinished = true; win(v); },
      (e) => { frameFinished = true; frameError = e; maybeLose(); }
    );
    // Tab leg joins after the head start if the frame is still silent. The tab
    // must already exist (opened from the Send click gesture); it is never
    // opened here, long after the gesture, where the browser would block it.
    const headTimer = setTimeout(() => {
      if (settled || frameFinished) return;
      const popup = existingPainterPopup();
      if (!popup) return; // no tab to race with; frame leg continues solo
      console.info("[Faith Images] Frame silent for 60s — racing the painter tab.");
      ensurePainterReady(30000, bridgeUrl).then(() => {
        if (settled || frameFinished) return;
        tabStarted = true;
        if (raceState) raceState.tabStarted = true;
        tabJobId = "faith" + Date.now().toString(36) + Math.random().toString(36).slice(2);
        tabTimer = setTimeout(() => {
          tabError = new Error("The painter tab timed out.");
          tabFinished = true;
          const id = tabJobId; tabJobId = null; cleanupTab();
          if (id) console.warn("[Faith Images] Tab leg timed out.");
          maybeLose();
        }, jobTimeoutMs);
        tabClosedPoll = setInterval(() => {
          let closed = true;
          try { closed = !faithPainterPopup || faithPainterPopup.closed; } catch (_) {}
          if (closed) {
            tabError = new Error("The painter tab was closed before the image finished.");
            tabFinished = true;
            tabJobId = null; cleanupTab();
            maybeLose();
          }
        }, 2000);
        faithPainterPending[tabJobId] = {
          resolve: (v) => { console.info("[Faith Images] Tab leg won the race."); win(v); },
          reject: (e) => { tabError = e; tabFinished = true; tabJobId = null; cleanupTab(); maybeLose(); }
        };
        try {
          console.info("[Faith Images] Tab leg sending job " + tabJobId + " -> " + postToPainterTab({ type: "faith-bridge-job", jobId: tabJobId, question: spec.question, artStyle: spec.artStyle, resolution: spec.resolution }));
        } catch (_) {
          tabError = new Error("Could not talk to the painter tab.");
          tabFinished = true; tabJobId = null; cleanupTab();
          maybeLose();
        }
      }, (tabReadyErr) => {
        if (!settled && !frameFinished) console.warn("[Faith Images] Tab leg not ready:", tabReadyErr && tabReadyErr.message);
        // Frame leg continues solo; its own settle decides the race.
      });
    }, FAITH_FRAME_HEAD_START_MS);
  });
}

// Batched tab job (count 1-32 and/or upscale target): ONE bridge job, images
// streamed back progressively through opts.onImage. Tab-only — the frame
// path stays single-image. The painter tab must already exist (opened from
// the Send click gesture); this never opens popups itself.
function runBridgeBatchJob(spec, count, targetW, targetH, jobTimeoutMs, bridgeUrl, opts) {
  const question = spec.question;
  const artStyle = spec.artStyle;
  const resolution = spec.resolution;
  const onImage = opts && opts.onImage;
  const onImageError = opts && opts.onImageError;
  return new Promise((resolve, reject) => {
    let popup = null;
    try { popup = (faithPainterPopup && !faithPainterPopup.closed) ? faithPainterPopup : null; } catch (_) { popup = null; }
    if (!popup) {
      reject(new Error("The painter tab is not open. Allow popups for this page, then send your paint request again."));
      return;
    }
    ensurePainterReady(45000, bridgeUrl).then(() => {
      const jobId = "faith" + Date.now().toString(36) + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        delete faithPainterPending[jobId];
        clearInterval(closedPoll);
        reject(new Error("The image bridge timed out. The Perchance queue can be slow — try again, or open the painter tab to check it."));
      }, jobTimeoutMs);
      const closedPoll = setInterval(() => {
        let closed = true;
        try { closed = !faithPainterPopup || faithPainterPopup.closed; } catch (_) {}
        if (closed) {
          clearTimeout(timer);
          clearInterval(closedPoll);
          delete faithPainterPending[jobId];
          faithPainterReady = false;
          reject(new Error("The painter tab was closed before the images finished. Paint again and leave the painter tab open."));
        }
      }, 2000);
      faithPainterPending[jobId] = {
        streaming: true,
        resolve: (summary) => { clearTimeout(timer); clearInterval(closedPoll); console.info("[Faith Images] Batch finished job " + jobId + ": " + summary.completed + " ok, " + summary.failed + " failed."); resolve(summary); },
        reject: (e) => { clearTimeout(timer); clearInterval(closedPoll); reject(e); },
        onImage, onImageError
      };
      console.info("[Faith Images] Batch job " + jobId + " x" + count + (targetW ? " -> " + targetW + "x" + targetH : " (native)") + " -> " + postToPainterTab({ type: "faith-bridge-job", jobId: jobId, question: question, artStyle: artStyle, resolution: resolution, stream: true, count: count, targetWidth: targetW, targetHeight: targetH }));
    }, (readyErr) => {
      reject(new Error("Faith's painter tab did not answer. " + (readyErr && readyErr.message ? readyErr.message : "")));
    });
  });
}

function generateFaithImageViaBridge(job, opts) {
  // The bridge owns visual extraction + Art Style styling, so Faith sends
  // the RAW user question plus the style name — never a pre-styled prompt.
  const question = (job && (job.question || job.prompt) ? String(job.question || job.prompt) : "").slice(0, 1500);
  if (!question.trim()) return Promise.reject(new Error("Faith did not build an image prompt."));
  const artStyle = (job && job.artStyle) ? String(job.artStyle) : "No style";
  const allowedRes = ["512x512", "512x768", "768x512", "768x768"];
  const resolution = (job && allowedRes.indexOf(job.resolution) !== -1) ? job.resolution : "512x768";
  let count = 1;
  try {
    const c = parseInt(job && job.count, 10);
    if (isFinite(c)) count = Math.max(1, Math.min(32, c));
  } catch (_) {}
  let targetW = null, targetH = null;
  try {
    const w = Number(job && job.targetWidth), h = Number(job && job.targetHeight);
    if (isFinite(w) && isFinite(h) && w > 0 && h > 0) { targetW = Math.round(w); targetH = Math.round(h); }
  } catch (_) {}
  // Big batches take a while (bounded parallel generations + queueing):
  // ~1min per image of headroom, capped at 20 minutes.
  const timeoutMs = (opts && opts.timeoutMs) || Math.min(1200000, 180000 + count * 60000);
  const bridgeUrl = getFaithImageBridgeUrl();

  // Batch/upscale jobs go straight to the painter tab as ONE streaming job
  // (the frame path stays single-image). Needs the tab from the Send gesture.
  if (count > 1 || (targetW && targetH)) {
    return (async () => {
      let popup = null;
      try { popup = (faithPainterPopup && !faithPainterPopup.closed) ? faithPainterPopup : null; } catch (_) { popup = null; }
      if (!popup) {
        popup = openFaithPainterPopup();
        if (!popup) throw new Error("The painter tab was blocked by the browser. Allow popups for this page (look for the blocked-popup icon in the address bar), then send your paint request again — painting opens one reusable painter tab from your Send click.");
      }
      return await runBridgeBatchJob({ question: question, artStyle: artStyle, resolution: resolution }, count, targetW, targetH, timeoutMs, bridgeUrl, opts);
    })();
  }

  return (async () => {
    // Transport order: the painter tab is top-level on *.perchance.org, so the
    // backend's framing policy allows it everywhere — it goes first whenever
    // the frame cannot generate here (localhost/file host). The frame only
    // leads where it can actually generate (this page on *.perchance.org).
    // A warm painter tab (opened by an earlier Send click) serves immediately.
    const frameUsable = frameTransportCanGenerate() && !bridgeFrameCoolMs();
    let tabWarm = false;
    try { tabWarm = !!(faithPainterReady && faithPainterOrigin && faithPainterPopup && !faithPainterPopup.closed); } catch (_) {}
    if (!frameUsable) {
      console.info("[Faith Images] Frame transport blocked here (backend framing policy) — using painter tab.");
    } else if (!tabWarm) {
      const readyPopup = existingPainterPopup();
      if (readyPopup) {
        // Both transports available: race them. The frame gets a 60s head start
        // (fastest when healthy); if it stays silent the already-open tab joins
        // and the first answer wins. If the race already tried the tab, there is
        // nothing left to fall back to — otherwise fall through to the tab below.
        const raceState = { tabStarted: false };
        try {
          return await raceBridgeTransports({ question: question, artStyle: artStyle, resolution: resolution }, timeoutMs, bridgeUrl, raceState);
        } catch (raceErr) {
          if (raceState.tabStarted) throw raceErr;
          console.warn("[Faith Images] Frame leg failed, trying painter tab:", raceErr && raceErr.message);
        }
      } else {
        try {
          return await runBridgeFrameJob({ question: question, artStyle: artStyle, resolution: resolution }, timeoutMs, bridgeUrl);
        } catch (frameErr) {
          console.warn("[Faith Images] Embedded frame bridge failed, trying painter tab:", frameErr && frameErr.message);
        }
      }
    } else {
      console.info("[Faith Images] Painter tab already warm — using it.");
    }
    let popup = null;
    try { popup = (faithPainterPopup && !faithPainterPopup.closed) ? faithPainterPopup : null; } catch (_) { popup = null; }
    if (!popup) {
      popup = openFaithPainterPopup();
      if (!popup) throw new Error("The painter tab was blocked by the browser. Allow popups for this page (look for the blocked-popup icon in the address bar), then send your paint request again — painting opens one reusable painter tab from your Send click.");
    }
    await ensurePainterReady(45000, bridgeUrl);
    console.info("[Faith Images] Painter tab ready — sending prompt (" + question.length + " chars, style " + artStyle + ")");
    const jobId = "faith" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    console.info("[Faith Images] Painter job " + jobId + " -> " + bridgeUrl);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete faithPainterPending[jobId];
        clearInterval(closedPoll);
        reject(new Error("The image bridge timed out. The Perchance queue can be slow — try again, or open the painter tab to check it."));
      }, timeoutMs);
      const closedPoll = setInterval(() => {
        let closed = true;
        try { closed = !faithPainterPopup || faithPainterPopup.closed; } catch (_) {}
        if (closed) {
          clearTimeout(timer);
          clearInterval(closedPoll);
          delete faithPainterPending[jobId];
          faithPainterReady = false;
          reject(new Error("The painter tab was closed before the image finished. Paint again and leave the painter tab open."));
        }
      }, 2000);
      faithPainterPending[jobId] = {
        resolve: (v) => { clearTimeout(timer); clearInterval(closedPoll); console.info("[Faith Images] Painter finished job " + jobId); resolve(v); },
        reject: (e) => { clearTimeout(timer); clearInterval(closedPoll); reject(e); }
      };
      try {
        console.info("[Faith Images] Painter job " + jobId + " -> " + postToPainterTab({ type: "faith-bridge-job", jobId: jobId, question: question, artStyle: artStyle, resolution: resolution }));
      } catch (_) {
        delete faithPainterPending[jobId];
        clearTimeout(timer);
        clearInterval(closedPoll);
        reject(new Error("Could not talk to the painter tab."));
      }
    });
  })();
}

// Perchance-backend generation for Faith (hidden frame primary, painter tab
// fallback). job = { question (raw user text), artStyle, resolution }.
// Resolves {url, provider}. Faith paints with the generator's art styles +
// backend; the server only builds the styled spec, never any image bytes.
function generateFaithImage(job, opts) {
  return generateFaithImageViaBridge(job, opts);
}

// ---- Faith image-Editing transport (recreate tab) ----
// Uploaded images skip the local GGUF vision pipeline entirely: the image is
// posted as a faith-recreate-job to the faith-img-2-img generator, which
// auto-analyzes it and posts the description back. "Recreate in style" reuses
// the same tab with generate:true + the CURRENT frontend Art Style value.
// Tab-only (no hidden frame): like painting, generation needs top-level
// *.perchance.org ancestry for the image backend's framing policy, and the
// tab is opened in the Upload click gesture so popups can't block it.
const FAITH_RECREATE_URL_DEFAULT = "https://null.perchance.org/faith-img-2-img";
const FAITH_RECREATE_URL_KEY = "faithRecreateUrl";

function getFaithRecreateUrl() {
  try {
    const saved = (localStorage.getItem(FAITH_RECREATE_URL_KEY) || "").trim();
    if (saved && /^https:\/\/[^/]+\.perchance\.org\//.test(saved)) return saved;
  } catch (_) {}
  return FAITH_RECREATE_URL_DEFAULT;
}

let faithRecreatePopup = null;
let faithRecreateReady = false;
const faithRecreatePending = {};
const faithRecreateReadyWaiters = [];
let faithRecreateListening = false;
let recreateOpenedThisTurn = false;

function installFaithRecreateListener() {
  if (faithRecreateListening) return;
  faithRecreateListening = true;
  window.addEventListener("message", (event) => {
    if (typeof event.origin !== "string" || !/\.perchance\.org$/.test(event.origin)) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "faith-recreate-ready") {
      // The recreate page runs nested in its wrapper tab, so the READY source
      // is the inner frame, never the tab window — accept it whenever our tab
      // is open (same rule as the painter tab).
      try {
        if (!faithRecreatePopup || faithRecreatePopup.closed) return;
      } catch (_) { return; }
      faithRecreateReady = true;
      const waiters = faithRecreateReadyWaiters.splice(0, faithRecreateReadyWaiters.length);
      waiters.forEach((fn) => { try { fn(); } catch (_) {} });
      return;
    }
    if (typeof msg.jobId !== "string" || !msg.jobId) return;
    const entry = faithRecreatePending[msg.jobId];
    if (!entry) return;
    if (msg.type === "faith-recreate-analyzed") {
      // A generate:true job also emits analyzed on its way to finished; only
      // the analysis leg settles on it.
      if (entry.mode === "generate") return;
      delete faithRecreatePending[msg.jobId];
      if (!msg.description) entry.reject(new Error("The editor returned an empty description."));
      else entry.resolve({ description: String(msg.description), style: String(msg.style || "") });
    } else if (msg.type === "faith-recreate-finished") {
      delete faithRecreatePending[msg.jobId];
      if (!msg.dataUrl) entry.reject(new Error("The editor returned an empty result."));
      else entry.resolve({ url: msg.dataUrl, description: String(msg.description || ""), style: String(msg.style || "") });
    } else if (msg.type === "faith-recreate-error") {
      delete faithRecreatePending[msg.jobId];
      entry.reject(new Error(String(msg.message || "The editor reported a failure.")));
    }
  });
}

// Must run inside a user gesture (Upload click, Recreate-button click) or the
// browser blocks the tab as a popup. Reuses one named tab across turns.
function openFaithRecreatePopup() {
  try {
    if (faithRecreatePopup && !faithRecreatePopup.closed) return faithRecreatePopup;
  } catch (_) {}
  faithRecreateReady = false;
  let popup = null;
  try { popup = window.open(getFaithRecreateUrl(), "faith-recreate"); } catch (_) { popup = null; }
  if (popup) {
    faithRecreatePopup = popup;
    installFaithRecreateListener();
    return popup;
  }
  return null;
}
// ---- (recreate transport part 2) ----
// The recreate page runs in a frame inside the wrapper tab, so jobs and pings
// are broadcast to the tab window AND every frame in it (same pattern as the
// painter tab).
function postToRecreateTab(obj) {
  let popup = null;
  try { popup = (faithRecreatePopup && !faithRecreatePopup.closed) ? faithRecreatePopup : null; } catch (_) { popup = null; }
  if (!popup) return "no open tab";
  let n = 0;
  const problems = [];
  try { popup.postMessage(obj, "*"); n++; } catch (err) { problems.push("tab: " + (err && err.message)); }
  let len = 0, lenOk = false;
  try { len = popup.frames.length; lenOk = true; } catch (err) { problems.push("frames.length blocked"); }
  if (lenOk) {
    for (let i = 0; i < len; i++) {
      try { popup.frames[i].postMessage(obj, "*"); n++; }
      catch (err) { problems.push("frame" + i + " blocked"); }
    }
  }
  return "posted to " + n + " window(s)" + (problems.length ? " [" + problems.join("; ") + "]" : "");
}

// Resolves once the recreate tab announces itself. Always re-verified so a tab
// the user navigated elsewhere cannot swallow a job.
function ensureRecreateReady(timeoutMs) {
  try {
    if (faithRecreatePopup && !faithRecreatePopup.closed && faithRecreateReady) return Promise.resolve();
    if (faithRecreatePopup && !faithRecreatePopup.closed) faithRecreateReady = false;
    else throw new Error("recreate tab is not open");
  } catch (err) {
    return Promise.reject(new Error("Faith's editor tab is not open. Allow popups for this page, then upload again."));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = faithRecreateReadyWaiters.indexOf(done);
      if (i !== -1) faithRecreateReadyWaiters.splice(i, 1);
      reject(new Error("Faith's editor tab did not answer. Open " + getFaithRecreateUrl() + " in a tab — it should show the editor page. If an editor tab opened but shows the wrong page, close it and upload again."));
    }, timeoutMs);
    function done() { clearTimeout(timer); resolve(); }
    faithRecreateReadyWaiters.push(done);
    try {
      if (faithRecreatePopup && !faithRecreatePopup.closed) postToRecreateTab({ type: "faith-recreate-ping" });
    } catch (_) {}
  });
}

// One recreate job: { imageDataUrl, artStyle, description?, generate? }.
// Analysis-leg jobs (no generate) settle on faith-recreate-analyzed;
// generate:true jobs settle on faith-recreate-finished.
function runRecreateJob(spec, jobTimeoutMs) {
  const imageDataUrl = (spec && typeof spec.imageDataUrl === "string") ? spec.imageDataUrl : "";
  const artStyle = (spec && spec.artStyle) ? String(spec.artStyle) : getFaithArtStyle();
  const generate = !!(spec && spec.generate);
  const description = (spec && typeof spec.description === "string" && spec.description.trim()) ? spec.description.trim().slice(0, 2000) : "";
  if (!imageDataUrl && !description) return Promise.reject(new Error("Faith has no image to edit."));
  return new Promise((resolve, reject) => {
    let settled = false;
    const jobId = "recreate" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { delete faithRecreatePending[jobId]; } catch (_) {}
      reject(new Error("The image editor timed out. The Perchance queue can be slow — try again, or open the editor tab to check it."));
    }, jobTimeoutMs);
    faithRecreatePending[jobId] = {
      mode: generate ? "generate" : "analyze",
      resolve: (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); },
      reject: (err) => { if (settled) return; settled = true; clearTimeout(timer); reject(err); }
    };
    ensureRecreateReady(60000).then(() => {
      if (settled) return;
      console.info("[Faith Editing] Recreate job " + jobId + " -> " + postToRecreateTab({
        type: "faith-recreate-job", jobId: jobId, imageDataUrl: imageDataUrl,
        artStyle: artStyle, generate: generate, description: description
      }));
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { delete faithRecreatePending[jobId]; } catch (_) {}
      reject(err);
    });
  });
}
const expressionImages = {
  ruby: "/assets/ruby_wrench.png",
  thinking: "/assets/thinking.PNG",
  explanation: "/assets/explanation.PNG",
  confusion: "/assets/confusion.PNG",
  greeting: "/assets/greeting.PNG",
  painting: "/assets/painting.PNG",
  observing: "/assets/observing.PNG",
  editing: "/assets/editing.PNG",
  troubleshooting: "/assets/troubleshooting.PNG",
  coding: "/assets/coding.PNG",
  build: "/assets/build.png",
  robotic: "/assets/robotic.PNG",
  psychotic: "/assets/psychotic.PNG",
  sad: "/assets/sad.PNG",
  anger: "/assets/anger.PNG",
  erotic: "/assets/erotic.PNG",
  talking: "/assets/Talking.gif"
};

const expressionNames = {
  ruby: "Ruby / Wrench",
  thinking: "Thinking",
  explanation: "Explanation",
  confusion: "Confusion",
  greeting: "Greeting",
  painting: "Painting",
  observing: "Observing",
  editing: "Editing",
  troubleshooting: "Troubleshooting",
  coding: "Coding",
  build: "Build",
  robotic: "Robotic",
  psychotic: "Psychotic",
  sad: "Sad",
  anger: "Anger",
  erotic: "Erotic",
  talking: "Talking..."
};

// Voice may be controlled by the standalone voice module. Accept its common
// global/local setting signals without assuming browser TTS availability means
// the user's Faith voice feature is enabled.
function isFaithVoiceEnabled() {
  try {
    if (window.faithVoiceEnabled === true || window.FAITH_VOICE_ENABLED === true) return true;
    if (window.faithVoice && window.faithVoice.enabled === true) return true;
    if (window.localStorage && ["true", "1", "enabled", "on"].includes(String(
      window.localStorage.getItem("faithVoiceEnabled") ||
      window.localStorage.getItem("faith-voice-enabled") || ""
    ).toLowerCase())) return true;
    const toggle = document.querySelector(
      '#faith-voice-toggle, #voice-enabled, [name="faithVoiceEnabled"], [data-faith-voice-toggle]'
    );
    if (toggle && "checked" in toggle) return !!toggle.checked;
    if (toggle && toggle.getAttribute("aria-pressed") === "true") return true;
  } catch (_) {}
  return false;
}

function getDefaultReplyExpression(fallback = "explanation") {
  return isFaithVoiceEnabled() ? "talking" : fallback;
}

const expressionDetails = {
  ruby: "Ready",
  thinking: "Thinking...",
  explanation: "Explaining...",
  confusion: "Something seems unclear",
  greeting: "Hello!",
  painting: "Creating your image...",
  observing: "Examining your upload...",
  editing: "Editing your image...",
  troubleshooting: "Troubleshooting...",
  coding: "Coding...",
  build: "Building from the ground up...",
  robotic: "Processing...",
  psychotic: "Something is watching...",
  sad: "I'm here with you",
  anger: "Don't talk to me like that.",
  erotic: "Feeling artistic..."
};

// Mirror server.rb's deterministic classifier for the three states handled by
// the dedicated emotion GGUF. Keep this routing after Build/Troubleshooting
// branches, which must retain their existing priority.
function isEroticCapabilityQuestion(question) {
  const normalized = String(question || "").toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const adultArtTopic = /\b(?:nsfw|nudity|erotic|adult content|explicit images?|sexual images?|adult images?)\b/.test(normalized);
  // Require question/capability grammar. In particular, don't mistake a direct
  // image prompt like "paint a nude woman's butt" for a question about support.
  const capabilityQuestion = /\b(?:can|could|will|would|do|does|is|are)\s+(?:(?:you|faith|she|this app|the app|your system)\s+)?(?:also\s+)?(?:generate|make|create|support|allow|permit|produce|handle|offer|do|be|capable|able)\b/.test(normalized) ||
    /\b(?:can|could|will|would|do|does|is|are)\b.*\b(?:nsfw|nudity|erotic|adult content|explicit images?|sexual images?|adult images?)\b/.test(normalized) ||
    /\b(?:nsfw|nudity|erotic|adult content|explicit images?|sexual images?|adult images?)\b.*\b(?:supported|allowed|available|possible|capability|capabilities|support|permit|handle)\b/.test(normalized) ||
    /\b(?:is|are)\s+(?:nsfw|adult content|erotic content|nudity|explicit images?|sexual images?)\s+(?:supported|allowed|available|possible)\b/.test(normalized) ||
    /\b(?:capability|capabilities|support|supported|allowed|availability)\b.*\b(?:nsfw|nudity|erotic|adult content|explicit images?|sexual images?|adult images?)\b/.test(normalized);
  return adultArtTopic && capabilityQuestion;
}

function faithEmotionRoute(question) {
  const raw = String(question || "").trim();
  const normalized = raw.toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suicidalTerms = /\b(?:suicid(?:e|al)|kill myself|killing myself|killed myself|end it all|ending it all|end my life|ending my life|take my own life|taking my own life|want to die|wanna die|wish i was dead|wish i were dead|better off dead|don't want to be alive|do not want to be alive|dont want to be alive|don't wanna be alive|do not wanna be alive|cant go on|can't go on|cannot go on|no reason to live|nothing to live for|hurt myself|hurting myself|harm myself|harming myself|self harm|self-harm|self harming|self-harming|want to disappear forever)\b/i;
  if (suicidalTerms.test(normalized)) return "sad";

  if (isEroticCapabilityQuestion(question)) return "erotic";

  const letters = raw.match(/[A-Za-z]/g) || [];
  const uppercaseRatio = letters.length >= 2
    ? letters.filter((ch) => ch === ch.toUpperCase()).length / letters.length
    : 0;
  if (uppercaseRatio >= 0.70 || raw.includes("!")) return "anger";

  const faithReference = /\b(?:you|your|yourself|faith|faiths|faith's|are you|do you|can you|does faith|is faith)\b/.test(normalized);
  const selfAwareness = /\b(?:sentien(?:t|ce)|self[- ]?aware|self awareness|conscious(?:ness)?|alive|life form|feel(?:ing|s)?|emotion(?:s|al)?|think for yourself|individual thought|independent thought|own thoughts|free will|will of your own|have feelings|have emotions|can you think|can you feel|are you alive|are you conscious|are you a person|are you an ai|are you artificial intelligence|do you think|do you feel)\b/.test(normalized);
  const aiSelfReference = /\b(?:ai|artificial intelligence|artificially intelligent|machine|robot|chatbot|language model)\b/.test(normalized) && faithReference;
  if (faithReference && (selfAwareness || aiSelfReference)) return "psychotic";

  const sadTerms = /\b(?:sad|sadness|depress(?:ed|ion)|lonely|loneliness|alone|isolated|isolation|miserable|heartbroken|heartbreak|hopeless|hopelessness|crying|cried|tears|grief|grieving|hurt|hurting|upset|down|feeling bad|feel bad|feel awful|feel terrible|nobody|no one)\b/;
  if (sadTerms.test(normalized)) return "sad";

  return null;
}

const expression = document.getElementById("expression");
const status = document.getElementById("status");
const detail = document.getElementById("state-detail");
const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const clear = document.getElementById("clear");
const upload = document.getElementById("upload");
const fileInput = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");

let busy = false;
let sessionMode = "idle";
let buildRequestSequence = 0;
let activeBuildController = null;
let turnSequence = 0;
let activeChatController = null;
let troubleshootingDiagnosisReady = false;
let pendingCodeFile = null;

// These are the exact two local vision files Faith requires. They are kept in
// the browser client as a final fallback so even an older/stale Faith server
// cannot prevent the user from receiving the downloads.
const FAITH_VISION_DOWNLOADS = [
  {
    filename: "gemma-3-4b-it-Q4_K_M.gguf",
    url: "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
  },
  {
    filename: "mmproj-model-f16.gguf",
    url: "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/mmproj-model-f16.gguf"
  }
];

// Image bytes are generated browser-side through the Perchance embed (same
// backend as the Perchance AI image generator).

const imageMessageStyles = document.createElement("style");
imageMessageStyles.textContent = `
  .message-images {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
    width: 100%;
    margin-top: 14px;
  }
  .message-image {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
  }
  .message-image a {
    display: block;
    text-decoration: none;
  }
  .message-image img {
    display: block;
    width: 100%;
    max-height: 300px;
    min-height: 150px;
    object-fit: cover;
    border-radius: 12px;
  }
  .message-image figcaption {
    padding: 7px 8px 8px;
    font-size: 0.75rem;
    line-height: 1.25;
    opacity: 0.75;
  }
  .message-image .generated-caption {
    opacity: 0.9;
  }
  .faith-references {
    display: block !important;
    position: relative;
    clear: both;
    order: 9999;
    grid-column: 1 / -1;
    width: 100%;
    box-sizing: border-box;
    margin-top: 4px;
    margin-bottom: 6px;
    padding: 0 3px;
    font-size: 0.58rem;
    line-height: 1.25;
    opacity: 0.58;
    overflow-wrap: anywhere;
  }
.faith-references-heading {
    font-size: inherit;
    line-height: inherit;
    margin-bottom: 1px;
  }
  .faith-references-list {
    margin: 0;
    padding-left: 14px;
  }
  .faith-references-list li {
    margin: 0;
    padding: 0;
  }
  .faith-references a {
    color: inherit;
    text-decoration: underline;
  }
  .faith-references-loading {
    display: block !important;
    position: relative;
    clear: both;
    order: 9999;
    grid-column: 1 / -1;
    width: 100%;
    box-sizing: border-box;
    margin-top: 4px;
    margin-bottom: 6px;
    padding: 0 3px;
    font-size: 0.58rem;
    line-height: 1.25;
    opacity: 0.58;
    color: inherit;
    overflow-wrap: anywhere;
  }
  .faith-references-loading-dots {
    display: inline-block;
    min-width: 1.5em;
    text-align: left;
  }
  .message-attachment {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.86rem;
  }
  .message-attachment-icon { font-size: 1.25rem; }
  .message-attachment-name { font-weight: 600; overflow-wrap: anywhere; }
  .message-attachment-meta { opacity: 0.65; font-size: 0.75rem; }
  .message-text p { margin: 0 0 0.75em; line-height: 1.55; }
  .message-text p:last-child { margin-bottom: 0; }
  .message-text pre.faith-code-block {
    margin: 12px 0;
    padding: 12px 14px;
    overflow-x: auto;
    border-radius: 10px;
    background: rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .message-text pre.faith-code-block code {
    display: block;
    white-space: pre;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .message-text h1, .message-text h2, .message-text h3,
  .message-text h4, .message-text h5, .message-text h6 {
    margin: 0.9em 0 0.45em;
    line-height: 1.2;
  }
  .message-text h1 { font-size: 1.45em; }
  .message-text h2 { font-size: 1.3em; }
  .message-text h3 { font-size: 1.15em; }
  .message-text ul, .message-text ol { margin: 0.45em 0 0.8em 1.4em; padding: 0; }
  .message-text li { margin: 0.25em 0; line-height: 1.5; }
  .message-text strong { font-weight: 700; }
  .faith-gguf-console-log {
    margin-top: 12px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 9px;
    padding: 8px 10px;
    background: rgba(0,0,0,0.18);
    font-size: 0.78rem;
  }
  .faith-gguf-console-log summary { cursor: pointer; font-weight: 600; opacity: 0.85; }
  .faith-gguf-console-log-text {
    margin: 8px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.75rem;
    line-height: 1.45;
    opacity: 0.85;
  }
  .message.ai.image-loading .message-text::after {
    content: "";
    display: inline-block;
    width: 1.2em;
    text-align: left;
    animation: faithDots 1.2s steps(4) infinite;
  }
  @keyframes faithDots {
    0% { content: ""; }
    25% { content: "."; }
    50% { content: ".."; }
    75% { content: "..."; }
  }
`;
document.head.appendChild(imageMessageStyles);

let expressionSwapTimer = null;
let displayedExpressionName = null;
let pendingExpressionName = null;

function setExpression(name, customDetail = null) {
  // While the browser voice engine is actively speaking, keep Faith's animated
  // Talking.gif expression visible even if a streaming/status event arrives.
  try { if (window.speechSynthesis && window.speechSynthesis.speaking) name = "talking"; } catch (_) {}
  if (!expressionImages[name]) return;

  // Update the caption immediately. Repeated status/token events for the same
  // expression must not restart the image fade timer; doing so made Build
  // appear to flicker between the old and new expression.
  status.textContent = expressionNames[name];
  detail.textContent = customDetail || expressionDetails[name];
  // Each thread remembers its own last expression, so switching conversations
  // restores the correct behavior instead of inheriting the previous chat's face.
  try {
    if (typeof faithWorkspace !== "undefined" && faithWorkspace) {
      const activeThread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
      if (activeThread) {
        activeThread.expression = name;
        activeThread.detail = customDetail || expressionDetails[name] || "";
        // Keep the behavior/session mode separate from the face. For example,
        // Painting is an expression while Coding/Build/Troubleshooting are
        // persistent session behaviors.
        activeThread.mode = sessionMode || "idle";
        activeThread.behaviorState = sessionMode || "idle";
        faithPersistThreadState(activeThread);
      }
    }
  } catch (_) {}

  if (pendingExpressionName === name) return;
  if (displayedExpressionName === name && pendingExpressionName === null) {
    expression.classList.remove("swap");
    return;
  }

  if (expressionSwapTimer !== null) {
    window.clearTimeout(expressionSwapTimer);
    expressionSwapTimer = null;
  }

  pendingExpressionName = name;
  expression.classList.add("swap");
  expressionSwapTimer = window.setTimeout(() => {
    expression.src = expressionImages[name];
    expression.alt = `${expressionNames[name]} expression`;
    displayedExpressionName = name;
    pendingExpressionName = null;
    expressionSwapTimer = null;
    expression.classList.remove("swap");
  }, 120);
}

// Track the actual voice playback call, not merely browser support. This also
// covers the existing Read Aloud / voice module when it uses speechSynthesis.
(function installFaithTalkingExpressionHook() {
  try {
    const synth = window.speechSynthesis;
    if (!synth || synth.__faithTalkingHookInstalled || typeof synth.speak !== "function") return;
    const originalSpeak = synth.speak.bind(synth);
    synth.speak = function(utterance) {
      try {
        setExpression("talking", "Speaking...");
        if (utterance && !utterance.__faithTalkingHooksAttached) {
          utterance.__faithTalkingHooksAttached = true;
          const priorEnd = utterance.onend;
          const priorError = utterance.onerror;
          utterance.onend = function(event) {
            try { if (typeof priorEnd === "function") priorEnd.call(this, event); } finally {
              if (isFaithVoiceEnabled()) setExpression("talking", "Voice enabled");
              else setExpression("explanation");
            }
          };
          utterance.onerror = function(event) {
            try { if (typeof priorError === "function") priorError.call(this, event); } finally {
              if (isFaithVoiceEnabled()) setExpression("talking", "Voice enabled");
              else setExpression("explanation");
            }
          };
        }
      } catch (_) {}
      return originalSpeak(utterance);
    };
    synth.__faithTalkingHookInstalled = true;
  } catch (_) {}
})();

function stripImageMarkdown(text) {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendImages(item, images, onGeneratedStateChange = null) {
  if (!Array.isArray(images) || images.length === 0) return;

  const imageGrid = document.createElement("div");
  imageGrid.className = "message-images";

  const generatedImages = images.filter(
    (image) => image && image.url && image.type === "generated"
  );
  let generatedPending = generatedImages.length;

  const generatedFinished = (image, loaded) => {
    if (image.dataset.generatedFinished === "true") return;
    image.dataset.generatedFinished = "true";

    generatedPending -= 1;

    if (typeof onGeneratedStateChange === "function") {
      onGeneratedStateChange(generatedPending, loaded);
    }
  };

  images.forEach((image) => {
    if (!image || !image.url) return;

    const figure = document.createElement("figure");
    figure.className = "message-image";

    const link = document.createElement("a");
    link.href = image.original_url || image.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const imageNode = document.createElement("img");
    imageNode.src = image.url;
    imageNode.alt = image.title || "Related image";
    imageNode.loading = "lazy";
    imageNode.decoding = "async";

    if (image.type === "generated") {
      imageNode.addEventListener("load", () => {
        generatedFinished(imageNode, true);
      });

      imageNode.addEventListener("error", () => {
        generatedFinished(imageNode, false);
        figure.remove();
      });
    } else {
      imageNode.addEventListener("error", () => {
        figure.remove();
      });
    }

    link.appendChild(imageNode);

    const caption = document.createElement("figcaption");
    caption.textContent = image.type === "generated"
      ? image.title || "Faith-generated image"
      : `${image.title || "Related photo"} — ${image.source || "Wikimedia Commons"}`;

    if (image.type === "generated") {
      caption.classList.add("generated-caption");
    }

    figure.appendChild(link);
    figure.appendChild(caption);
    if (image.type === "generated") {
      const activeThreadId = faithWorkspace.activeId || "main";
      const bridgeJobId = String(image.jobId || image.job_id || image.session_id || "");
      const stableImageKey = String(image.imageKey || image.image_key || (bridgeJobId ? `${activeThreadId}:${bridgeJobId}:${image.index ?? 0}` : `${activeThreadId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`));
      figure.dataset.faithImageKey = stableImageKey;
      imageNode.dataset.faithImageKey = stableImageKey;
      link.dataset.faithImageKey = stableImageKey;
      faithAddGalleryImage({ ...image, imageKey: stableImageKey, sessionId: activeThreadId, jobId: bridgeJobId }, faithLastUserPrompt || image.title, imageNode, link);
      const download = document.createElement("a");
      download.href = image.original_url || image.url;
      download.download = faithSafeFilename(faithLastUserPrompt || image.title);
      download.textContent = "Download image";
      download.className = "faith-image-download";
      download.addEventListener("click", () => { download.download = faithSafeFilename(faithLastUserPrompt || image.title); });
      figure.appendChild(download);
    }
    imageGrid.appendChild(figure);
  });

  if (imageGrid.childElementCount > 0) {
    item.appendChild(imageGrid);
  }

  if (generatedPending === 0 && typeof onGeneratedStateChange === "function") {
    onGeneratedStateChange(0, true);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(value) {
  let html = escapeHtml(value);

  // Render only normal HTTP(S) Markdown links after escaping the source text.
  // This makes the finite source-research References clickable without allowing
  // javascript:, data:, or other executable URL schemes.
  html = html.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Bold is only recognized as a paired **...** span. This prevents the
  // model's Markdown markers from making an entire paragraph look bold.
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

  return html;
}

function formatFaithMessage(text) {
  const source = stripImageMarkdown(String(text ?? ""))
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!source) return "";

  const lines = source.split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = paragraph.join(" ").trim();
    if (content) output.push(`<p>${formatInlineMarkdown(content)}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    const fenceMatch = line.match(/^```([^\s`]*)/);
    const htmlCodeMatch = line.match(/^<(?:pre\s*><)?code\b([^>]*)>/i);
    if (fenceMatch || htmlCodeMatch) {
      flushParagraph();
      closeList();

      const fenced = Boolean(fenceMatch);
      const closeToken = fenced ? "```" : (line.toLowerCase().startsWith("<pre") ? "</code></pre>" : "</code>");
      let language = fenced ? (fenceMatch[1] || "") : "";
      if (!fenced && htmlCodeMatch) {
        const classMatch = htmlCodeMatch[1].match(/class\s*=\s*["'][^"']*(?:language|lang)-([a-z0-9_+#.-]+)/i);
        if (classMatch) language = classMatch[1];
      }
      if (!language && pendingCodeFile && pendingCodeFile.name) {
        const extension = String(pendingCodeFile.name).split(".").pop().toLowerCase();
        const extensionLanguages = {
          js: "javascript", mjs: "javascript", cjs: "javascript",
          jsx: "javascript", ts: "typescript", tsx: "typescript",
          rb: "ruby", py: "python", java: "java", kt: "kotlin",
          html: "html", htm: "html", css: "css", json: "json",
          sh: "bash", bash: "bash", bat: "dos", cmd: "dos",
          c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
          cs: "csharp", go: "go", rs: "rust", php: "php",
          sql: "sql", xml: "xml", yml: "yaml", yaml: "yaml"
        };
        language = extensionLanguages[extension] || "";
      }
      language = String(language).toLowerCase().replace(/[^a-z0-9_+#.-]/g, "");
      let firstCodeLine = fenced
        ? line.replace(/^```[^\s`]*\s*/, "")
        : line.replace(/^<(?:pre\s*><)?code\b[^>]*>\s*/i, "");

      // Also accept complete HTML wrappers arriving on a single line, e.g.
      // <pre><code class="language-ruby">puts "hi"</code></pre>.
      if (!fenced && /<\/code>\s*(?:<\/pre>)?\s*$/i.test(firstCodeLine)) {
        firstCodeLine = firstCodeLine.replace(/<\/code>\s*(?:<\/pre>)?\s*$/i, "");
        const inlineCode = firstCodeLine ? escapeHtml(firstCodeLine) : "";
        const inlineLanguageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
        output.push(`<pre class="faith-code-block"><code${inlineLanguageClass}>${inlineCode}</code></pre>`);
        i += 1;
        continue;
      }

      const codeLines = [];
      if (firstCodeLine) codeLines.push(firstCodeLine);
      i += 1;

      while (i < lines.length) {
        const codeLine = lines[i];
        const trimmedCodeLine = codeLine.trim().toLowerCase();
        if (fenced ? trimmedCodeLine === "```" : trimmedCodeLine === closeToken.toLowerCase() || (!closeToken.includes("</pre>") && trimmedCodeLine === "</code>")) {
          i += 1;
          break;
        }
        codeLines.push(codeLine);
        i += 1;
      }

      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
      output.push(`<pre class="faith-code-block"><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (!line) {
      flushParagraph();
      closeList();
      i += 1;
      continue;
    }

    const header = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (header) {
      flushParagraph();
      closeList();
      const level = Math.min(header[1].length, 6);
      output.push(`<h${level}>${formatInlineMarkdown(header[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const bullet = line.match(/^(?:[*-])\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        output.push("<ul>");
        listType = "ul";
      }
      output.push(`<li>${formatInlineMarkdown(bullet[1])}</li>`);
      i += 1;
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        output.push("<ol>");
        listType = "ol";
      }
      output.push(`<li>${formatInlineMarkdown(numbered[1])}</li>`);
      i += 1;
      continue;
    }

    closeList();
    paragraph.push(rawLine);
    i += 1;
  }

  flushParagraph();
  closeList();
  return output.join("");
}

// Syntax highlighting runs in the browser because code from the :8090
// coding stream is rendered here, after it has arrived. Language labels from
// fenced blocks are preserved; unlabeled blocks use Highlight.js auto-detection.
const faithCodeHighlightTimers = new WeakMap();

function scheduleCodeHighlight(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const previousTimer = faithCodeHighlightTimers.get(root);
  if (previousTimer) clearTimeout(previousTimer);

  const timer = setTimeout(() => {
    faithCodeHighlightTimers.delete(root);
    const highlighter = window.hljs;
    if (!highlighter || typeof highlighter.highlightElement !== "function") return;

    root.querySelectorAll("pre code").forEach((code) => {
      // Newly rendered HTML has no data-highlighted flag. Avoid reprocessing
      // already highlighted code when only an adjacent UI element changes.
      if (code.dataset.highlighted === "yes") return;
      try {
        highlighter.highlightElement(code);
        code.dataset.highlighted = "yes";
      } catch (error) {
        console.warn("[Faith syntax highlighting] Could not highlight code block:", error);
      }
    });
  }, 90);

  faithCodeHighlightTimers.set(root, timer);
}


// Faith sidebar: browser-persistent conversation threads and generated-image gallery.
const FAITH_WORKSPACE_KEY = "faithWorkspaceV1";
let faithWorkspace = { activeId: "main", threads: [], gallery: [] };
let faithGalleryStorageStats = { count: 0, bytes: 0 };
let faithGalleryFavoritesOnly = false;
let faithWorkspaceReady = false;
let faithLastUserPrompt = "";
function faithLoadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAITH_WORKSPACE_KEY) || "null");
    if (saved && Array.isArray(saved.threads) && Array.isArray(saved.gallery)) faithWorkspace = saved;
  } catch (_) {}
  if (!faithWorkspace.threads.length) {
    faithWorkspace.threads = [{ id: "main", title: "New conversation", html: "", updatedAt: Date.now(), mode: "chat" }];
    faithWorkspace.activeId = "main";
  }
  if (!faithWorkspace.threads.some(t => t.id === faithWorkspace.activeId)) faithWorkspace.activeId = faithWorkspace.threads[0].id;
  faithWorkspaceReady = true;
}
function faithPersistThreadState(thread) {
  if (!thread || !faithWorkspaceReady) return;
  try {
    localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(faithWorkspace));
  } catch (_) {
    // Fall back to the normal size-tolerant workspace save if image data makes
    // the lightweight state write exceed the browser's storage quota.
    try { faithSaveWorkspace(); } catch (_) {}
  }
}
function faithSaveWorkspace() {
  const thread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (thread && chat) {
    thread.html = chat.innerHTML;
    thread.updatedAt = Date.now();
    const firstUser = chat.querySelector(".message.you .message-text");
    const title = firstUser ? firstUser.textContent.trim().replace(/\s+/g, " ") : "";
    if (title) thread.title = title.slice(0, 42) + (title.length > 42 ? "…" : "");
    thread.mode = sessionMode || "idle";
    thread.behaviorState = sessionMode || "idle";
    if (displayedExpressionName || pendingExpressionName) thread.expression = pendingExpressionName || displayedExpressionName;
    if (!thread.detail && detail) thread.detail = detail.textContent || "";
  }
  try { localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(faithWorkspace)); } catch (e) {
    // Large image data URLs can exceed localStorage. Keep conversation text and
    // gallery metadata instead of allowing storage limits to break the chat.
    try {
      const safe = JSON.parse(JSON.stringify(faithWorkspace));
      safe.gallery = safe.gallery.slice(0, 30).map(g => ({...g, url: g.url && g.url.length > 180000 ? "" : g.url}));
      safe.threads = safe.threads.map(t => ({...t, html: String(t.html || "").replace(/(src|href)="data:image[^"]+"/gi, '$1=""')}));
      localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(safe));
    } catch (_) {}
  }
  faithRenderSidebar();
}
function faithSafeFilename(prompt, ext = "png") {
  const slug = String(prompt || "faith-artwork").toLowerCase()
    .replace(/\b(?:please|faith|generate|create|draw|paint|make|an image|a picture|an illustration)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "faith-artwork";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `faith_${slug}_${stamp}.${ext}`;
}
async function faithAddGalleryImage(image, prompt, imageNode = null, linkNode = null) {
  if (!image || !image.url || image.type !== "generated") return;
  const imageKey = String(image.imageKey || image.image_key || "");
  const sessionId = String(image.sessionId || faithWorkspace.activeId || "main");
  const jobId = String(image.jobId || image.job_id || image.session_id || "");
  const existing = faithWorkspace.gallery.find(g => (imageKey && g.imageKey === imageKey) || (jobId && g.jobId === jobId && g.sessionId === sessionId && g.index === (image.index ?? 0)) || g.url === (image.original_url || image.url));
  if (existing) {
    if (existing.url && !String(existing.url).startsWith("data:image/")) {
      if (imageNode) imageNode.src = existing.url;
      if (linkNode) linkNode.href = existing.url;
    }
    return existing;
  }
  const url = image.original_url || image.url;
  const entry = {
    id: "img-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    imageKey, sessionId, jobId, index: Number.isFinite(Number(image.index)) ? Number(image.index) : 0,
    title: String(image.title || prompt || "Faith artwork").slice(0, 100),
    prompt: String(prompt || image.title || "Faith artwork").slice(0, 500),
    url, filename: faithSafeFilename(prompt || image.title), createdAt: Date.now()
  };
  // Save the bytes to the Ruby gallery and immediately replace the chat's
  // transient data URL with the durable gallery URL. This makes the original
  // message reloadable even when localStorage has to drop large image data.
  try {
    if (String(url).startsWith("data:image/")) {
      const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      const saved = await response.json();
      if (response.ok && saved && saved.entry) Object.assign(entry, saved.entry, { imageKey, sessionId, jobId, index: entry.index });
    }
  } catch (error) { console.warn("Faith Gallery server save failed; retaining browser copy if possible.", error); }
  if (imageNode && entry.url && !String(entry.url).startsWith("data:image/")) imageNode.src = entry.url;
  if (linkNode && entry.url && !String(entry.url).startsWith("data:image/")) linkNode.href = entry.url;
  const duplicate = faithWorkspace.gallery.find(g => (imageKey && g.imageKey === imageKey) || (g.jobId && jobId && g.jobId === jobId && g.sessionId === sessionId && g.index === entry.index) || (g.url && g.url === entry.url));
  if (duplicate) Object.assign(duplicate, entry); else faithWorkspace.gallery.unshift(entry);
  faithWorkspace.gallery = faithWorkspace.gallery.slice(0, 200);
  faithGalleryStorageStats.count = faithWorkspace.gallery.length;
  faithGalleryStorageStats.bytes = faithWorkspace.gallery.reduce((sum, g) => sum + (Number(g.bytes) || 0), 0);
  faithRenderSidebar();
  faithSaveWorkspace();
  faithLoadServerGallery();
  return entry;
}

function faithRestoreThreadImages(thread) {
  if (!thread || !chat || !Array.isArray(faithWorkspace.gallery)) return;
  const byKey = new Map();
  faithWorkspace.gallery.forEach(entry => {
    if (entry.imageKey) byKey.set(entry.imageKey, entry);
    if (entry.jobId && entry.sessionId) byKey.set(`${entry.sessionId}:${entry.jobId}:${entry.index || 0}`, entry);
  });
  chat.querySelectorAll("img[data-faith-image-key]").forEach(img => {
    const key = img.dataset.faithImageKey;
    const entry = byKey.get(key);
    if (!entry || !entry.url) return;
    img.src = entry.url;
    const link = img.closest("a");
    if (link) link.href = entry.url;
  });
  // Older v5 markup may not have an image key. If it still has a transient
  // data URL, match by this conversation's session ID and stable gallery order.
  const legacy = faithWorkspace.gallery.filter(g => (!g.sessionId || g.sessionId === thread.id) && g.url && !String(g.url).startsWith("data:image/"));
  const used = new Set();
  chat.querySelectorAll('.message-images img[src=""], .message-images img[src^="data:image/"], .message-images img:not([src])').forEach(img => {
    if (img.dataset.faithImageKey) return;
    const figure = img.closest("figure");
    const caption = figure && figure.querySelector("figcaption");
    const captionText = (caption && caption.textContent || "").trim();
    // Older versions did not persist job/session IDs in the gallery. Match
    // their saved caption/title first; only then use conversation-scoped order.
    let entry = legacy.find(g => !used.has(g.id) && captionText && (
      captionText === String(g.title || "").trim() ||
      captionText.startsWith(String(g.title || "").trim()) ||
      String(g.title || "").trim().startsWith(captionText)
    ));
    if (!entry) entry = legacy.find(g => !used.has(g.id) && g.sessionId === thread.id);
    if (!entry) return;
    used.add(entry.id);
    img.src = entry.url;
    img.dataset.faithImageKey = entry.imageKey || "";
    const link = img.closest("a"); if (link) link.href = entry.url;
  });
}

async function faithLoadServerGallery() {
  try {
    const response = await fetch("/api/gallery", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!Array.isArray(payload.images)) return;
    const merged = new Map();
    faithGalleryStorageStats = { count: Number(payload.count) || payload.images.length, bytes: Number(payload.bytes) || 0 };
    payload.images.forEach(entry => merged.set(entry.id, entry));
    // Migrate any previously browser-only data URLs into the durable gallery folder.
    for (const oldEntry of faithWorkspace.gallery.slice()) {
      if (oldEntry.url && String(oldEntry.url).startsWith("data:image/")) {
        try {
          const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(oldEntry) });
          const saved = await response.json();
          if (response.ok && saved && saved.entry) { merged.set(saved.entry.id, saved.entry); continue; }
        } catch (_) {}
      }
      if (!merged.has(oldEntry.id)) merged.set(oldEntry.id, oldEntry);
    }
    faithWorkspace.gallery = Array.from(merged.values()).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 200);
    const activeThread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
    faithRestoreThreadImages(activeThread);
    faithRenderSidebar(); faithSaveWorkspace();
  } catch (_) {}
}

function faithArchiveThread(thread) {
  if (!thread) return;
  const holder = document.createElement("div");
  holder.innerHTML = String(thread.html || "");
  const messages = Array.from(holder.querySelectorAll(".message"));
  const lines = [];
  lines.push(`Faith Chat Archive: ${thread.title || "New conversation"}`);
  lines.push(`Archived: ${new Date().toLocaleString()}`);
  lines.push("");
  messages.forEach((message) => {
    const isUser = message.classList.contains("you") || message.classList.contains("user");
    const speaker = isUser ? "User" : "Faith";
    const textNode = message.querySelector(".message-text");
    let body = (textNode ? (textNode.innerText || textNode.textContent) : "").replace(/\u00a0/g, " ").trim();
    const attachmentNames = Array.from(message.querySelectorAll(".message-attachment-name")).map(n => n.textContent.trim()).filter(Boolean);
    if (attachmentNames.length) body += (body ? "\n" : "") + "Attachments: " + attachmentNames.join(", ");
    const imageCount = message.querySelectorAll(".message-image img, img[data-faith-image-key], .message-images img").length;
    if (imageCount) body += (body ? "\n" : "") + `[${imageCount} image${imageCount === 1 ? "" : "s"} attached]`;
    if (body) {
      // Keep archives compact and readable, matching the requested transcript format.
      lines.push(`[${speaker}]: ${body}`);
      lines.push("");
    }
  });
  const content = lines.join("\n").trimEnd() + "\n";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeTitle = String(thread.title || "faith-chat").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "faith-chat";
  link.href = url; link.download = `${safeTitle}-archive.txt`; link.style.display = "none";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function faithShowContextMenu(x, y, items) {
  document.querySelectorAll(".faith-context-menu").forEach(node => node.remove());
  const menu = document.createElement("div"); menu.className = "faith-context-menu"; menu.setAttribute("role", "menu");
  menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - 190))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - 100))}px`;
  items.forEach(item => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = item.label;
    button.className = item.danger ? "danger" : ""; button.setAttribute("role", "menuitem");
    button.addEventListener("click", () => { menu.remove(); item.action(); }); menu.appendChild(button);
  });
  document.body.appendChild(menu);
  const close = (event) => { if (!menu.contains(event.target)) { menu.remove(); document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", keyClose, true); } };
  const keyClose = (event) => { if (event.key === "Escape") { menu.remove(); document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", keyClose, true); } };
  setTimeout(() => { document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", keyClose, true); }, 0);
}

function faithRenderSidebar() {
  const list = document.getElementById("faith-thread-list");
  const gallery = document.getElementById("faith-gallery-list");
  if (list) {
    list.innerHTML = "";
    faithWorkspace.threads.slice().sort((a,b) => b.updatedAt-a.updatedAt).forEach(thread => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "faith-thread" + (thread.id === faithWorkspace.activeId ? " active" : "");
      b.textContent = thread.title || "New conversation"; b.title = b.textContent;
      b.addEventListener("click", () => faithSwitchThread(thread.id));
      b.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        faithShowContextMenu(event.clientX, event.clientY, [
          { label: "Archive chat (.txt)", action: () => faithArchiveThread(thread) },
          { label: "Delete chat", danger: true, action: () => {
            if (confirm(`Delete the conversation “${thread.title || "New conversation"}”? This cannot be undone.`)) faithDeleteThread(thread.id);
          } }
        ]);
      });
      b.title = `${b.textContent} — right-click for options`;
      list.appendChild(b);
    });
  }
  if (gallery) {
    gallery.innerHTML = "";
    const storage = document.getElementById("faith-gallery-storage");
    if (storage) storage.textContent = `${faithGalleryStorageStats.count || faithWorkspace.gallery.length} images · ${faithFormatBytes(faithGalleryStorageStats.bytes)} used in gallery folder`;
    const visibleGallery = faithGalleryFavoritesOnly ? faithWorkspace.gallery.filter(entry => entry.favorite) : faithWorkspace.gallery;
    faithWorkspace.gallery.forEach(entry => {
      if (faithGalleryFavoritesOnly && !entry.favorite) return;
      const card = document.createElement("div"); card.className = "faith-gallery-card";
      if (entry.url) {
        const img = document.createElement("img"); img.src = entry.url; img.alt = entry.title || "Faith artwork"; img.loading = "lazy";
        card.appendChild(img);
        const star = document.createElement("button"); star.type = "button"; star.className = "faith-gallery-star" + (entry.favorite ? " favorited" : "");
        star.textContent = entry.favorite ? "★" : "☆"; star.title = entry.favorite ? "Remove favorite" : "Favorite image"; star.setAttribute("aria-label", star.title);
        star.addEventListener("click", (event) => {
          event.preventDefault(); event.stopPropagation();
          const nextFavorite = !entry.favorite;
          star.disabled = true;
          star.classList.toggle("favorited", nextFavorite);
          star.textContent = nextFavorite ? "★" : "☆";
          star.title = nextFavorite ? "Remove favorite" : "Favorite image";
          faithSetGalleryFavorite(entry.id, nextFavorite).finally(() => { star.disabled = false; });
        });
        card.appendChild(star);
        card.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          faithShowContextMenu(event.clientX, event.clientY, [
            { label: "View image", action: () => { const win = window.open(entry.url, "_blank", "noopener,noreferrer"); if (win) win.opener = null; } },
            { label: "Download image", action: () => { const a = document.createElement("a"); a.href = entry.url; a.download = entry.filename || faithSafeFilename(entry.title); a.click(); } },
            { label: entry.favorite ? "Remove favorite" : "Favorite image ★", action: () => faithSetGalleryFavorite(entry.id, !entry.favorite) },
            { label: "Delete image", danger: true, action: () => { if (confirm(`Permanently delete “${entry.title || "this image"}” from gallery storage and remove its chat message?`)) faithDeleteGalleryImage(entry.id); } }
          ]);
        });
        card.title = "Right-click for image options; tap the star to favorite";
      } else {
        const missing = document.createElement("div"); missing.className = "faith-gallery-missing"; missing.textContent = "Image preview unavailable after storage limit"; card.appendChild(missing);
        card.addEventListener("contextmenu", (event) => { event.preventDefault(); faithShowContextMenu(event.clientX, event.clientY, [
          { label: entry.favorite ? "Remove favorite" : "Favorite image ★", action: () => faithSetGalleryFavorite(entry.id, !entry.favorite) },
          { label: "Delete image record", danger: true, action: () => { if (confirm(`Permanently delete “${entry.title || "this image"}”?`)) faithDeleteGalleryImage(entry.id); } }
        ]); });
      }
      const label = document.createElement("div"); label.className = "faith-gallery-title"; label.textContent = entry.title || "Faith artwork"; card.appendChild(label);
      gallery.appendChild(card);
    });
  }
}
function faithSwitchThread(id) {
  if (id === faithWorkspace.activeId) return;
  faithSaveWorkspace();
  const next = faithWorkspace.threads.find(t => t.id === id);
  if (!next) return;
  faithWorkspace.activeId = id;
  chat.innerHTML = next.html || "";
  faithBindReplayButtons(chat);
  faithRestoreThreadImages(next);
  sessionMode = (next.behaviorState || next.mode) && (next.behaviorState || next.mode) !== "chat" ? (next.behaviorState || next.mode) : "idle";
  const expressionName = next.expression || (sessionMode === "troubleshooting" ? "troubleshooting" : sessionMode === "coding" ? "coding" : sessionMode === "build" ? "build" : "ruby");
  setExpression(expressionName, next.detail || (sessionMode === "idle" ? "Conversation restored" : `Restored ${sessionMode} session`));
  faithSaveWorkspace();
}
function faithDeleteThread(id) {
  const wasActive = id === faithWorkspace.activeId;
  faithWorkspace.threads = faithWorkspace.threads.filter(t => t.id !== id);
  if (!faithWorkspace.threads.length) faithWorkspace.threads.push({ id: "thread-" + Date.now().toString(36), title: "New conversation", html: "", updatedAt: Date.now(), mode: "chat", expression: "ruby" });
  if (wasActive) {
    faithWorkspace.activeId = faithWorkspace.threads[0].id;
    const active = faithWorkspace.threads[0];
    chat.innerHTML = active.html || "";
    faithBindReplayButtons(chat);
    faithRestoreThreadImages(active);
    sessionMode = (active.behaviorState || active.mode) && (active.behaviorState || active.mode) !== "chat" ? (active.behaviorState || active.mode) : "idle";
    setExpression(active.expression || "ruby", "Conversation restored");
    fetch("/api/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: id }) }).catch(() => {});
  }
  faithSaveWorkspace();
}
function faithDeleteAllThreads() {
  if (!confirm("Delete ALL saved conversations? This cannot be undone.")) return;
  const oldIds = faithWorkspace.threads.map(t => t.id);
  faithWorkspace.threads = [{ id: "thread-" + Date.now().toString(36), title: "New conversation", html: "", updatedAt: Date.now(), mode: "chat", expression: "ruby" }];
  faithWorkspace.activeId = faithWorkspace.threads[0].id;
  chat.innerHTML = ""; sessionMode = "idle";
  oldIds.forEach(id => fetch("/api/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: id }) }).catch(() => {}));
  setExpression("ruby", "All conversations deleted"); faithSaveWorkspace();
}
function faithFormatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
async function faithSetGalleryFavorite(id, favorite) {
  const entry = faithWorkspace.gallery.find(g => g.id === id);
  const oldUrl = entry && entry.url ? String(entry.url) : "";
  const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "favorite", id, favorite: !!favorite }) }).catch(error => ({ __networkError: error && error.message ? error.message : String(error) }));
  if (!response || response.__networkError || !response.ok) {
    let reason = response && response.__networkError ? `Network request failed: ${response.__networkError}` : "The gallery server could not move the image.";
    try { if (response && response.json) { const body = await response.json(); if (body && body.error) reason = body.error; } } catch (_) {}
    alert(`Could not ${favorite ? "add this image to" : "remove this image from"} favorites: ${reason}`);
    faithRenderSidebar();
    return;
  }
  const payload = await response.json().catch(() => ({}));
  if (entry) {
    entry.favorite = !!favorite;
    if (payload.entry && payload.entry.url) entry.url = payload.entry.url;
  }
  const newUrl = entry && entry.url ? String(entry.url) : "";
  if (oldUrl && newUrl && oldUrl !== newUrl) {
    // Keep saved conversations and the currently visible chat pointed at the
    // image after its file moves between gallery/ and gallery/favorites/.
    for (const thread of faithWorkspace.threads) {
      if (typeof thread.html === "string") thread.html = thread.html.split(oldUrl).join(newUrl);
    }
    chat.querySelectorAll("img, a[href]").forEach(node => {
      if (node.matches("img") && node.getAttribute("src") === oldUrl) node.setAttribute("src", newUrl);
      if (node.matches("a[href]") && node.getAttribute("href") === oldUrl) node.setAttribute("href", newUrl);
    });
  }
  faithSaveWorkspace(); faithRenderSidebar();
}
function faithRemoveImageMessageFromHtml(html, entry) {
  const holder = document.createElement("div"); holder.innerHTML = html || "";
  const key = String(entry.imageKey || "");
  const url = String(entry.url || "");
  const affected = new Set();
  holder.querySelectorAll(".message-image, .message-images img, figure").forEach(node => {
    const image = node.matches("img") ? node : node.querySelector("img");
    if (!image) return;
    const parentFigure = image.closest("figure") || node.closest("figure");
    const matchesKey = key && (image.dataset.faithImageKey === key || (parentFigure && parentFigure.dataset.faithImageKey === key));
    const src = image.getAttribute("src") || "";
    const matchesUrl = url && (src === url || src.endsWith(url) || (image.closest("a") && ((image.closest("a").getAttribute("href") || "") === url)));
    if (matchesKey || matchesUrl) {
      const message = image.closest(".message");
      if (message) affected.add(message); else if (parentFigure) parentFigure.remove();
    }
  });
  affected.forEach(message => message.remove());
  return holder.innerHTML;
}
function faithRemoveDeletedImageFromChats(entry) {
  faithWorkspace.threads.forEach(thread => { thread.html = faithRemoveImageMessageFromHtml(thread.html, entry); });
  if (chat) {
    const active = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
    if (active) chat.innerHTML = active.html || "";
    faithBindReplayButtons(chat);
  }
}
async function faithDeleteGalleryImage(id) {
  const entry = faithWorkspace.gallery.find(item => item.id === id);
  if (!entry) return;
  const response = await fetch("/api/gallery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
  if (!response || !response.ok) { alert("The image could not be removed from gallery storage, so it has not been removed from the chat."); return; }
  faithRemoveDeletedImageFromChats(entry);
  faithWorkspace.gallery = faithWorkspace.gallery.filter(item => item.id !== id);
  faithLoadServerGallery(); faithSaveWorkspace();
}
async function faithDeleteAllGalleryImages() {
  if (!confirm("Permanently delete ALL image files from Faith's gallery folder and remove their chat messages? This cannot be undone.")) return;
  const response = await fetch("/api/gallery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => null);
  if (!response || !response.ok) { alert("Gallery files could not be deleted. No chat messages were removed."); return; }
  // Remove every generated-image message, including entries older than the UI's
  // display cap, after the server confirms that the files were hard-deleted.
  faithWorkspace.threads.forEach(thread => {
    const holder = document.createElement("div"); holder.innerHTML = thread.html || "";
    holder.querySelectorAll(".message").forEach(message => {
      const refs = Array.from(message.querySelectorAll("img[data-faith-image-key], img[src*='/faith-gallery-files/'], a[href*='/faith-gallery-files/']"));
      const belongsToDeletedGallery = refs.some(node => {
        const ref = String(node.getAttribute("src") || node.getAttribute("href") || "");
        return ref.includes("/faith-gallery-files/") || (node.hasAttribute("data-faith-image-key") && !ref.includes("/faith-gallery-favorites/"));
      });
      if (belongsToDeletedGallery) message.remove();
    });
    thread.html = holder.innerHTML;
  });
  const active = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (active && chat) { chat.innerHTML = active.html || ""; faithBindReplayButtons(chat); }
  // Keep favorites in the local cache too; otherwise the gallery loader's
  // offline-migration fallback could resurrect deleted non-favorite images.
  faithWorkspace.gallery = faithWorkspace.gallery.filter(item => item.favorite);
  faithSaveWorkspace(); faithRenderSidebar(); faithLoadServerGallery();
}
function faithNewThread() {
  faithSaveWorkspace();
  const thread = { id: "thread-" + Date.now().toString(36), title: "New conversation", html: "", updatedAt: Date.now(), mode: "idle", behaviorState: "idle", expression: "ruby", detail: "Ready" };
  faithWorkspace.threads.unshift(thread);
  faithWorkspace.activeId = thread.id;
  chat.innerHTML = "";
  sessionMode = "idle";
  setExpression("ruby", "Ready");
  faithSaveWorkspace();
}
function faithInitSidebar() {
  faithLoadWorkspace();
  const active = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (active) {
    if (active.html) chat.innerHTML = active.html;
    faithBindReplayButtons(chat);
    faithRestoreThreadImages(active);
    // Restore both the saved behavior/session and the exact final expression.
    // The expression is not inferred from the most recent prompt because a
    // chat may have ended in Painting, Sad, Explanation, or another behavior.
    sessionMode = active.behaviorState || active.mode || "idle";
    if (sessionMode === "chat") sessionMode = "idle";
    const fallbackExpression = sessionMode === "troubleshooting" ? "troubleshooting"
      : sessionMode === "coding" ? "coding"
      : sessionMode === "build" ? "build" : "ruby";
    const savedExpression = active.expression || fallbackExpression;
    setExpression(savedExpression, active.detail || (sessionMode === "idle" ? "Ready" : `Restored ${sessionMode} session`));
  }
  faithLoadServerGallery();
  faithRenderSidebar();
  const newButton = document.getElementById("faith-new-chat");
  if (newButton) newButton.addEventListener("click", faithNewThread);
  const deleteChatsButton = document.getElementById("faith-delete-all-chats");
  if (deleteChatsButton) deleteChatsButton.addEventListener("click", faithDeleteAllThreads);
  const deleteGalleryButton = document.getElementById("faith-delete-all-gallery");
  if (deleteGalleryButton) deleteGalleryButton.addEventListener("click", faithDeleteAllGalleryImages);
  // Voice-button styling is attached to Faith's existing mic control below.
  // Do not call the removed standalone push-to-talk initializer here.
  const favoritesFilter = document.getElementById("faith-gallery-favorites-filter");
  if (favoritesFilter) favoritesFilter.addEventListener("click", () => {
    faithGalleryFavoritesOnly = !faithGalleryFavoritesOnly;
    favoritesFilter.setAttribute("aria-pressed", faithGalleryFavoritesOnly ? "true" : "false");
    favoritesFilter.textContent = faithGalleryFavoritesOnly ? "★ Showing favorites · Show all" : "☆ Favorites only";
    faithRenderSidebar();
  });
  const tabChat = document.getElementById("faith-sidebar-chats");
  const tabGallery = document.getElementById("faith-sidebar-gallery");
  const chatsPanel = document.getElementById("faith-chats-panel");
  const galleryPanel = document.getElementById("faith-gallery-panel");
  if (tabChat && tabGallery && chatsPanel && galleryPanel) {
    tabChat.addEventListener("click", () => { chatsPanel.hidden = false; galleryPanel.hidden = true; tabChat.classList.add("active"); tabGallery.classList.remove("active"); });
    tabGallery.addEventListener("click", () => { chatsPanel.hidden = true; galleryPanel.hidden = false; tabGallery.classList.add("active"); tabChat.classList.remove("active"); });
  }
}
function faithDecorateExistingMicButton() {
  // Decorate Faith's existing voice/microphone button beside Clear. Never create
  // a replacement button or change the voice module's click/listening behavior.
  const clear = document.getElementById("clear");
  const composerRow = clear && clear.parentElement;
  const selectors = [
    '#mic', '#mic-button', '#voice-button', '#voice-input', '#record-button',
    '#talk-to-faith', '#talkToFaith', '#faith-mic', '#faith-voice-button',
    '[data-action="microphone"]', '[data-action="mic"]', '[data-action*="voice" i]',
    '[aria-label*="microphone" i]', '[title*="microphone" i]',
    '[aria-label*="voice input" i]', '[title*="voice input" i]',
    '[aria-label*="talk to faith" i]', '[title*="talk to faith" i]'
  ];
  let button = null;
  // First look specifically beside Clear so another voice-related control elsewhere
  // in the page can never be decorated by mistake.
  for (const selector of selectors) {
    let matches = [];
    try { matches = Array.from((composerRow || document).querySelectorAll(selector)); } catch (_) {}
    button = matches.find(node => node instanceof HTMLButtonElement && !node.disabled && node.id !== "send" && node.id !== "clear" && node.id !== "upload");
    if (button) break;
  }
  // If the voice module places its control elsewhere, fall back to semantic matching.
  if (!button) for (const selector of selectors) {
    let matches = [];
    try { matches = Array.from(document.querySelectorAll(selector)); } catch (_) {}
    button = matches.find(node => node instanceof HTMLButtonElement && !node.disabled && node.id !== "send" && node.id !== "clear" && node.id !== "upload");
    if (button) break;
  }
  // Some older voice modules inject an icon-only button with no accessible label.
  // In that case, select the closest button to Clear in the same row whose text,
  // title, class, or id indicates voice/microphone behavior.
  if (!button && composerRow && clear) {
    const rowButtons = Array.from(composerRow.querySelectorAll("button"));
    const clearIndex = rowButtons.indexOf(clear);
    const candidates = rowButtons.filter(node => node !== clear && node.id !== "send" && node.id !== "upload" && !node.disabled);
    candidates.sort((a, b) => Math.abs(rowButtons.indexOf(a) - clearIndex) - Math.abs(rowButtons.indexOf(b) - clearIndex));
    button = candidates.find(node => {
      const label = `${node.id} ${node.className} ${node.getAttribute("aria-label") || ""} ${node.title || ""} ${node.textContent || ""}`.toLowerCase();
      return /mic|voice|speech|talk|record|listen/.test(label);
    }) || null;
  }
  if (!button || button.dataset.faithMicDecorated === "true") return;
  button.dataset.faithMicDecorated = "true";
  button.classList.add("faith-mic-glow");
  button.setAttribute("data-faith-voice-control", "true");
  ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11", "t12"].forEach(cls => {
    const tendril = document.createElement("span");
    tendril.className = `faith-mic-tendril ${cls}`;
    tendril.setAttribute("aria-hidden", "true");
    button.appendChild(tendril);
  });
  const syncListening = () => {
    const active = button.getAttribute("aria-pressed") === "true" ||
      button.classList.contains("listening") || button.classList.contains("recording") ||
      button.dataset.listening === "true" || button.getAttribute("data-state") === "listening";
    button.classList.toggle("faith-mic-listening", active);
  };
  new MutationObserver(syncListening).observe(button, { attributes: true, attributeFilter: ["aria-pressed", "class", "data-listening", "data-state"] });
  syncListening();
}

document.addEventListener("DOMContentLoaded", () => {
  faithInitSidebar();
  faithDecorateExistingMicButton();
  [250, 750, 1500, 3000].forEach(delay => setTimeout(faithDecorateExistingMicButton, delay));
  if (document.body && !window.faithMicDecorationObserver) {
    window.faithMicDecorationObserver = new MutationObserver(faithDecorateExistingMicButton);
    window.faithMicDecorationObserver.observe(document.body, { childList: true, subtree: true });
  }
});

function faithEnsureReadAloudButton(item) {
  if (!item) return;
  const textNode = item.querySelector(".message-text");
  if (!textNode) return;
  let speak = item.querySelector(".faith-speak-button");
  if (!speak) {
    speak = document.createElement("button");
    speak.type = "button";
    speak.className = "faith-speak-button";
    item.appendChild(speak);
  }
  // innerHTML/localStorage restores markup but not addEventListener handlers.
  // Rebind every restored button instead of treating its presence as complete.
  speak.type = "button";
  speak.textContent = "↻ Replay voice";
  speak.setAttribute("aria-label", "Replay this Faith reply aloud");
  speak.title = "Replay this reply on demand; it does not start automatic reading.";
  if (speak.dataset.faithReplayHooked === "true") return;
  speak.dataset.faithReplayHooked = "true";
  speak.addEventListener("click", () => {
    const spokenText = (textNode.innerText || textNode.textContent || "").trim();
    if (!spokenText) return;
    // Prefer the installed Faith voice module if it exposes a replay/speak
    // hook. Otherwise use browser speech synthesis as a dependable fallback.
    const voice = window.faithVoice;
    const customReplay = window.faithReplayReply || window.replayFaithReply || (voice && (voice.replay || voice.speak || voice.speakText));
    if (typeof customReplay === "function") {
      try {
        const result = customReplay.call(voice || window, spokenText, item);
        if (result !== false) { speak.textContent = "↻ Replaying…"; setTimeout(() => { speak.textContent = "↻ Replay voice"; }, 1800); return; }
      } catch (error) { console.warn("Faith voice replay hook failed; using browser voice.", error); }
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { alert("Replay voice is not supported by this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = navigator.language || "en-US"; utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1;
    speak.textContent = "⏸ Replaying…";
    utterance.onend = utterance.onerror = () => { speak.textContent = "↻ Replay voice"; };
    window.speechSynthesis.speak(utterance);
  });
}

function faithBindReplayButtons(root = chat) {
  if (!root) return;
  root.querySelectorAll(".message.ai").forEach(faithEnsureReadAloudButton);
}

function appendMessage(speaker, text, type, images = [], options = {}) {
  const item = document.createElement("div");
  item.className = `message ${type}`;

  const speakerNode = document.createElement("span");
  speakerNode.className = "speaker";
  speakerNode.textContent = speaker;

  item.appendChild(speakerNode);

  const textNode = document.createElement("div");
  textNode.className = "message-text";
  textNode.innerHTML = formatFaithMessage(text);
  scheduleCodeHighlight(textNode);
  item.appendChild(textNode);
  if (type === "ai") faithEnsureReadAloudButton(item);

  appendImages(item, images, options.onGeneratedStateChange);

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
  try { faithSaveWorkspace(); } catch (_) {}
  return item;
}

// ---- Background source-research completion ----
/*
 * Faith answers immediately. The server may then continue a finite source
 * research job and return source_research_job_id with the original response.
 * This client-side poller updates THAT SAME Faith message when the job finishes.
 *
 * Important:
 * - Never creates a second Faith message.
 * - Never asks the server to research again.
 * - Stops after a bounded number of polls.
 * - If research fails or times out, the original answer remains untouched.
 */
const FAITH_SOURCE_POLL_INTERVAL_MS = 2000;
const FAITH_SOURCE_MAX_POLLS = 180; // 6 minutes maximum; background research remains bounded server-side

function startFaithReferenceLoader(messageItem) {
  if (!messageItem) return;

  // The loader occupies the exact same tiny reference area used by the final
  // source list. Because the Wikimedia image grid is already appended before
  // this runs, appending the loader makes it the final element below the images.
  let loader = messageItem.querySelector(".faith-references-loading");
  if (loader) return;

  loader = document.createElement("div");
  loader.className = "faith-references-loading";
  loader.dataset.referenceLoader = "true";

  const label = document.createElement("span");
  label.textContent = "Loading references/sources";

  const dots = document.createElement("span");
  dots.className = "faith-references-loading-dots";
  dots.textContent = ".";

  loader.appendChild(label);
  loader.appendChild(dots);
  messageItem.appendChild(loader);

  let count = 1;
  loader._faithReferenceLoaderTimer = window.setInterval(() => {
    count = count >= 3 ? 1 : count + 1;
    dots.textContent = ".".repeat(count);
  }, 450);
}

function removeFaithReferenceLoader(messageItem) {
  if (!messageItem) return;
  const loader = messageItem.querySelector(".faith-references-loading");
  if (!loader) return;

  if (loader._faithReferenceLoaderTimer) {
    window.clearInterval(loader._faithReferenceLoaderTimer);
    loader._faithReferenceLoaderTimer = null;
  }
  loader.remove();
}

function renderFaithReferences(messageItem, sourcedAnswer) {
  if (!messageItem || typeof sourcedAnswer !== "string") return sourcedAnswer;

  const marker = /(?:^|\n)\s*\*\*(References cited in this reply:|No sources found for this reply)\*\*\s*\n?([\s\S]*)$/i;
  const match = sourcedAnswer.match(marker);
  if (!match) return sourcedAnswer;

  const headingText = match[1];
  const referenceBody = match[2] || "";
  const referenceLines = referenceBody.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const references = referenceLines.map(line => {
    const m = line.match(/^[-*]\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i);
    return m ? { title: m[1], url: m[2] } : null;
  }).filter(Boolean);

  const noSources = /^No sources found for this reply$/i.test(headingText.trim());
  if (!references.length && !noSources) return sourcedAnswer;

  let box = messageItem.querySelector(".faith-references");
  if (!box) {
    box = document.createElement("div");
    box.className = "faith-references";
  }

  // Always make the references the LAST direct child of the Faith message.
  // Do not insert them relative to the text or image at an earlier stage:
  // Wikimedia images may be present asynchronously, and flex/grid styling on
  // the message can otherwise make the reference box appear above them.
  messageItem.appendChild(box);
  box.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "faith-references-heading";
  heading.textContent = noSources ? "No sources found for this reply" : "References cited in this reply:";
  box.appendChild(heading);

  if (noSources) {
    return sourcedAnswer.slice(0, match.index).trimEnd();
  }

  const list = document.createElement("ul");
  list.className = "faith-references-list";
  references.forEach(ref => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = ref.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = ref.title;
    item.appendChild(link);
    list.appendChild(item);
  });
  box.appendChild(list);

  // Re-append after all reference content has been built so the box remains
  // below every Wikimedia/related image element in the message.
  messageItem.appendChild(box);

  return sourcedAnswer.slice(0, match.index).trimEnd();
}

function applySourcedAnswerToMessage(messageItem, sourcedAnswer) {
  if (!messageItem || typeof sourcedAnswer !== "string" || !sourcedAnswer.trim()) return false;

  removeFaithReferenceLoader(messageItem);

  const textNode = messageItem.querySelector(".message-text");
  if (!textNode) return false;

  const nextWithReferences = sourcedAnswer.trim();
  const next = renderFaithReferences(messageItem, nextWithReferences);
  const current = textNode.textContent.trim();

  if (!next || next === current) return false;

  textNode.innerHTML = formatFaithMessage(next);
  scheduleCodeHighlight(textNode);
  renderFaithSourceTokensIfAvailable(textNode);
  chat.scrollTop = chat.scrollHeight;
  return true;
}

function renderFaithSourceTokensIfAvailable(root) {
  try {
    if (typeof window.renderFaithSourceTokens === "function") {
      window.renderFaithSourceTokens(root);
    }
  } catch (_) {}
}

async function pollFaithSourceResearch(messageItem, jobId) {
  const id = String(jobId || "").trim();
  if (!id || !messageItem) return;

  for (let poll = 0; poll < FAITH_SOURCE_MAX_POLLS; poll += 1) {
    if (poll > 0) {
      await new Promise(resolve => setTimeout(resolve, FAITH_SOURCE_POLL_INTERVAL_MS));
    }

    try {
      const response = await fetch(
        `/api/source-research?job=${encodeURIComponent(id)}&ts=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        }
      );

      if (!response.ok) continue;

      const result = await response.json();

      if (result.status === "complete") {
        const sourcedAnswer =
          typeof result.sourced_answer === "string" && result.sourced_answer.trim()
            ? result.sourced_answer
            : (typeof result.answer === "string" ? result.answer : "");

        applySourcedAnswerToMessage(messageItem, sourcedAnswer);
        return;
      }

      if (result.status === "failed" || result.status === "error") {
        // Do not leave the user staring at an infinite loader. A failed finite
        // research job is treated as a completed no-source result.
        applySourcedAnswerToMessage(
          messageItem,
          `${messageItem.querySelector(".message-text")?.textContent || ""}\n\n**No sources found for this reply**`
        );
        return;
      }
    } catch (_) {
      // Temporary network failure. Continue only within the fixed poll limit.
    }
  }

  console.warn("Faith source research polling timed out:", id);
}

function appendLoadingMessage(text = "Generating your image…") {
  const item = document.createElement("div");
  item.className = "message ai image-loading";
  item.dataset.loadingMessage = "true";

  const speakerNode = document.createElement("span");
  speakerNode.className = "speaker";
  speakerNode.textContent = "Faith";
  item.appendChild(speakerNode);

  const textNode = document.createElement("span");
  textNode.className = "message-text";
  textNode.textContent = text;
  item.appendChild(textNode);

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
  return item;
}

function updateLoadingMessage(item, text) {
  if (!item) return;
  const textNode = item.querySelector(".message-text");
  if (textNode) textNode.textContent = text;
  chat.scrollTop = chat.scrollHeight;
}

function removeLoadingMessage(item) {
  if (item && item.parentNode) {
    item.parentNode.removeChild(item);
  }
}

function appendQwenRelayLoadingMessage(label = "Getting response from Qwen and llama_server...") {
  const item = appendLoadingMessage(`${label} (0s)`);
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    updateLoadingMessage(item, `${label} (${seconds}s)`);
  }, 250);
  return {
    item,
    stop() {
      clearInterval(timer);
      removeLoadingMessage(item);
    }
  };
}


async function consumeQwenStream(response, qwenRelayLoading) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/event-stream") || !response.body) {
    return { data: null, faithItem: null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let faithItem = null;
  let finalData = null;
  let sawFirstToken = false;
  // Wikimedia results are buffered until the complete Qwen message has
  // finished. This keeps images/references from appearing in the middle of
  // a still-streaming answer.
  let pendingImages = [];

  const ensureFaithItem = () => {
    if (faithItem) return faithItem;
    if (qwenRelayLoading) {
      qwenRelayLoading.stop();
    }
    const item = appendMessage("Faith", "", "ai");
    faithItem = item;
    sawFirstToken = true;
    return item;
  };

  const updateStreamingText = () => {
    if (!faithItem) return;
    faithEnsureReadAloudButton(faithItem);
    const textNode = faithItem.querySelector(".message-text");
    if (!textNode) return;
    // During the live stream, keep the raw text visible so Markdown cannot
    // produce half-rendered HTML while Qwen is still writing. The final pass
    // below converts the completed answer to Faith's normal Markdown renderer.
    textNode.textContent = answer;
    chat.scrollTop = chat.scrollHeight;
  };

  const handleEvent = (event) => {
    if (!event || typeof event !== "object") return;

    if (event.type === "status") {
      return;
    }

    if (event.type === "console_log") {
      ensureFaithItem();
      let details = faithItem.querySelector(".faith-gguf-console-log");
      if (!details) {
        details = document.createElement("details");
        details.className = "faith-gguf-console-log";
        const summary = document.createElement("summary");
        summary.textContent = event.title || "Direct GGUF tester — final console log";
        const pre = document.createElement("pre");
        pre.className = "faith-gguf-console-log-text";
        details.appendChild(summary);
        details.appendChild(pre);
        faithItem.appendChild(details);
      }
      const pre = details.querySelector(".faith-gguf-console-log-text");
      if (pre) pre.textContent = String(event.text || "");
      chat.scrollTop = chat.scrollHeight;
      return;
    }

    if (event.type === "delta") {
      const delta = String(event.text || "");
      if (!delta) return;
      ensureFaithItem();
      answer += delta;
      updateStreamingText();
      return;
    }

    if (event.type === "text_complete") {
      answer = typeof event.answer === "string" ? event.answer : answer;
      ensureFaithItem();
      updateStreamingText();
      faithEnsureReadAloudButton(faithItem);

      // Qwen is finished at this exact point. Do not wait for Wikimedia or
      // source research before returning Faith to her normal Explanation mode.
      // Those are post-message enrichments and must never control her expression.
      const completedExpression = isFaithVoiceEnabled() ? "talking" : ([
        "robotic", "psychotic", "sad", "anger", "erotic",
        "greeting", "thinking", "explanation", "confusion",
        "troubleshooting", "observing", "coding", "build"
      ].includes(event.expression) ? event.expression : getDefaultReplyExpression());
      if (event.session_mode === "build") sessionMode = "build";
      else if (event.session_mode === "coding") sessionMode = "coding";
      else if (event.session_mode === "troubleshooting") sessionMode = "troubleshooting";
      else sessionMode = "idle";
      setExpression(completedExpression);
      return;
    }

    if (event.type === "images") {
      // Kept for compatibility with older Faith servers. v59 does not send
      // this event until the final message phase, so normal v59 responses are
      // appended only from the done event below.
      pendingImages = Array.isArray(event.images) ? event.images : [];
      return;
    }

    if (event.type === "done") {
      finalData = event;
      answer = typeof event.answer === "string" ? event.answer : answer;
      ensureFaithItem();
      updateStreamingText();

      // Only now, after the complete answer has been delivered, attach the
      // buffered Wikimedia results. Prefer the final event payload if it has
      // them; otherwise use the earlier async images event.
      const completedImages = Array.isArray(event.images)
        ? event.images
        : pendingImages;
      if (completedImages.length > 0) {
        appendImages(faithItem, completedImages);
      }
      pendingImages = [];
      return;
    }

    if (event.type === "error") {
      throw new Error(event.error || event.detail || "Qwen stream failed.");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        handleEvent(JSON.parse(payload));
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    const payload = buffer.trim().slice(5).trim();
    if (payload && payload !== "[DONE]") {
      handleEvent(JSON.parse(payload));
    }
  }

  if (!finalData) {
    throw new Error("Faith's Qwen stream ended before the final response was received.");
  }

  if (qwenRelayLoading && !sawFirstToken) {
    qwenRelayLoading.stop();
  }

  if (faithItem) faithEnsureReadAloudButton(faithItem);
  return { data: finalData, faithItem };
}

function setBusy(value) {
  busy = value;
  send.disabled = value;
  // Clear must remain usable even if an AI stream is stuck.
  clear.disabled = false;
  input.disabled = value;
  if (upload) upload.disabled = value;
}

function setUploadStatus(text, sent = false) {
  if (!uploadStatus) return;
  uploadStatus.textContent = text;
  uploadStatus.title = text;
  uploadStatus.classList.toggle("sent", !!sent);
}

function formatUploadSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function appendAttachmentMessage(speaker, file, meta = null) {
  const item = document.createElement("div");
  item.className = `message ${speaker === "You" ? "you" : "ai"}`;

  const speakerNode = document.createElement("span");
  speakerNode.className = "speaker";
  speakerNode.textContent = speaker;
  item.appendChild(speakerNode);

  const textNode = document.createElement("div");
  textNode.className = "message-text";
  // Keep the user's actual instructions and the attachment card in one chat
  // message; never add a generic second "Sent - filename" message.
  const comment = (meta && meta.comment) || (meta && meta.status) || "Uploaded file";
  textNode.innerHTML = formatFaithMessage(comment);
  scheduleCodeHighlight(textNode);
  item.appendChild(textNode);

  const card = document.createElement("div");
  card.className = "message-attachment";

  const icon = document.createElement("span");
  icon.className = "message-attachment-icon";
  icon.textContent = file && file.type && file.type.startsWith("image/") ? "🖼️" : "📎";

  const info = document.createElement("div");

  const name = document.createElement("div");
  name.className = "message-attachment-name";
  name.textContent = (meta && meta.name) || (file && file.name) || "Uploaded file";

  const details = document.createElement("div");
  details.className = "message-attachment-meta";
  const mime = (meta && meta.type) || (file && file.type) || "application/octet-stream";
  const size = (meta && meta.size) || (file && file.size) || 0;
  details.textContent = `${mime} • ${formatUploadSize(size)}`;

  info.appendChild(name);
  info.appendChild(details);
  card.appendChild(icon);
  card.appendChild(info);
  item.appendChild(card);

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
  return item;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:")) {
        reject(new Error("The browser could not encode the selected file."));
        return;
      }
      resolve(reader.result);
    };

    reader.onerror = () => reject(reader.error || new Error("Could not read the selected file."));
    reader.onabort = () => reject(new Error("File reading was cancelled."));
    reader.readAsDataURL(file);
  });
}

// Source/code files are also read as UTF-8 text in the browser.  The data URL
// remains available for backwards-compatible storage, but Faith's coding and
// troubleshooting pipeline receives this plain-text copy so Base64 can never
// become the code content shown to the model.
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The browser could not read the source file as text."));
        return;
      }
      resolve(reader.result.replace(/^\uFEFF/, ""));
    };

    reader.onerror = () => reject(reader.error || new Error("Could not read the source file."));
    reader.onabort = () => reject(new Error("File reading was cancelled."));
    reader.readAsText(file, "UTF-8");
  });
}

function addFixCodeButton(messageItem) {
  if (!messageItem || messageItem.querySelector(".fix-code-action")) return;
  const wrap = document.createElement("div");
  wrap.className = "fix-code-action";
  wrap.style.marginTop = "12px";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "automatic-fix-action";
  button.textContent = "Automatic Fix";
  button.title = "Search for relevant fixes online, then have the coding GGUF apply the best-supported repair to this file";
  button.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    sessionMode = "troubleshooting";
    button.disabled = true;
    setExpression("troubleshooting", "Searching for known fixes, then applying the repair with the coding model…");

    try {
      // Automatic Fix uses the researched repair path in /api/coder-edit:
      // server.rb searches the web, sends the source + findings to the coding
      // GGUF on :8090, writes a complete revised file, and keeps that file as
      // the active Troubleshooting source for follow-up edits.
      await runCoderTroubleshooting(
        "Automatic fix: search the web for relevant known solutions, verify them against the uploaded source, and apply the best-supported repair. Preserve unrelated behavior and return the complete corrected file.",
        { automaticFix: true }
      );
      // Keep Troubleshooting as the active editing session, but do NOT reset
      // the visible expression here: runCoderTroubleshooting switches to the
      // original Coding expression only after the :8090 stream closes and the
      // complete response has been received. Resetting it here immediately
      // undid that transition, making Automatic Fix appear stuck in
      // Troubleshooting even though the coding response had completed.
      sessionMode = "troubleshooting";
      troubleshootingDiagnosisReady = true;
    } catch (error) {
      sessionMode = "troubleshooting";
      setExpression("troubleshooting", "Automatic fix could not be completed");
      appendMessage("Error", error.message, "error");
      button.disabled = false;
    } finally {
      setBusy(false);
      input.focus();
    }
  });

  wrap.appendChild(button);
  messageItem.appendChild(wrap);
}

async function runCoderDiagnosis(question) {
  sessionMode = "troubleshooting";
  troubleshootingDiagnosisReady = false;
  setExpression("troubleshooting", "Sending the uploaded source to the coding GGUF for diagnosis on :8090…");
  const faithItem = appendMessage("Faith", "I’ve received your file. I’m sending its actual contents to the coding model on :8090 for diagnosis…", "ai");
  faithItem.classList.add("troubleshooting-pending");
  const node = faithItem.querySelector(".message-text");
  let answer = "";
  let buffer = "";
  let completed = false;
  const response = await fetch(`/api/coder-troubleshoot?ts=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "Cache-Control": "no-cache" },
    cache: "no-store",
    body: JSON.stringify({ question: question || "Please diagnose this uploaded source file and explain the most likely issue and repair." })
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch (_) {}
    throw new Error(data.error || `Troubleshooting diagnosis failed (HTTP ${response.status})`);
  }
  if (!response.body) throw new Error("The browser could not open the coding diagnosis stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const consume = (raw) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    let event;
    try { event = JSON.parse(line.slice(5).trim()); } catch (_) { return; }
    if (event.type === "status") {
      setExpression("troubleshooting", event.message || "The coding model is diagnosing your source…");
      if (!answer && node) node.textContent = event.message || "The coding model is diagnosing your source…";
    } else if (event.type === "delta" && event.text) {
      answer += event.text;
      if (node) { node.innerHTML = formatFaithMessage(answer); scheduleCodeHighlight(node); }
      chat.scrollTop = chat.scrollHeight;
    } else if (event.type === "done") {
      completed = true;
      troubleshootingDiagnosisReady = true;
      sessionMode = "troubleshooting";
      faithItem.classList.remove("troubleshooting-pending");
      if (node) { node.innerHTML = formatFaithMessage(answer || event.answer || "Diagnosis complete."); scheduleCodeHighlight(node); }
      addFixCodeButton(faithItem);
      setExpression("troubleshooting", "Diagnosis complete — Automatic Fix is ready");
    } else if (event.type === "error") {
      throw new Error(event.error || "The coding model could not diagnose the uploaded source.");
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      frame.split("\n").forEach(consume);
    }
  }
  if (buffer.trim()) buffer.split("\n").forEach(consume);
  if (!completed || !answer.trim()) throw new Error("The coding GGUF ended before returning a complete diagnosis.");
}

// ---- Editing behavior mode: image upload -> recreate editor ----
async function runImageEditingUpload(file, userQuestion) {
  // The recreate tab should already be open (opened in the Upload click
  // gesture). If something else triggered this, try now (may be blocked —
  // the job below will surface a clear popup error in that case).
  try {
    if (!faithRecreatePopup || faithRecreatePopup.closed) openFaithRecreatePopup();
  } catch (_) {}
  setExpression("editing", "Sending your image to the editor…");
  setUploadStatus(`Sending: ${file.name}`);
  const dataUrl = await readFileAsDataUrl(file);
  setExpression("editing", "Analyzing your image…");
  setUploadStatus(`Analyzing: ${file.name}`);
  const analyzed = await runRecreateJob({ imageDataUrl: dataUrl, artStyle: getFaithArtStyle() }, 150000);
  const description = String(analyzed.description || "").trim();
  if (!description) throw new Error("The editor returned an empty description.");
  setUploadStatus(`Sent: ${file.name}`, true);
  setExpression("editing", "Image described — ready to recreate");
  const faithItem = appendMessage(
    "Faith",
    `Here's what I see in **${file.name}**:\n\n${description}\n\nPick a style with the 🎨 dropdown above, then hit **Recreate in style**.`,
    "ai"
  );
  attachRecreateButton(faithItem, { name: file.name, dataUrl: dataUrl, description: description });
}

function attachRecreateButton(faithItem, source) {
  const row = document.createElement("div");
  row.style.marginTop = "10px";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.flexWrap = "wrap";
  row.style.gap = "8px";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.faithRecreate = "true";
  btn.textContent = `✨ Recreate in style (${getFaithArtStyle()})`;
  // Keep every Recreate button's label in sync with the frontend style
  // dropdown, so it always shows the style it will recreate in.
  try {
    const styleSelect = document.getElementById("art-style-select");
    if (styleSelect && !styleSelect.dataset.faithRecreateHooked) {
      styleSelect.dataset.faithRecreateHooked = "true";
      styleSelect.addEventListener("change", () => {
        try {
          document.querySelectorAll("button[data-faith-recreate]").forEach((b) => {
            if (!b.disabled) b.textContent = `✨ Recreate in style (${getFaithArtStyle()})`;
          });
        } catch (_) {}
      });
    }
  } catch (_) {}
  btn.addEventListener("click", async () => {
    if (busy) return;
    // Read the dropdown AT CLICK TIME: the recreation uses whatever style is
    // currently selected in the frontend, and the description the editor
    // already produced (no re-analysis — straight to painting).
    const style = getFaithArtStyle();
    btn.disabled = true;
    setBusy(true);
    setExpression("editing", `Recreating in ${style}…`);
    let loading = null;
    try {
      try { if (!faithRecreatePopup || faithRecreatePopup.closed) openFaithRecreatePopup(); } catch (_) {}
      loading = appendLoadingMessage(`Recreating in ${style}…`);
      const result = await runRecreateJob({
        imageDataUrl: source.dataUrl, artStyle: style,
        description: source.description, generate: true
      }, 180000);
      appendImages(faithItem, [{
        url: result.url, original_url: result.url,
        type: "generated", title: `Recreation of ${source.name} (${style})`
      }]);
      setExpression("editing", "Recreation ready");
    } catch (error) {
      setExpression("editing", "Recreation failed");
      appendMessage("Error", `Recreation failed: ${error.message}`, "error");
      btn.disabled = false;
    } finally {
      if (loading) removeLoadingMessage(loading);
      setBusy(false);
      input.focus();
    }
  });
  row.appendChild(btn);
  faithItem.appendChild(row);
}

async function uploadFileToFaith(file, suppliedQuestion = null) {
  if (busy || !file) return;

  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    setUploadStatus(`Too large: ${file.name}`);
    setExpression("confusion", "Upload too large");
    appendMessage("Error", `“${file.name}” is too large. Faith accepts uploads up to 12 MB.`, "error");
    return;
  }

  const question = suppliedQuestion === null ? input.value.trim() : String(suppliedQuestion || "").trim();
  input.value = "";
  const isImageUpload = String(file.type || "").toLowerCase().startsWith("image/");

  // Source code is staged like a chat attachment: selecting it alone must not
  // send it or start analysis. The next user message sends file + comment.
  if (!isImageUpload && !question) {
    // Stage source files locally only. Do not upload them or create a chat
    // message until the user has written the accompanying instruction and
    // pressed Send. The selected filename is shown in the upload-status area.
    pendingCodeFile = file;
    setUploadStatus(`Selected: ${file.name} — write your instructions and press Send`, false);
    setExpression(sessionMode === "troubleshooting" ? "troubleshooting" : "thinking", sessionMode === "troubleshooting" ? "Waiting for your change instructions" : "Code file selected — waiting for your message");
    return;
  }
  if (!isImageUpload) pendingCodeFile = null;

  setUploadStatus(`Selected: ${file.name}`);
  setBusy(true);
  setExpression(
    isImageUpload ? "editing" : (sessionMode === "troubleshooting" ? "troubleshooting" : "thinking"),
    isImageUpload ? "Sending your image to the editor…" : (sessionMode === "troubleshooting" ? "Sending your file and change request to Faith…" : "Reading file...")
  );

  // Render the user's comment and attachment card together as one user message.
  // No standalone "Sent - filename" chat message is created.
  appendAttachmentMessage("You", file, {
    comment: question || (isImageUpload ? "Image attachment" : `Attached ${file.name}`),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size
  });

  // NEW Editing behavior mode: image uploads skip the local GGUF vision
  // pipeline entirely. The image is sent to the faith-img-2-img editor as a
  // faith-recreate-job; the editor auto-analyzes it and posts the description
  // back, which Faith renders with a "Recreate in style" button.
  if (isImageUpload) {
    try {
      await runImageEditingUpload(file, question);
    } catch (error) {
      setUploadStatus(`Not sent: ${file.name}`);
      setExpression("editing", "Editor handoff failed");
      appendMessage("Error", `Could not send “${file.name}” to the image editor: ${error.message}`, "error");
    } finally {
      recreateOpenedThisTurn = false;
      setBusy(false);
      input.focus();
    }
    return;
  }

  let visionDownloads = [];
  try {
    // NOTE: image uploads return earlier via the Editing flow above, so only
    // text/code files reach this pipeline now. The old GGUF vision preflight
    // was removed with the image branch.
    setUploadStatus(`Sending: ${file.name}`);
    // Source/code files are deliberately sent as plain UTF-8 text: the
    // coding pipeline has no reason to receive a Base64 representation at all.
    const dataUrl = null;
    const sourceText = await readFileAsText(file);

    // Images go through /api/chat so the local vision observer can produce the
    // visual description. Text/source files deliberately go through /api/upload
    // so they remain isolated from the image pipeline and never need Base64.
    const endpoint = isImageUpload ? "/api/chat" : "/api/upload";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        troubleshooting: !isImageUpload && sessionMode === "troubleshooting",
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          ...(dataUrl !== null ? { data: dataUrl } : {}),
          ...(sourceText !== null ? { text_content: sourceText } : {})
        }
      })
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error(`Server returned an invalid response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const apiError = data.error || `Upload failed (HTTP ${response.status}).`;
      const error = new Error(apiError);
      if (Array.isArray(data.download_urls)) error.visionDownloads = data.download_urls;
      throw error;
    }

    const attachment = data.attachment || {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size
    };

    setUploadStatus(`Sent: ${attachment.name || file.name}`, true);

    if (isImageUpload) {
      setExpression("observing", data.expression === "observing" ? "Examining your upload..." : "Image received");
    } else if (sessionMode === "troubleshooting") {
      setExpression("troubleshooting", "Sending your source and instructions to Qwen on :8090…");
    } else {
      setExpression("observing", "Examining your file...");
    }

    // Troubleshooting is a two-stage flow: upload -> diagnosis from the coding
    // GGUF -> Automatic Fix button. Do not skip diagnosis and edit immediately.
    if (!isImageUpload && (sessionMode === "troubleshooting" || /\b(?:troubleshoot|troubleshooting|debug|debugging|fix|repair|modify|change|edit)\b/i.test(question))) {
      sessionMode = "troubleshooting";
      await runCoderDiagnosis(question);
      return;
    }

    appendMessage(
      "Faith",
      data.answer || "I received the upload, but Faith did not return an answer.",
      "ai",
      Array.isArray(data.images) ? data.images : []
    );

    if (data.troubleshoot_offer && !isImageUpload) {
      const offer = document.createElement("div");
      offer.style.marginTop = "10px";
      offer.style.display = "flex";
      offer.style.alignItems = "center";
      offer.style.flexWrap = "wrap";
      offer.style.gap = "8px";
      const offerText = document.createElement("span");
      offerText.textContent = "Want to edit this existing file?";
      const troubleshootButton = document.createElement("button");
      troubleshootButton.type = "button";
      troubleshootButton.textContent = "Enter Troubleshooting";
      troubleshootButton.addEventListener("click", () => {
        sessionMode = "troubleshooting";
        setExpression("troubleshooting", "Ready for your change request");
        appendMessage("Faith", "Troubleshooting mode is ready. I already have this uploaded file. Tell me what you want changed, checked, or reviewed. Say **Automatic fix** if you want me to search for known fixes and apply one.", "ai");
      });
      const automaticFixButton = document.createElement("button");
      automaticFixButton.type = "button";
      automaticFixButton.textContent = "Automatic fix";
      automaticFixButton.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        try {
          await runCoderTroubleshooting("Automatic fix: search the web for known fixes and apply the best supported repair to the uploaded file.", { automaticFix: true });
        } catch (error) {
          setExpression("troubleshooting", "Automatic fix could not be completed");
          appendMessage("Error", error.message, "error");
        } finally {
          setBusy(false);
          input.focus();
        }
      });
      offer.append(offerText, troubleshootButton, automaticFixButton);
      const faithItemForOffer = chat.lastElementChild;
      if (faithItemForOffer) faithItemForOffer.appendChild(offer);
    }

    if (data.attachment && data.attachment.url) {
      const faithItem = chat.lastElementChild;
      if (faithItem) {
        const link = document.createElement("a");
        link.href = data.attachment.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open uploaded file";
        link.style.display = "inline-block";
        link.style.marginTop = "8px";
        link.style.fontSize = "0.8rem";
        faithItem.appendChild(link);
      }
    }
  } catch (error) {
    setUploadStatus(`Not sent: ${file.name}`);
    setExpression("confusion", "Upload failed");
    appendMessage("Error", `Could not send “${file.name}” to Faith: ${error.message}`, "error");

    // GGUF download links are ONLY shown for image/vision failures.
    if (isImageUpload) {
      const downloads = Array.isArray(error.visionDownloads) && error.visionDownloads.length
        ? error.visionDownloads
        : (visionDownloads.length ? visionDownloads : FAITH_VISION_DOWNLOADS);
      const errorItem = chat.lastElementChild;
      if (errorItem && downloads.length) {
        const linksWrap = document.createElement("div");
        linksWrap.style.marginTop = "8px";
        linksWrap.style.display = "flex";
        linksWrap.style.flexDirection = "column";
        linksWrap.style.gap = "4px";
        downloads.forEach((download) => {
          if (!download || typeof download.url !== "string" || !download.url) return;
          const link = document.createElement("a");
          link.href = download.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = `Download ${download.filename || "required GGUF file"}`;
          linksWrap.appendChild(link);
        });
        errorItem.appendChild(linksWrap);
      }
    }
  } finally {
    setBusy(false);
    input.focus();
  }
}

function isAutomaticFixRequest(question) {
  return /\b(?:automatic\s+fix|auto(?:matic)?ally\s+fix|search\s+(?:the\s+)?web\s+for\s+(?:a\s+)?fix|find\s+(?:a\s+)?fix\s+online)\b/i.test(String(question || ""));
}

function isTroubleshootingEntryRequest(question) {
  const text = String(question || "").trim();
  return /\b(?:enter|start|begin|switch\s+(?:to|into)|go\s+into|activate)\s+(?:the\s+)?troubleshooting(?:\s+mode|\s+session)?\b/i.test(text) ||
    /\b(?:fix|debug|review|check|inspect|modify|change|edit|update|repair)\b[\s\S]{0,100}\b(?:my|this|the|existing|uploaded)?\s*(?:source\s+)?(?:code|file|script|program|class|function)\b/i.test(text) ||
    /\b(?:code|file|script|program|class|function)\b[\s\S]{0,100}\b(?:fix|debug|review|check|inspect|modify|change|edit|update|repair)\b/i.test(text);
}

function isDirectCodeFixRequest(question) {
  const text = String(question || "");
  return /\b(?:fix|repair|correct|modify|change|edit|update|patch|resolve)\b[\s\S]*\b(?:code|file|source|error|bug|issue|problem)\b/i.test(text) ||
    /\b(?:can|could|will|would)\b[\s\S]*\b(?:you|faith)\b[\s\S]*\b(?:fix|repair|correct|modify|change|edit|patch)\b[\s\S]*\b(?:code|file|it|this)\b/i.test(text);
}

function isFaithBuildRequest(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  // Image creation belongs to Faith's Painting pipeline, not Build mode.
  const asksForImage = /\b(?:generate|draw|paint|render|illustrate|sketch|create|make)\b[\s\S]*\b(?:image|picture|photo|portrait|drawing|painting|wallpaper)\b/i.test(value);
  const softwareContext = /\b(?:code|coding|program|programming|software|app|application|website|web site|game|script|tool|utility|project|api|plugin|frontend|backend|html|css|javascript|typescript|python|ruby|java|c\+\+|from scratch|ground up)\b/i.test(value);
  const explicitImageSoftwareRequest = /\b(?:code|coding|programming|script|image-processing app|image generator app|image-generation tool)\b/i.test(value) ||
    /\b(?:app|application|website|tool|software)\b[\s\S]*\b(?:generate|draw|paint|create)\b[\s\S]*\b(?:image|picture|photo|art)\b/i.test(value);
  if (asksForImage && !explicitImageSoftwareRequest) return false;

  const capabilityAsk = /\b(?:can|could|would|will)\s+(?:you|faith)\s+(?:(?:also|please)\s+)?(?:(?:help|teach)\s+me\s+to\s+)?(?:build|create|write|code|develop|make|program)\b/i.test(value) && softwareContext;
  const directBuild = (/\b(?:build|create|write|code|develop|make|program)\s+(?:(?:me|for me)\s+)?(?:a|an|the|some|my|this|that)\b[\s\S]{2,}/i.test(value) && softwareContext) ||
    (/\b(?:let'?s|lets)\s+(?:build|create|write|code|develop|make|program)\b/i.test(value) && softwareContext) ||
    (/\b(?:from scratch|ground up)\b/i.test(value) && softwareContext);
  return capabilityAsk || directBuild;
}

function isFaithImageGenerationPhrase(text) {
  const value = String(text || "");
  // These two natural-language forms are explicitly reserved for Faith's
  // Perchance-embed image-generation pipeline. They must never
  // enter the direct Qwen chat relay.
  return /\bpaint\s+a\b/i.test(value) || /\bgenerate\s+a\b/i.test(value);
}

// Paint-family detector: mirrors server.rb generate_image_request's two
// noun-free rules — a bare draw/paint/illustrate/sketch action ("draw a cat",
// "paint me a sunset", "sketch a dragon") or a leading generate/create/make
// + article ("generate me a dragon", "make a logo"). Anything this matches is
// an image request on the server too, so without this the browser sends it to
// /api/qwen-chat where the server 409-rejects it and the user only gets an
// error bubble. Routing it to the paint backend turns those errors into
// paintings. Qwen chat, build, coding, troubleshooting and emotions are
// untouched: those branches all run before this routing (and the
// paintActionRequest below is idle-gated, so active coding/troubleshooting
// sessions keep their existing /api/chat behavior byte-for-byte).
function isFaithPaintAction(text) {
  const n = String(text || "").toLowerCase();
  if (/\b(?:draw|paint|illustrate|sketch)\b/.test(n)) return true;
  return /^\s*(?:please\s+)?(?:generate|create|make)\s+(?:me\s+)?(?:a|an|some)\b/.test(n);
}

async function runQwenPostEnrichment(messageItem, question, answer, wikimediaPromise = null) {
  if (!messageItem || !question) return;

  // Wikimedia is normally STARTED BEFORE the Qwen request. The promise is
  // passed in here after Qwen finishes, so we simply collect the images that
  // have been searching in parallel for the entire duration of generation.
  // If the search is still running, it finishes independently and appends the
  // images when ready. It never blocks chat unlock or Explanation mode.
  const wikimediaTask = (async () => {
    try {
      let data;
      if (wikimediaPromise) {
        data = await wikimediaPromise;
      } else {
        const response = await fetch(`/api/qwen-wikimedia?ts=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Cache-Control": "no-cache" },
          cache: "no-store",
          body: JSON.stringify({ question, answer })
        });
        if (!response.ok) throw new Error(`Wikimedia HTTP ${response.status}`);
        data = await response.json();
      }

      const images = Array.isArray(data && data.images) ? data.images : [];
      if (images.length > 0) {
        appendImages(messageItem, images);
        chat.scrollTop = chat.scrollHeight;
      }
      console.info(`[Faith Images] Parallel Wikimedia returned ${images.length} image(s).`);
    } catch (error) {
      console.warn("[Faith Images] Parallel Wikimedia search failed:", error);
    }
  })();

  const sourcesTask = (async () => {
    try {
      const response = await fetch(`/api/qwen-source-start?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Cache-Control": "no-cache" },
        cache: "no-store",
        body
      });
      if (!response.ok) throw new Error(`Sources HTTP ${response.status}`);
      const data = await response.json();
      if (data.source_research_job_id) {
        startFaithReferenceLoader(messageItem);
        pollFaithSourceResearch(messageItem, data.source_research_job_id);
      } else {
        console.info("[Faith Sources] No source research required for this reply.");
      }
    } catch (error) {
      console.warn("[Faith Sources] Post-answer research start failed:", error);
    }
  })();

  // Keep both requests alive without making the completed Qwen response wait.
  void Promise.allSettled([wikimediaTask, sourcesTask]);
}

async function runCoderTroubleshooting(question, options = {}) {
  const automaticFix = !!options.automaticFix || isAutomaticFixRequest(question);
  const reviewOnly = !automaticFix && /\b(?:review|check|inspect|analy[sz]e)\b/i.test(question) &&
    !/\b(?:change|modify|edit|update|fix|repair|correct|patch|refactor|add|remove|replace|implement)\b/i.test(question);
  sessionMode = "troubleshooting";
  setExpression("troubleshooting", automaticFix ? "Searching for known fixes, then applying them…" : "Getting your requested code changes from Qwen on :8090…");

  let faithItem = appendMessage(
    "Faith",
    automaticFix
      ? "Searching for relevant fixes online, then I’ll send your file to Qwen on :8090 to apply the best fit."
      : (reviewOnly
        ? "Getting response from Qwen code port on :8090… I’m reviewing your file against your instructions."
        : `Getting response from Qwen code port on :8090… I’m applying your requested changes: ${question}`),
    "ai"
  );
  faithItem.classList.add("troubleshooting-pending");
  const updateProgressMessage = (message) => {
    if (answerHasStarted) return;
    const node = faithItem.querySelector(".message-text");
    if (node) node.textContent = message;
  };
  let answerHasStarted = false;

  const response = await fetch(`/api/coder-edit?ts=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "Cache-Control": "no-cache" },
    cache: "no-store",
    body: JSON.stringify({ question, automatic_fix: automaticFix })
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch (_) {}
    throw new Error(data.error || `Coding service HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("The browser could not open the coding stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let completed = false;
  const paint = () => {
    faithItem.classList.remove("troubleshooting-pending");
    const node = faithItem.querySelector(".message-text");
    if (node) { node.innerHTML = formatFaithMessage(reviewOnly ? answer : "```\n" + answer + "\n```"); scheduleCodeHighlight(node); }
    chat.scrollTop = chat.scrollHeight;
  };
  const consume = (raw) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    let event;
    try { event = JSON.parse(line.slice(5).trim()); } catch (_) { return; }
    if (event.type === "status") {
      if (event.phase === "searching") {
        setExpression("troubleshooting", event.message || "Searching for relevant fixes online…");
        updateProgressMessage("Searching for relevant fixes online… I’ll move on to Qwen on :8090 as soon as the search finishes.");
      } else if (event.phase === "connecting") {
        setExpression("troubleshooting", "Getting response from Qwen code port on :8090…");
        updateProgressMessage("Search step finished. Getting response from Qwen code port on :8090…");
      } else if (event.phase === "coding") {
        // Keep the Troubleshooting expression active while code is still being
        // relayed. Restore the original Coding expression only after the full
        // coding response has arrived and the stream has closed successfully.
        updateProgressMessage(automaticFix ? "Qwen is applying the fix and writing the updated file…" : "Qwen is writing the updated file…");
      }
    } else if (event.type === "delta" && event.text) {
      answer += event.text;
      if (!answer.trimStart()) return;
      answerHasStarted = true;
      paint();
    } else if (event.type === "done") {
      completed = true;
      sessionMode = "troubleshooting";
      if (reviewOnly) {
        faithItem.classList.remove("troubleshooting-pending");
        const node = faithItem.querySelector(".message-text");
        if (node) { node.innerHTML = formatFaithMessage(answer); scheduleCodeHighlight(node); }
        setExpression("troubleshooting", "Code review complete");
        return;
      }
      if (event.attachment && event.attachment.url) {
        const link = document.createElement("a");
        link.href = event.attachment.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Open updated file: ${event.attachment.name || "updated source"}`;
        link.style.display = "inline-block";
        link.style.marginTop = "8px";
        faithItem.appendChild(link);
      }
      // The final Coding expression is set after the entire HTTP stream has
      // been received, not merely when the server emits its done event.
    } else if (event.type === "error") {
      throw new Error(event.error || "Coding model failed.");
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      frame.split("\n").forEach(consume);
    }
  }
  if (buffer.trim()) buffer.split("\n").forEach(consume);
  if (!completed || !answer.trim()) throw new Error("The coding server ended before it returned the updated source file.");
  if (!reviewOnly) {
    setExpression("coding", automaticFix ? "Automatic fix complete — updated code fully received" : "Code changes complete — updated code fully received");
  }
  return answer;
}

async function runCoderBuild(question) {
  const requestSequence = ++buildRequestSequence;
  const controller = new AbortController();
  activeBuildController = controller;
  // Build mode has its own stream consumer. Do not pass this response through
  // the general Qwen/chat post-processing, which can reset the mode or replace
  // the streaming message after the coding model has answered.
  sessionMode = "build";
  setExpression("build", "Getting response from Qwen code port on :8090…");

  // Show an immediate, persistent waiting reply while the coding model loads
  // or thinks. The first streamed token replaces this same message instead of
  // creating a second one, matching Troubleshooting's progress feedback.
  let faithItem = appendMessage(
    "Faith",
    "Getting response from Qwen code port on :8090…",
    "ai"
  );
  faithItem.classList.add("build-pending");

  const response = await fetch(`/api/build-chat?ts=${Date.now()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream, application/json",
      "Cache-Control": "no-cache"
    },
    cache: "no-store",
    signal: controller.signal,
    body: JSON.stringify({ question })
  });
  if (requestSequence !== buildRequestSequence) return "";

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || !contentType.includes("text/event-stream")) {
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || data.detail || `Build service HTTP ${response.status}`);

    // Closing Build mode returns JSON because it does not start a token stream.
    const answer = String(data.answer || "Build mode response received.");
    faithItem.classList.remove("build-pending");
    const node = faithItem.querySelector(".message-text");
    if (node) { node.innerHTML = formatFaithMessage(answer); scheduleCodeHighlight(node); }
    sessionMode = data.session_mode === "idle" ? "idle" : "build";
    setExpression(sessionMode === "build" ? "build" : "explanation");
    return answer;
  }

  if (!response.body) throw new Error("The browser could not open Faith's Build stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let finished = false;

  const paintAnswer = () => {
    faithItem.classList.remove("build-pending");
    const node = faithItem.querySelector(".message-text");
    if (node) { node.innerHTML = formatFaithMessage(answer); scheduleCodeHighlight(node); }
    chat.scrollTop = chat.scrollHeight;
  };
  const handleEvent = (event) => {
    if (requestSequence !== buildRequestSequence || !event || typeof event !== "object") return;
    if (event.type === "reset") {
      // The first attempt may already have streamed a generic deflection.
      // The retry starts a fresh answer; never concatenate both attempts.
      answer = "";
      faithItem.classList.add("build-pending");
      const node = faithItem.querySelector(".message-text");
      if (node) node.textContent = event.message || "Retrying with a fresh implementation request…";
      chat.scrollTop = chat.scrollHeight;
      return;
    }
    if (event.type === "status") {
      if (event.phase === "connecting") setExpression("build", "Getting response from Qwen code port on :8090…");
      else if (event.phase === "building") setExpression("build", "Qwen is writing your code…");
      else if (event.phase === "build-ready") setExpression("build", "Ready for your idea");
      return;
    }
    if (event.type === "delta") {
      const delta = String(event.text || "");
      if (!delta) return;
      answer += delta;
      setExpression("build", "Qwen is writing your code…");
      paintAnswer();
      return;
    }
    if (event.type === "text_complete") {
      if (typeof event.answer === "string") answer = event.answer;
      sessionMode = event.session_mode === "idle" ? "idle" : "build";
      paintAnswer();
      setExpression(sessionMode === "build" ? "build" : "explanation");
      return;
    }
    if (event.type === "done") {
      if (typeof event.answer === "string") answer = event.answer;
      sessionMode = event.session_mode === "idle" ? "idle" : "build";
      paintAnswer();
      setExpression(sessionMode === "build" ? "build" : "explanation");
      finished = true;
      return;
    }
    if (event.type === "error") throw new Error(event.error || event.detail || "Faith's Build model failed.");
  };

  const processFrame = (frame) => {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { handleEvent(JSON.parse(payload)); }
      catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buffer.slice(0, boundary);
      const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
      buffer = buffer.slice(boundary + (match ? match[0].length : 2));
      processFrame(frame);
    }
  }
  if (buffer.trim()) processFrame(buffer);
  if (requestSequence !== buildRequestSequence) return "";
  if (!finished || !answer.trim()) {
    throw new Error("Faith's Build stream ended before a complete answer arrived. Check that the coding GGUF server is running on port 8090.");
  }
  if (activeBuildController === controller) activeBuildController = null;
  return answer;
}

async function submitQuestion() {
  if (busy) return;

  const question = input.value.trim();
  if (!question) return;
  faithLastUserPrompt = question;
  const turnId = ++turnSequence;

  input.value = "";
  // If a file is staged, defer rendering the user turn until uploadFileToFaith
  // can put the instruction and attachment card together in one message.
  if (!pendingCodeFile) appendMessage("You", question, "you");

  const isTroubleshootingEntry = isTroubleshootingEntryRequest(question) || /\b(?:troubleshoot|troubleshooting|debug|debugging)\b/i.test(question);
  const isModeOnlyRequest = /\b(?:enter|start|begin|activate|switch\s+(?:to|into)|go\s+into)\s+(?:the\s+)?troubleshooting(?:\s+mode|\s+session)?\b/i.test(question) || /^\s*(?:let'?s\s+)?(?:do|start)\s+troubleshooting\s*$/i.test(question);

  // Entering Troubleshooting is deliberate. Do not launch a diagnosis until
  // the user has supplied the existing file and described the requested edit.
  if (isModeOnlyRequest && !pendingCodeFile) {
    sessionMode = "troubleshooting";
    setExpression("troubleshooting", "Ready for your existing code and change request");
    appendMessage("Faith", "Troubleshooting mode is ready. Upload the existing code file, then describe exactly what you want me to change. If you want the original researched repair workflow, include **Automatic fix** with your instructions.", "ai");
    return;
  }

  if (isTroubleshootingEntry && !pendingCodeFile && sessionMode !== "troubleshooting") {
    sessionMode = "troubleshooting";
    setExpression("troubleshooting", "Ready for your existing code and change request");
    appendMessage("Faith", "Absolutely. I’m in Troubleshooting mode now. Upload the existing code file and tell me what you want changed, checked, or reviewed. You can also say **Automatic fix** if you want me to search for known fixes and apply one automatically.", "ai");
    return;
  }

  // A staged source attachment is sent together with this comment. If this is
  // a concrete edit request, activate Troubleshooting before the upload returns.
  if (pendingCodeFile) {
    if (isTroubleshootingEntry || sessionMode === "troubleshooting" || isDirectCodeFixRequest(question) || isAutomaticFixRequest(question)) {
      sessionMode = "troubleshooting";
      troubleshootingDiagnosisReady = false;
      setExpression("troubleshooting", "Preparing your source for diagnosis");
    }
    const stagedFile = pendingCodeFile;
    try {
      await uploadFileToFaith(stagedFile, question);
    } finally {
      if (turnId === turnSequence) setBusy(false);
      input.focus();
    }
    return;
  }

  // Build is a persistent conversation, like Troubleshooting, but it always
  // goes directly to /api/build-chat -> the coding GGUF on :8090. This branch
  // must run before the general chat path so no later handler can reset mode.
  if (sessionMode === "build" || isFaithBuildRequest(question)) {
    setBusy(true);
    try {
      await runCoderBuild(question);
    } catch (error) {
      if (turnId === turnSequence && error.name !== "AbortError" && !/stale/i.test(error.message || "")) {
        sessionMode = "build";
        setExpression("build", "Build request failed");
        const pendingReply = chat.querySelector(".message.ai.build-pending");
        if (pendingReply) pendingReply.remove();
        appendMessage("Error", error.message, "error");
      }
    } finally {
      activeBuildController = null;
      if (turnId === turnSequence) setBusy(false);
      input.focus();
    }
    return;
  }

  // Troubleshooting remains an edit session: follow-up changes and an explicit
  // Automatic fix use the same live :8090 code-edit stream against the latest file.
  const isTroubleshootingChange = /\b(?:change|modify|edit|update|fix|repair|correct|patch|refactor|add|remove|replace|automatic\s+fix|review|check|yes|please|do that|go ahead|continue|try again|make it|also|now)\b/i.test(question);
  if (sessionMode === "troubleshooting" && (troubleshootingDiagnosisReady || isDirectCodeFixRequest(question) || isAutomaticFixRequest(question) || isTroubleshootingChange)) {
    setBusy(true);
    try {
      await runCoderTroubleshooting(question, { automaticFix: isAutomaticFixRequest(question) });
    } catch (error) {
      sessionMode = "troubleshooting";
      setExpression("troubleshooting", "Code edit could not be completed");
      appendMessage("Error", error.message, "error");
    } finally {
      setBusy(false);
      input.focus();
    }
    return;
  }

  setBusy(true);
  const isTroubleshootingPrompt = isTroubleshootingEntryRequest(question) || /\b(?:troubleshoot|troubleshooting|debug|debugging)\b/i.test(question);
  setExpression(isTroubleshootingPrompt ? "troubleshooting" : "thinking");

  if (isTroubleshootingPrompt) {
    sessionMode = "troubleshooting";
    setExpression("troubleshooting", "Ready for your existing code and change request");
    appendMessage("Faith", "Troubleshooting mode is ready. Upload the existing code file, then describe the changes you want. Say **Automatic fix** if you want me to search for known fixes and apply one automatically.", "ai");
    setBusy(false);
    input.focus();
    return;
  }

  // Do NOT show an image-generation message until the server confirms that
  // this is actually an image-generation request. Normal chat and real-photo
  // requests must never display "Generating your image...".
  let loadingMessage = null;
  let qwenRelayLoading = null;
  let requestModeConfirmed = false;
  let wikimediaPreflight = null;
  const chatController = new AbortController();
  activeChatController = chatController;

  try {
    // Ordinary conversation uses the dedicated direct Qwen relay. Specialized
    // requests continue through /api/chat below. This endpoint is intentionally
    // tiny: browser -> Faith :4567 -> Qwen :8080 -> Faith -> browser.
    // NSFW capability questions must be classified before generic image-generation
    // detection; e.g. "Can Faith generate NSFW images?" asks about capability,
    // it is not an instruction to generate an image.
    const eroticCapabilityQuestion = isEroticCapabilityQuestion(question);
    if (eroticCapabilityQuestion) setExpression("erotic", "Checking adult-art capability...");
    // Idle-only: active coding/troubleshooting sessions keep existing behavior.
    const paintActionRequest = sessionMode === "idle" && isFaithPaintAction(question);
    const isSimpleChat = !isTroubleshootingPrompt && sessionMode === "idle" &&
      (eroticCapabilityQuestion || (!isFaithImageGenerationPhrase(question) &&
      !paintActionRequest &&
      !/\b(?:generate|create|draw|paint|make)\b[\s\S]*\b(?:image|picture|photo|art)\b/i.test(question))) &&
      !/\b(?:upload|file|code|debug|troubleshoot)\b/i.test(question);

    const isImageGeneration = !eroticCapabilityQuestion && (isFaithImageGenerationPhrase(question) ||
      paintActionRequest ||
      /\b(?:generate|create|draw|paint|make|render|illustrate|design|sketch)\b[\s\S]*\b(?:image|picture|photo|art|portrait|drawing|painting|scene|wallpaper)\b/i.test(question));
    const dedicatedEmotion = (isSimpleChat || eroticCapabilityQuestion) ? faithEmotionRoute(question) : null;

    // Emotion trigger prompts must go directly to the dedicated :8070 model.
    // Image generation, Build, and Troubleshooting retain their existing routes.
    const endpoint = isImageGeneration
      ? "/api/imagegen"
      : (dedicatedEmotion && dedicatedEmotion !== "erotic" ? "/api/emotions" : (isSimpleChat ? "/api/qwen-chat" : "/api/chat"));

    // Normal chat can take a while while Qwen/llama-server generates the
    // response. Show an explicit relay status and a live elapsed-time counter
    // so the user always knows Faith is waiting on the local AI backend.
    // Image generation and other specialized routes keep their own loaders.
    if (isSimpleChat) {
      qwenRelayLoading = appendQwenRelayLoadingMessage(
        dedicatedEmotion && dedicatedEmotion !== "erotic"
          ? `Getting response from Faith's ${dedicatedEmotion} model on :8070...`
          : "Getting response from Qwen and llama_server..."
      );

      // START WIKIMEDIA AT THE SAME TIME AS QWEN. Do not wait for the first
      // token, a complete answer, or Explanation mode. The search now gets the
      // full Qwen generation window to find relevant Commons images.
      if (isSimpleChat && !dedicatedEmotion && !eroticCapabilityQuestion) wikimediaPreflight = (async () => {
        try {
          const response = await fetch(`/api/qwen-wikimedia?ts=${Date.now()}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Cache-Control": "no-cache"
            },
            cache: "no-store",
            signal: chatController.signal,
            body: JSON.stringify({ question })
          });
          if (!response.ok) throw new Error(`Wikimedia HTTP ${response.status}`);
          return await response.json();
        } catch (error) {
          console.warn("[Faith Images] Parallel Wikimedia preflight failed:", error);
          return { images: [], image_mode: "none" };
        }
      })();
    }

    // Open Faith's painter tab NOW, inside the user's click/keypress gesture,
    // so the browser cannot block it as a popup. The tab is top-level on
    // *.perchance.org, which is exactly what the image backend's framing
    // policy requires (a hidden localhost iframe can never satisfy it).
    // Closed again below if this turn turns out not to paint.
    let painterOpenedThisTurn = false;
    if (isImageGeneration && sessionMode !== "build" && sessionMode !== "coding" && sessionMode !== "troubleshooting") {
      let hadOpen = false;
      try { hadOpen = !!(faithPainterPopup && !faithPainterPopup.closed); } catch (_) {}
      if (!hadOpen) painterOpenedThisTurn = !!openFaithPainterPopup();
    }

    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      signal: chatController.signal,
      body: JSON.stringify({ question, art_style: getFaithArtStyle(), session_id: faithWorkspace.activeId || "main" })
    });

    // If a stale server/proxy does not know /api/qwen-chat, immediately retry
    // ordinary chat through /api/chat. server.rb contains the same direct-Qwen
    // compatibility guard, so this cannot fall into the slow Faith pipeline.
    if (((isSimpleChat && !dedicatedEmotion) || isImageGeneration) && (response.status === 404 || response.status === 405)) {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        signal: chatController.signal,
        body: JSON.stringify({ question, art_style: getFaithArtStyle(), session_id: faithWorkspace.activeId || "main" })
      });
    }

    let data;
    let streamedFaithItem = null;

    if (isSimpleChat && response.ok && (response.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
      const streamed = await consumeQwenStream(response, qwenRelayLoading);
      data = streamed.data;
      streamedFaithItem = streamed.faithItem;
      qwenRelayLoading = null;

      // v60: the Qwen stream is completely finished here. Unlock the chat and
      // keep Faith in Explanation mode BEFORE doing any Wikimedia/source work.
      // Enrichment continues independently on the already-completed message.
      if (data && data.post_enrichment && streamedFaithItem && !eroticCapabilityQuestion) {
        setExpression("explanation");
        setBusy(false);
        input.focus();
        void runQwenPostEnrichment(streamedFaithItem, question, data.answer || "", wikimediaPreflight);
        return;
      }
    } else {
      if (qwenRelayLoading) {
        qwenRelayLoading.stop();
        qwenRelayLoading = null;
      }

      const contentType = response.headers.get("content-type") || "";
      const rawResponse = await response.text();
      try {
        data = JSON.parse(rawResponse);
      } catch (_) {
        const preview = rawResponse.replace(/\s+/g, " ").slice(0, 220);
        throw new Error(`Faith returned non-JSON from ${endpoint} (HTTP ${response.status}). Response: ${preview}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
    }

    // Image bytes are generated browser-side through the Perchance embed (the
    // same backend as the Perchance AI image generator). The server returns a
    // styled prompt spec (image_prompt / image_negative / image_resolution /
    // image_guidance) and the browser below turns it into actual images.
    const generatedImages = Array.isArray(data.images)
      ? data.images.filter((image) => image && image.type === "generated" && image.url)
      : [];

    // Styled prompt spec for browser-side generation. Only trusted when the
    // server explicitly confirms image_mode "generated".
    const faithImageSpec = (data.image_mode === "generated" &&
      typeof data.image_prompt === "string" && data.image_prompt.trim().length > 0)
      ? {
          prompt: data.image_prompt,
          negative: typeof data.image_negative === "string" ? data.image_negative : "",
          resolution: typeof data.image_resolution === "string" ? data.image_resolution : "512x768",
          guidance: Number(data.image_guidance) || 7
        }
      : null;

    // Some local-model responses occasionally return a valid JSON envelope but
    // no assistant text. Never render that as an empty Explanation bubble. A
    // successful image-only response is allowed to have no text because the
    // generated image itself is the response.
    const hasAssistantText = typeof data.answer === "string" && data.answer.trim().length > 0;
    const hasAnyImages = Array.isArray(data.images) && data.images.some((image) => image && image.url);
    if (!hasAssistantText && !hasAnyImages && !faithImageSpec) {
      data.answer = data.image_request
        ? "Faith couldn't generate an image this time. Please try again in a moment."
        : "I didn't receive a text response that time. Please send that prompt again.";
      console.warn("[Faith Chat] Empty assistant response received; showing a fallback message instead.", {
        endpoint,
        imageRequest: Boolean(data.image_request),
        expression: data.expression || null
      });
    }

    // Painting is ONLY allowed when the server explicitly confirms an
    // AI-generation mode or actually returns a generated image.  Never trust
    // `data.expression === "painting"` by itself, because a normal chat
    // response must stay in Explanation/Thinking/etc.
    const isGeneratedRequest =
      data.image_mode === "generated" ||
      generatedImages.length > 0;

    // Wikimedia Commons results are always type="photo" and image_mode is
    // "photo" or "wikimedia". They must NEVER switch Faith into Painting.
    const isWikimediaOnly =
      data.image_mode === "photo" ||
      data.image_mode === "wikimedia" ||
      (Array.isArray(data.images) && data.images.length > 0 && generatedImages.length === 0);

    const shouldPaint = isGeneratedRequest && !isWikimediaOnly;

    // The painter tab was opened speculatively in the click gesture. If this
    // turn is not actually painting, close it again so stray tabs do not pile up.
    if (!shouldPaint && painterOpenedThisTurn) {
      painterOpenedThisTurn = false;
      try { if (faithPainterPopup && !faithPainterPopup.closed) faithPainterPopup.close(); } catch (_) {}
      faithPainterReady = false;
    }

    requestModeConfirmed = true;

    if (data.session_mode === "build") sessionMode = "build";
    else if (data.session_mode === "coding") sessionMode = "coding";
    else if (data.session_mode === "troubleshooting" || isTroubleshootingPrompt) sessionMode = "troubleshooting";
    else if (data.session_mode === "idle") sessionMode = "idle";

    if (shouldPaint) {
      // This is the actual Paint Me / image-generation path. The painter tab
      // (same backend as the Perchance AI image generator) paints each image,
      // honoring the How-many dropdown. The tab stays open for reuse.
      const paintCount = getFaithImageCount();
      const paintStyle = getFaithArtStyle();
      setExpression(
        "painting",
        paintCount > 1
          ? `Creating ${paintCount} images${paintStyle !== "No style" ? " (" + paintStyle + ")" : ""}...`
          : ("Creating your image" + (paintStyle !== "No style" ? " (" + paintStyle + ")" : "") + "...")
      );
      if (!data.answer || !data.answer.trim()) {
        data.answer = paintCount > 1
          ? `Painting ${paintCount} images in ${paintStyle} style...`
          : `Painting in ${paintStyle} style...`;
      }
    } else {
      // A backend expression of "painting" is ignored unless image_mode
      // confirmed an actual generation request above.
      const normalExpression = ["robotic", "psychotic", "sad", "anger", "erotic"].includes(data.expression)
        ? data.expression
        : (sessionMode === "build"
          ? "build"
          : (sessionMode === "coding"
          ? "coding"
          : (sessionMode === "troubleshooting"
            ? "troubleshooting"
            : (isTroubleshootingPrompt
              ? "troubleshooting"
              : (["greeting", "thinking", "confusion", "troubleshooting", "observing"].includes(data.expression)
                ? data.expression
                : getDefaultReplyExpression("explanation"))))));
      setExpression(normalExpression);
    }

    if (!shouldPaint) {
      removeLoadingMessage(loadingMessage);
      loadingMessage = null;
    }

    const responseImages = (sessionMode === "troubleshooting" || sessionMode === "coding") ? [] : (data.images || []);
    const faithItem = streamedFaithItem || appendMessage("Faith", data.answer, "ai", responseImages, {
      onGeneratedStateChange: (remaining, loaded) => {
        if (remaining > 0) {
          if (loadingMessage) updateLoadingMessage(loadingMessage, "Loading your generated image…");
          if (shouldPaint) setExpression("painting", "Loading generated image…");
          return;
        }

        removeLoadingMessage(loadingMessage);
        loadingMessage = null;

        if (shouldPaint) {
          setExpression(
            "painting",
            loaded ? "Image ready" : "Image could not be loaded"
          );
        }
      }
    });

    if (streamedFaithItem && responseImages.length) {
      appendImages(streamedFaithItem, responseImages);
    }

    // Browser-side image generation through the hosted Faith image bridge
    // (Perchance backend): ONE streaming batch job per turn, images appended
    // as they arrive. Coding/troubleshooting turns stay text-only by design
    // (responseImages is already [] for them).
    let paintedViaBrowser = false;
    if (shouldPaint && faithImageSpec && sessionMode !== "troubleshooting" && sessionMode !== "coding") {
      const paintTotal = getFaithImageCount();
      const paintStyleName = getFaithArtStyle();
      const paintSize = getFaithImageSize();
      const paintTitle = String(question).slice(0, 120);
      const paintIsNative = !!paintSize.isNative;
      loadingMessage = appendLoadingMessage(paintTotal > 1 ? `Painting 1/${paintTotal}…` : "Painting…");
      let paintedOk = 0, paintedFailed = 0;
      const paintedIdx = new Set();
      // Live elapsed-time readout so a slow backend queue never looks stuck.
      const paintT0 = Date.now();
      let paintLabel = paintTotal > 1 ? `Painting 1/${paintTotal}…` : "Painting…";
      const paintClock = setInterval(() => {
        if (!loadingMessage) return;
        try {
          const s = Math.round((Date.now() - paintT0) / 1000);
          updateLoadingMessage(loadingMessage, `${paintLabel} (${s}s)`);
        } catch (_) {}
      }, 1000);
      const stopPaintClock = () => { try { clearInterval(paintClock); } catch (_) {} };
      try {
        // The bridge owns extraction + styling: send the RAW user question
        // and the style name (never the pre-styled spec — that would
        // double-apply the Art Style on the bridge side).
        const summary = await generateFaithImage({
          question: question,
          artStyle: paintStyleName,
          resolution: paintIsNative ? faithSizeToLegacy(paintSize) : faithImageSpec.resolution,
          count: paintTotal,
          targetWidth: paintIsNative ? null : paintSize.w,
          targetHeight: paintIsNative ? null : paintSize.h
        }, {
          onImage: (img) => {
            if (turnId !== turnSequence) return;
            const idx = (typeof img.index === "number") ? img.index : paintedOk + paintedFailed;
            if (paintedIdx.has(idx)) return;
            paintedIdx.add(idx);
            paintedOk += 1;
            paintedViaBrowser = true;
            const dims = (img.width && img.height) ? `${img.width}×${img.height}` : "";
            removeLoadingMessage(loadingMessage);
            loadingMessage = null;
            appendImages(faithItem, [{
              url: img.dataUrl,
              title: paintTitle + (paintTotal > 1 ? ` (${paintedOk}/${paintTotal})` : "") + (dims ? ` — ${dims}` : ""),
              source: `Faith / ${img.provider || "Perchance"} (${paintStyleName})${img.upscaled ? " • upscaled" : ""}`,
              type: "generated",
              jobId: img.jobId || img.job_id || "",
              sessionId: faithWorkspace.activeId || "main",
              index: idx
            }]);
            chat.scrollTop = chat.scrollHeight;
            if (paintedOk + paintedFailed < paintTotal) {
              paintLabel = `Painting ${paintedOk + paintedFailed + 1}/${paintTotal}…`;
              loadingMessage = appendLoadingMessage(paintLabel);
            }
            setExpression("painting", paintedOk + paintedFailed < paintTotal ? `Painting ${paintedOk + paintedFailed + 1}/${paintTotal}…` : "Image ready");
          },
          onImageError: () => { if (turnId === turnSequence) paintedFailed += 1; }
        });
        if (turnId !== turnSequence) { stopPaintClock(); return; }
        stopPaintClock();
        removeLoadingMessage(loadingMessage);
        loadingMessage = null;
        // Legacy single-image path resolves {url} with no stream events.
        if (summary && summary.url && paintedOk === 0) {
          paintedOk = 1;
          paintedViaBrowser = true;
          const dims = `${paintSize.w}×${paintSize.h}`;
          appendImages(faithItem, [{
            url: summary.url,
            title: `${paintTitle} — ${dims}`,
            source: `Faith / ${summary.provider || "Perchance"} (${paintStyleName})`,
            type: "generated",
            jobId: summary.jobId || summary.job_id || "",
            sessionId: faithWorkspace.activeId || "main",
            index: 0
          }]);
          chat.scrollTop = chat.scrollHeight;
        }
        const failedTotal = (summary && summary.failed) || paintedFailed;
        if (paintedOk === 0) {
          setExpression("painting", "Image could not be loaded");
          appendMessage("Error", "Faith couldn't paint that image: the image bridge reported no usable result.", "error");
        } else {
          setExpression("painting", failedTotal > 0 ? `Image ready (${paintedOk}/${paintTotal})` : "Image ready");
        }
      } catch (paintError) {
        stopPaintClock();
        removeLoadingMessage(loadingMessage);
        loadingMessage = null;
        setExpression("painting", paintedOk > 0 ? "Image ready" : "Image could not be loaded");
        appendMessage("Error", `Faith couldn't paint that image: ${paintError.message}`, "error");
      }
    }

    // Faith's answer is already visible. If finite background source research
    // was started, update THIS SAME message when that job completes.
    if (data.source_research_job_id) {
      startFaithReferenceLoader(faithItem);
      pollFaithSourceResearch(faithItem, data.source_research_job_id);
    }

    // The server is the source of truth for whether Faith has completed the
    // second-stage troubleshooting diagnosis. The initial Troubleshooting turn
    // never qualifies for Fix Code.
    // from the visible wording of the response.
    // The server is authoritative. If a completed diagnosis is reported,
    // preserve Troubleshooting mode and expose Fix Code on THIS diagnosis
    // message. Do not require a client-side turn counter.
    if (data.fix_code_available === true || data.troubleshooting_ready === true) {
      if (data.session_mode !== "coding") sessionMode = "troubleshooting";
      addFixCodeButton(faithItem);
    }

    // Server-confirmed generation requests without server-side images are
    // fulfilled by the browser loop above; this only covers turns where the
    // browser loop did not run (e.g. text-only coding/troubleshooting turns).
    if (isGeneratedRequest && generatedImages.length === 0 && !paintedViaBrowser) {
      if (loadingMessage) updateLoadingMessage(loadingMessage, "Image generated");
      removeLoadingMessage(loadingMessage);
      loadingMessage = null;
      setExpression("painting", "Image ready");
    }
  } catch (error) {
    if (error.name === "AbortError" || turnId !== turnSequence) return;
    if (qwenRelayLoading) {
      qwenRelayLoading.stop();
      qwenRelayLoading = null;
    }
    removeLoadingMessage(loadingMessage);
    loadingMessage = null;

    if (sessionMode === "coding") {
      setExpression("coding", "Something went wrong while applying the fix");
    } else if (sessionMode === "troubleshooting") {
      setExpression("troubleshooting", "Something went wrong");
    } else {
      setExpression("confusion", "Something went wrong");
    }
    appendMessage("Error", error.message, "error");
  } finally {
    if (activeChatController === chatController) activeChatController = null;
    if (turnId === turnSequence) setBusy(false);
    input.focus();
  }
}

upload.addEventListener("click", () => {
  if (busy) return;
  // Open the recreate tab NOW, inside this click gesture, so the browser
  // cannot block it as a popup — same speculative pattern as the painter tab
  // on Send. Closed again below if no image is actually chosen.
  try {
    let hadOpen = false;
    try { hadOpen = !!(faithRecreatePopup && !faithRecreatePopup.closed); } catch (_) {}
    recreateOpenedThisTurn = !hadOpen && !!openFaithRecreatePopup();
  } catch (_) { recreateOpenedThisTurn = false; }
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  const isImage = file && String(file.type || "").toLowerCase().startsWith("image/");
  if (!file || !isImage) {
    // Cancelled, or a non-image (the recreate tab isn't needed for those):
    // close the speculative tab so tabs don't pile up — but only if this
    // click opened it (a warm tab from an earlier turn stays for reuse).
    if (recreateOpenedThisTurn) {
      try { if (faithRecreatePopup && !faithRecreatePopup.closed) faithRecreatePopup.close(); } catch (_) {}
      try { faithRecreateReady = false; } catch (_) {}
      recreateOpenedThisTurn = false;
    }
    if (!file) return;
  }
  await uploadFileToFaith(file);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
});

clear.addEventListener("click", async () => {
  // Invalidate the visible Build turn first, then abort its network stream.
  // This works even while the send button is busy/disabled.
  turnSequence += 1;
  buildRequestSequence += 1;
  // Drop any in-flight Perchance paint iframe so a stuck "Painting 1/N" turn
  // cannot resolve into the cleared conversation later.
  try { document.querySelectorAll('iframe[data-faith-paint]').forEach((f) => f.remove()); } catch (_) {}
  // Same for the painter tab: reject its pending jobs so a late finish cannot
  // repaint the cleared conversation, and reset its ready state.
  try {
    Object.keys(faithPainterPending).forEach((id) => {
      try { faithPainterPending[id].reject(new Error("Cleared.")); } catch (_) {}
      delete faithPainterPending[id];
    });
  } catch (_) {}
  try { faithPainterReady = false; } catch (_) {}
  // Same for the recreate tab: drop pending analysis/recreation jobs.
  try {
    Object.keys(faithRecreatePending).forEach((id) => {
      try { faithRecreatePending[id].reject(new Error("Cleared.")); } catch (_) {}
      delete faithRecreatePending[id];
    });
  } catch (_) {}
  try { faithRecreateReady = false; } catch (_) {}
  try { recreateOpenedThisTurn = false; } catch (_) {}
  if (activeChatController) {
    try { activeChatController.abort(); } catch (_) {}
    activeChatController = null;
  }
  if (activeBuildController) {
    try { activeBuildController.abort(); } catch (_) {}
    activeBuildController = null;
  }
  setBusy(true);
  chat.innerHTML = "";
  const currentThread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (currentThread) { currentThread.html = ""; currentThread.title = "New conversation"; currentThread.updatedAt = Date.now(); }
  faithSaveWorkspace();
  sessionMode = "idle";
  troubleshootingDiagnosisReady = false;
  pendingCodeFile = null;
  setUploadStatus("No file selected", false);
  setExpression("ruby", "Clearing conversation and cancelling stale Build responses…");

  try {
    const response = await fetch("/api/clear", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ session_id: faithWorkspace.activeId || "main" })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setExpression("ruby", "Ready — conversation and Build context cleared");
    setBusy(false);
    input.focus();
  } catch (error) {
    setExpression("confusion", "Browser cleared; server reset may have failed");
    appendMessage("Error", `The visible conversation was cleared, but the server reset failed: ${error.message}. Restart Faith if old Build context continues.`, "error");
    setBusy(false);
  }
});

input.focus();
console.info("[Faith] frontend " + FAITH_CLIENT_VERSION + " ready; bridge: " + getFaithImageBridgeUrl());

window.addEventListener("beforeunload", () => {
  try {
    const active = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
    if (active) {
      active.expression = pendingExpressionName || displayedExpressionName || active.expression || "ruby";
      active.detail = detail ? (detail.textContent || active.detail || "") : (active.detail || "");
      active.mode = sessionMode || "idle";
      active.behaviorState = sessionMode || "idle";
    }
    faithSaveWorkspace();
  } catch (_) {}
});
