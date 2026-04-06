// Background service worker - handles messaging relay between popup and content scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay messages from content script to popup
  if (message.action === 'scrapeProgress' ||
      message.action === 'scrapeResult' ||
      message.action === 'scrapeComplete' ||
      message.action === 'scrapeError') {
    // Forward to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might be closed, that's fine
    });
  }
});

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('OpenVC Scrapper installed');
});

// Context menu for quick scrape on OpenVC pages
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: 'scrape-page',
    title: 'Scrape this page with OpenVC Scrapper',
    documentUrlPatterns: ['https://www.openvc.app/*', 'https://openvc.app/*'],
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scrape-page') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'startScrape',
      mode: 'current',
      filters: {},
    });
  }
});
