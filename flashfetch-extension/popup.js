// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_API = "https://rag-document-qa-bot-production.up.railway.app";

// ─── State ─────────────────────────────────────────────────────────────────────
let conversationHistory = [];
let activeFileContext   = null; // { text, filename } — set when a file is open

// ─── DOM ───────────────────────────────────────────────────────────────────────
const authScreen    = document.getElementById("auth-screen");
const chatScreen    = document.getElementById("chat-screen");
const tokenInput    = document.getElementById("token-input");
const apiUrlInput   = document.getElementById("api-url-input");
const saveTokenBtn  = document.getElementById("save-token-btn");
const messagesEl    = document.getElementById("messages");
const questionInput = document.getElementById("question-input");
const sendBtn       = document.getElementById("send-btn");
const savePageBtn   = document.getElementById("save-page-btn");
const logoutBtn     = document.getElementById("logout-btn");
const statusBar     = document.getElementById("status-bar");
const fileBanner    = document.getElementById("file-banner");
const fileBannerName = document.getElementById("file-banner-name");
const fileBannerClear = document.getElementById("file-banner-clear");

// ─── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(["ff_token", "ff_api_url", "ff_prefill"], (data) => {
  if (data.ff_token) {
    showChat();
    detectOpenFile(); // auto-detect file on open
  } else {
    showAuth();
  }

  if (data.ff_prefill) {
    questionInput.value = data.ff_prefill;
    chrome.storage.local.remove("ff_prefill");
    setTimeout(() => sendQuestion(), 300);
  }
});

// ─── Auto-detect open file / Drive / PDF URL ──────────────────────────────────
function detectOpenFile() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    const url      = tab.url;
    const isFile   = url.startsWith("file://");
    const rawName  = url.split("/").pop().split("?")[0] || "document";
    const fileName = decodeURIComponent(rawName);

    // ── Google Drive / Docs / Slides / PDF URL ────────────────────────────
    const isDrive = url.includes("drive.google.com") || url.includes("docs.google.com");
    const isPDFUrl = !isFile && url.toLowerCase().endsWith(".pdf");

    if (isDrive || isPDFUrl) {
      loadFromUrl(url, isDrive ? "Google Drive" : fileName);
      return;
    }

    // ── Local file via file:// ─────────────────────────────────────────────
    if (isFile) {
      const isPDF = fileName.toLowerCase().endsWith(".pdf");
      if (isPDF) {
        // local PDF: use backend to fetch and extract
        loadFromUrl(url, fileName);
      } else {
        // plain text file — read via content script directly, no backend needed
        chrome.tabs.sendMessage(tab.id, { action: "getFileContext" }, (res) => {
          if (chrome.runtime.lastError || !res || !res.text) {
            chrome.scripting.executeScript(
              { target: { tabId: tab.id }, files: ["content.js"] },
              () => {
                if (chrome.runtime.lastError) return;
                chrome.tabs.sendMessage(tab.id, { action: "getFileContext" }, (res2) => {
                  if (res2 && res2.text) setFileContext(res2);
                });
              }
            );
            return;
          }
          setFileContext(res);
        });
      }
    }
  });
}

// ── Load any URL via backend /extract-url ────────────────────────────────────
function loadFromUrl(url, label) {
  chrome.storage.local.get(["ff_token", "ff_api_url"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;

    clearEmptyState();
    showLoadingBanner(label);
    setStatus(`Reading ${label}…`);

    try {
      const headers = { "Content-Type": "application/json" };
      if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;

      const res = await fetch(`${apiUrl}/extract-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      const json = await res.json();
      hideStatus();

      setFileContext({
        title:    json.filename,
        text:     json.text,
        fileType: json.filename.toLowerCase().endsWith(".pdf") ? "pdf" : "txt",
      });

    } catch (err) {
      hideStatus();
      hideBanner();
      clearEmptyState();
      appendPDFHelp(label, err.message);
    }
  });
}

function showLoadingBanner(label) {
  fileBannerName.textContent = `⏳ Loading ${label}…`;
  fileBanner.classList.remove("hidden");
}

function setFileContext(res) {
  activeFileContext = { text: res.text, filename: res.title };
  showFileBanner(res.title, res.fileType);
  clearEmptyState();
  appendMessage("assistant",
    `📄 I've read "${res.title}" (${Math.ceil(res.text.length / 1000)}k chars). Ask me anything about it!`
  );
  questionInput.focus();
}

function appendPDFHelp(fileName, errorMsg) {
  const div = document.createElement("div");
  div.className = "msg assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (errorMsg && errorMsg.includes("Anyone with the link")) {
    bubble.innerHTML = `
      <strong>📕 ${fileName}</strong><br/><br/>
      <strong>Google Drive file is not public.</strong><br/><br/>
      To fix: Right-click the file in Drive → Share → <em>"Anyone with the link"</em> can view → Copy link → try again.
    `;
  } else if (errorMsg) {
    bubble.innerHTML = `
      <strong>📕 ${fileName}</strong><br/><br/>
      Could not read this document: <em>${errorMsg}</em><br/><br/>
      Make sure the file is publicly shared or try uploading it directly using the ⬆ button.
    `;
  } else {
    bubble.innerHTML = `
      <strong>📕 ${fileName}</strong><br/><br/>
      Chrome's PDF viewer blocks extensions from reading PDF text.<br/><br/>
      <strong>Options:</strong><br/>
      • Open a <strong>Google Drive link</strong> instead — FlashFetch reads it instantly<br/>
      • Click <strong>⬆</strong> above to upload this PDF to your document library
    `;
  }

  div.appendChild(bubble);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── File banner ───────────────────────────────────────────────────────────────
function showFileBanner(filename, fileType) {
  const icon = fileType === "pdf" ? "📕" : fileType === "webpage" ? "🌐" : "📄";
  fileBannerName.textContent = `${icon} ${filename}`;
  fileBanner.classList.remove("hidden");
}

function hideBanner() {
  fileBanner.classList.add("hidden");
}

fileBannerClear.addEventListener("click", () => {
  activeFileContext = null;
  fileBanner.classList.add("hidden");
  setStatus("Switched back to uploaded documents", "success");
  setTimeout(() => hideStatus(), 2000);
});

// ─── Auth ──────────────────────────────────────────────────────────────────────
function showAuth() {
  authScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

function showChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  questionInput.focus();
}

saveTokenBtn.addEventListener("click", () => {
  const token  = tokenInput.value.trim();
  const apiUrl = apiUrlInput.value.trim() || DEFAULT_API;
  if (!token) { setStatus("Paste your JWT token first", "error"); return; }
  chrome.storage.local.set({ ff_token: token, ff_api_url: apiUrl }, () => {
    showChat();
    detectOpenFile();
    setStatus("Connected ✓", "success");
    setTimeout(() => hideStatus(), 2000);
  });
});

logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["ff_token", "ff_api_url"], () => {
    conversationHistory = [];
    activeFileContext   = null;
    showAuth();
  });
});

// ─── Messaging ────────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", sendQuestion);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
});

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    questionInput.value = chip.dataset.q;
    sendQuestion();
  });
});

async function sendQuestion() {
  const question = questionInput.value.trim();
  if (!question) return;

  chrome.storage.local.get(["ff_token", "ff_api_url"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;

    clearEmptyState();
    appendMessage("user", question);
    questionInput.value = "";
    sendBtn.disabled = true;

    conversationHistory.push({ role: "user", content: question });
    const historyToSend = conversationHistory.slice(-8);
    const typingId = appendTyping();

    try {
      const headers = { "Content-Type": "application/json" };
      if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;

      let endpoint, body;

      if (activeFileContext) {
        // ── Use inline file context (no FAISS lookup needed) ──
        endpoint = `${apiUrl}/ask-with-context`;
        body = JSON.stringify({
          question,
          context_text: activeFileContext.text,
          filename:     activeFileContext.filename,
          history:      historyToSend.slice(0, -1),
        });
      } else {
        // ── Normal RAG query against uploaded docs ────────────
        endpoint = `${apiUrl}/ask`;
        body = JSON.stringify({
          question,
          history: historyToSend.slice(0, -1),
        });
      }

      const res = await fetch(endpoint, { method: "POST", headers, body });
      removeTyping(typingId);

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const json       = await res.json();
      const answer     = json.answer    || "No answer returned.";
      const confidence = json.confidence || "low";
      const sources    = json.sources    || [];

      appendMessage("assistant", answer, confidence, sources);
      conversationHistory.push({ role: "assistant", content: answer });

    } catch (err) {
      removeTyping(typingId);
      appendMessage("assistant", `Error: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      questionInput.focus();
    }
  });
}

// ─── Save current page / upload PDF ──────────────────────────────────────────
savePageBtn.addEventListener("click", async () => {
  chrome.storage.local.get(["ff_token", "ff_api_url"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url) { setStatus("Cannot read this tab", "error"); return; }

      const url      = tab.url;
      const isPDF    = url.toLowerCase().endsWith(".pdf");
      const isFile   = url.startsWith("file://");
      const rawName  = url.split("/").pop().split("?")[0] || "document";
      const fileName = decodeURIComponent(rawName);

      // ── PDF or any local file: use fetch(file://) to read bytes ──────────
      if (isFile) {
        setStatus(`Reading ${fileName}…`);
        try {
          const fileRes  = await fetch(url);
          const blob     = await fileRes.blob();
          const mimeType = isPDF ? "application/pdf" : "text/plain";
          const upload   = new Blob([blob], { type: mimeType });
          const formData = new FormData();
          formData.append("file", upload, fileName);
          setStatus("Uploading to FlashFetch…");

          const headers = {};
          if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;

          const res = await fetch(`${apiUrl}/upload`, { method: "POST", headers, body: formData });
          if (!res.ok) throw new Error(`Upload failed ${res.status}`);

          setStatus(`✓ Uploaded: ${fileName}`, "success");
          clearEmptyState();
          appendMessage("assistant",
            `✅ "${fileName}" uploaded and indexed! You can now ask questions about it using the main chat.`
          );
          setTimeout(() => hideStatus(), 3000);
        } catch (err) {
          setStatus(`Error: ${err.message}`, "error");
        }
        return;
      }

      // ── Web page: extract text via content script ─────────────────────────
      setStatus("Extracting page content…");
      chrome.tabs.sendMessage(tab.id, { action: "getPageText" }, async (response) => {
        if (chrome.runtime.lastError || !response) {
          setStatus("Cannot read this page", "error"); return;
        }
        const { title, text } = response;
        const blob     = new Blob([text], { type: "text/plain" });
        const fname    = (title || "webpage").replace(/[^a-z0-9]/gi, "_").slice(0, 40) + ".txt";
        const formData = new FormData();
        formData.append("file", blob, fname);
        setStatus("Uploading…");
        try {
          const headers = {};
          if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;
          const res = await fetch(`${apiUrl}/upload`, { method: "POST", headers, body: formData });
          if (!res.ok) throw new Error(`Upload failed ${res.status}`);
          setStatus(`Saved: ${fname}`, "success");
          setTimeout(() => hideStatus(), 3000);
        } catch (err) {
          setStatus(`Upload error: ${err.message}`, "error");
        }
      });
    });
  });
});

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function clearEmptyState() {
  const empty = messagesEl.querySelector(".empty-state");
  if (empty) empty.remove();
}

function appendMessage(role, text, confidence, sources) {
  const div    = document.createElement("div");
  div.className = `msg ${role}`;
  const bubble  = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(bubble);

  if (confidence && role === "assistant") {
    const badge = document.createElement("span");
    badge.className = `confidence-badge ${confidence}`;
    badge.textContent = { high: "High confidence", medium: "Medium", low: "Low" }[confidence] || confidence;
    div.appendChild(badge);
  }

  if (sources && sources.length > 0) {
    const chips = document.createElement("div");
    chips.className = "source-chips";
    sources.forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.textContent = s.document || s;
      chips.appendChild(chip);
    });
    div.appendChild(chips);
  }

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

let typingCounter = 0;
function appendTyping() {
  const id      = `typing-${++typingCounter}`;
  const wrapper = document.createElement("div");
  wrapper.className = "msg assistant";
  wrapper.id = id;
  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function setStatus(msg, type = "") {
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
  statusBar.classList.remove("hidden");
}

function hideStatus() {
  statusBar.classList.add("hidden");
  statusBar.className = "status-bar hidden";
}

// ─── State ─────────────────────────────────────────────────────────────────────
let conversationHistory = [];

// ─── DOM ───────────────────────────────────────────────────────────────────────
const authScreen   = document.getElementById("auth-screen");
const chatScreen   = document.getElementById("chat-screen");
const tokenInput   = document.getElementById("token-input");
const apiUrlInput  = document.getElementById("api-url-input");
const saveTokenBtn = document.getElementById("save-token-btn");
const messagesEl   = document.getElementById("messages");
const questionInput = document.getElementById("question-input");
const sendBtn      = document.getElementById("send-btn");
const savePageBtn  = document.getElementById("save-page-btn");
const logoutBtn    = document.getElementById("logout-btn");
const statusBar    = document.getElementById("status-bar");

// ─── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(["ff_token", "ff_api_url", "ff_prefill"], (data) => {
  if (data.ff_token) {
    showChat();
  } else {
    showAuth();
  }

  // If opened via context menu with selected text, prefill
  if (data.ff_prefill) {
    questionInput.value = data.ff_prefill;
    chrome.storage.local.remove("ff_prefill");
    // auto-send after a small delay
    setTimeout(() => sendQuestion(), 300);
  }
});

// ─── Auth ──────────────────────────────────────────────────────────────────────
function showAuth() {
  authScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

function showChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  questionInput.focus();
}

saveTokenBtn.addEventListener("click", () => {
  const token  = tokenInput.value.trim();
  const apiUrl = apiUrlInput.value.trim() || DEFAULT_API;
  if (!token) {
    setStatus("Paste your JWT token first", "error");
    return;
  }
  chrome.storage.local.set({ ff_token: token, ff_api_url: apiUrl }, () => {
    showChat();
    setStatus("Connected ✓", "success");
    setTimeout(() => hideStatus(), 2000);
  });
});

logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["ff_token", "ff_api_url"], () => {
    conversationHistory = [];
    showAuth();
  });
});

// ─── Messaging ────────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", sendQuestion);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
});

// Suggestion chips
document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    questionInput.value = chip.dataset.q;
    sendQuestion();
  });
});

async function sendQuestion() {
  const question = questionInput.value.trim();
  if (!question) return;

  chrome.storage.local.get(["ff_token", "ff_api_url"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;

    // Clear empty state
    clearEmptyState();

    appendMessage("user", question);
    questionInput.value = "";
    sendBtn.disabled = true;

    // Add to history
    conversationHistory.push({ role: "user", content: question });
    const historyToSend = conversationHistory.slice(-8);

    const typingId = appendTyping();

    try {
      const headers = { "Content-Type": "application/json" };
      if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;

      const res = await fetch(`${apiUrl}/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          history: historyToSend.slice(0, -1), // exclude current user msg
        }),
      });

      removeTyping(typingId);

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const json = await res.json();
      const answer    = json.answer    || "No answer returned.";
      const confidence = json.confidence || "low";
      const sources   = json.sources    || [];

      appendMessage("assistant", answer, confidence, sources);
      conversationHistory.push({ role: "assistant", content: answer });

    } catch (err) {
      removeTyping(typingId);
      appendMessage("assistant", `Error: ${err.message}. Check your API URL and token.`);
    } finally {
      sendBtn.disabled = false;
      questionInput.focus();
    }
  });
}

// ─── Save current page ────────────────────────────────────────────────────────
savePageBtn.addEventListener("click", async () => {
  chrome.storage.local.get(["ff_token", "ff_api_url"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;

    setStatus("Extracting page content…");

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];

      chrome.tabs.sendMessage(tab.id, { action: "getPageText" }, async (response) => {
        if (chrome.runtime.lastError || !response) {
          setStatus("Cannot read this page", "error");
          return;
        }

        const { title, text } = response;
        const blob = new Blob([text], { type: "text/plain" });
        const filename = (title || "webpage").replace(/[^a-z0-9]/gi, "_").slice(0, 40) + ".txt";

        const formData = new FormData();
        formData.append("file", blob, filename);

        setStatus("Uploading to FlashFetch…");

        try {
          const headers = {};
          if (data.ff_token) headers["Authorization"] = `Bearer ${data.ff_token}`;

          const res = await fetch(`${apiUrl}/upload`, {
            method: "POST",
            headers,
            body: formData,
          });

          if (!res.ok) throw new Error(`Upload failed ${res.status}`);

          setStatus(`Saved: ${filename}`, "success");
          setTimeout(() => hideStatus(), 3000);
        } catch (err) {
          setStatus(`Upload error: ${err.message}`, "error");
        }
      });
    });
  });
});

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function clearEmptyState() {
  const empty = messagesEl.querySelector(".empty-state");
  if (empty) empty.remove();
}

function appendMessage(role, text, confidence, sources) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(bubble);

  if (confidence && role === "assistant") {
    const badge = document.createElement("span");
    badge.className = `confidence-badge ${confidence}`;
    const labels = { high: "High confidence", medium: "Medium", low: "Low" };
    badge.textContent = labels[confidence] || confidence;
    div.appendChild(badge);
  }

  if (sources && sources.length > 0) {
    const chips = document.createElement("div");
    chips.className = "source-chips";
    sources.forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.textContent = s.document || s;
      chips.appendChild(chip);
    });
    div.appendChild(chips);
  }

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

let typingCounter = 0;
function appendTyping() {
  const id = `typing-${++typingCounter}`;
  const wrapper = document.createElement("div");
  wrapper.className = "msg assistant";
  wrapper.id = id;

  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  wrapper.appendChild(bubble);

  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function setStatus(msg, type = "") {
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
  statusBar.classList.remove("hidden");
}

function hideStatus() {
  statusBar.classList.add("hidden");
  statusBar.className = "status-bar hidden";
}
