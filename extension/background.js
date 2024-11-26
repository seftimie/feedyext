chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed successfully');
});

// Abrir el panel lateral cuando se hace clic en el icono de la extensión
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Detectar cambios de pestaña
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    console.log('Tab changed:', tab.url);
    
    // Enviar mensaje al popup para resetear datos
    chrome.runtime.sendMessage({
      action: 'resetData',
      tabInfo: {
        url: tab.url,
        title: tab.title
      }
    });
  } catch (error) {
    console.error('Error handling tab change:', error);
  }
});

// Detectar actualizaciones de pestaña (cuando se navega a una nueva URL)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.runtime.sendMessage({
      action: 'resetData',
      tabInfo: {
        url: tab.url,
        title: tab.title
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  return true;
});
