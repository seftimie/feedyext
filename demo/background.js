chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed successfully');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  return true;
});
