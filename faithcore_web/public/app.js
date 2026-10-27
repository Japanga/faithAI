const FAITH_CLIENT_VERSION = "108-code-block-rendering-repair";

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
  talking: "/assets/Talking.gif",
  voiceMode: "/assets/voicemode.png",
  voiceModeTalking: "/assets/robot_talking.gif",
  hazard: "/assets/hazard.PNG",
  videoStudio: "/assets/videostudio.png",
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
  talking: "Talking...",
  voiceMode: "Voice Mode",
  voiceModeTalking: "Voice Mode — Speaking",
  hazard: "Hazard",
  videoStudio: "Video Studio",
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
  erotic: "Feeling artistic...",
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
  try { if (window.speechSynthesis && window.speechSynthesis.speaking && window.__faithVoicePlaybackSource !== "user") name = "talking"; } catch (_) {}
  if (!expressionImages[name]) return;

  // Update the caption immediately. Repeated status/token events for the same
  // expression must not restart the image fade timer; doing so made Build
  // appear to flicker between the old and new expression.
  status.textContent = expressionNames[name];
  detail.textContent = customDetail || expressionDetails[name];
  // Each thread remembers its own last expression, so switching conversations
  // restores the correct behavior instead of inheriting the previous chat's face.
  try {
    if (!window.__faithStudioExpressionActive && typeof faithWorkspace !== "undefined" && faithWorkspace) {
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
    if (name === "hazard") {
      expression.onerror = function() {
        expression.onerror = null;
        expression.src = expressionImages.troubleshooting;
        expression.alt = "Hazard warning expression";
      };
    } else {
      expression.onerror = null;
    }
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

// Some voice modules play audio directly instead of calling speechSynthesis.speak.
// Watch actual playback and keep the Talking.gif expression active while audio is running.
(function installFaithPlaybackWatcher() {
  if (window.__faithPlaybackWatcher) return;
  window.__faithPlaybackWatcher = true;
  window.setInterval(() => {
    // Actual playback is the source of truth. Some voice modules do not expose
    // a reliable enabled flag, so never gate the Talking expression on that flag.
    let speaking = false;
    try { speaking = !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (_) {}
    if (!speaking) {
      const audios = Array.from(document.querySelectorAll("audio, video"));
      speaking = audios.some(media => !media.paused && !media.ended && !media.muted && media.currentTime > 0);
    }
    if (speaking) {
      if (displayedExpressionName !== "talking" && pendingExpressionName !== "talking") setExpression("talking", "Speaking...");
    } else if (displayedExpressionName === "talking" && !pendingExpressionName) {
      // Restore the chat's expression after speech ends rather than leaving Talking stuck.
      const active = (typeof faithWorkspace !== "undefined" && faithWorkspace.threads)
        ? faithWorkspace.threads.find(thread => thread.id === faithWorkspace.activeId) : null;
      const restore = active && active.expression ? active.expression : "explanation";
      if (restore !== "talking") setExpression(restore, active && active.detail ? active.detail : "");
    }
  }, 200);
})();

// Dedicated expression handling for manual replay and the experimental
// user-message Voice Mode. The voice module emits these events around playback.
window.addEventListener("faith-voice-playback", (event) => {
  const detail = event && event.detail ? event.detail : {};
  if (detail.active) {
    window.__faithVoicePlaybackSource = detail.source || "faith";
    if (detail.source === "user") setExpression("voiceModeTalking", "Reading your message aloud...");
    else setExpression("talking", "Speaking...");
    return;
  }
  window.__faithVoicePlaybackSource = null;
  if (detail.source === "user" && window.faithVoiceModeActive) {
    setExpression("voiceMode", "Voice Mode is active");
  } else {
    const active = (typeof faithWorkspace !== "undefined" && faithWorkspace.threads)
      ? faithWorkspace.threads.find(thread => thread.id === faithWorkspace.activeId) : null;
    const restore = active && active.expression && active.expression !== "talking" ? active.expression : "explanation";
    setExpression(restore, active && active.detail ? active.detail : "");
  }
});

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

// Some local coding models occasionally omit Markdown fences and return source as
// ordinary text. Recover clearly code-like multiline runs before formatting so
// they use the same <pre><code> + Highlight.js pipeline as the editor.
function recoverUnfencedCodeRuns(source) {
  const lines = String(source ?? "").split("\n");
  const strongCodeLine = (line) => {
    const s = line.trim();
    if (!s) return false;
    return /^(?:#!|<\/?[A-Za-z][^>]*>|(?:export\s+)?(?:async\s+)?function\b|(?:export\s+)?class\s+|(?:const|let|var)\s+[\w$]+\s*=|(?:def|class|module)\s+\w+|(?:public|private|protected|static|void|int|string|bool|async|await)\b|import\s+|from\s+\S+\s+import\b|require\s*\(|using\s+|package\s+|#include\s+|@(?:app|route|Override|staticmethod)|if\s*\(|for\s*\(|while\s*\(|return\b|[{}\[\]];?$)/.test(s) ||
      /(?:=>|===?|!==?|&&|\|\||\+=|-=|::|->|\bconsole\.(?:log|error|warn)\s*\(|\bprint\s*\(|\bputs\s+|\bSELECT\s+.+\bFROM\b)/i.test(s) ||
      /[;{}]\s*$/.test(s);
  };
  const likelyCodeLine = (line) => {
    const s = line.trim();
    if (!s) return true;
    if (strongCodeLine(s)) return true;
    return /^(?:\/\/|#|\*|\*\/|--|\.\w+[\s:{.#]|[\w.$()[\]<>]+\s*(?:=|:|\(|\{|\.|\[)|end\b|else\b|catch\b|finally\b|\}\s*[,;]?$)/.test(s);
  };

  // If the entire response is clearly source code, fence it as one block.
  const nonblank = lines.filter(line => line.trim());
  const strongCount = nonblank.filter(strongCodeLine).length;
  const hasCodeSignals = nonblank.some(line => /[{};]|=>|\b(function|class|def|import|return|const|let|var|SELECT|<html|<script)\b/i.test(line));
  if (nonblank.length >= 3 && hasCodeSignals && strongCount / nonblank.length >= 0.45 &&
      nonblank.filter(line => /[.!?]$/.test(line.trim()) && !/[;{}]$/.test(line.trim())).length < nonblank.length * 0.45) {
    return "```\n" + source + "\n```";
  }

  // In mixed prose/code replies, wrap only contiguous code-like runs. Keep
  // blank lines within a run, but don't turn ordinary prose paragraphs into code.
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!strongCodeLine(lines[i])) { out.push(lines[i++]); continue; }
    const start = i;
    let end = i + 1;
    let strong = 1;
    while (end < lines.length) {
      if (likelyCodeLine(lines[end])) {
        if (lines[end].trim() && strongCodeLine(lines[end])) strong++;
        end++;
      } else break;
    }
    const run = lines.slice(start, end);
    const runNonblank = run.filter(line => line.trim()).length;
    if (runNonblank >= 3 && strong / runNonblank >= 0.5) {
      out.push("```", ...run, "```");
      i = end;
    } else {
      out.push(lines[i++]);
    }
  }
  return out.join("\n");
}

function recoverUnfencedCodeRunsOutsideFences(source) {
  const lines = String(source ?? "").split("\n");
  const output = [];
  let prose = [];
  let fenceChar = null;
  let fenceLength = 0;
  let inHtmlCode = false;

  const flushProse = () => {
    if (prose.length) output.push(recoverUnfencedCodeRuns(prose.join("\n")));
    prose = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (!inHtmlCode && fence) {
      if (fenceChar === null) {
        flushProse();
        fenceChar = fence[1][0];
        fenceLength = fence[1].length;
      } else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength &&
                 new RegExp("^" + fenceChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "{" + fenceLength + ",}\\s*$").test(trimmed)) {
        fenceChar = null;
        fenceLength = 0;
      }
      output.push(line);
      continue;
    }

    if (fenceChar !== null) {
      output.push(line);
      continue;
    }

    if (/^<pre\b[^>]*>\s*<code\b/i.test(trimmed) || /^<code\b/i.test(trimmed)) {
      flushProse();
      inHtmlCode = true;
      output.push(line);
      if (/<\/code>\s*(?:<\/pre>)?\s*$/i.test(trimmed)) inHtmlCode = false;
      continue;
    }
    if (inHtmlCode) {
      output.push(line);
      if (/<\/code>\s*(?:<\/pre>)?\s*$/i.test(trimmed)) inHtmlCode = false;
      continue;
    }
    prose.push(line);
  }
  flushProse();
  return output.join("\n");
}

function formatFaithMessage(text) {
  let source = stripImageMarkdown(String(text ?? ""))
    .replace(/\r\n?/g, "\n")
    .trim();

  // Recover code-like runs even when the same answer already contains a fenced
  // block. Previously, the presence of any ``` disabled recovery for the whole
  // message, leaving additional unfenced source snippets as ordinary prose.
  if (source) source = recoverUnfencedCodeRunsOutsideFences(source);

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
  faithWorkspace.threads.forEach(t => {
    if (!Number.isFinite(Number(t.createdAt))) t.createdAt = Number(t.updatedAt) || Date.now();
    // Video Studio is a tab-local expression, never a conversation mode. Clean
    // up values saved by earlier builds so a reload cannot leak it into chat.
    if (t.expression === "videoStudio" || t.expression === "videoMode") {
      t.expression = "explanation";
      t.detail = "";
      if (t.mode === "video" || t.mode === "videoMode" || t.behaviorState === "video" || t.behaviorState === "videoMode") {
        t.mode = "chat";
        t.behaviorState = "idle";
      }
    }
  });
  window.__faithStudioExpressionActive = false;
  window.__faithStudioSystemConversation = null;
  faithWorkspaceReady = true;
}
function faithPersistThreadState(thread) {
  if (!thread || !faithWorkspaceReady) return;
  thread.voiceModeActive = !!window.faithVoiceModeActive && thread.id === faithWorkspace.activeId
    ? true : !!thread.voiceModeActive;
  try {
    localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(faithWorkspace));
  } catch (_) {
    // Fall back to the normal size-tolerant workspace save if image data makes
    // the lightweight state write exceed the browser's storage quota.
    try { faithSaveWorkspace(); } catch (_) {}
  }
}
window.addEventListener("pagehide", () => {
  const activeVoiceThread = faithWorkspace && Array.isArray(faithWorkspace.threads)
    ? faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId) : null;
  if (activeVoiceThread) {
    activeVoiceThread.voiceModeActive = !!window.faithVoiceModeActive;
    try { localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(faithWorkspace)); }
    catch (_) { /* Existing workspace save handles storage limits during normal use. */ }
  }
});
function faithSaveWorkspace() {
  const thread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (thread && chat) {
    thread.html = chat.innerHTML;
    thread.updatedAt = Date.now();
    const firstUser = chat.querySelector(".message.you .message-text");
    const title = firstUser ? firstUser.textContent.trim().replace(/\s+/g, " ") : "";
    if (title) thread.title = title.slice(0, 42) + (title.length > 42 ? "…" : "");
    thread.voiceModeActive = !!window.faithVoiceModeActive;
    thread.mode = sessionMode || "idle";
    thread.behaviorState = sessionMode || "idle";
    if (displayedExpressionName || pendingExpressionName) {
      const expressionToSave = pendingExpressionName || displayedExpressionName;
      // Never serialize the Studio tab's private expression into a chat thread.
      if (expressionToSave !== "videoStudio" && expressionToSave !== "videoMode") thread.expression = expressionToSave;
    }
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

let faithHazardPromptShown = false;
function faithOpenStorageLimitConversation(bytes) {
  const title = "Storage limit";
  let thread = faithWorkspace.threads.find(item => item.storageLimitConversation === true || item.title === title);
  const used = faithFormatBytes(bytes);
  const reply = `⚠️ **Gallery storage limit reached**\n\nFaith's generated-image folder is using **${used}**, which has reached the **100 MB warning threshold**.\n\nHere are your options:\n- **Clear gallery images now:** removes non-favorite generated images and preserves favorites.\n- **Keep everything for now:** leaves the gallery unchanged, and this warning will appear again the next time the page is refreshed while storage remains at or above 100 MB.\n- **Protect important images:** mark images as favorites before clearing; favorites are preserved.\n\nYou can manage images from the Gallery panel. I'll keep this notice in the dedicated **Storage limit** conversation so it doesn't interrupt your other chats.`;
  if (!thread) {
    thread = { id: "storage-limit", title, html: "", updatedAt: Date.now(), mode: "idle", behaviorState: "idle", expression: "hazard", detail: "Gallery storage limit reached", storageLimitConversation: true };
    faithWorkspace.threads.unshift(thread);
  }
  thread.title = title;
  thread.storageLimitConversation = true;
  thread.expression = "hazard";
  thread.detail = `Gallery storage warning · ${used}`;
  // Refresh the single notice instead of adding duplicate first posts every reload.
  const holder = document.createElement("div");
  holder.innerHTML = thread.html || "";
  let post = holder.querySelector(".message.ai.storage-limit-notice");
  if (!post) {
    post = document.createElement("div");
    post.className = "message ai storage-limit-notice";
    const speaker = document.createElement("span"); speaker.className = "speaker"; speaker.textContent = "Faith";
    const body = document.createElement("div"); body.className = "message-text";
    post.append(speaker, body); holder.appendChild(post);
  }
  const body = post.querySelector(".message-text");
  if (body) {
    body.innerHTML = formatFaithMessage(reply);
    // Restore the actionable control in the dedicated storage-limit notice.
    // It is part of the saved conversation HTML, so it survives reloads.
    let clearButton = body.querySelector(".faith-storage-clear-gallery");
    if (!clearButton) {
      clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "faith-storage-clear-gallery";
      clearButton.textContent = "Clear gallery images now (keep favorites)";
      body.appendChild(clearButton);
    }
    faithStyleStorageLimitClearButton(clearButton);
  }
  thread.html = holder.innerHTML;
  thread.updatedAt = Date.now();
  faithWorkspace.activeId = thread.id;
  window.faithVoiceModeActive = !!thread.voiceModeActive;
  if (typeof chat !== "undefined" && chat) {
    chat.innerHTML = thread.html;
    faithBindReplayButtons(chat);
    faithBindStorageLimitClearButton(chat);
    sessionMode = "idle";
    setExpression("hazard", thread.detail);
  }
  faithSaveWorkspace();
  faithRenderSidebar();
}
function faithStyleStorageLimitClearButton(button) {
  if (!button) return;
  button.textContent = "Clear gallery images";
  button.style.cssText = "display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:2!important;margin:14px 0 4px!important;padding:10px 15px!important;border:1px solid #7f1d1d!important;border-radius:8px!important;background:#450a0a!important;color:#ffffff!important;font-weight:700!important;font-size:14px!important;line-height:1.35!important;cursor:pointer!important;box-shadow:0 2px 7px rgba(0,0,0,.28)!important;";
}
function faithBindStorageLimitClearButton(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(".faith-storage-clear-gallery").forEach(button => {
    faithStyleStorageLimitClearButton(button);
    button.type = "button";
    // Bind directly to the current DOM node. Saved conversation HTML does not
    // retain event listeners or dataset flags, so never trust a stale bound flag.
    if (button._faithClearGalleryHandler) button.removeEventListener("click", button._faithClearGalleryHandler);
    button._faithClearGalleryHandler = faithClearStorageGalleryFromNotice;
    button.addEventListener("click", button._faithClearGalleryHandler);
  });
}
// Upgrade saved Storage limit conversations created by older versions.
// This runs on every startup, even when gallery storage is now below the
// warning threshold, so users never have to wait for the limit to recur.
function faithRetrofitStorageLimitButtons() {
  if (!faithWorkspace || !Array.isArray(faithWorkspace.threads)) return;
  let changed = false;
  for (const thread of faithWorkspace.threads) {
    const isStorageThread = thread.storageLimitConversation === true ||
      String(thread.title || "").trim().toLowerCase() === "storage limit" ||
      String(thread.html || "").toLowerCase().includes("gallery storage limit reached");
    if (!isStorageThread) continue;
    thread.storageLimitConversation = true;
    const holder = document.createElement("div");
    holder.innerHTML = thread.html || "";
    let post = holder.querySelector(".message.ai.storage-limit-notice");
    if (!post) {
      post = Array.from(holder.querySelectorAll(".message.ai")).find(message =>
        /gallery storage limit reached|100\s*mb warning threshold/i.test(message.textContent || ""));
      if (post) post.classList.add("storage-limit-notice");
    }
    if (!post) post = Array.from(holder.querySelectorAll(".message.ai")).slice(-1)[0];
    if (!post) continue;
    post.classList.add("storage-limit-notice");
    let body = post.querySelector(".message-text");
    if (!body) {
      body = document.createElement("div");
      body.className = "message-text";
      post.appendChild(body);
    }
    let button = body.querySelector(".faith-storage-clear-gallery");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "faith-storage-clear-gallery";
      button.textContent = "Clear gallery images now (keep favorites)";
      body.appendChild(button);
      changed = true;
    }
    faithStyleStorageLimitClearButton(button);
    if (thread.html !== holder.innerHTML) { thread.html = holder.innerHTML; changed = true; }
  }
  if (changed) {
    try { localStorage.setItem(FAITH_WORKSPACE_KEY, JSON.stringify(faithWorkspace)); }
    catch (_) { try { faithSaveWorkspace(); } catch (_) {} }
  }
}

async function faithClearStorageGalleryFromNotice(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  if (window.faithStorageClearInProgress) return;
  window.faithStorageClearInProgress = true;
  // Use the exact same established action as the working Gallery panel button.
  // Keeping a second implementation here caused the Storage limit control to
  // drift from the real gallery deletion flow.
  if (typeof faithDeleteAllGalleryImages === "function") {
    Promise.resolve(faithDeleteAllGalleryImages()).finally(() => { window.faithStorageClearInProgress = false; });
    return;
  }
  window.faithStorageClearInProgress = false;
  alert("The gallery deletion action is unavailable. Please use the Gallery panel's delete-all button.");
}

function faithCheckGalleryHazard(bytes) {
  const threshold = 100 * 1024 * 1024;
  if (Number(bytes) < threshold || faithHazardPromptShown) return;
  faithHazardPromptShown = true;
  faithOpenStorageLimitConversation(bytes);
  setExpression("hazard", "Gallery storage warning");
  const used = faithFormatBytes(bytes);
  const clearNow = confirm(`HAZARD: Faith's generated-image folder has reached ${used} (100 MB warning threshold).\n\nPress OK to clear non-favorite gallery images now. Favorite images will be preserved. Press Cancel to keep the gallery unchanged. The Storage limit conversation contains the options.`);
  if (clearNow) {
    fetch("/api/gallery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) })
      .then(async response => {
        if (!response.ok) { let body = {}; try { body = await response.json(); } catch (_) {} throw new Error(body.error || "Gallery cleanup failed."); }
        faithWorkspace.gallery = faithWorkspace.gallery.filter(item => item.favorite);
        faithWorkspace.threads.forEach(thread => {
          const holder = document.createElement("div"); holder.innerHTML = thread.html || "";
          holder.querySelectorAll(".message").forEach(message => {
            if (Array.from(message.querySelectorAll("img, a[href]")).some(node => String(node.getAttribute("src") || node.getAttribute("href") || "").includes("/faith-gallery-files/"))) message.remove();
          });
          thread.html = holder.innerHTML;
        });
        faithSaveWorkspace(); faithRenderSidebar(); faithLoadServerGallery();
        setExpression("hazard", "Gallery cleanup complete; favorites preserved");
      }).catch(error => alert(`Faith could not clear the gallery: ${error.message}`));
  } else {
    setExpression("hazard", "Storage limit warning remains in its conversation");
  }
}

async function faithLoadServerGallery() {
  try {
    const response = await fetch("/api/gallery", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!Array.isArray(payload.images)) return;
    const merged = new Map();
    faithGalleryStorageStats = { count: Number(payload.count) || payload.images.length, bytes: Number(payload.bytes) || 0 };
    faithCheckGalleryHazard(faithGalleryStorageStats.bytes);
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
    let body = (textNode ? (textNode.innerText || textNode.textContent) : "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const content = "\uFEFF" + lines.join("\r\n").trimEnd() + "\r\n";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeTitle = String(thread.title || "faith-chat").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "faith-chat";
  link.href = url; link.download = `${safeTitle}-archive.txt`; link.style.display = "none";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function faithShowChatInfo(thread) {
  if (!thread) return;
  document.querySelectorAll('.faith-chat-info-overlay').forEach(n => n.remove());
  const holder = document.createElement('div');
  holder.className = 'faith-chat-info-overlay';
  holder.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:14px;';
  const panel = document.createElement('section');
  panel.style.cssText = 'width:min(560px,100%);max-height:88vh;overflow:auto;background:#151b28;color:#edf3ff;border:1px solid rgba(140,170,230,.35);border-radius:14px;padding:18px;box-shadow:0 18px 55px rgba(0,0,0,.55);';
  const title = document.createElement('h2'); title.textContent = 'Chat info'; title.style.cssText='margin:0 0 12px;font-size:1.15rem;'; panel.appendChild(title);
  const temp = document.createElement('div'); temp.innerHTML = String(thread.html || '');
  const messages = Array.from(temp.querySelectorAll('.message'));
  const words = messages.reduce((sum,m) => { const node=m.querySelector('.message-text'); const t=node?(node.innerText||node.textContent):m.textContent; return sum + ((String(t||'').trim().match(/\S+/g)||[]).length); },0);
  const images = messages.reduce((sum,m)=>sum+m.querySelectorAll('img').length,0);
  const created = new Date(Number(thread.createdAt) || Number(thread.updatedAt) || Date.now());
  const rows = [
    ['Chat', thread.title || 'New conversation'], ['Messages', String(messages.length)], ['Words', String(words)], ['Images exchanged', String(images)],
    ['Created', Number.isNaN(created.getTime()) ? 'Unknown' : created.toLocaleString()], ['Voice mode', thread.voiceModeActive ? 'Enabled' : 'Disabled'],
    ['Saved behavior', thread.behaviorState || thread.mode || 'idle'], ['Saved expression', thread.expression || 'ruby'], ['Last updated', Number(thread.updatedAt) ? new Date(Number(thread.updatedAt)).toLocaleString() : 'Unknown']
  ];
  const table=document.createElement('div'); table.style.cssText='display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.2fr);gap:8px 12px;font-size:.9rem;';
  rows.forEach(([k,v])=>{const a=document.createElement('div');a.textContent=k;a.style.cssText='color:#aab9d4;';const b=document.createElement('div');b.textContent=v;b.style.cssText='overflow-wrap:anywhere;';table.append(a,b);}); panel.appendChild(table);
  const controls=document.createElement('div'); controls.style.cssText='margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);';
  const hint=document.createElement('p'); hint.textContent='Restore the behavior and expression for this chat if they were saved incorrectly.'; hint.style.cssText='font-size:.82rem;color:#aab9d4;margin:0 0 10px;';controls.appendChild(hint);
  const behaviorLabel=document.createElement('label');behaviorLabel.textContent='Behavior / session';behaviorLabel.style.cssText='display:block;margin:8px 0 4px;font-size:.85rem;';controls.appendChild(behaviorLabel);
  const behavior=document.createElement('select');behavior.style.cssText='width:100%;padding:9px;border-radius:7px;background:#0d1320;color:#fff;border:1px solid #44516b;';
  [['idle','Normal chat'],['coding','Coding'],['build','Build'],['troubleshooting','Troubleshooting']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;behavior.appendChild(o);});behavior.value=['idle','coding','build','troubleshooting'].includes(thread.behaviorState||thread.mode)?(thread.behaviorState||thread.mode):'idle';controls.appendChild(behavior);
  const expressionLabel=document.createElement('label');expressionLabel.textContent='Expression';expressionLabel.style.cssText='display:block;margin:10px 0 4px;font-size:.85rem;';controls.appendChild(expressionLabel);
  const expression=document.createElement('select');expression.style.cssText=behavior.style.cssText;
  Object.keys(expressionNames).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=expressionNames[v];expression.appendChild(o);});expression.value=expressionImages[thread.expression]?thread.expression:'ruby';controls.appendChild(expression);
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px;';
  const close=document.createElement('button');close.type='button';close.textContent='Close';
  const apply=document.createElement('button');apply.type='button';apply.textContent='Save chat state';apply.style.cssText='background:#6336a6;color:#fff;border:0;border-radius:7px;padding:9px 12px;';
  close.style.cssText='background:#252e40;color:#fff;border:1px solid #46516a;border-radius:7px;padding:9px 12px;';
  close.onclick=()=>holder.remove(); apply.onclick=()=>{thread.behaviorState=behavior.value;thread.mode=behavior.value;thread.expression=expression.value;thread.detail=expressionDetails[expression.value]||'';thread.updatedAt=Date.now();if(thread.id===faithWorkspace.activeId){sessionMode=behavior.value;window.faithVoiceModeActive=!!thread.voiceModeActive;setExpression(expression.value,thread.detail);faithSaveWorkspace();}else{try{localStorage.setItem(FAITH_WORKSPACE_KEY,JSON.stringify(faithWorkspace));}catch(_){faithSaveWorkspace();}faithRenderSidebar();}holder.remove();};
  actions.append(close,apply);controls.appendChild(actions);panel.appendChild(controls);holder.appendChild(panel);holder.addEventListener('click',e=>{if(e.target===holder)holder.remove();});document.addEventListener('keydown',function esc(e){if(e.key==='Escape'&&holder.isConnected){holder.remove();document.removeEventListener('keydown',esc);}});document.body.appendChild(holder);
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
          { label: "View chat info", action: () => faithShowChatInfo(thread) },
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
            { label: "Copy prompt", action: () => faithCopyGalleryPrompt(entry) },
            { label: entry.favorite ? "Remove favorite" : "Favorite image ★", action: () => faithSetGalleryFavorite(entry.id, !entry.favorite) },
            { label: "Delete image", danger: true, action: () => { if (confirm(`Permanently delete “${entry.title || "this image"}” from gallery storage and remove its chat message?`)) faithDeleteGalleryImage(entry.id); } }
          ]);
        });
        card.title = "Right-click for image options; tap the star to favorite";
      } else {
        const missing = document.createElement("div"); missing.className = "faith-gallery-missing"; missing.textContent = "Image preview unavailable after storage limit"; card.appendChild(missing);
        card.addEventListener("contextmenu", (event) => { event.preventDefault(); faithShowContextMenu(event.clientX, event.clientY, [
          { label: "Copy prompt", action: () => faithCopyGalleryPrompt(entry) },
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
  window.faithVoiceModeActive = !!next.voiceModeActive;
  chat.innerHTML = next.html || "";
  faithBindReplayButtons(chat);
  faithBindStorageLimitClearButton(chat);
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
    faithBindStorageLimitClearButton(chat);
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
async function faithCopyGalleryPrompt(entry) {
  // The gallery sidecar stores the original image-generation prompt separately
  // from the generated image's randomized storage filename.
  const prompt = String(entry && (entry.prompt || entry.paintPrompt || entry.title) || "").trim();
  if (!prompt) {
    alert("No saved prompt is available for this image.");
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const area = document.createElement("textarea");
      area.value = prompt;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (!copied) throw new Error("Clipboard access is unavailable in this browser.");
    }
    // Brief unobtrusive confirmation; the prompt itself stays untouched.
    const notice = document.createElement("div");
    notice.className = "faith-gallery-copy-notice";
    notice.textContent = "Prompt copied to clipboard";
    notice.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:100000;padding:10px 14px;border:1px solid #6f5bb5;border-radius:10px;background:#201a32;color:#fff;box-shadow:0 6px 24px #0005";
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 1800);
  } catch (error) {
    alert(`Could not copy prompt: ${error && error.message ? error.message : error}`);
  }
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
  const entry = faithWorkspace.gallery.find(item => String(item.id) === String(id) || String(item.filename || "") === String(id) || String(item.url || "").split(/[?#]/, 1)[0].split("/").pop() === String(id));
  if (!entry) { alert("This gallery item is stale. Refresh the gallery and try deleting it again."); await faithLoadServerGallery(); return; }
  const deleteId = entry.id || entry.filename || String(entry.url || "").split(/[?#]/, 1)[0].split("/").pop();
  const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: deleteId, filename: entry.filename, url: entry.url }) }).catch(() => null);
  if (!response || !response.ok) {
    let reason = "The image could not be removed from gallery storage, so it has not been removed from the chat.";
    try { const body = await response.json(); if (body && body.error) reason = body.error; } catch (_) {}
    alert(reason); return;
  }
  faithRemoveDeletedImageFromChats(entry);
  faithWorkspace.gallery = faithWorkspace.gallery.filter(item => item.id !== id);
  faithLoadServerGallery(); faithSaveWorkspace();
}
async function faithDeleteAllGalleryImages() {
  if (!confirm("Permanently delete ALL image files from Faith's gallery folder and remove their chat messages? This cannot be undone.")) return;
  const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", all: true }) }).catch(() => null);
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
  if (active && chat) { chat.innerHTML = active.html || ""; faithBindReplayButtons(chat); faithBindStorageLimitClearButton(chat); }
  // Keep favorites in the local cache too; otherwise the gallery loader's
  // offline-migration fallback could resurrect deleted non-favorite images.
  faithWorkspace.gallery = faithWorkspace.gallery.filter(item => item.favorite);
  faithSaveWorkspace(); faithRenderSidebar(); faithLoadServerGallery();
}
function faithNewThread() {
  faithSaveWorkspace();
  const thread = { id: "thread-" + Date.now().toString(36), title: "New conversation", html: "", createdAt: Date.now(), updatedAt: Date.now(), mode: "idle", behaviorState: "idle", expression: "ruby", detail: "Ready" };
  faithWorkspace.threads.unshift(thread);
  faithWorkspace.activeId = thread.id;
  window.faithVoiceModeActive = false;
  chat.innerHTML = "";
  sessionMode = "idle";
  setExpression("ruby", "Ready");
  faithSaveWorkspace();
}
function faithInitSidebar() {
  faithRenameExistingAutoReadLabel();
  faithLoadWorkspace();
  faithRetrofitStorageLimitButtons();
  const active = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
  if (active) {
    window.faithVoiceModeActive = !!active.voiceModeActive;
    if (active.html) chat.innerHTML = active.html;
    faithBindReplayButtons(chat);
    faithBindStorageLimitClearButton(chat);
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
  async function faithLoadVideoLibrary() {
    const list = document.getElementById("faith-videos-list");
    const storage = document.getElementById("faith-videos-storage");
    if (!list) return;
    try {
      const response = await fetch("/api/videos", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load saved videos");
      const payload = await response.json();
      const videos = Array.isArray(payload.videos) ? payload.videos : [];
      list.innerHTML = "";
      if (storage) storage.textContent = `${videos.length} completed video${videos.length === 1 ? "" : "s"} · ${faithFormatBytes(Number(payload.bytes) || 0)} in videos folder`;
      if (!videos.length) { list.innerHTML = '<div class="faith-gallery-missing">Completed MP4 exports will appear here.</div>'; return; }
      videos.forEach(entry => {
        const card = document.createElement("div"); card.className = "faith-video-card";
        const video = document.createElement("video");
        video.src = entry.url; video.preload = "metadata"; video.playsInline = true; video.muted = true;
        video.controls = false; video.tabIndex = -1; video.setAttribute("aria-label", entry.title || entry.filename || "Completed video preview");
        // Match the image Gallery: previews are passive and actions appear
        // only in the card's right-click context menu.
        card.appendChild(video);
        const title = document.createElement("div"); title.className = "faith-video-title"; title.textContent = entry.title || entry.filename || "Completed video"; card.appendChild(title);
        // Store the source entry on the card. A delegated listener on the list
        // handles contextmenu events, including events originating on native
        // video surfaces or nested title elements.
        card.__faithVideoEntry = entry;
        card.tabIndex = 0;
        card.title = "Right-click for video options";
        card.querySelectorAll(".faith-video-actions").forEach(node => node.remove());
        list.appendChild(card);
      });
    } catch (error) { if (storage) storage.textContent = `Video folder unavailable: ${error.message}`; }
  }
  // Install once on the persistent list rather than on regenerated cards.
  // This avoids event loss when the library is refreshed and works when the
  // right-click begins on the video element itself.
  const faithVideoListForMenu = document.getElementById("faith-videos-list");
  if (faithVideoListForMenu && !faithVideoListForMenu.dataset.contextMenuReady) {
    faithVideoListForMenu.dataset.contextMenuReady = "1";
    faithVideoListForMenu.addEventListener("contextmenu", event => {
      const card = event.target && event.target.closest ? event.target.closest(".faith-video-card") : null;
      const entry = card && card.__faithVideoEntry;
      if (!entry) return;
      event.preventDefault();
      event.stopPropagation();
      faithShowContextMenu(event.clientX, event.clientY, [
        { label: "View", action: () => faithOpenVideoEntry(entry) },
        { label: "Download", action: () => {
          const a = document.createElement("a"); a.href = entry.url;
          a.download = entry.filename || "faith-video.mp4"; a.rel = "noopener";
          document.body.appendChild(a); a.click(); a.remove();
        } },
        { label: "Delete", danger: true, action: async () => {
          if (!confirm(`Permanently delete “${entry.title || entry.filename || "this video"}” from the videos folder?`)) return;
          try {
            const r = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json", "X-Faith-Video-Action": "delete" }, body: JSON.stringify({ action: "delete", id: entry.id || entry.filename }) });
            const result = await r.json().catch(() => ({}));
            if (!r.ok || !result.ok) throw new Error(result.error || `Server returned ${r.status}`);
            await faithLoadVideoLibrary();
          } catch (error) { alert(`Could not delete video: ${error.message}`); }
        } }
      ]);
    }, true);
  }
  function faithOpenVideoEntry(entry) {
    const url = String(entry && entry.url || "");
    if (!url) { alert("This video has no playable file URL."); return; }
    // Open directly from the menu click so browsers do not treat it as a
    // delayed popup. Keep a normal link fallback if window.open is blocked.
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "Open video"; a.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:100000;background:#151b28;color:#fff;padding:10px;border-radius:8px";
      a.addEventListener("click", () => a.remove(), { once: true });
      document.body.appendChild(a);
    }
  }
  window.faithLoadVideoLibrary = faithLoadVideoLibrary;
  const deleteAllCompletedVideos = document.getElementById("faith-delete-all-completed-videos");
  if (deleteAllCompletedVideos) deleteAllCompletedVideos.addEventListener("click", async () => {
    if (!confirm("Delete all completed videos from the videos folder? This will not delete workspaces or gallery images.")) return;
    try { const response = await fetch("/api/videos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); if (!response.ok) throw new Error("Server rejected deletion"); await faithLoadVideoLibrary(); }
    catch (error) { alert(`Could not delete completed videos: ${error.message}`); }
  });

  const tabChat = document.getElementById("faith-sidebar-chats");
  const tabGallery = document.getElementById("faith-sidebar-gallery");
  const tabFiles = document.getElementById("faith-sidebar-files");
  const tabStudio = document.getElementById("faith-sidebar-studio");
  const chatsPanel = document.getElementById("faith-chats-panel");
  const galleryPanel = document.getElementById("faith-gallery-panel");
  const filesPanel = document.getElementById("faith-files-panel");
  const studioPanel = document.getElementById("faith-studio-panel");

  // Small, self-contained language marks inspired by each language's familiar logo.
  // Keep these inline (no external icon font/CDN) so the Files tab works offline.
  const faithCodeIcon = (filename) => {
    const ext = (String(filename).split(".").pop() || "file").toLowerCase();
    const logos = {
      html: ['#e34f26', '<path fill="#e34f26" d="M5 2h22l-2 25-9 3-9-3z"/><path fill="#fff" d="M10 8h13l-.3 3H13l.2 3h9.2l-.8 8-5.6 2-5.6-2-.4-4h3l.2 2 2.8.8 2.8-.8.3-3H9.7z"/>'],
      htm: ['#e34f26', '<path fill="#e34f26" d="M5 2h22l-2 25-9 3-9-3z"/><path fill="#fff" d="M10 8h13l-.3 3H13l.2 3h9.2l-.8 8-5.6 2-5.6-2-.4-4h3l.2 2 2.8.8 2.8-.8.3-3H9.7z"/>'],
      css: ['#1572b6', '<path fill="#1572b6" d="M5 2h22l-2 25-9 3-9-3z"/><path fill="#fff" d="M10 8h13l-.3 3H13l.2 3h9.2l-.8 8-5.6 2-5.6-2-.4-4h3l.2 2 2.8.8 2.8-.8.3-3H9.7z"/>'],
      js: ['#f7df1e', '<rect x="2" y="2" width="28" height="28" rx="2" fill="#f7df1e"/><path fill="#222" d="M15 24.5c.6 1 1.3 1.6 2.5 1.6 1 0 1.6-.5 1.6-1.2 0-.8-.6-1.1-1.8-1.7l-.7-.3c-2- .9-3.3-2-3.3-4.3 0-2.1 1.6-3.7 4.1-3.7 1.8 0 3.1.6 4 2.3l-2.2 1.4c-.5-.9-1-1.2-1.8-1.2-.7 0-1.2.5-1.2 1.1 0 .8.5 1.1 1.6 1.6l.7.3c2.4 1 3.7 2.1 3.7 4.4 0 2.5-2 3.9-4.6 3.9-2.6 0-4.2-1.2-5-2.9zM6 24.7l2.3-1.4c.4.8.8 1.5 1.7 1.5.8 0 1.3-.3 1.3-1.6v-8h2.8v8c0 2.9-1.7 4.2-4 4.2-2.1 0-3.4-1.1-4.1-2.7z"/>'],
      mjs: ['#f7df1e', '<rect x="2" y="2" width="28" height="28" rx="2" fill="#f7df1e"/><text x="16" y="21" font-size="12" font-weight="800" text-anchor="middle" fill="#222">JS</text>'],
      cjs: ['#f7df1e', '<rect x="2" y="2" width="28" height="28" rx="2" fill="#f7df1e"/><text x="16" y="21" font-size="12" font-weight="800" text-anchor="middle" fill="#222">JS</text>'],
      ts: ['#3178c6', '<path fill="#3178c6" d="M2 2h28v28H2z"/><path fill="#fff" d="M7 14h10v3h-3.5v9h-3v-9H7zm11 8.7 2.6-1.5c.6 1 1.3 1.5 2.4 1.5.9 0 1.5-.4 1.5-1 0-.8-.7-1.1-1.9-1.7l-.7-.3c-2- .9-3.3-1.9-3.3-4.1 0-2 1.6-3.5 4-3.5 1.7 0 3 .6 3.9 2.2l-2.5 1.6c-.5-.9-.9-1.2-1.7-1.2-.7 0-1.1.4-1.1 1 0 .7.4 1 1.5 1.5l.7.3c2.4 1 3.7 2.1 3.7 4.3 0 2.5-2 3.8-4.7 3.8-2.6 0-4.3-1.2-5.1-2.9z"/>'],
      tsx: ['#3178c6', '<path fill="#3178c6" d="M2 2h28v28H2z"/><text x="16" y="20" font-size="11" font-weight="800" text-anchor="middle" fill="#fff">TSX</text>'],
      jsx: ['#61dafb', '<circle cx="16" cy="16" r="2.5" fill="#61dafb"/><g fill="none" stroke="#61dafb" stroke-width="1.8"><ellipse cx="16" cy="16" rx="13" ry="5.5"/><ellipse cx="16" cy="16" rx="13" ry="5.5" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="13" ry="5.5" transform="rotate(120 16 16)"/></g>'],
      py: ['#3776ab', '<path fill="#3776ab" d="M16 2c-7 0-7 3-7 6v4h8v2H6c-4 0-5 4-5 8s2 7 6 7h4v-5c0-4 3-6 7-6h7c3 0 5-2 5-5V8c0-4-4-6-14-6z"/><path fill="#ffd343" d="M16 30c7 0 7-3 7-6v-4h-8v-2h11c4 0 5-4 5-8s-2-7-6-7h-4v5c0 4-3 6-7 6H7c-3 0-5 2-5 5v5c0 4 4 6 14 6z"/><circle cx="12" cy="7" r="1.4" fill="#fff"/><circle cx="20" cy="25" r="1.4" fill="#fff"/>'],
      rb: ['#cc342d', '<path fill="#cc342d" d="M16 2 28 9v14l-12 7L4 23V9z"/><text x="16" y="21" font-size="13" font-weight="800" text-anchor="middle" fill="#fff">Rb</text>'],
      php: ['#777bb4', '<ellipse cx="16" cy="16" rx="14" ry="9" fill="#777bb4"/><text x="16" y="20" font-size="10" font-weight="800" text-anchor="middle" fill="#fff">php</text>'],
      java: ['#f89820', '<path fill="#f89820" d="M12 3c-4 4 6 4 1 9 8-4 1-6-1-9zm7 1c-5 5 6 6-2 11 11-5 1-8 2-11z"/><path fill="#5382a1" d="M5 18c5 2 17 2 22 0v3c-5 4-17 4-22 0zm3 6c4 2 12 2 16 0l-2 4H10z"/>'],
      go: ['#00add8', '<path fill="#00add8" d="M4 10h11l-2 3H3zm-2 5h12l-2 3H1zm4 5h8l-2 3H4z"/><text x="18" y="21" font-size="12" font-weight="800" fill="#00add8">Go</text>'],
      rs: ['#dea584', '<path fill="#dea584" d="M16 2 28 9v14l-12 7L4 23V9z"/><text x="16" y="21" font-size="12" font-weight="800" text-anchor="middle" fill="#20242b">R</text>'],
      kt: ['#7f52ff', '<path fill="#7f52ff" d="M3 3h12L3 16V3zm0 15 13-13v24H3zm15-15h11L18 15z"/><path fill="#e44857" d="M18 17 29 29H18z"/>'],
      swift: ['#f05138', '<path fill="#f05138" d="M3 7c6 5 10 7 15 8-4-3-7-6-9-9 6 5 12 8 18 9-2-4-5-7-8-10 8 5 12 11 10 17-2 6-10 8-17 4 5 1 9 0 11-3C15 24 7 18 3 7z"/>'],
      cs: ['#68217a', '<path fill="#68217a" d="M16 2 28 9v14l-12 7L4 23V9z"/><text x="16" y="21" font-size="11" font-weight="800" text-anchor="middle" fill="#fff">C#</text>'],
      cpp: ['#00599c', '<path fill="#00599c" d="M16 2 28 9v14l-12 7L4 23V9z"/><text x="16" y="21" font-size="10" font-weight="800" text-anchor="middle" fill="#fff">C++</text>'],
      c: ['#555', '<path fill="#555" d="M16 2 28 9v14l-12 7L4 23V9z"/><text x="16" y="21" font-size="14" font-weight="800" text-anchor="middle" fill="#fff">C</text>'],
      sql: ['#e38c00', '<ellipse cx="16" cy="7" rx="11" ry="4" fill="#f3b23d"/><path fill="#e38c00" d="M5 7v17c0 5 22 5 22 0V7c0 5-22 5-22 0z"/><path fill="none" stroke="#fff" stroke-width="1.5" d="M5 13c0 5 22 5 22 0M5 19c0 5 22 5 22 0"/>'],
      json: ['#e5c07b', '<path fill="#e5c07b" d="M7 4C2 4 5 12 2 16c3 4 0 12 5 12h3v-4H8c-2 0-1-6-3-8 2-2 1-8 3-8h2V4zm18 0c5 0 2 8 5 12-3 4 0 12-5 12h-3v-4h2c2 0 1-6 3-8-2-2-1-8-3-8h-2V4z"/><circle cx="16" cy="12" r="2" fill="#e5c07b"/><circle cx="16" cy="20" r="2" fill="#e5c07b"/>'],
      sh: ['#4eaa25', '<rect x="2" y="4" width="28" height="24" rx="3" fill="#252525"/><path d="m8 11 5 4-5 4m8 0h8" fill="none" stroke="#4eaa25" stroke-width="2.5"/>'],
      bat: ['#4eaa25', '<rect x="2" y="4" width="28" height="24" rx="3" fill="#252525"/><path d="m8 11 5 4-5 4m8 0h8" fill="none" stroke="#4eaa25" stroke-width="2.5"/>'],
      ps1: ['#2671be', '<path fill="#2671be" d="M3 4h26v24H3z"/><path d="m7 10 9 5-9 5m10 0h8" fill="none" stroke="#fff" stroke-width="2.3"/>'],
      md: ['#083fa6', '<rect x="2" y="5" width="28" height="22" rx="3" fill="#083fa6"/><path d="M6 21V11l5 6 5-6v10m3-10h5m-2-3 3 3-3 3" fill="none" stroke="#fff" stroke-width="2"/>'],
      svg: ['#ffb13b', '<path fill="#ffb13b" d="M16 2 30 16 16 30 2 16z"/><text x="16" y="20" font-size="9" font-weight="800" text-anchor="middle" fill="#292929">SVG</text>'],
      xml: ['#e37933', '<path fill="#e37933" d="m11 7-8 9 8 9 2-3-6-6 6-6zm10 0-2 3 6 6-6 6 2 3 8-9z"/><path fill="#e37933" d="m17 4 3 1-5 22-3-1z"/>'],
      default: ['#9aa9bf', '<path fill="#9aa9bf" d="M7 2h12l6 6v22H7z"/><path fill="#e9eef7" d="M19 2v7h6"/><path fill="none" stroke="#e9eef7" stroke-width="1.6" d="M11 16h10M11 20h10M11 24h7"/>']
    };
    const key = ({htm:'html', mjs:'js', cjs:'js', jsx:'jsx', tsx:'tsx', py:'py', rb:'rb', java:'java', cc:'cpp', hpp:'cpp', h:'c', cs:'cs', kt:'kt', kts:'kt', swift:'swift', sql:'sql', bash:'sh', cmd:'bat', ps1:'ps1', json:'json', xml:'xml', yml:'json', yaml:'json', md:'md', svg:'svg'})[ext] || (logos[ext] ? ext : 'default');
    const [color, artwork] = logos[key] || logos.default;
    const title = ext.toUpperCase().replace(/[^A-Z0-9.+#_-]/g, '').slice(0, 12) || 'FILE';
    return `<svg viewBox="0 0 32 32" role="img" aria-label="${title} language logo" style="color:${color}" xmlns="http://www.w3.org/2000/svg">${artwork}</svg>`;
  };
  const faithRefreshCodeFiles = async () => {
    const list = document.getElementById("faith-files-list");
    const stats = document.getElementById("faith-files-storage");
    if (!list) return;
    list.innerHTML = "";
    if (stats) stats.textContent = "Loading coding files…";
    try {
      const response = await fetch("/api/code-files", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load files");
      if (stats) stats.textContent = `${data.count || 0} files · ${faithFormatBytes(data.bytes || 0)} used`;
      (data.files || []).forEach(file => {
        const card = document.createElement("div"); card.className = "faith-file-card";
        card.draggable = true;
        card.title = "Drag into the current conversation to attach this code file; click to open; right-click for file actions";
        card.addEventListener("dragstart", event => {
          try {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/x-faith-code-file", JSON.stringify({ name: file.name, url: file.url, stored_name: file.stored_name }));
            event.dataTransfer.setData("text/plain", `faith-code-file:${file.stored_name}`);
          } catch (_) {}
          card.classList.add("faith-file-dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("faith-file-dragging"));
        const icon = document.createElement("div"); icon.className = "faith-file-icon"; icon.innerHTML = faithCodeIcon(file.name); icon.setAttribute("aria-hidden", "true");
        const meta = document.createElement("div"); meta.className = "faith-file-meta";
        const name = document.createElement("div"); name.className = "faith-file-name"; name.textContent = file.name;
        const sub = document.createElement("div"); sub.className = "faith-file-sub"; sub.textContent = `${faithFormatBytes(file.size)} · ${new Date(file.updated_at).toLocaleString()}`;
        meta.append(name, sub); card.append(icon, meta);
        card.addEventListener("click", () => window.open(file.url, "_blank", "noopener"));
        card.addEventListener("contextmenu", event => {
          event.preventDefault();
          const items = [
            { label: "Edit file", action: () => faithOpenCodeEditor(file) },
            { label: "View / open file", action: () => window.open(file.url, "_blank", "noopener") },
            { label: "Download file", action: () => { const a = document.createElement("a"); a.href = file.url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); } }
          ];
          if (/\.html?$/i.test(file.name)) items.splice(1, 0, { label: "Preview HTML", action: () => faithPreviewCodeHtml(file.url, file.name) });
          items.push({ label: "Rename file", action: async () => {
            const proposed = prompt("Enter a new name for this file (keep the correct file extension):", file.name);
            if (proposed === null) return;
            const newName = proposed.trim();
            if (!newName) { alert("The filename cannot be empty."); return; }
            if (/[\\/\\:*?"<>|]/.test(newName) || newName === "." || newName === "..") { alert("Please use a valid filename without path separators or reserved characters."); return; }
            if (newName.toLowerCase() === file.name.toLowerCase()) return;
            try {
              const r = await fetch("/api/code-files", { method:"POST", headers:{"Content-Type":"application/json", "Accept":"application/json"}, body:JSON.stringify({action:"rename", stored_name:file.stored_name, filename:newName}) });
              const raw = await r.text(); let result = {};
              try { result = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error(`Server returned a non-JSON response (HTTP ${r.status}).`); }
              if (!r.ok) throw new Error(result.error || `Rename failed (HTTP ${r.status})`);
              await faithRefreshCodeFiles();
            } catch (error) { alert(`Could not rename file: ${error.message}`); }
          }});
          items.push({ label: "Delete file", danger: true, action: async () => {
            if (!confirm(`Permanently delete ${file.name}?`)) return;
            try {
              const r = await fetch("/api/code-files", { method:"POST", headers:{"Content-Type":"application/json", "Accept":"application/json"}, body:JSON.stringify({action:"delete", stored_name:file.stored_name, filename:file.name}) });
              const responseText = await r.text();
              let result = {};
              try { result = responseText ? JSON.parse(responseText) : {}; }
              catch (_) { throw new Error(`Server returned a non-JSON response (HTTP ${r.status}). Restart Faith's Ruby server and try again.`); }
              if (!r.ok) throw new Error(result.error || `Delete failed (HTTP ${r.status})`);
              await faithRefreshCodeFiles();
            } catch (error) { alert(`Could not delete file: ${error.message}`); }
          }});
          faithShowContextMenu(event.clientX, event.clientY, items);
        });
        list.appendChild(card);
      });
      if (!(data.files || []).length) { const empty = document.createElement("div"); empty.className = "faith-file-sub"; empty.textContent = "No coding files yet. Fixed and built source files will appear here automatically."; list.appendChild(empty); }
    } catch (error) { if (stats) stats.textContent = `Could not load coding files: ${error.message}`; }
  };
  const faithOpenCodeEditor = async (file) => {
    const overlay = document.createElement("div");
    overlay.className = "faith-code-editor-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:100020;background:rgba(4,8,18,.86);display:flex;align-items:center;justify-content:center;padding:2vh 2vw;";
    const panel = document.createElement("section");
    panel.style.cssText = "width:min(1240px,98vw);height:96vh;display:flex;flex-direction:column;gap:10px;padding:16px;background:#101725;color:#edf3ff;border:1px solid #394760;border-radius:14px;box-shadow:0 24px 90px #0009;min-height:0;";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;";
    const title = document.createElement("strong"); title.textContent = `Edit ${file.name}`; title.style.cssText = "flex:1;overflow-wrap:anywhere;font-size:1.05rem;";
    const status = document.createElement("span"); status.textContent = "Loading file…"; status.style.cssText = "font-size:.82rem;color:#a8b8d3;";
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
    close.style.cssText = "background:#273349;color:#fff;border:1px solid #4b5b76;border-radius:7px;padding:8px 12px;";
    header.append(title, status, close);
    // Overlay a syntax-highlighted Highlight.js layer beneath the editable textarea.
    // The textarea remains the source of truth, preserving normal editing, selection,
    // undo/redo, keyboard navigation, and exact file contents.
    const editorWrap = document.createElement("div");
    editorWrap.style.cssText = "position:relative;flex:1 1 0;min-height:0;height:0;width:100%;overflow:hidden;border:1px solid #34445d;border-radius:9px;background:#080d16;";
    const highlighted = document.createElement("pre");
    highlighted.className = "faith-editor-highlight-pre";
    highlighted.setAttribute("aria-hidden", "true");
    highlighted.style.cssText = "position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;box-sizing:border-box!important;background:#080d16!important;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace!important;letter-spacing:normal!important;tab-size:2!important;white-space:pre!important;word-break:normal!important;overflow-wrap:normal!important;pointer-events:none!important;";
    const highlightedCode = document.createElement("code");
    highlightedCode.className = "faith-editor-highlight-code";
    highlightedCode.style.cssText = "display:block;min-height:100%;width:max-content;min-width:100%;padding:14px;margin:0;border:0;background:transparent;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:normal;font-weight:400;font-style:normal;white-space:pre;tab-size:2;word-break:normal;overflow-wrap:normal;transform:translate(0,0);will-change:transform;";
    highlighted.appendChild(highlightedCode);
    const editor = document.createElement("textarea");
    editor.className = "faith-code-editor-input";
    editor.spellcheck = false; editor.autocapitalize = "off"; editor.autocomplete = "off"; editor.wrap = "off";
    editor.setAttribute("aria-label", `Source code for ${file.name}`);
    // Reliability-first editor: use one native textarea as both the visible code
    // surface and the scrolling surface. The previous transparent-text + <pre>
    // overlay required two independently laid-out layers and repeatedly drifted.
    // A single native control guarantees caret, selection, scroll, and text share
    // the same geometry; message code blocks elsewhere keep their highlighting.
    editor.style.cssText = "position:relative;display:block;flex:1 1 auto;min-height:0;width:100%;height:100%;resize:none;box-sizing:border-box;padding:14px;border:0;outline:none;border-radius:9px;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:#f5f8ff;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:normal;font-weight:400;font-style:normal;tab-size:2;white-space:pre;overflow:auto;overflow-wrap:normal;scrollbar-width:auto;scrollbar-color:#536784 #111a29;-ms-overflow-style:auto;z-index:1;";
    const selectionStyle = document.createElement("style");
    selectionStyle.textContent = ".faith-code-editor-input::-webkit-scrollbar{width:12px!important;height:12px!important;display:block!important}.faith-code-editor-input::-webkit-scrollbar-thumb{background:#536784!important;border-radius:8px!important;border:2px solid #111a29!important}.faith-code-editor-input::-webkit-scrollbar-track{background:#111a29!important}.faith-code-editor-input::selection{background:rgba(89,145,255,.42)}.faith-code-editor-input::-moz-selection{background:rgba(89,145,255,.42)}";
    document.head.appendChild(selectionStyle);
    const extension = (String(file.name).split(".").pop() || "").toLowerCase();
    const languageByExtension = {js:"javascript",mjs:"javascript",cjs:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",py:"python",rb:"ruby",html:"xml",htm:"xml",xhtml:"xml",svg:"xml",xml:"xml",css:"css",scss:"scss",sass:"scss",json:"json",jsonc:"json",yml:"yaml",yaml:"yaml",sh:"bash",bash:"bash",zsh:"bash",bat:"dos",cmd:"dos",ps1:"powershell",java:"java",kt:"kotlin",kts:"kotlin",swift:"swift",c:"c",h:"c",cc:"cpp",cpp:"cpp",cxx:"cpp",hpp:"cpp",cs:"csharp",go:"go",rs:"rust",php:"php",sql:"sql",md:"markdown",markdown:"markdown",toml:"ini",ini:"ini",r:"r",lua:"lua",dart:"dart",ex:"elixir",exs:"elixir",erl:"erlang",hs:"haskell",pl:"perl",pm:"perl",vue:"xml",svelte:"xml"};
    const highlightLanguage = languageByExtension[extension] || "";
    const renderEditorHighlight = () => {
      const source = editor.value || " ";
      const hljs = window.hljs;
      if (hljs) {
        try {
          const language = highlightLanguage && typeof hljs.getLanguage === "function" && hljs.getLanguage(highlightLanguage) ? highlightLanguage : "";
          highlightedCode.innerHTML = language ? hljs.highlight(source, { language, ignoreIllegals: true }).value : hljs.highlightAuto(source).value;
          highlightedCode.className = language ? `hljs language-${language}` : "hljs";
        } catch (_) { highlightedCode.textContent = source; }
      } else {
        highlightedCode.textContent = source;
        editor.style.color = "transparent";
        editor.style.webkitTextFillColor = "transparent";
      }
    };
    let highlightFrame = 0;
    const scheduleEditorHighlight = () => {
      if (highlightFrame) return;
      highlightFrame = requestAnimationFrame(() => { highlightFrame = 0; renderEditorHighlight(); });
    };
    editor.addEventListener("input", scheduleEditorHighlight);
    const syncEditorViewport = () => { highlightedCode.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`; highlighted.style.width = `${editor.clientWidth}px`; highlighted.style.height = `${editor.clientHeight}px`; };
    editor.addEventListener("scroll", syncEditorViewport, { passive: true });
    window.addEventListener("resize", syncEditorViewport);
    editor.addEventListener("keydown", event => {
      if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const start = editor.selectionStart, end = editor.selectionEnd;
        editor.setRangeText("\t", start, end, "end");
        scheduleEditorHighlight();
      }
    });
    // Do not stack a second independently scrolling <pre> beneath the textarea.
    // That overlay was the source of the mismatched viewport and unreachable lines.
    editorWrap.append(highlighted, editor);
    const requestLabel = document.createElement("label"); requestLabel.textContent = "What would you like Faith to change? (optional)"; requestLabel.style.cssText = "font-size:.88rem;color:#c7d5ec;";
    const request = document.createElement("textarea"); request.rows = 2; request.placeholder = "Example: Add input validation, preserve existing behavior, and update the error handling…";
    request.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;min-height:54px;max-height:140px;padding:10px;border:1px solid #34445d;border-radius:8px;background:#0a101c;color:#fff;font:14px/1.4 system-ui,sans-serif;";
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";
    const buttonStyle = "border:0;border-radius:8px;padding:10px 14px;font-weight:600;cursor:pointer;";
    const save = document.createElement("button"); save.type = "button"; save.textContent = "Save changes to file"; save.style.cssText = buttonStyle + "background:#34435d;color:#fff;";
    const chatButton = document.createElement("button"); chatButton.type = "button"; chatButton.textContent = "Save & chat about changes"; chatButton.style.cssText = buttonStyle + "background:#6336a6;color:#fff;";
    actions.append(save, chatButton); panel.append(header, editorWrap, requestLabel, request, actions); overlay.appendChild(panel);
    let originalCode = "", loaded = false, saving = false;
    const closeEditor = () => { if (editor.value !== originalCode && !confirm("You have unsaved code changes. Close without saving?")) return; overlay.remove(); selectionStyle.remove(); window.removeEventListener("resize", syncEditorViewport); };
    close.addEventListener("click", closeEditor);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeEditor(); });
    const saveCode = async () => {
      if (saving) throw new Error("A save is already in progress.");
      saving = true; save.disabled = chatButton.disabled = true; status.textContent = "Saving…";
      try {
        const r = await fetch("/api/code-files", { method: "PUT", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ stored_name: file.stored_name, code: editor.value }) });
        const raw = await r.text(); let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error(`Server returned a non-JSON response (HTTP ${r.status}).`); }
        if (!r.ok) throw new Error(data.error || `Save failed (HTTP ${r.status})`);
        originalCode = editor.value; status.textContent = "Saved"; return data;
      } finally { saving = false; save.disabled = chatButton.disabled = false; }
    };
    save.addEventListener("click", async () => { try { await saveCode(); await faithRefreshCodeFiles(); status.textContent = "Saved successfully"; } catch (error) { status.textContent = "Save failed"; alert(`Could not save ${file.name}: ${error.message}`); } });
    chatButton.addEventListener("click", async () => {
      const instructions = request.value.trim();
      if (!instructions) { alert("Describe the changes you want Faith to make before starting the troubleshooting conversation."); request.focus(); return; }
      try {
        // Save the editor contents first, then send those exact bytes through
        // Faith's normal file-attachment flow. This avoids calling /api/coder-edit
        // before the troubleshooting upload/session state has been initialized.
        await saveCode();
        status.textContent = "Preparing file attachment…";
        // Each Edit & Chat action starts a fresh, dedicated conversation. The
        // source is represented as a real attachment in that chat, just like a
        // file selected from the normal composer, and therefore enters the same
        // Troubleshooting diagnosis/fix pipeline users already know.
        faithNewThread();
        const thread = faithWorkspace.threads.find(item => item.id === faithWorkspace.activeId);
        if (thread) {
          thread.title = `Edit: ${file.name}`;
          thread.mode = "coding";
          thread.behaviorState = "coding";
          thread.expression = "coding";
          thread.detail = `Editing ${file.name}`;
        }
        sessionMode = "coding";
        troubleshootingDiagnosisReady = false;
        setExpression("coding", `Preparing ${file.name} for direct code editing…`);
        faithSaveWorkspace();
        showSidebarTab("chats");
        overlay.remove(); selectionStyle.remove();
        await faithRefreshCodeFiles();
        // Do not send this source through uploadFileToFaith: that route invokes
        // the normal file-observation/chat pipeline before deciding what to do.
        // Call the dedicated code-edit endpoint directly with the exact source,
        // filename and stored artifact identity. The server starts/checks the
        // coding BAT and waits for :8090 readiness before submitting the edit.
        const prompt = instructions;
        setBusy(false);
        await runCoderTroubleshooting(prompt, {
          directCode: true,
          sourceCode: editor.value,
          filename: file.name,
          storedName: file.stored_name
        });
      } catch (error) {
        status.textContent = "Could not start chat";
        alert(`Could not start a direct code-editing conversation for ${file.name}: ${error.message}`);
      }
    });
    document.body.appendChild(overlay);
    try {
      const response = await fetch(file.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read file (HTTP ${response.status})`);
      originalCode = await response.text(); editor.value = originalCode; renderEditorHighlight(); loaded = true; status.textContent = `${faithFormatBytes(new Blob([originalCode]).size)} · ${file.name}`; editor.focus();
    } catch (error) { status.textContent = "Could not load file"; editor.value = `// Could not load ${file.name}: ${error.message}`; renderEditorHighlight(); save.disabled = chatButton.disabled = true; }
  };

  const faithPreviewCodeHtml = (url, filename) => {
    const overlay = document.createElement("div"); overlay.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:3vh 3vw";
    const frame = document.createElement("div"); frame.style.cssText = "width:min(1100px,96vw);height:94vh;background:#111827;border:1px solid #536176;border-radius:12px;overflow:hidden;display:flex;flex-direction:column";
    const bar = document.createElement("div"); bar.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 14px;color:#eaf2ff";
    const label = document.createElement("strong"); label.textContent = filename; label.style.cssText = "flex:1;overflow-wrap:anywhere";
    const close = document.createElement("button"); close.textContent = "Close preview"; close.type = "button"; close.addEventListener("click", () => overlay.remove());
    const iframe = document.createElement("iframe"); iframe.src = url; iframe.title = `Preview ${filename}`; iframe.sandbox = "allow-scripts allow-forms"; iframe.style.cssText = "border:0;flex:1;width:100%;background:white";
    bar.append(label, close); frame.append(bar, iframe); overlay.appendChild(frame); overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); }); document.body.appendChild(overlay);
  };
  // Files-tab cards can be dropped onto the active conversation or composer.
  // Dropping stages the file just like the Upload menu; it never sends or edits
  // anything until the user types a request and presses Send.
  const faithDropTargets = [chat, document.getElementById("chat-form"), input].filter(Boolean);
  faithDropTargets.forEach(target => {
    target.addEventListener("dragover", event => {
      const types = event.dataTransfer && Array.from(event.dataTransfer.types || []);
      if (types && (types.includes("application/x-faith-code-file") || types.includes("text/plain"))) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        target.classList.add("faith-code-drop-target");
      }
    });
    target.addEventListener("dragleave", event => {
      if (!target.contains(event.relatedTarget)) target.classList.remove("faith-code-drop-target");
    });
    target.addEventListener("drop", async event => {
      const raw = event.dataTransfer && event.dataTransfer.getData("application/x-faith-code-file");
      if (!raw) return;
      event.preventDefault();
      target.classList.remove("faith-code-drop-target");
      let fileInfo;
      try { fileInfo = JSON.parse(raw); } catch (_) { return; }
      if (!fileInfo || !fileInfo.url || !fileInfo.name) return;
      try {
        setUploadStatus(`Loading ${fileInfo.name} from Files…`, false);
        const response = await fetch(fileInfo.url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not read file (HTTP ${response.status})`);
        const blob = await response.blob();
        const sourceFile = new File([blob], fileInfo.name, { type: blob.type && blob.type !== "application/octet-stream" ? blob.type : "text/plain", lastModified: Date.now() });
        pendingCodeFile = sourceFile;
        setUploadStatus(`Attached: ${fileInfo.name} — write your request and press Send`, false);
        setExpression(sessionMode === "troubleshooting" ? "troubleshooting" : "thinking", `Ready to revise ${fileInfo.name}`);
        input.focus();
      } catch (error) {
        setUploadStatus(`Could not attach ${fileInfo.name}`, false);
        appendMessage("Error", `Could not attach ${fileInfo.name} from Files: ${error.message}`, "error");
      }
    });
  });
  const refreshFilesButton = document.getElementById("faith-files-refresh");
  if (refreshFilesButton) refreshFilesButton.addEventListener("click", faithRefreshCodeFiles);
  const showSidebarTab = (which) => {
    if (!tabChat || !tabGallery || !tabStudio || !chatsPanel || !galleryPanel || !studioPanel) return;
    chatsPanel.hidden = which !== "chats";
    galleryPanel.hidden = which !== "gallery";
    if (filesPanel) filesPanel.hidden = which !== "files";
    studioPanel.hidden = which !== "studio";
    // Studio is its own blank workspace, not a view layered over the current
    // conversation. The chat and composer return when another sidebar tab opens.
    document.body.classList.toggle("faith-studio-mode", which === "studio");
    tabChat.classList.toggle("active", which === "chats");
    tabGallery.classList.toggle("active", which === "gallery");
    if (tabFiles) tabFiles.classList.toggle("active", which === "files");
    tabStudio.classList.toggle("active", which === "studio");
    if (which === "files") faithRefreshCodeFiles();
    if (which === "studio") {
      // Studio owns a private, non-visible system conversation. Its only job is
      // to activate the Video Mode expression while Studio is open; it never
      // enters the user's chat history or overwrites a chat's saved behavior.
      window.__faithStudioExpressionActive = true;
      window.__faithStudioSystemConversation = {
        id: "__faith_internal_video_studio__",
        internal: true,
        messages: [
          { role: "system", content: "You are in Faith's Video Studio workspace. Use the videomode expression while this workspace is open. Keep this context isolated from user conversations." },
          { role: "assistant", content: "Video Studio expression context active." }
        ],
        expression: "videoStudio"
      };
      setExpression(window.__faithStudioSystemConversation.expression, "Working in Video Studio");
      faithLoadVideoLibrary();
    }
    if (which !== "studio") {
      window.__faithStudioExpressionActive = false;
      window.__faithStudioSystemConversation = null;
      // Restore the active conversation's saved expression after leaving Studio.
      const activeThread = typeof faithWorkspace !== "undefined" && faithWorkspace.threads
        ? faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId) : null;
      const name = activeThread && expressionImages[activeThread.expression] ? activeThread.expression : "explanation";
      setExpression(name, activeThread && activeThread.detail ? activeThread.detail : null);
    }
  };
  if (tabChat && tabGallery && tabStudio && chatsPanel && galleryPanel && studioPanel) {
    tabChat.addEventListener("click", () => showSidebarTab("chats"));
    tabGallery.addEventListener("click", () => showSidebarTab("gallery"));
    if (tabFiles) tabFiles.addEventListener("click", () => showSidebarTab("files"));
    tabStudio.addEventListener("click", () => {
      // Enter Studio's separate internal expression context without changing
      // the active conversation's saved expression or behavior.
      showSidebarTab("studio");
    });
  }
}
// Rename the existing cyan voice toggle label only if the voice module has
// already created it. This does not create, replace, or wire any checkbox.
function faithRenameExistingAutoReadLabel() {
  const rename = () => {
    const label = document.querySelector('label[for="faith-cyan-voice-toggle"]');
    const span = label && label.querySelector("span");
    if (span && span.textContent.trim() !== "Auto-read?") span.textContent = "Auto-read?";
  };
  rename();
  if (document.body && !window.__faithAutoReadLabelObserver) {
    const observer = new MutationObserver(rename);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__faithAutoReadLabelObserver = observer;
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
  const isVoiceModeUserMessage = item.classList.contains("cyan-voice-message");
  const idleLabel = isVoiceModeUserMessage ? "🔊 Read aloud" : "↻ Replay voice";
  speak.textContent = idleLabel;
  speak.setAttribute("aria-label", isVoiceModeUserMessage ? "Read your message aloud" : "Replay this Faith reply aloud");
  speak.title = isVoiceModeUserMessage ? "Read this cyan Voice Mode message aloud on demand." : "Replay this reply on demand; it does not start automatic reading.";
  if (speak.dataset.faithReplayHooked === "true") return;
  speak.dataset.faithReplayHooked = "true";
  speak.addEventListener("click", () => {
    const spokenText = (textNode.innerText || textNode.textContent || "").trim();
    if (!spokenText) return;
    // Prefer the installed Faith voice module if it exposes a replay/speak
    // hook. Otherwise use browser speech synthesis as a dependable fallback.
    const voice = window.faithVoice;
    const cyanVoice = window.FaithCyanVoice;
    // Explicit Replay is a user action and must work even when Auto-read? is off.
    const isVoiceModeUserMessage = item.classList.contains("cyan-voice-message");
    const customReplay = isVoiceModeUserMessage && cyanVoice && typeof cyanVoice.speakUserMessage === "function"
      ? cyanVoice.speakUserMessage
      : ((cyanVoice && typeof cyanVoice.replay === "function")
        ? cyanVoice.replay
        : (window.faithReplayReply || window.replayFaithReply || (voice && (voice.replay || voice.speak || voice.speakText))));
    if (typeof customReplay === "function") {
      try {
        const result = customReplay.call(cyanVoice || voice || window, spokenText, item);
        if (result !== false) { speak.textContent = isVoiceModeUserMessage ? "🔊 Reading…" : "↻ Replaying…"; setTimeout(() => { speak.textContent = idleLabel; }, 1800); return; }
      } catch (error) { console.warn("Faith voice replay hook failed; using browser voice.", error); }
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { alert("Replay voice is not supported by this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = navigator.language || "en-US"; utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1;
    speak.textContent = isVoiceModeUserMessage ? "🔊 Reading…" : "⏸ Replaying…";
    utterance.onend = utterance.onerror = () => { speak.textContent = idleLabel; };
    window.speechSynthesis.speak(utterance);
  });
}

function faithBindReplayButtons(root = chat) {
  if (!root) return;
  root.querySelectorAll(".message.ai, .message.you.cyan-voice-message").forEach(faithEnsureReadAloudButton);
}

function appendMessage(speaker, text, type, images = [], options = {}) {
  const item = document.createElement("div");
  item.className = `message ${type}`;
  // Voice Mode user turns are displayed as cyan BBCode-style messages and
  // receive the same on-demand read-aloud control as Faith's replies.
  const isVoiceModeUserMessage = type === "you" && !!window.faithVoiceModeActive;
  if (isVoiceModeUserMessage) item.classList.add("cyan-voice-message");

  const speakerNode = document.createElement("span");
  speakerNode.className = "speaker";
  speakerNode.textContent = speaker;

  item.appendChild(speakerNode);

  const textNode = document.createElement("div");
  textNode.className = "message-text";
  textNode.innerHTML = formatFaithMessage(text);
  if (isVoiceModeUserMessage) {
    textNode.style.color = "#00dfff";
    textNode.style.textShadow = "0 0 5px rgba(0, 223, 255, 0.18)";
  }
  scheduleCodeHighlight(textNode);
  item.appendChild(textNode);
  if (type === "ai" || isVoiceModeUserMessage) faithEnsureReadAloudButton(item);

  appendImages(item, images, options.onGeneratedStateChange);

  chat.appendChild(item);
  if (isVoiceModeUserMessage) faithEnsureReadAloudButton(item);
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

      // Critical: streamed text is intentionally shown as textContent while
      // tokens arrive, but it must be converted to the normal Markdown/code
      // renderer when the stream finishes. Without this final render, streamed
      // replies stay plain text forever and never create <pre><code> blocks.
      const completedTextNode = faithItem && faithItem.querySelector(".message-text");
      if (completedTextNode) {
        completedTextNode.innerHTML = formatFaithMessage(answer);
        scheduleCodeHighlight(completedTextNode);
      }

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
  // Fix Code belongs on a diagnosis, never on a completed edit/fix result.
  // The server may retain a previous diagnosis-ready flag across turns, so
  // explicitly tagged edit results must not inherit a stale Automatic Fix button.
  if (!messageItem || messageItem.classList.contains("faith-code-edit-result") ||
      messageItem.querySelector(".faith-troubleshooting-artifact-actions, .fix-code-action")) return;
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

async function uploadFileToFaith(file, suppliedQuestion = null, uploadKind = null) {
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
  // The menu choice is authoritative: an image selected through File remains
  // a normal attachment; only the Image choice enters the img2img pipeline.
  const isImageUpload = uploadKind ? uploadKind === "image" : String(file.type || "").toLowerCase().startsWith("image/");

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

    // Routing distinction:
    // - A user who deliberately entered Troubleshooting (or explicitly asks to
    //   troubleshoot/debug) gets the established diagnosis-first workflow.
    // - A concrete edit request with an attached file in an ordinary/new chat is
    //   a direct coder-chat request. It must NOT require a prior diagnosis or a
    //   previous troubleshooting conversation (e.g. Files-tab handoff).
    // - Explicit Automatic Fix keeps its dedicated automatic-fix path.
    const explicitTroubleshootingRequest = /\b(?:troubleshoot|troubleshooting|debug|debugging|diagnos(?:e|is|tic))\b/i.test(question);
    if (!isImageUpload && isAutomaticFixRequest(question)) {
      sessionMode = "troubleshooting";
      await runCoderTroubleshooting(question, { automaticFix: true });
      return;
    }
    if (!isImageUpload && (sessionMode === "troubleshooting" || explicitTroubleshootingRequest)) {
      sessionMode = "troubleshooting";
      troubleshootingDiagnosisReady = false;
      await runCoderDiagnosis(question || "Please diagnose this uploaded source file and explain the most likely issue and repair.");
      return;
    }
    if (!isImageUpload && isDirectCodeFixRequest(question)) {
      // Direct attached-file edits are allowed in a fresh conversation. The
      // upload endpoint has already stored this file as the active coder source.
      // Use the existing edit pipeline without inventing a diagnosis step.
      const fromDirectCodeHandoff = sessionMode === "coding";
      if (fromDirectCodeHandoff) {
        await runCoderTroubleshooting(question, { automaticFix: false, directCode: true });
      } else {
        sessionMode = "troubleshooting";
        await runCoderTroubleshooting(question, { automaticFix: false });
      }
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

function addTroubleshootingArtifactControls(messageItem, attachment) {
  if (!messageItem || !attachment || !attachment.url) return;
  if (messageItem.querySelector(".faith-troubleshooting-artifact-actions")) return;

  const wrap = document.createElement("div");
  wrap.className = "faith-troubleshooting-artifact-actions";
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center";

  const button = (label, handler) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.style.cssText = "border:1px solid #65718a;border-radius:8px;padding:7px 11px;background:#252b3b;color:#f4f6ff;cursor:pointer";
    el.addEventListener("click", handler);
    return el;
  };

  const filename = String(attachment.name || "updated-source.txt");
  const download = document.createElement("a");
  download.href = attachment.url;
  download.download = filename;
  download.textContent = `Download ${filename}`;
  download.style.cssText = "border:1px solid #65718a;border-radius:8px;padding:7px 11px;color:inherit;text-decoration:none";
  wrap.appendChild(download);

  wrap.appendChild(button("Copy code", async (event) => {
    const control = event.currentTarget;
    try {
      const response = await fetch(attachment.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(source);
      } else {
        const area = document.createElement("textarea");
        area.value = source;
        area.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand("copy");
        area.remove();
        if (!copied) throw new Error("Clipboard access is unavailable in this browser.");
      }
      const previous = control.textContent;
      control.textContent = "Copied!";
      setTimeout(() => { if (control.isConnected) control.textContent = previous; }, 1600);
    } catch (error) {
      alert(`Could not copy code: ${error.message}`);
    }
  }));
  messageItem.appendChild(wrap);
}

async function runCoderTroubleshooting(question, options = {}) {
  const automaticFix = !!options.automaticFix || isAutomaticFixRequest(question);
  const reviewOnly = !automaticFix && /\b(?:review|check|inspect|analy[sz]e)\b/i.test(question) &&
    !/\b(?:change|modify|edit|update|fix|repair|correct|patch|refactor|add|remove|replace|implement)\b/i.test(question);
  const directCode = !!options.directCode;
  sessionMode = directCode ? "coding" : "troubleshooting";
  setExpression(directCode ? "coding" : "troubleshooting", directCode
    ? "Sending your file and instructions directly to the code editor…"
    : (automaticFix ? "Using the completed diagnosis and applying the repair…" : "Getting your requested code changes from Qwen on :8090…"));

  let faithItem = appendMessage(
    "Faith",
    directCode
      ? `I’m sending ${question ? "your requested changes" : "the file"} and the attached source directly to the code editor on :8090. No diagnosis step is needed.`
      : (automaticFix
      ? "The diagnosis is complete. I’m sending the source and diagnosis directly to Qwen on :8090 so it can apply and return the repaired file."
      : (reviewOnly
        ? "Getting response from Qwen code port on :8090… I’m reviewing your file against your instructions."
        : `Getting response from Qwen code port on :8090… I’m applying your requested changes: ${question}`)),
    "ai"
  );
  faithItem.classList.add("troubleshooting-pending");
  if (!reviewOnly) faithItem.classList.add("faith-code-edit-result");
  const updateProgressMessage = (message) => {
    if (answerHasStarted) return;
    const node = faithItem.querySelector(".message-text");
    if (node) node.textContent = message;
  };
  let answerHasStarted = false;

  const editEndpoint = directCode ? "/api/direct-code-edit" : "/api/coder-edit";
  const response = await fetch(`${editEndpoint}?ts=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "Cache-Control": "no-cache" },
    cache: "no-store",
    body: JSON.stringify({
      question,
      automatic_fix: automaticFix,
      ...(directCode ? {
        source_code: String(options.sourceCode || ""),
        filename: String(options.filename || ""),
        stored_name: String(options.storedName || "")
      } : {})
    })
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
    if (node) {
      // All coding-related modes use the same Markdown-aware formatter.
      // Never synthesize a fence around an entire answer: Build, Troubleshooting,
      // review, and direct-code replies can mix prose with one or more code excerpts.
      // Only explicit fences or code runs detected by the formatter become code blocks.
      node.innerHTML = formatFaithMessage(answer);
      scheduleCodeHighlight(node);
    }
    chat.scrollTop = chat.scrollHeight;
  };
  const consume = (raw) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    let event;
    try { event = JSON.parse(line.slice(5).trim()); } catch (_) { return; }
    if (event.type === "status") {
      if (event.phase === "searching") {
        setExpression(directCode ? "coding" : "troubleshooting", event.message || "Preparing the repair request…");
        updateProgressMessage(event.message || "Preparing the repair request…");
      } else if (event.phase === "generating") {
        const message = event.message || "The coding model received the request. Waiting for the first generated code…";
        setExpression(directCode ? "coding" : "troubleshooting", message);
        updateProgressMessage(message);
      } else if (event.phase === "waiting-coder") {
        // Show server/model startup progress instead of leaving the user on
        // the previous searching message while the coder process is prepared.
        const message = event.message || "Preparing the coding model on :8090…";
        setExpression(directCode ? "coding" : "troubleshooting", message);
        updateProgressMessage(message);
      } else if (event.phase === "connecting") {
        const message = event.message || "Search step finished. Getting response from Qwen code port on :8090…";
        setExpression(directCode ? "coding" : "troubleshooting", message);
        updateProgressMessage(message);
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
      sessionMode = directCode ? "coding" : "troubleshooting";
      // The server returns a clean chat presentation separately from the exact
      // source written to disk. Render that final message explicitly so direct
      // edits remain visible even if the local model returned its answer all at once.
      if (directCode && typeof event.display_text === "string" && event.display_text.trim()) {
        answer = event.display_text;
        answerHasStarted = true;
        paint();
      } else if (directCode && answer.trim()) {
        // Older server responses still get a final paint on the done event.
        paint();
      }
      if (reviewOnly) {
        faithItem.classList.remove("troubleshooting-pending");
        const node = faithItem.querySelector(".message-text");
        if (node) { node.innerHTML = formatFaithMessage(answer); scheduleCodeHighlight(node); }
        setExpression(directCode ? "coding" : "troubleshooting", "Code review complete");
        return;
      }
      if (event.attachment && event.attachment.url) {
        // The completed source is already delivered in the chat and the Coding
        // expression confirms completion. Keep artifact actions/HTML preview,
        // but omit the redundant “Open updated file” hyperlink.
        addTroubleshootingArtifactControls(faithItem, event.attachment);
        if (/\.html?$/i.test(event.attachment.name || "")) {
          const preview = document.createElement("iframe");
          preview.src = event.attachment.url;
          preview.title = `Preview of ${event.attachment.name}`;
          preview.sandbox = "allow-scripts allow-forms";
          preview.style.cssText = "display:block;width:100%;height:360px;margin-top:10px;border:1px solid rgba(255,255,255,.18);border-radius:9px;background:white";
          faithItem.appendChild(preview);
        }
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
  // Save the finished message HTML so the source block remains in the chat after
  // switching threads or reloading Faith, along with its syntax-highlighted DOM.
  try { faithSaveWorkspace(); } catch (_) {}
  if (!reviewOnly) {
    // Troubleshooting must never borrow the Coding face: coding.png is reserved
    // for explicit direct-code endpoint requests only.
    setExpression(directCode ? "coding" : "troubleshooting", directCode
      ? "Direct code edit complete — updated code fully received"
      : (automaticFix ? "Automatic fix complete — updated code fully received" : "Code changes complete — updated code fully received"));
  }
  return answer;
}

function faithIsCodeDownloadPlaceholder(value) {
  const text = String(value || "").trim();
  return /^(?:\[[^\]]*(?:\.html?|downloaded|download)[^\]]*\]|(?:the\s+)?(?:\.html?|html)\s+(?:file\s+)?(?:was\s+)?downloaded\.?|download(?:ed)?\s+(?:the\s+)?(?:html|code)\s+file\.?)[.! ]*$/i.test(text);
}

function faithHasRealCodeBlock(value) {
  return /```[^\n]*\n[\s\S]+?```/.test(String(value || "")) || /<\/?(?:html|script|style|body|div|main|section|canvas)\b/i.test(String(value || ""));
}

function addBuildArtifactControls(messageItem, attachment) {
  if (!messageItem || !attachment || !attachment.url || !/\.html?$/i.test(attachment.name || "")) return;
  if (messageItem.querySelector(".faith-build-artifact-actions")) return;
  const wrap = document.createElement("div");
  wrap.className = "faith-build-artifact-actions";
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center";
  const makeButton = (label, action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "border:1px solid #65718a;border-radius:8px;padding:7px 11px;background:#252b3b;color:#f4f6ff;cursor:pointer";
    button.addEventListener("click", action);
    return button;
  };
  const download = document.createElement("a");
  download.href = attachment.url;
  download.download = attachment.name;
  download.textContent = `Download ${attachment.name}`;
  download.style.cssText = "border:1px solid #65718a;border-radius:8px;padding:7px 11px;color:inherit;text-decoration:none";
  wrap.appendChild(download);
  wrap.appendChild(makeButton("Copy HTML code", async () => {
    try {
      const response = await fetch(attachment.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(source);
      else {
        const area = document.createElement("textarea"); area.value = source; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        const ok = document.execCommand("copy"); area.remove();
        if (!ok) throw new Error("Clipboard access is unavailable in this browser.");
      }
      const button = wrap.querySelector("button");
      if (button) { const old = button.textContent; button.textContent = "Copied!"; setTimeout(() => { button.textContent = old; }, 1600); }
    } catch (error) { alert(`Could not copy HTML: ${error.message}`); }
  }));
  const previewButton = makeButton("Embed preview", () => {
    let frame = messageItem.querySelector(".faith-build-html-embed");
    if (frame) { frame.remove(); previewButton.textContent = "Embed preview"; return; }
    frame = document.createElement("iframe");
    frame.className = "faith-build-html-embed";
    frame.src = attachment.url;
    frame.title = `Embedded preview of ${attachment.name}`;
    frame.sandbox = "allow-scripts allow-forms";
    frame.style.cssText = "display:block;width:100%;height:420px;margin-top:12px;border:1px solid #65718a;border-radius:10px;background:white";
    messageItem.appendChild(frame);
    previewButton.textContent = "Hide preview";
  });
  wrap.appendChild(previewButton);
  messageItem.appendChild(wrap);
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
  let lastMeaningfulAnswer = "";
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
      lastMeaningfulAnswer = "";
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
      if (answer.trim() && !faithIsCodeDownloadPlaceholder(answer) && (!faithIsCodeDownloadPlaceholder(lastMeaningfulAnswer) || answer.length >= lastMeaningfulAnswer.length)) lastMeaningfulAnswer = answer;
      setExpression("build", "Qwen is writing your code…");
      paintAnswer();
      return;
    }
    if (event.type === "text_complete") {
      if (typeof event.answer === "string" && event.answer.trim()) {
        const finalAnswer = event.answer;
        // Some server paths return an artifact/download notice at completion
        // after streaming the actual source. Never replace that source with a placeholder.
        const streamedHasCode = faithHasRealCodeBlock(lastMeaningfulAnswer || answer);
        if (streamedHasCode && (faithIsCodeDownloadPlaceholder(finalAnswer) || !faithHasRealCodeBlock(finalAnswer))) answer = lastMeaningfulAnswer || answer;
        else answer = finalAnswer;
      }
      sessionMode = event.session_mode === "idle" ? "idle" : "build";
      paintAnswer();
      addBuildArtifactControls(faithItem, event.attachment);
      try { faithSaveWorkspace(); } catch (_) {}
      setExpression(sessionMode === "build" ? "build" : "explanation");
      return;
    }
    if (event.type === "done") {
      if (typeof event.answer === "string" && event.answer.trim()) {
        const finalAnswer = event.answer;
        const streamedHasCode = faithHasRealCodeBlock(lastMeaningfulAnswer || answer);
        if (streamedHasCode && (faithIsCodeDownloadPlaceholder(finalAnswer) || !faithHasRealCodeBlock(finalAnswer))) answer = lastMeaningfulAnswer || answer;
        else answer = finalAnswer;
      }
      sessionMode = event.session_mode === "idle" ? "idle" : "build";
      paintAnswer();
      addBuildArtifactControls(faithItem, event.attachment);
      try { faithSaveWorkspace(); } catch (_) {}
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

  let question = input.value.trim();
  if (!question) return;
  faithLastUserPrompt = question;
  const turnId = ++turnSequence;

  input.value = "";

  // Experimental Voice Mode: [cyan]text[/cyan] activates voice-only mode and
  // speaks the enclosed text. While active, plain user messages are spoken
  // instead of being sent to the AI. Use [cyan]exit[/cyan] to leave Voice Mode.
  const cyanMatch = question.match(/^\s*\[cyan\]([\s\S]*?)\[\/cyan\]\s*$/i);
  if (cyanMatch) {
    const cyanPayload = cyanMatch[1].trim();
    if (/^(?:exit|off|stop|disable)\s*$/i.test(cyanPayload)) {
      window.faithVoiceModeActive = false;
      const voiceThread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
      if (voiceThread) voiceThread.voiceModeActive = false;
      if (voiceThread) faithPersistThreadState(voiceThread);
      appendMessage("You", "[cyan]exit[/cyan]", "you");
      setExpression("ruby", "Voice Mode disabled");
      return;
    }
    window.faithVoiceModeActive = true;
    const voiceThread = faithWorkspace.threads.find(t => t.id === faithWorkspace.activeId);
    if (voiceThread) faithPersistThreadState(voiceThread);
    question = cyanPayload;
  }

  const userVisibleQuestion = question;
  // Video Studio's expression is private to the Studio tab. Ordinary chat
  // messages (including video-related questions) never enter a persistent
  // Video Mode, so unrelated threads cannot inherit the Studio expression.

  if (window.faithVoiceModeActive) {
    if (!question.trim()) return;
    appendMessage("You", question, "you");
    setExpression("voiceMode", "Reading your message aloud...");
    const voice = window.FaithCyanVoice;
    if (voice && typeof voice.speakUserMessage === "function") {
      voice.speakUserMessage(question);
    } else if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(question);
        utterance.onend = utterance.onerror = () => {
          if (window.faithVoiceModeActive) setExpression("voiceMode", "Voice Mode is active");
        };
        window.speechSynthesis.speak(utterance);
      } catch (_) {}
    }
    return;
  }
  // If a file is staged, defer rendering the user turn until uploadFileToFaith
  // can put the instruction and attachment card together in one message.
  if (!pendingCodeFile) appendMessage("You", userVisibleQuestion, "you");

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

  // A staged source attachment is sent with the user's actual instructions.
  // Preserve an explicitly active Troubleshooting session, but do not force a
  // fresh direct-edit request through diagnosis just because it contains words
  // like "modify", "change", or "fix". uploadFileToFaith chooses the right path.
  if (pendingCodeFile) {
    if (isTroubleshootingEntry || sessionMode === "troubleshooting" || isAutomaticFixRequest(question)) {
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
      let normalExpression;
      if (["robotic", "psychotic", "sad", "anger", "erotic"].includes(data.expression)) normalExpression = data.expression;
      else if (sessionMode === "build") normalExpression = "build";
      else if (sessionMode === "coding") normalExpression = "coding";
      else if (sessionMode === "troubleshooting" || isTroubleshootingPrompt) normalExpression = "troubleshooting";
      else if (["greeting", "thinking", "confusion", "troubleshooting", "observing"].includes(data.expression)) normalExpression = data.expression;
      else normalExpression = getDefaultReplyExpression("explanation");
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

const uploadMenu = document.getElementById("upload-menu");
const uploadFileChoice = document.getElementById("upload-file-choice");
const uploadImageChoice = document.getElementById("upload-image-choice");
let selectedUploadKind = "file";

function closeUploadMenu() {
  if (uploadMenu) uploadMenu.hidden = true;
  if (upload) upload.setAttribute("aria-expanded", "false");
}

upload.addEventListener("click", (event) => {
  if (busy) return;
  event.stopPropagation();
  const willOpen = uploadMenu && uploadMenu.hidden;
  if (uploadMenu) uploadMenu.hidden = !willOpen;
  upload.setAttribute("aria-expanded", willOpen ? "true" : "false");
});

document.addEventListener("click", (event) => {
  if (uploadMenu && !uploadMenu.hidden && !event.target.closest(".upload-menu-wrap")) closeUploadMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeUploadMenu();
});

function chooseUpload(kind) {
  if (busy) return;
  selectedUploadKind = kind;
  closeUploadMenu();
  if (kind === "image") {
    // Open the recreate tab during this user gesture so popup blockers allow it.
    try {
      let hadOpen = false;
      try { hadOpen = !!(faithRecreatePopup && !faithRecreatePopup.closed); } catch (_) {}
      recreateOpenedThisTurn = !hadOpen && !!openFaithRecreatePopup();
    } catch (_) { recreateOpenedThisTurn = false; }
    fileInput.accept = "image/*";
    fileInput.setAttribute("aria-label", "Choose an image for image-to-image editing");
  } else {
    fileInput.removeAttribute("accept");
    fileInput.setAttribute("aria-label", "Choose a file to send to Faith for coding, troubleshooting, or building");
  }
  fileInput.click();
}

uploadFileChoice.addEventListener("click", () => chooseUpload("file"));
uploadImageChoice.addEventListener("click", () => chooseUpload("image"));

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  const kind = selectedUploadKind;
  if (!file || kind !== "image") {
    // If the Image menu opened a speculative editor tab but no image was
    // selected, close only that newly opened tab.
    if (recreateOpenedThisTurn) {
      try { if (faithRecreatePopup && !faithRecreatePopup.closed) faithRecreatePopup.close(); } catch (_) {}
      try { faithRecreateReady = false; } catch (_) {}
      recreateOpenedThisTurn = false;
    }
    if (!file) return;
  }
  await uploadFileToFaith(file, null, kind);
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
