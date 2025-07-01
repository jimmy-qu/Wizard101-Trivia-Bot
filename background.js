// Handles extension events and long-running processes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "performBotAction") {
    // Handle bot logic or forward to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: "executeBot"});
    });
  }
});

chrome.runtime.onSuspend.addListener(() => {
    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, 'CONTEXT_INVALIDATED');
        });
    });
});