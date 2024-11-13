chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startMonitoring") {
      chrome.alarms.create("monitor", { periodInMinutes: 10 });
    }
  });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "monitor") {
      chrome.storage.local.get("monitoredUrl", (data) => {
        const url = data.monitoredUrl;
        if (url) {
          chrome.tabs.create({ url, active: false }, (tab) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content.js"]
            });
          });
        }
      });
    }
  });
  