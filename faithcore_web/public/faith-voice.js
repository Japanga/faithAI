/* Faith Voice v1 — read Faith's completed relay messages aloud.
 *
 * Drop-in: place beside app.js in Faith's public/ folder and add
 *   <script src="/faith-voice.js?v=1" defer></script>
 * next to the faith-ptt.js tag in index.html. No other dependency: every
 * call site in app.js is guarded (window.FaithVoice && try/catch), so Faith
 * works unchanged if this file is missing.
 *
 * How it fits Faith's relay: Faith streams deltas, holds expression/image
 * changes until the message is fully relayed, then fires text_complete
 * (expression release) and done (final). app.js calls
 * FaithVoice.speakRelayedOnce(answer) at those points. speakRelayedOnce
 * dedups, so a turn is never read twice even if both fire.
 *
 * Voice: real Australian voice audio (server /api/tts proxy -> Google en-AU)
 * run through a heavy robotizer (bitcrush + square ring-mod + metallic comb
 * + drone bed). Falls back to system Australian speechSynthesis if the
 * fetch or AudioContext is unavailable. Toggle in the composer persists to
 * localStorage (faithVoiceReadAloud, default ON).
 */
(function () {
"use strict";

var FAITH_VOICE_VERSION = "1";
var TTS_ENDPOINT = "/api/tts";
var STORE_KEY = "faithVoiceReadAloud";
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
var lastSpokenAt = 0;

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

// Strip Faith's Markdown + private tokens down to speakable plain text.
// Code fences are dropped (reading code aloud is awful); if a message is
// code-only the caller substitutes a short standby line instead.
function stripForSpeech(text) {
  var t = String(text || "");
  var hadCode = /```/.test(t);
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/\[\[FAITH_SOURCE\|[^\]]*\]\]/g, " ");
  t = t.replace(/\[\[FAITH_MISSING\]\]/g, " ");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/(^|[^a-zA-Z0-9_*])\*([^*\n]+)\*/g, "$1$2");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  t = t.replace(/[*_~#|>]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return { text: t, hadCode: hadCode };
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
    // Guard: if stop() halts the source, onended fires and resolves. If the
    // context is wedged, never hang the relay — resolve after an upper bound.
    var capMs = Math.min(90000, Math.max(8000, Math.floor((buf.duration || 5) * 1000 * 1.5)));
    setTimeout(finish, capMs);
    try { car.start(); } catch (_) {}
    try { wob.start(); } catch (_) {}
    try { src.start(); } catch (e) { finish(); }
  });
}

// Primary voice: real Australian audio via the server proxy, mangled hard.
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

// Entry point for app.js: speak a fully-relayed Faith message, at most once.
// Safe to call from text_complete AND done AND the non-streaming path.
function speakRelayedOnce(rawText) {
  if (!isEnabled()) return Promise.resolve();
  var cleaned = stripForSpeech(rawText);
  var text = cleaned.text.slice(0, MAX_TEXT);
  if (!text) {
    if (!cleaned.hadCode) return Promise.resolve();
    text = "The code is on screen.";
  }
  var now = Date.now();
  if (text === lastSpokenText && now - lastSpokenAt < 5000) return Promise.resolve();
  lastSpokenText = text;
  lastSpokenAt = now;
  var token = ++voiceToken;
  console.info("[Faith Voice] Reading completed message aloud (" + text.length + " chars).");
  return speakAuRobot(text, token).catch(function (e) {
    console.warn("[Faith Voice] Robot voice failed, browser fallback:", e && e.message ? e.message : e);
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

// Toggle checkbox injection into the composer row, before Send.
function injectToggle() {
  try {
    var row = document.querySelector(".composer-row");
    var send = document.getElementById("send");
    if (!row || !send || document.getElementById("faith-voice-toggle")) return;
    var label = document.createElement("label");
    label.htmlFor = "faith-voice-toggle";
    label.title = "Read Faith's completed messages aloud with her robot voice";
    label.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto;font-size:0.82rem;color:#9ba7bd;cursor:pointer;user-select:none;";
    var box = document.createElement("input");
    box.type = "checkbox";
    box.id = "faith-voice-toggle";
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
    var b = document.getElementById("faith-voice-toggle");
    if (b) b.checked = enabled;
  } catch (_) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectToggle);
} else {
  injectToggle();
}
try {
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = function () {};
  }
} catch (_) {}

var FaithVoice = {
  version: FAITH_VOICE_VERSION,
  speakRelayedOnce: speakRelayedOnce,
  stop: stop,
  isEnabled: isEnabled,
  setEnabled: setEnabled
};
if (typeof window !== "undefined") window.FaithVoice = FaithVoice;
})();
