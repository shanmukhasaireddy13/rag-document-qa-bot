// ─── Service Worker (Background Script) ──────────────────────────────────────
// Registers the context menu on install and handles right-click → ask FlashFetch

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "flashfetch-ask",
    title: "Ask FlashFetch: \"%s\"",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "flashfetch-save-page",
    title: "Save page to FlashFetch docs",
    contexts: ["page"],
  });
});

// ─── Context menu click handler ───────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "flashfetch-ask") {
    const selectedText = info.selectionText || "";

    // Store selected text so popup can pick it up
    chrome.storage.local.set({ ff_prefill: selectedText }, () => {
      // Open the popup — this triggers popup.js to read ff_prefill
      chrome.action.openPopup();
    });
  }

  if (info.menuItemId === "flashfetch-save-page") {
    chrome.storage.local.get(["ff_api_key", "ff_api_url"], async (data) => {
      const apiUrl = data.ff_api_url || "http://localhost:8000";

      // Inject content script to grab page text
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: extractPageText,
        },
        async (results) => {
          if (!results || !results[0]) return;
          const { title, text } = results[0].result;

          const blob = new Blob([text], { type: "text/plain" });
          const filename = (title || "webpage").replace(/[^a-z0-9]/gi, "_").slice(0, 40) + ".txt";

          const formData = new FormData();
          formData.append("file", blob, filename);

          try {
            const headers = {};
            if (data.ff_api_key) headers["Authorization"] = `Bearer ${data.ff_api_key}`;

            const res = await fetch(`${apiUrl}/upload`, {
              method: "POST",
              headers,
              body: formData,
            });

            if (res.ok) {
              chrome.notifications.create({
                type: "basic",
                iconUrl: "icons/icon48.png",
                title: "FlashFetch",
                message: `Page saved: ${filename}`,
              });
            }
          } catch (_) {
            // silent fail from background
          }
        }
      );
    });
  }
});

// Injected into the active tab to extract readable text
function extractPageText() {
  const title = document.title;
  const body = document.body ? document.body.innerText : "";
  return { title, text: body.slice(0, 50000) }; // cap at 50 KB
}
