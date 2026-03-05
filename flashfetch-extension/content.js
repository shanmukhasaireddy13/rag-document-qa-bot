// content.js — runs in every page context
// Responds to popup requests for the page's text content

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "getPageText") {
    const title = document.title || window.location.hostname;
    const text  = document.body ? document.body.innerText : "";
    sendResponse({ title, text: text.slice(0, 50000) }); // cap at 50 KB
  }
  // Required to keep message channel open for async use
  return true;
});
