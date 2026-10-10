const FAITH_CLIENT_VERSION = "75-image-fallback-timeout-fix";
const expressionImages = {
  ruby: "/assets/ruby_wrench.png",
  thinking: "/assets/thinking.PNG",
  explanation: "/assets/explanation.PNG",
  confusion: "/assets/confusion.PNG",
  greeting: "/assets/greeting.PNG",
  painting: "/assets/painting.PNG",
  observing: "/assets/observing.PNG",
  troubleshooting: "/assets/troubleshooting.PNG",
  coding: "/assets/coding.PNG",
  build: "/assets/build.png",
  robotic: "/assets/robotic.PNG",
  psychotic: "/assets/psychotic.PNG",
  sad: "/assets/sad.PNG",
  anger: "/assets/anger.PNG"
};

const expressionNames = {
  ruby: "Ruby / Wrench",
  thinking: "Thinking",
  explanation: "Explanation",
  confusion: "Confusion",
  greeting: "Greeting",
  painting: "Painting",
  observing: "Observing",
  troubleshooting: "Troubleshooting",
  coding: "Coding",
  build: "Build",
  robotic: "Robotic",
  psychotic: "Psychotic",
  sad: "Sad",
  anger: "Anger"
};

const expressionDetails = {
  ruby: "Ready",
  thinking: "Thinking...",
  explanation: "Explaining...",
  confusion: "Something seems unclear",
  greeting: "Hello!",
  painting: "Creating your image...",
  observing: "Examining your upload...",
  troubleshooting: "Troubleshooting...",
  coding: "Coding...",
  build: "Building from the ground up...",
  robotic: "Processing...",
  psychotic: "Something is watching...",
  sad: "I'm here with you",
  anger: "Don't talk to me like that."
};

// Mirror server.rb's deterministic classifier for the three states handled by
// the dedicated emotion GGUF. Keep this routing after Build/Troubleshooting
// branches, which must retain their existing priority.
function faithEmotionRoute(question) {
  const raw = String(question || "").trim();
  const normalized = raw.toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suicidalTerms = /\b(?:suicid(?:e|al)|kill myself|killing myself|killed myself|end it all|ending it all|end my life|ending my life|take my own life|taking my own life|want to die|wanna die|wish i was dead|wish i were dead|better off dead|don't want to be alive|do not want to be alive|dont want to be alive|don't wanna be alive|do not wanna be alive|cant go on|can't go on|cannot go on|no reason to live|nothing to live for|hurt myself|hurting myself|harm myself|harming myself|self harm|self-harm|self harming|self-harming|want to disappear forever)\b/i;
  if (suicidalTerms.test(normalized)) return "sad";

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

// ---- Perchance browser-side image generation (perchance-ai-api) ----
// Ruby can't run text-to-image-plugin (browser GPU + JS). Backend returns
// `image_prompt`, browser generates here via hidden iframe + postMessage.
let _perchanceWarmed = false;
const _perchanceCache = {};

function warmUpPerchance() {
  return new Promise((res) => {
    if (_perchanceWarmed) return res(true);
    try {
      const f = document.createElement("iframe");
      f.style.cssText = "width:1px;height:1px;border:0;position:absolute;opacity:0;pointer-events:none;";
      f.src = "https://perchance.org";
      f.setAttribute("aria-hidden", "true");
      const t = setTimeout(() => { try { f.remove(); } catch (_) {} res(false); }, 15000);
      f.onload = () => {
        clearTimeout(t);
        setTimeout(() => { try { f.remove(); } catch (_) {} _perchanceWarmed = true; res(true); }, 500);
      };
      f.onerror = () => { clearTimeout(t); try { f.remove(); } catch (_) {} res(false); };
      document.body.appendChild(f);
    } catch (_) {
      res(false);
    }
  });
}

const FAITH_PERCHANCE_TIMEOUT_MS = (() => {
  const configured = Number(window.FAITH_PERCHANCE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 30000
    ? Math.min(configured, 1800000)
    : 300000; // 5 minutes by default; may be overridden by the host page.
})();

function generateImageViaPerchance(prompt, opts = {}) {
  const key = String(prompt) + JSON.stringify(opts || {});
  if (_perchanceCache[key]) return Promise.resolve({ ok: true, url: _perchanceCache[key], cached: true });

  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      prompt: String(prompt),
      format: "json",
      id: Math.random().toString(36).slice(2)
    });
    const defaults = { resolution: "768x768", guidanceScale: "7" };
    const merged = Object.assign({}, defaults, opts || {});
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    });

    const f = document.createElement("iframe");
    f.style.cssText = "width:1px;height:1px;border:0;position:absolute;opacity:0;pointer-events:none;";
    f.setAttribute("aria-hidden", "true");
    f.src = "https://perchance.org/perchance-ai-api?" + params.toString();

    let settled = false;
    const finish = (cb, val) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMsg);
      try { f.remove(); } catch (_) {}
      cb(val);
    };

    function onMsg(e) {
      const d = e.data || {};
      if (d.api !== "perchance-image-api" || !d.result || d.result.id !== params.get("id")) return;
      if (d.result.ok && d.result.url) {
        _perchanceCache[key] = d.result.url;
        finish(resolve, d.result);
      } else {
        finish(reject, new Error((d.result && d.result.error) || "image generation failed"));
      }
    }

    window.addEventListener("message", onMsg);
    document.body.appendChild(f);
    setTimeout(() => finish(reject, new Error(`Perchance image generation timed out after ${Math.round(FAITH_PERCHANCE_TIMEOUT_MS / 1000)}s`)), FAITH_PERCHANCE_TIMEOUT_MS);
  });
}

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
  if (!expressionImages[name]) return;

  // Update the caption immediately. Repeated status/token events for the same
  // expression must not restart the image fade timer; doing so made Build
  // appear to flicker between the old and new expression.
  status.textContent = expressionNames[name];
  detail.textContent = customDetail || expressionDetails[name];

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

  appendImages(item, images, options.onGeneratedStateChange);

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
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

      // Qwen is finished at this exact point. Do not wait for Wikimedia or
      // source research before returning Faith to her normal Explanation mode.
      // Those are post-message enrichments and must never control her expression.
      const completedExpression = [
        "robotic", "psychotic", "sad", "anger",
        "greeting", "thinking", "explanation", "confusion",
        "troubleshooting", "observing", "coding", "build"
      ].includes(event.expression) ? event.expression : "explanation";
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
    isImageUpload ? "observing" : (sessionMode === "troubleshooting" ? "troubleshooting" : "thinking"),
    isImageUpload ? "Checking vision files..." : (sessionMode === "troubleshooting" ? "Sending your file and change request to Faith…" : "Reading file...")
  );

  // Render the user's comment and attachment card together as one user message.
  // No standalone "Sent - filename" chat message is created.
  appendAttachmentMessage("You", file, {
    comment: question || (isImageUpload ? "Image attachment" : `Attached ${file.name}`),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size
  });

  let visionDownloads = [];
  try {
    // IMPORTANT: ONLY image uploads use the optional local vision preflight.
    // Text/source files (.py, .java, .js, etc.) use Faith's independent local
    // file-observer pipeline and must never be blocked by missing GGUF files.
    if (isImageUpload) {
      const visionAbort = new AbortController();
      const visionTimeout = setTimeout(() => visionAbort.abort(), 5000);
      let visionResponse;
      try {
        visionResponse = await fetch(`/api/vision-status?ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: visionAbort.signal
        });
      } finally {
        clearTimeout(visionTimeout);
      }

      let visionStatus;
      try {
        visionStatus = await visionResponse.json();
      } catch (_) {
        throw new Error("Faith returned an invalid vision-status response. Please restart Faith with the latest version.");
      }

      visionDownloads = Array.isArray(visionStatus.download_urls) ? visionStatus.download_urls : [];
      if (!visionDownloads.length) {
        visionDownloads = [
          { filename: visionStatus.model_filename || FAITH_VISION_DOWNLOADS[0].filename, url: visionStatus.download_url || FAITH_VISION_DOWNLOADS[0].url },
          { filename: visionStatus.mmproj_filename || FAITH_VISION_DOWNLOADS[1].filename, url: visionStatus.mmproj_download_url || FAITH_VISION_DOWNLOADS[1].url }
        ];
      }

      if (!visionStatus.model_installed || !visionStatus.mmproj_installed) {
        const missingParts = [];
        if (!visionStatus.model_installed) missingParts.push(visionStatus.model_filename || "gemma-3-4b-it-Q4_K_M.gguf");
        if (!visionStatus.mmproj_installed) missingParts.push(visionStatus.mmproj_filename || "mmproj-model-f16.gguf");
        const error = new Error(`Faith cannot describe images yet. Missing required vision file${missingParts.length === 1 ? "" : "s"}: ${missingParts.join(", ")}.`);
        error.visionDownloads = visionDownloads;
        throw error;
      }

      setExpression("observing", "Reading your upload...");
    }

    setUploadStatus(`Sending: ${file.name}`);
    // Images still use the existing data-URL transport for the vision pipeline.
    // Source/code files are deliberately sent as plain UTF-8 text instead: the
    // coding pipeline has no reason to receive a Base64 representation at all.
    const dataUrl = isImageUpload ? await readFileAsDataUrl(file) : null;
    const sourceText = isImageUpload ? null : await readFileAsText(file);

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
  // existing Perchance/Pollinations image-generation pipeline. They must never
  // enter the direct Qwen chat relay.
  return /\bpaint\s+a\b/i.test(value) || /\bgenerate\s+a\b/i.test(value);
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
    const isSimpleChat = !isTroubleshootingPrompt && sessionMode === "idle" &&
      !isFaithImageGenerationPhrase(question) &&
      !/\b(?:generate|create|draw|paint|make)\b[\s\S]*\b(?:image|picture|photo|art)\b/i.test(question) &&
      !/\b(?:upload|file|code|debug|troubleshoot)\b/i.test(question);

    const isImageGeneration = isFaithImageGenerationPhrase(question) ||
      /\b(?:generate|create|draw|paint|make|render|illustrate|design|sketch)\b[\s\S]*\b(?:image|picture|photo|art|portrait|drawing|painting|scene|wallpaper)\b/i.test(question);
    const dedicatedEmotion = isSimpleChat ? faithEmotionRoute(question) : null;

    // Emotion trigger prompts must go directly to the dedicated :8070 model.
    // Image generation, Build, and Troubleshooting retain their existing routes.
    const endpoint = isImageGeneration
      ? "/api/imagegen"
      : (dedicatedEmotion ? "/api/emotions" : (isSimpleChat ? "/api/qwen-chat" : "/api/chat"));

    // Normal chat can take a while while Qwen/llama-server generates the
    // response. Show an explicit relay status and a live elapsed-time counter
    // so the user always knows Faith is waiting on the local AI backend.
    // Image generation and other specialized routes keep their own loaders.
    if (isSimpleChat) {
      qwenRelayLoading = appendQwenRelayLoadingMessage(
        dedicatedEmotion
          ? `Getting response from Faith's ${dedicatedEmotion} model on :8070...`
          : "Getting response from Qwen and llama_server..."
      );

      // START WIKIMEDIA AT THE SAME TIME AS QWEN. Do not wait for the first
      // token, a complete answer, or Explanation mode. The search now gets the
      // full Qwen generation window to find relevant Commons images.
      if (isSimpleChat && !dedicatedEmotion) wikimediaPreflight = (async () => {
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

    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      signal: chatController.signal,
      body: JSON.stringify({ question })
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
        body: JSON.stringify({ question })
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
      if (data && data.post_enrichment && streamedFaithItem) {
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

    // A server-side failure may intentionally return generated-pending so
    // the browser can try Perchance. Do not convert that fallback handoff into
    // an immediate rate-limit error.
    const generatedImages = Array.isArray(data.images)
      ? data.images.filter((image) => image && image.type === "generated" && image.url)
      : [];

    const pendingPrompt = typeof data.image_prompt === "string" ? data.image_prompt.trim() : "";
    const isPendingGenerated =
      (data.image_mode === "generated-pending" || data.image_mode === "generated") &&
      pendingPrompt.length > 0 &&
      generatedImages.length === 0;

    // Painting is ONLY allowed when the server explicitly confirms an
    // AI-generation mode or actually returns a generated image.  Never trust
    // `data.expression === "painting"` by itself, because a normal chat
    // response must stay in Explanation/Thinking/etc.
    const isGeneratedRequest =
      data.image_mode === "generated" ||
      data.image_mode === "generated-pending" ||
      generatedImages.length > 0;

    // Wikimedia Commons results are always type="photo" and image_mode is
    // "photo" or "wikimedia". They must NEVER switch Faith into Painting.
    const isWikimediaOnly =
      data.image_mode === "photo" ||
      data.image_mode === "wikimedia" ||
      (Array.isArray(data.images) && data.images.length > 0 && generatedImages.length === 0);

    const shouldPaint = isGeneratedRequest && !isWikimediaOnly;

    requestModeConfirmed = true;

    if (data.session_mode === "build") sessionMode = "build";
    else if (data.session_mode === "coding") sessionMode = "coding";
    else if (data.session_mode === "troubleshooting" || isTroubleshootingPrompt) sessionMode = "troubleshooting";
    else if (data.session_mode === "idle") sessionMode = "idle";

    if (shouldPaint) {
      // This is the actual Paint Me / image-generation path. Use the Painting
      // expression consistently for both server-side and browser-side generation.
      setExpression(
        "painting",
        isPendingGenerated ? "Generating image..." : (generatedImages.length ? "Image ready" : "Creating your image...")
      );
      if (isPendingGenerated) {
        loadingMessage = appendLoadingMessage(`Generating "${pendingPrompt.slice(0, 80)}"…`);
      }
    } else {
      // A backend expression of "painting" is ignored unless image_mode
      // confirmed an actual generation request above.
      const normalExpression = ["robotic", "psychotic", "sad", "anger"].includes(data.expression)
        ? data.expression
        : (sessionMode === "build"
          ? "build"
          : (sessionMode === "coding"
          ? "coding"
          : (sessionMode === "troubleshooting"
            ? "troubleshooting"
            : (isTroubleshootingPrompt
              ? "troubleshooting"
              : (["greeting", "thinking", "explanation", "confusion", "troubleshooting", "observing"].includes(data.expression)
                ? data.expression
                : "explanation")))));
      setExpression(normalExpression);
    }

    if (!shouldPaint) {
      removeLoadingMessage(loadingMessage);
      loadingMessage = null;
    }

    const responseImages = (sessionMode === "troubleshooting" || sessionMode === "coding") ? [] : (data.images || []);
    const faithItem = streamedFaithItem || appendMessage("Faith", data.answer, "ai", responseImages, {
      onGeneratedStateChange: (remaining, loaded) => {
        // Pending Perchance flow manages its own loadingMessage below - ignore backend callbacks with 0 images.
        if (isPendingGenerated) return;
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

    // Browser-side fallback (only when server-side download failed and it
    // sent image_prompt + generated-pending). Primary path is server-side
    // /generated/* URLs handled above via data.images.
    if (isPendingGenerated) {
      // Release input so the user can keep chatting while the fallback generates.
      setBusy(false);
      const t0 = Date.now();
      updateLoadingMessage(loadingMessage, `Generating "${pendingPrompt.slice(0, 80)}" (0s, up to ${Math.round(FAITH_PERCHANCE_TIMEOUT_MS / 1000)}s)…`);
      const tick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        updateLoadingMessage(loadingMessage, `Generating "${pendingPrompt.slice(0, 80)}" (${s}s, up to ${Math.round(FAITH_PERCHANCE_TIMEOUT_MS / 1000)}s)…`);
      }, 5000);
      try {
        const result = await generateImageViaPerchance(pendingPrompt, {
          resolution: data.image_resolution || "768x768",
          guidanceScale: data.image_guidance || "7",
          ...(data.image_seed !== undefined && data.image_seed !== null ? { seed: String(data.image_seed) } : {})
        });
        clearInterval(tick);
        appendImages(faithItem, [{
          url: result.url,
          original_url: result.url,
          title: pendingPrompt.slice(0, 120),
          source: "Faith / Perchance",
          type: "generated"
        }]);
        chat.scrollTop = chat.scrollHeight;
        updateLoadingMessage(loadingMessage, "Image ready");
        setExpression("painting", result.cached ? "Image ready (cached)" : "Image ready");
      } catch (genError) {
        clearInterval(tick);
        console.warn("Perchance fallback failed:", genError);
        appendMessage("Faith", "I tried both the server image generator and the browser-side Perchance fallback for \"" + pendingPrompt.slice(0, 120) + "\", but generation failed (" + genError.message + "). Check the Faith server log for provider details, then try again.", "ai");
      } finally {
        clearInterval(tick);
        removeLoadingMessage(loadingMessage);
        loadingMessage = null;
      }
      return;
    }

    if (isGeneratedRequest && generatedImages.length === 0 && !isPendingGenerated) {
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
  if (!busy) fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (file) await uploadFileToFaith(file);
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
  sessionMode = "idle";
  troubleshootingDiagnosisReady = false;
  pendingCodeFile = null;
  setUploadStatus("No file selected", false);
  setExpression("ruby", "Clearing conversation and cancelling stale Build responses…");

  try {
    const response = await fetch("/api/clear", {
      method: "POST",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
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

setExpression("ruby", "Ready");
warmUpPerchance();
input.focus();
