// Constants
// In production: update this to your Render backend URL
// e.g. "https://flashfetch-backend.onrender.com"
const DEFAULT_API = "http://localhost:8000";
const OLD_RAILWAY = "https://rag-document-qa-bot-production.up.railway.app";

// State
let conversationHistory = [];
let activeFileContext = null;

// DOM
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const apiUrlInput = document.getElementById("api-url-input");
const apiKeyInput = document.getElementById("api-key-input");
const saveTokenBtn = document.getElementById("save-token-btn");
const messagesEl = document.getElementById("messages");
const questionInput = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const savePageBtn = document.getElementById("save-page-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusBar = document.getElementById("status-bar");
const fileBanner = document.getElementById("file-banner");
const fileBannerName = document.getElementById("file-banner-name");
const fileBannerClear = document.getElementById("file-banner-clear");

// Init - no token needed, go straight to chat
chrome.storage.local.get(["ff_api_url", "ff_prefill"], (data) => {
  // Auto-migrate: clear old Railway URL so DEFAULT_API (localhost) is used
  if (data.ff_api_url === OLD_RAILWAY) {
    chrome.storage.local.remove("ff_api_url");
  }
  showChat();
  detectOpenFile();

  if (data.ff_prefill) {
    questionInput.value = data.ff_prefill;
    chrome.storage.local.remove("ff_prefill");
    setTimeout(() => sendQuestion(), 300);
  }
});

// Auto-detect open file / Drive / PDF URL
function detectOpenFile() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    const url = tab.url;
    const isFile = url.startsWith("file://");
    const rawName = url.split("/").pop().split("?")[0] || "document";
    const fileName = decodeURIComponent(rawName);

    const isDrive = url.includes("drive.google.com") || url.includes("docs.google.com");
    const isPDFUrl = !isFile && url.toLowerCase().endsWith(".pdf");

    if (isDrive || isPDFUrl) {
      loadFromUrl(url, isDrive ? "Google Drive" : fileName);
      return;
    }

    if (isFile) {
      const isPDF = fileName.toLowerCase().endsWith(".pdf");
      if (isPDF) {
        loadFromUrl(url, fileName);
      } else {
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

// Load any URL via backend /extract-url
function loadFromUrl(url, label) {
  chrome.storage.local.get(["ff_api_url", "ff_api_key"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;
    const apiKey = data.ff_api_key || "";
    clearEmptyState();
    showLoadingBanner(label);
    setStatus("Reading " + label + "...");

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(apiUrl + "/extract-url", {
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
        title: json.filename,
        text: json.text,
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
  fileBannerName.textContent = "Loading " + label + "...";
  fileBanner.classList.remove("hidden");
}

function setFileContext(res) {
  activeFileContext = { text: res.text, filename: res.title };
  showFileBanner(res.title, res.fileType);
  clearEmptyState();
  appendMessage("assistant",
    "I have read \"" + res.title + "\" (" + Math.ceil(res.text.length / 1000) + "k chars). Ask me anything about it!"
  );
  questionInput.focus();
}

function appendPDFHelp(fileName, errorMsg) {
  const div = document.createElement("div");
  div.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (errorMsg && errorMsg.includes("Anyone with the link")) {
    bubble.innerHTML = "<strong>" + fileName + "</strong><br/><br/><strong>Google Drive file is not public.</strong><br/><br/>Fix: Right-click in Drive &rarr; Share &rarr; <em>Anyone with the link</em> &rarr; try again.";
  } else if (errorMsg) {
    bubble.innerHTML = "<strong>" + fileName + "</strong><br/><br/>Could not read: <em>" + errorMsg + "</em><br/><br/>Make sure the file is publicly shared or upload it using the &uarr; button.";
  } else {
    bubble.innerHTML = "<strong>" + fileName + "</strong><br/><br/>Chrome PDF viewer blocks extensions.<br/><br/>Open a <strong>Google Drive link</strong> instead, or click <strong>&uarr;</strong> to upload.";
  }

  div.appendChild(bubble);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// File banner
function showFileBanner(filename, fileType) {
  const icon = fileType === "pdf" ? "PDF" : fileType === "webpage" ? "Web" : "Doc";
  fileBannerName.textContent = icon + " | " + filename;
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

// Auth / Settings
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
  const apiUrl = apiUrlInput.value.trim() || DEFAULT_API;
  const apiKey = apiKeyInput.value.trim();
  chrome.storage.local.set({ ff_api_url: apiUrl, ff_api_key: apiKey }, () => {
    setStatus("Settings saved!", "success");
    setTimeout(() => hideStatus(), 2000);
  });
});

logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["ff_api_url", "ff_api_key"], () => {
    conversationHistory = [];
    activeFileContext = null;
    setStatus("Reset done", "success");
    setTimeout(() => hideStatus(), 1500);
  });
});

// Messaging
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

  chrome.storage.local.get(["ff_api_url", "ff_api_key"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;
    const apiKey = data.ff_api_key || "";

    clearEmptyState();
    appendMessage("user", question);
    questionInput.value = "";
    sendBtn.disabled = true;

    conversationHistory.push({ role: "user", content: question });
    const historyToSend = conversationHistory.slice(-8);
    const typingId = appendTyping();

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      let endpoint, body;

      if (activeFileContext) {
        endpoint = apiUrl + "/ask-with-context";
        body = JSON.stringify({
          question,
          context_text: activeFileContext.text,
          filename: activeFileContext.filename,
          history: historyToSend.slice(0, -1),
        });
      } else {
        endpoint = apiUrl + "/ask";
        body = JSON.stringify({
          question,
          history: historyToSend.slice(0, -1),
        });
      }

      const res = await fetch(endpoint, { method: "POST", headers, body });
      removeTyping(typingId);

      if (!res.ok) throw new Error("API error " + res.status);

      const json = await res.json();
      const answer = json.answer || "No answer returned.";
      const confidence = json.confidence || "low";
      const sources = json.sources || [];

      appendMessage("assistant", answer, confidence, sources);
      conversationHistory.push({ role: "assistant", content: answer });

    } catch (err) {
      removeTyping(typingId);
      appendMessage("assistant", "Error: " + err.message);
    } finally {
      sendBtn.disabled = false;
      questionInput.focus();
    }
  });
}

// Save current page / upload
savePageBtn.addEventListener("click", async () => {
  chrome.storage.local.get(["ff_api_url", "ff_api_key"], async (data) => {
    const apiUrl = data.ff_api_url || DEFAULT_API;
    const apiKey = data.ff_api_key || "";

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url) { setStatus("Cannot read this tab", "error"); return; }

      const url = tab.url;
      const isPDF = url.toLowerCase().endsWith(".pdf");
      const isFile = url.startsWith("file://");
      const rawName = url.split("/").pop().split("?")[0] || "document";
      const fileName = decodeURIComponent(rawName);

      if (isFile) {
        setStatus("Reading " + fileName + "...");
        try {
          const fileRes = await fetch(url);
          const blob = await fileRes.blob();
          const mimeType = isPDF ? "application/pdf" : "text/plain";
          const upload = new Blob([blob], { type: mimeType });
          const formData = new FormData();
          formData.append("file", upload, fileName);
          setStatus("Uploading to FlashFetch...");
          const headers = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

          const res = await fetch(apiUrl + "/upload", { method: "POST", headers, body: formData });
          if (!res.ok) throw new Error("Upload failed " + res.status);
          setStatus("Uploaded: " + fileName, "success");
          clearEmptyState();
          appendMessage("assistant", "\"" + fileName + "\" uploaded. Ask me anything about it!");
          setTimeout(() => hideStatus(), 3000);
        } catch (err) {
          setStatus("Error: " + err.message, "error");
        }
        return;
      }

      setStatus("Reading page...");
      chrome.tabs.sendMessage(tab.id, { action: "getPageText" }, async (response) => {
        if (chrome.runtime.lastError || !response) {
          setStatus("Cannot read this page", "error"); return;
        }
        const { title, text } = response;
        const blob = new Blob([text], { type: "text/plain" });
        const fname = (title || "webpage").replace(/[^a-z0-9]/gi, "_").slice(0, 40) + ".txt";
        const formData = new FormData();
        formData.append("file", blob, fname);
        setStatus("Uploading...");
        try {
          const headers = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

          const res = await fetch(apiUrl + "/upload", { method: "POST", headers, body: formData });
          if (!res.ok) throw new Error("Upload failed " + res.status);
          setStatus("Saved: " + fname, "success");
          setTimeout(() => hideStatus(), 3000);
        } catch (err) {
          setStatus("Upload error: " + err.message, "error");
        }
      });
    });
  });
});

// DOM helpers
function clearEmptyState() {
  const empty = messagesEl.querySelector(".empty-state");
  if (empty) empty.remove();
}

function appendMessage(role, text, confidence, sources) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(bubble);

  if (confidence && role === "assistant") {
    const badge = document.createElement("span");
    badge.className = "confidence-badge " + confidence;
    badge.textContent = { high: "High", medium: "Medium", low: "Low" }[confidence] || confidence;
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
  const id = "typing-" + (++typingCounter);
  const wrapper = document.createElement("div");
  wrapper.className = "msg assistant";
  wrapper.id = id;
  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function setStatus(msg, type) {
  statusBar.textContent = msg;
  statusBar.className = "status-bar " + (type || "");
  statusBar.classList.remove("hidden");
}

function hideStatus() {
  statusBar.classList.add("hidden");
  statusBar.className = "status-bar hidden";
}
