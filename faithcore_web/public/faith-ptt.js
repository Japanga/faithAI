/* Faith push-to-talk (faith-ptt.js)
 * A small hold-to-talk button for Faith's chat composer.
 * Hold it, speak, and your words are typed into the "Ask Faith something..."
 * box (#input). Release and press Send yourself — it never auto-sends.
 *
 * Integration (no changes to app.js or server.rb needed):
 *   1. Copy this file next to Faith's index.html (same folder as app.js).
 *   2. Add one line before </body> in index.html:
 *        <script src="/faith-ptt.js" defer></script>
 *   3. Done. The button + wave insert themselves right after #clear.
 *
 * The module looks up #input and the .composer-row / #clear at load and
 * inserts: [mic button][tiny waveform]. Styling is injected, matched to
 * Faith's dark glass composer. Uses the browser's built-in SpeechRecognition
 * (Chrome/Edge) — no network model, no TTS, no extra settings.
 */
(() => {
  "use strict";

  const CSS = `
    #faith-ptt-btn {
      flex: 0 0 auto;
      width: 38px; height: 38px;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 11px;
      background: #0a0d14;
      color: #9beaff;
      cursor: pointer;
      touch-action: none;
      user-select: none; -webkit-user-select: none;
    }
    #faith-ptt-btn:hover { border-color: rgba(125, 249, 255, 0.45); color: #d9f6ff; }
    #faith-ptt-btn:focus-visible { outline: none; border-color: rgba(107, 151, 255, 0.65); box-shadow: 0 0 0 3px rgba(107, 151, 255, 0.10); }
    #faith-ptt-btn.listening {
      color: #fff;
      border-color: rgba(34, 211, 238, 0.8);
      box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.15), 0 0 14px rgba(34, 211, 238, 0.45);
      animation: faith-ptt-pulse 0.9s ease-in-out infinite alternate;
    }
    @keyframes faith-ptt-pulse { from { transform: scale(1); } to { transform: scale(1.08); } }
    #faith-ptt-wave {
      flex: 0 0 auto;
      width: 76px; height: 30px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 8px;
      background: #0a0d14;
      opacity: 0.55;
      transition: opacity 0.15s ease;
    }
    #faith-ptt-wave.live { opacity: 1; border-color: rgba(34, 211, 238, 0.35); }
    #faith-ptt-err {
      flex: 1 1 100%;
      display: none;
      font-size: 0.75rem;
      color: #ff9a9a;
    }
    #faith-ptt-err.show { display: block; }
    #faith-ptt-err.show-info { display: block; color: #7df9ff; }
  `;

  const MIC_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="22"/></svg>';

  function injectCSS() {
    if (document.getElementById("faith-ptt-style")) return;
    const s = document.createElement("style");
    s.id = "faith-ptt-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(opts) {
    opts = opts || {};
    injectCSS();

    const input = opts.input || document.getElementById("input");
    const row = opts.row || (input && input.closest("form") ? input.closest("form").querySelector(".composer-row") : null) || document.querySelector(".composer-row");
    const form = (input && input.closest("form")) || document.getElementById("chat-form");
    if (!input || !row) {
      console.warn("[Faith PTT] composer not found (#input + .composer-row).");
      return null;
    }
    if (row.dataset.pttMounted === "1") return row._faithPTT || null;

    const afterEl = opts.after || document.getElementById("clear") || row.lastElementChild;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "faith-ptt-btn";
    btn.innerHTML = MIC_SVG;
    btn.title = "Hold to talk — types into the message box";
    btn.setAttribute("aria-label", "Hold to dictate into the message box");

    const wave = document.createElement("canvas");
    wave.id = "faith-ptt-wave";
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    wave.width = Math.round(76 * dpr);
    wave.height = Math.round(30 * dpr);
    wave.title = "Mic level";

    const err = document.createElement("span");
    err.id = "faith-ptt-err";
    err.setAttribute("aria-live", "polite");

    if (afterEl && afterEl.parentNode === row) {
      afterEl.insertAdjacentElement("afterend", btn);
      btn.insertAdjacentElement("afterend", wave);
      wave.insertAdjacentElement("afterend", err);
    } else {
      row.appendChild(btn);
      row.appendChild(wave);
      row.appendChild(err);
    }

    const S = {
      listening: false,
      recog: null,
      base: "",
      gotResult: false,
      watchdog: 0,
      stream: null,
      streamTried: false,
      ac: null,
      analyser: null,
      waveData: null,
      raf: 0,
      waveT: 0,
      errTimer: 0,
    };

    function showErr(msg, ms) {
      err.textContent = msg;
      err.classList.remove("show-info");
      err.classList.add("show");
      clearTimeout(S.errTimer);
      S.errTimer = setTimeout(() => err.classList.remove("show"), ms || 8000);
    }

    function showInfo(msg, ms) {
      err.textContent = msg;
      err.classList.remove("show");
      err.classList.add("show-info");
      clearTimeout(S.errTimer);
      if (ms) S.errTimer = setTimeout(() => err.classList.remove("show-info"), ms);
    }

    function hideNote() {
      clearTimeout(S.errTimer);
      err.classList.remove("show");
      err.classList.remove("show-info");
    }

    async function ensureWaveStream() {
      if (S.stream || S.streamTried) return S.stream;
      S.streamTried = true;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
        S.stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("mic-timeout")), 4000)),
        ]);
        return S.stream;
      } catch (_) {
        S.stream = null;
        return null;
      }
    }

    function drawFrame() {
      if (!S.listening) return;
      S.raf = requestAnimationFrame(drawFrame);
      S.waveT += 0.08;
      const ctx = wave.getContext("2d");
      const W = wave.width, H = wave.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "#22d3ee"); grad.addColorStop(1, "#a78bfa");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6 * dpr;
      ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 5 * dpr;
      ctx.beginPath();
      for (let x = 0; x < W; x += 2 * dpr) {
        let y;
        if (S.analyser && S.waveData) {
          const i = Math.floor((x / W) * S.waveData.length);
          y = H / 2 + ((S.waveData[i] - 128) / 128) * H * 0.46;
        } else {
          y = H / 2 + Math.sin(x * 0.09 + S.waveT * 2.4) * Math.sin(x * 0.023 - S.waveT) * H * 0.22;
        }
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    async function startWave() {
      wave.classList.add("live");
      const stream = await ensureWaveStream();
      if (stream && !S.analyser) {
        try {
          if (!S.ac) S.ac = new (window.AudioContext || window.webkitAudioContext)();
          if (S.ac.state === "suspended") {
            try { await Promise.race([S.ac.resume(), new Promise((r) => setTimeout(r, 800))]); } catch (_) {}
          }
          const src = S.ac.createMediaStreamSource(stream);
          S.analyser = S.ac.createAnalyser();
          S.analyser.fftSize = 512;
          src.connect(S.analyser);
          S.waveData = new Uint8Array(S.analyser.fftSize);
          const pump = () => {
            if (!S.listening || !S.analyser) return;
            S.analyser.getByteTimeDomainData(S.waveData);
            setTimeout(pump, 50);
          };
          pump();
        } catch (_) { S.analyser = null; }
      }
      if (!S.raf) drawFrame(); // paint one frame now; the loop keeps it alive
    }

    function stopWave() {
      wave.classList.remove("live");
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
      const ctx = wave.getContext("2d");
      ctx.clearRect(0, 0, wave.width, wave.height);
    }

    function rewriteInput(finalText, interimText) {
      input.value = S.base + finalText + interimText;
      try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
    }

    function onResult(e) {
      let fin = "", inter = "";
      try {
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t; else inter += t;
        }
      } catch (_) { return; }
      if (!S.gotResult && (fin || inter)) {
        S.gotResult = true;
        clearTimeout(S.watchdog);
        showInfo("hearing you…");
        console.info("[Faith PTT] first result received");
      }
      rewriteInput(fin, inter);
    }

    function onError(e) {
      const code = (e && e.error) || "";
      console.warn("[Faith PTT] recognition error:", code);
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        showErr("Mic blocked — click the lock/tune icon in the address bar, allow the microphone for this page, then hold again.");
        stop(true);
      } else if (code === "no-speech") {
        showInfo("Didn't catch that — hold and speak clearly.", 3000);
      } else if (code === "network") {
        showErr("Speech service needs network — check connection.", 8000);
        stop(true);
      }
    }

    function onEnd() {
      // Chrome auto-stops on pauses; keep the hold alive by restarting.
      if (!S.listening) return;
      try { S.recog.start(); }
      catch (_) { stop(); }
    }

    async function start() {
      if (S.listening) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        showErr("Voice typing needs Chrome or Edge (this browser has no SpeechRecognition).", 8000);
        console.warn("[Faith PTT] no SpeechRecognition in this browser");
        return;
      }
      S.listening = true;
      S.gotResult = false;
      btn.classList.add("listening");
      S.base = input.value || "";
      if (S.base && !/\s$/.test(S.base)) S.base += " ";
      showInfo("listening… speak now");
      console.info("[Faith PTT] listening started");
      clearTimeout(S.watchdog);
      S.watchdog = setTimeout(() => {
        if (S.listening && !S.gotResult) {
          showInfo("Still hearing nothing — check the mic isn't muted and speak closer.", 6000);
          console.warn("[Faith PTT] 6s with no results (mic silent or wrong input device?)");
        }
      }, 6000);
      startWave(); // not awaited: level meter is best-effort
      try {
        const r = new SR();
        S.recog = r;
        r.continuous = true;
        r.interimResults = true;
        try { r.lang = navigator.language || "en-US"; } catch (_) {}
        r.onresult = onResult;
        r.onerror = onError;
        r.onend = onEnd;
        r.start();
      } catch (e2) {
        S.listening = false;
        btn.classList.remove("listening");
        stopWave();
        showErr("Could not start voice typing: " + (e2 && e2.message ? e2.message : e2));
      }
    }

    function stop(quiet) {
      if (!S.listening) return;
      S.listening = false;
      clearTimeout(S.watchdog);
      btn.classList.remove("listening");
      try { if (S.recog) S.recog.stop(); } catch (_) {}
      S.recog = null;
      stopWave();
      if (!quiet) {
        if (!S.gotResult) showInfo("Heard nothing — hold longer and speak clearly.", 5000);
        else hideNote();
        try {
          input.focus();
          const n = input.value.length;
          input.setSelectionRange(n, n);
        } catch (_) {}
      }
      console.info("[Faith PTT] stopped, gotResult=" + S.gotResult);
    }

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      start();
    });
    btn.addEventListener("pointerup", () => stop());
    btn.addEventListener("pointercancel", () => stop());
    btn.addEventListener("pointerleave", () => { if (S.listening) stop(); });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("blur", () => stop());
    btn.addEventListener("keydown", (e) => {
      if ((e.code === "Space" || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        start();
      }
    });
    btn.addEventListener("keyup", (e) => {
      if (e.code === "Space" || e.key === "Enter") stop();
    });
    if (form) form.addEventListener("submit", () => stop(true));

    row.dataset.pttMounted = "1";
    const api = { start, stop, button: btn, wave, isListening: () => S.listening, _gotResult: () => S.gotResult };
    row._faithPTT = api;
    lastApi = api;
    console.info("[Faith PTT] mounted (button after #" + (afterEl && afterEl.id ? afterEl.id : "?") + ")");
    return api;
  }

  let lastApi = null;

  function debug() {
    return {
      hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      secureContext: (typeof window.isSecureContext === "undefined") ? "unknown" : window.isSecureContext,
      protocol: location.protocol,
      mounted: !!lastApi,
      listening: lastApi ? lastApi.isListening() : false,
      gotResult: lastApi ? lastApi._gotResult() : false,
    };
  }

  function tryMount() {
    try {
      if (document.getElementById("input") && document.querySelector(".composer-row")) mount();
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryMount);
  } else {
    tryMount();
  }

  window.FaithPTT = { mount, debug };
})();
