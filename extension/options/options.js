const DEFAULT_SETTINGS = {
  trackingEnabled: true,
  autoTracking: true,
  trackLinks: true,
  openNotifications: true,
  clickNotifications: true,
  notificationSound: false,
  collectGeolocation: true,
  collectDeviceInfo: true,
  dataRetention: '90',
  syncData: true,
  privacyDisclosure: true,
  disclosureText: 'This email is being tracked to notify the sender when it is opened. This tracking collects information such as the time of opening and device information. If you have concerns about this tracking, please contact the sender directly.'
};

const FIELD_MAP = {
  trackingEnabled: 'tracking-enabled',
  autoTracking: 'auto-tracking',
  trackLinks: 'track-links',
  openNotifications: 'open-notifications',
  clickNotifications: 'click-notifications',
  notificationSound: 'notification-sound',
  collectGeolocation: 'collect-geolocation',
  collectDeviceInfo: 'collect-device-info',
  dataRetention: 'data-retention',
  syncData: 'sync-data',
  privacyDisclosure: 'privacy-disclosure',
  disclosureText: 'disclosure-text'
};

const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const deleteDataBtn = document.getElementById('delete-data-btn');
const saveStatus = document.getElementById('save-status');

async function initialize() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  applySettings({ ...DEFAULT_SETTINGS, ...stored });

  saveBtn.addEventListener('click', saveSettings);
  resetBtn.addEventListener('click', resetSettings);
  exportDataBtn.addEventListener('click', exportTrackingData);
  deleteDataBtn.addEventListener('click', deleteTrackingData);
}

function applySettings(settings) {
  Object.entries(FIELD_MAP).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (!element) return;

    if (element.type === 'checkbox') {
      element.checked = Boolean(settings[key]);
    } else {
      element.value = settings[key];
    }
  });
}

function collectSettings() {
  return Object.entries(FIELD_MAP).reduce((settings, [key, id]) => {
    const element = document.getElementById(id);
    if (!element) return settings;

    settings[key] = element.type === 'checkbox' ? element.checked : element.value;
    return settings;
  }, {});
}

async function saveSettings() {
  await chrome.storage.sync.set(collectSettings());
  showStatus('Settings saved.');
}

async function resetSettings() {
  applySettings(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  showStatus('Settings reset.');
}

async function exportTrackingData() {
  chrome.runtime.sendMessage({ type: 'GET_TRACKING_DATA' }, (response) => {
    const trackingData = response && response.success ? response.data || {} : {};
    const blob = new Blob([JSON.stringify(trackingData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `email-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function deleteTrackingData() {
  if (!confirm('Delete all local tracking data? This cannot be undone.')) {
    return;
  }

  chrome.runtime.sendMessage({ type: 'CLEAR_TRACKING_DATA' }, (response) => {
    showStatus(response && response.success ? 'Tracking data deleted.' : 'Could not delete tracking data.');
  });
}

function showStatus(message) {
  saveStatus.textContent = message;
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 2500);
}

document.addEventListener('DOMContentLoaded', initialize);
