// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_API = "https://rag-document-qa-bot-production.up.railway.app";

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
