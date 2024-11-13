document.getElementById("start").addEventListener("click", () => {
    const url = document.getElementById("url").value;
    if (url) {
      chrome.storage.local.set({ monitoredUrl: url }, () => {
        chrome.runtime.sendMessage({ action: "startMonitoring" });
        alert("Monitoreo iniciado para: " + url);
      });
    }
  });
  