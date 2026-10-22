/* Faith Voice (cyan-watch edition) — completely optional, zero chat hooks.
 *
 * Drop-in: place beside app.js in Faith's public/ folder and add
 *   <script src="/faith-voice-cyan.js?v=1" defer></script>
 * to index.html. No app.js or server.rb changes needed — nothing to break.
 *
 * How it works: Faith's AI replies render in cyan (see the .message.ai CSS
 * rule in index.html). This module simply watches #chat for cyan (AI)
 * messages; once a message sits unchanged for a few seconds (i.e. the relay
 * finished it), it reads that text aloud. A new user message or Clear
 * interrupts speech. Toggle in the composer (persisted, default ON).
 *
 * Voice: tries the /api/tts server endpoint for real Australian audio run
 * through a heavy robotizer; if the endpoint isn't there (rolled-back
 * server.rb), it falls back to the system Australian voice + FX bed.
 */
(function () {
"use strict";

var FAITH_CYAN_VOICE_VERSION = "1";
var TTS_ENDPOINT = "/api/tts";
var STORE_KEY = "faithCyanVoice";
var SETTLE_MS = 3000;
var CHUNK_LIMIT = 180;
var MAX_CHUNKS = 8;
var MAX_TEXT = 1200;
var ROBOT_FX = 0.85;
var VOICE_PITCH = 1.22;

var enabled = true;
try { enabled = (localStorage.getItem(STORE_KEY) || "1") === "1"; } catch (_) {}

var audioCtx = null;
var liveSources = [];
var humNodes = [];
var voiceToken = 0;
var lastSpokenText = "";
var settleTimer = null;
var chatEl = null;

function isEnabled() { return enabled; }

function setEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem(STORE_KEY, enabled ? "1" : "0"); } catch (_) {}
  if (!enabled) stop();
  syncToggle();
}

function getAudioCtx() {
  if (!audioCtx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (_) {} }
  return audioCtx;
}

// Speech text from a rendered Faith message: clone its .message-text, drop
// code blocks / figures / detail logs (never read code aloud), then take the
// visible text and mop up source-link markers and emoji.
function aiSpeechText(item) {
  try {
    var textNode = item.querySelector(".message-text");
    if (!textNode) return { text: "", hadCode: false };
    var hadCode = !!textNode.querySelector("pre");
    var clone = textNode.cloneNode(true);
    var kill = clone.querySelectorAll("pre, figure, figcaption, .message-image, details, summary");
    for (var i = 0; i < kill.length; i++) { try { kill[i].remove(); } catch (_) {} }
    var t = "";
    try { t = clone.innerText || clone.textContent || ""; } catch (_) { t = ""; }
    t = String(t)
      .replace(/\[¶\]|\[Â¶\]|\[¿\]|\[✓\]/g, " ")
      .replace(/\[\?\]/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
      .replace(/\s+/g, " ").trim();
    return { text: t, hadCode: hadCode };
  } catch (_) {
    return { text: "", hadCode: false };
  }
}

function lastAiItem() {
  try {
    var items = chatEl.querySelectorAll(".message.ai");
    return items.length ? items[items.length - 1] : null;
  } catch (_) { return null; }
}

function chunkForSpeech(text) {
  var clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_LIMIT) return [clean];
  var parts = clean.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) || [clean];
  var chunks = [];
  var cur = "";
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (cur && (cur + p).length > CHUNK_LIMIT) { chunks.push(cur.trim()); cur = p; }
    else cur += p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  var out = [];
  chunks.forEach(function (c) {
    if (c.length > CHUNK_LIMIT) {
      (c.match(/.{1,165}\S*\s*/g) || [c]).forEach(function (s) {
        if (s.trim()) out.push(s.trim());
      });
    } else out.push(c);
  });
  return out.filter(Boolean);
}

// Heavy bitcrush curve: slammed drive, hard quantization steps, metallic edge.
function makeRobotCurve() {
  var n = 2048, curve = new Float32Array(n), i, x, driven, crushed;
  for (i = 0; i < n; i++) {
    x = (i / (n - 1)) * 2 - 1;
    driven = Math.tanh(6 * x);
    crushed = Math.round(driven * 10) / 10;
    curve[i] = crushed * 0.85 + Math.sin(x * Math.PI * 5) * 0.09;
  }
  return curve;
}

// Detuned machine-drone bed under the mangled voice.
function startRobotHum() {
  try {
    var ctx = getAudioCtx();
    var t = ctx.currentTime;
    var mk = function (type, freq, gainVal, lfoFreq, lfoDepth) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      var g = ctx.createGain(); g.gain.value = gainVal;
      o.connect(g); g.connect(ctx.destination);
      var lfo = null;
      if (lfoFreq) {
        lfo = ctx.createOscillator(); lfo.frequency.value = lfoFreq;
        var lg = ctx.createGain(); lg.gain.value = lfoDepth;
        lfo.connect(lg); lg.connect(g.gain);
        try { lfo.start(t); } catch (_) {}
      }
      try { o.start(t); } catch (_) {}
      humNodes.push(o);
      if (lfo) humNodes.push(lfo);
    };
    mk("sawtooth", 55, 0.028, 0.4, 0.014);
    mk("sawtooth", 55.7, 0.028, 0.33, 0.014);
    mk("sine", 1244, 0.010, 5.5, 0.006);
    mk("sine", 1866, 0.005, 0.9, 0.004);
  } catch (_) {}
}

function stopRobotHum() {
  humNodes.forEach(function (o) { try { o.stop(); } catch (_) {} try { o.disconnect(); } catch (_) {} });
  humNodes = [];
}

// Play one decoded voice chunk through the heavy robotizer chain.
function playRobotizedBuffer(ctx, buf) {
  return new Promise(function (resolve) {
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1.07;
    liveSources.push(src);
    src.onended = function () {
      var i = liveSources.indexOf(src);
      if (i >= 0) liveSources.splice(i, 1);
    };

    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 320;
    var shaper = ctx.createWaveShaper(); shaper.curve = makeRobotCurve(); shaper.oversample = "4x";

    var ring = ctx.createGain(); ring.gain.value = 0;
    var car = ctx.createOscillator(); car.type = "square"; car.frequency.value = 26;
    var cg = ctx.createGain(); cg.gain.value = 0.7;
    car.connect(cg); cg.connect(ring.gain);
    var wob = ctx.createOscillator(); wob.frequency.value = 0.8;
    var wg = ctx.createGain(); wg.gain.value = 7;
    wob.connect(wg); wg.connect(car.frequency);

    var dly = ctx.createDelay(0.05); dly.delayTime.value = 0.011;
    var fb = ctx.createGain(); fb.gain.value = 0.55;
    var wet = ctx.createGain(); wet.gain.value = 0.6;
    var dry = ctx.createGain(); dry.gain.value = 0.9;
    var thru = ctx.createGain(); thru.gain.value = 0.45;
    var master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(ctx.destination);

    src.connect(hp); hp.connect(shaper);
    shaper.connect(dry); dry.connect(ring);
    shaper.connect(thru); thru.connect(dly);
    ring.connect(dly);
    dly.connect(fb); fb.connect(dly);
    dly.connect(wet); wet.connect(master);

    var finished = false;
    var finish = function () {
      if (finished) return; finished = true;
      try { car.stop(); } catch (_) {}
      try { wob.stop(); } catch (_) {}
      resolve();
    };
    var prevEnd = src.onended;
    src.onended = function (e) { try { prevEnd(e); } catch (_) {} finish(); };
    var capMs = Math.min(90000, Math.max(8000, Math.floor((buf.duration || 5) * 1000 * 1.5)));
    setTimeout(finish, capMs);
    try { car.start(); } catch (_) {}
    try { wob.start(); } catch (_) {}
    try { src.start(); } catch (e) { finish(); }
  });
}

// Real Australian audio via the server proxy, mangled hard. Rejects when the
// endpoint is absent (rolled-back server) so the caller falls back.
function speakAuRobot(text, token) {
  var ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    return Promise.reject(new Error("AudioContext suspended (autoplay policy)."));
  }
  var chunks = chunkForSpeech(text).slice(0, MAX_CHUNKS);
  if (!chunks.length) return Promise.resolve();
  var jobs = chunks.map(function (c) {
    return fetch(TTS_ENDPOINT + "?q=" + encodeURIComponent(c), { cache: "force-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("TTS HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then(function (ab) { return ctx.decodeAudioData(ab); });
  });
  return Promise.all(jobs).then(function (bufs) {
    if (token !== voiceToken) return;
    startRobotHum();
    var chain = Promise.resolve();
    bufs.forEach(function (buf) {
      chain = chain.then(function () {
        if (token !== voiceToken) return;
        return playRobotizedBuffer(ctx, buf);
      });
    });
    return chain.then(function () { stopRobotHum(); }, function (e) { stopRobotHum(); throw e; });
  });
}

function pickAuVoice() {
  var vs = [];
  try { vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []) || []; } catch (_) {}
  var isUK = function (v) { return /uk\b|british|en-GB/i.test(v.name + " " + (v.lang || "")); };
  var au = vs.filter(function (v) { return /en-AU/i.test(v.lang || "") || /australi|karen|catherine/i.test(v.name); });
  var rest = vs.filter(function (v) { return !isUK(v) && au.indexOf(v) < 0; });
  return (
    au.filter(function (v) { return /karen|catherine|female|australi/i.test(v.name); })[0] ||
    au[0] ||
    rest.filter(function (v) { return /google us english/i.test(v.name); })[0] ||
    rest.filter(function (v) { return /samantha|jenny|aria|michelle|allison|ava|zira|tessa|serena/i.test(v.name); })[0] ||
    rest.filter(function (v) { return v.lang === "en-US"; })[0] ||
    rest.filter(function (v) { return v.lang && v.lang.indexOf("en") === 0; })[0] ||
    rest[0] || null
  );
}

// Fallback when the proxy/context is unavailable: system Australian voice.
function speakBrowserFallback(text) {
  return new Promise(function (resolve) {
    try {
      if (!window.speechSynthesis) { resolve(); return; }
      var u = new SpeechSynthesisUtterance(text);
      var v = pickAuVoice();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || "en-AU";
      u.pitch = VOICE_PITCH + ROBOT_FX * 0.15;
      u.rate = 0.94;
      u.volume = 1;
      startRobotHum();
      var done = function () { stopRobotHum(); resolve(); };
      u.onend = done; u.onerror = done;
      try { speechSynthesis.cancel(); } catch (_) {}
      speechSynthesis.speak(u);
      setTimeout(function () { try { if (!speechSynthesis.speaking) done(); } catch (_) {} },
        Math.max(5000, text.length * 130));
    } catch (_) { try { stopRobotHum(); } catch (_) {} resolve(); }
  });
}

function speakText(text) {
  var token = ++voiceToken;
  console.info("[Faith Voice] Reading cyan message aloud (" + text.length + " chars).");
  return speakAuRobot(text, token).catch(function (e) {
    console.warn("[Faith Voice] Robot voice unavailable, browser fallback:", e && e.message ? e.message : e);
    if (token !== voiceToken) return;
    return speakBrowserFallback(text);
  });
}

function stop() {
  voiceToken++;
  liveSources.splice(0).forEach(function (s) {
    try { s.stop(); } catch (_) {}
    try { s.disconnect(); } catch (_) {}
  });
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (_) {}
  stopRobotHum();
}

function checkAndSpeak() {
  settleTimer = null;
  if (!isEnabled()) return;
  try {
    var item = lastAiItem();
    if (!item) return;
    var cleaned = aiSpeechText(item);
    var text = cleaned.text.slice(0, MAX_TEXT);
    if (!text) {
      if (!cleaned.hadCode) return;
      text = "The code is on screen.";
    }
    if (text === lastSpokenText) return;
    lastSpokenText = text;
    speakText(text);
  } catch (_) {}
}

function scheduleCheck() {
  try { if (settleTimer) clearTimeout(settleTimer); } catch (_) {}
  settleTimer = setTimeout(checkAndSpeak, SETTLE_MS);
}

function installWatcher() {
  try {
    chatEl = document.getElementById("chat");
    if (!chatEl) return;
    var observer = new MutationObserver(function (muts) {
      var interrupt = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        var added = m.addedNodes || [];
        for (var a = 0; a < added.length; a++) {
          var n = added[a];
          if (n && n.nodeType === 1 && n.classList) {
            // Own user message (or anything new from the user side) stops her;
            // Error bubbles never trigger speech (we only read .message.ai).
            if (n.classList.contains("you")) interrupt = true;
          }
        }
        if (m.removedNodes && m.removedNodes.length) interrupt = true; // Clear wiped the chat
      }
      if (interrupt) { stop(); lastSpokenText = ""; }
      scheduleCheck();
    });
    observer.observe(chatEl, { childList: true, characterData: true, subtree: true });
  } catch (_) {}
}

// Toggle checkbox injection into the composer row, before Send.
function injectToggle() {
  try {
    var row = document.querySelector(".composer-row");
    var send = document.getElementById("send");
    if (!row || !send || document.getElementById("faith-cyan-voice-toggle")) return;
    var label = document.createElement("label");
    label.htmlFor = "faith-cyan-voice-toggle";
    label.title = "Read Faith's cyan replies aloud with her robot voice";
    label.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto;font-size:0.82rem;color:#9ba7bd;cursor:pointer;user-select:none;";
    var box = document.createElement("input");
    box.type = "checkbox";
    box.id = "faith-cyan-voice-toggle";
    box.checked = enabled;
    box.addEventListener("change", function () { setEnabled(box.checked); });
    var span = document.createElement("span");
    span.textContent = "🔊 Voice";
    label.appendChild(box);
    label.appendChild(span);
    row.insertBefore(label, send);
  } catch (_) {}
}

function syncToggle() {
  try {
    var b = document.getElementById("faith-cyan-voice-toggle");
    if (b) b.checked = enabled;
  } catch (_) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () { injectToggle(); installWatcher(); });
} else {
  injectToggle(); installWatcher();
}
try {
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = function () {};
  }
} catch (_) {}

var FaithCyanVoice = {
  version: FAITH_CYAN_VOICE_VERSION,
  stop: stop,
  isEnabled: isEnabled,
  setEnabled: setEnabled
};
if (typeof window !== "undefined") window.FaithCyanVoice = FaithCyanVoice;
})();
