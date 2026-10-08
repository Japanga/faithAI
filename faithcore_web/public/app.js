const FAITH_CLIENT_VERSION = "63-parallel-wikimedia-during-qwen";
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
  robotic: "Processing...",
  psychotic: "Something is watching...",
  sad: "I'm here with you",
  anger: "Don't talk to me like that."
};

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
    setTimeout(() => finish(reject, new Error("image timeout after 900s")), 900000);
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

function setExpression(name, customDetail = null) {
  if (!expressionImages[name]) return;

  expression.classList.add("swap");

  window.setTimeout(() => {
    expression.src = expressionImages[name];
    expression.alt = `${expressionNames[name]} expression`;
    status.textContent = expressionNames[name];
    detail.textContent = customDetail || expressionDetails[name];
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

    if (line.startsWith("```") || line.startsWith("<code>")) {
      flushParagraph();
      closeList();

      const fenced = line.startsWith("```");
      const closeToken = fenced ? "```" : "</code>";
      let firstCodeLine = fenced
        ? line.replace(/^```[^\s]*\s*/, "")
        : line.replace(/^<code>\s*/, "");
      const codeLines = [];
      if (firstCodeLine) codeLines.push(firstCodeLine);
      i += 1;

      while (i < lines.length) {
        const codeLine = lines[i];
        if (codeLine.trim() === closeToken) {
          i += 1;
          break;
        }
        codeLines.push(codeLine);
        i += 1;
      }

      output.push(`<pre class="faith-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
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

function appendQwenRelayLoadingMessage() {
  const item = appendLoadingMessage("Getting response from Qwen and llama_server... (0s)");
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    updateLoadingMessage(item, `Getting response from Qwen and llama_server... (${seconds}s)`);
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
        "troubleshooting", "observing", "coding"
      ].includes(event.expression) ? event.expression : "explanation";
      if (event.session_mode === "coding") sessionMode = "coding";
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
  clear.disabled = value;
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
  textNode.textContent = (meta && meta.status) || "Uploaded file";
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
  button.textContent = "Fix Code";
  button.title = "Apply Faith's troubleshooting diagnosis to the uploaded source file";
  button.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    sessionMode = "coding";
    setExpression("coding", "Applying the fix...");
    button.disabled = true;

    try {
      const response = await fetch("/api/fix-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Fix the diagnosed problem in the uploaded code and return the completed corrected file." })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      sessionMode = "coding";
      setExpression("coding", "Code fixed");
      const faithItem = appendMessage("Faith", data.answer || "I fixed the code and prepared the completed file.", "ai");
      if (data.attachment && data.attachment.url) {
        const link = document.createElement("a");
        link.href = data.attachment.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Open fixed file: ${data.filename || data.attachment.name || "fixed source"}`;
        link.style.display = "inline-block";
        link.style.marginTop = "8px";
        faithItem.appendChild(link);
      }
    } catch (error) {
      sessionMode = "troubleshooting";
      setExpression("troubleshooting", "Fix could not be completed");
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

async function uploadFileToFaith(file) {
  if (busy || !file) return;

  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    setUploadStatus(`Too large: ${file.name}`);
    setExpression("confusion", "Upload too large");
    appendMessage("Error", `“${file.name}” is too large. Faith accepts uploads up to 12 MB.`, "error");
    return;
  }

  const question = input.value.trim();
  input.value = "";
  const isImageUpload = String(file.type || "").toLowerCase().startsWith("image/");

  setUploadStatus(`Selected: ${file.name}`);
  setBusy(true);
  setExpression(isImageUpload ? "observing" : "thinking", isImageUpload ? "Checking vision files..." : "Reading file...");

  appendAttachmentMessage("You", file, {
    status: question ? `Uploading with question: ${question}` : "Uploading to Faith..."
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
    } else {
      setExpression("observing", "Examining your file...");
    }

    const uploadCards = chat.querySelectorAll(".message-attachment");
    const lastUploadCard = uploadCards[uploadCards.length - 1];
    if (lastUploadCard) {
      const parentMessage = lastUploadCard.closest(".message");
      const messageText = parentMessage && parentMessage.querySelector(".message-text");
      if (messageText) messageText.textContent = "Sent to Faith for analysis";
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
      offer.style.gap = "8px";
      const offerText = document.createElement("span");
      offerText.textContent = "Would you like me to troubleshoot this code?";
      const troubleshootButton = document.createElement("button");
      troubleshootButton.type = "button";
      troubleshootButton.textContent = "Troubleshoot";
      troubleshootButton.addEventListener("click", () => {
        input.value = `Please troubleshoot the uploaded code file ${file.name}. Search the web for matching errors and known fixes.`;
        submitQuestion();
      });
      offer.append(offerText, troubleshootButton);
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

function isDirectCodeFixRequest(question) {
  const text = String(question || "");
  return /\b(?:fix|repair|correct|modify|change|edit|update|patch|resolve)\b[\s\S]*\b(?:code|file|source|error|bug|issue|problem)\b/i.test(text) ||
    /\b(?:can|could|will|would)\b[\s\S]*\b(?:you|faith)\b[\s\S]*\b(?:fix|repair|correct|modify|change|edit|patch)\b[\s\S]*\b(?:code|file|it|this)\b/i.test(text);
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

async function submitQuestion() {
  if (busy) return;

  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  appendMessage("You", question, "you");

  // In an active troubleshooting session, natural requests such as
  // “can you fix the code yourself?” are the same action as the Fix Code button.
  if (sessionMode === "troubleshooting" && isDirectCodeFixRequest(question)) {
    setBusy(true);
    sessionMode = "coding";
    setExpression("coding", "Applying the fix...");
    try {
      const fixResponse = await fetch("/api/fix-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const fixData = await fixResponse.json();
      if (!fixResponse.ok) throw new Error(fixData.error || `HTTP ${fixResponse.status}`);
      sessionMode = "coding";
      setExpression("coding", "Code fixed");
      const fixedItem = appendMessage("Faith", fixData.answer || "I fixed the code and prepared the completed file.", "ai");
      if (fixData.attachment && fixData.attachment.url) {
        const link = document.createElement("a");
        link.href = fixData.attachment.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Open fixed file: ${fixData.filename || fixData.attachment.name || "fixed source"}`;
        link.style.display = "inline-block";
        link.style.marginTop = "8px";
        fixedItem.appendChild(link);
      }
    } catch (error) {
      sessionMode = "troubleshooting";
      setExpression("troubleshooting", "Fix could not be completed");
      appendMessage("Error", error.message, "error");
    } finally {
      setBusy(false);
      input.focus();
    }
    return;
  }

  setBusy(true);
  const isTroubleshootingPrompt = /\b(?:troubleshoot|troubleshooting|debug|debugging)\b/i.test(question);
  setExpression(isTroubleshootingPrompt ? "troubleshooting" : "thinking");

  // Do NOT show an image-generation message until the server confirms that
  // this is actually an image-generation request. Normal chat and real-photo
  // requests must never display "Generating your image...".
  let loadingMessage = null;
  let qwenRelayLoading = null;
  let requestModeConfirmed = false;
  let wikimediaPreflight = null;

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

    // IMAGE GENERATION HAS ITS OWN PIPE. It must never enter the Qwen chat relay.
    // This is especially important for Perchance/Pollinations requests.
    const endpoint = isImageGeneration ? "/api/imagegen" : (isSimpleChat ? "/api/qwen-chat" : "/api/chat");

    // Normal chat can take a while while Qwen/llama-server generates the
    // response. Show an explicit relay status and a live elapsed-time counter
    // so the user always knows Faith is waiting on the local AI backend.
    // Image generation and other specialized routes keep their own loaders.
    if (isSimpleChat) {
      qwenRelayLoading = appendQwenRelayLoadingMessage();

      // START WIKIMEDIA AT THE SAME TIME AS QWEN. Do not wait for the first
      // token, a complete answer, or Explanation mode. The search now gets the
      // full Qwen generation window to find relevant Commons images.
      wikimediaPreflight = (async () => {
        try {
          const response = await fetch(`/api/qwen-wikimedia?ts=${Date.now()}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Cache-Control": "no-cache"
            },
            cache: "no-store",
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
      body: JSON.stringify({ question })
    });

    // If a stale server/proxy does not know /api/qwen-chat, immediately retry
    // ordinary chat through /api/chat. server.rb contains the same direct-Qwen
    // compatibility guard, so this cannot fall into the slow Faith pipeline.
    if ((isSimpleChat || isImageGeneration) && (response.status === 404 || response.status === 405)) {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
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

    if (data.session_mode === "coding") sessionMode = "coding";
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
        : (sessionMode === "coding"
          ? "coding"
          : (sessionMode === "troubleshooting"
            ? "troubleshooting"
            : (isTroubleshootingPrompt
              ? "troubleshooting"
              : (["greeting", "thinking", "explanation", "confusion", "troubleshooting", "observing"].includes(data.expression)
                ? data.expression
                : "explanation"))));
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
      updateLoadingMessage(loadingMessage, `Generating "${pendingPrompt.slice(0, 80)}" (0s, up to 180s)…`);
      const tick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        updateLoadingMessage(loadingMessage, `Generating "${pendingPrompt.slice(0, 80)}" (${s}s, up to 180s)…`);
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
        appendMessage("Faith", "I tried to generate \"" + pendingPrompt.slice(0, 120) + "\" but the image service failed (" + genError.message + "). The server log will have Faith pollinations error details. Try again in a minute.", "ai");
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
    setBusy(false);
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
  if (busy) return;

  try {
    const response = await fetch("/api/clear", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    chat.innerHTML = "";
    sessionMode = "idle";
    setUploadStatus("No file selected", false);
    setExpression("ruby", "Ready");
    input.focus();
  } catch (error) {
    setExpression("confusion", "Could not clear memory");
    appendMessage("Error", error.message, "error");
  }
});

setExpression("ruby", "Ready");
warmUpPerchance();
input.focus();
