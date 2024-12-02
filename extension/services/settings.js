// Storage keys
const API_URL_KEY = 'socialAnalytics_apiUrl';
const DEFAULT_API_URL = 'https://feedy-195788712267.europe-west4.run.app';

// Get API URL
export const getApiUrl = async () => {
  const result = await chrome.storage.local.get(API_URL_KEY);
  return result[API_URL_KEY] || DEFAULT_API_URL;
};

// Set API URL
export const setApiUrl = async (url) => {
  await chrome.storage.local.set({
    [API_URL_KEY]: url
  });
};

// Initialize settings in UI
export const initializeSettings = async () => {
  const apiUrlInput = document.getElementById('apiUrlInput');
  if (apiUrlInput) {
    // Set initial value
    apiUrlInput.value = await getApiUrl();

    // Handle changes
    apiUrlInput.addEventListener('change', async () => {
      try {
        const url = apiUrlInput.value.trim();
        if (url) {
          await setApiUrl(url);
        } else {
          await setApiUrl(DEFAULT_API_URL);
          apiUrlInput.value = DEFAULT_API_URL;
        }
      } catch (error) {
        console.error('Error saving API URL:', error);
      }
    });
  }
}; 