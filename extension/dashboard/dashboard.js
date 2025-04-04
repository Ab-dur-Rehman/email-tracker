/**
 * Email Tracker - Dashboard Script
 * 
 * This script handles the dashboard functionality:
 * - Loads and displays tracking data
 * - Generates charts and visualizations
 * - Manages filtering and pagination
 * - Handles detailed email view
 */

// DOM Elements
const dateRangeSelect = document.getElementById('date-range');
const refreshBtn = document.getElementById('refresh-btn');
const sentCount = document.getElementById('sent-count');
const openedCount = document.getElementById('opened-count');
const clickedCount = document.getElementById('clicked-count');
const openRate = document.getElementById('open-rate');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const trackingTableBody = document.getElementById('tracking-table-body');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const emailDetailModal = document.getElementById('email-detail-modal');
const closeModal = document.querySelector('.close-modal');
const exportDataBtn = document.getElementById('export-data');

// Charts
let activityChart = null;
let geoChart = null;
let deviceChart = null;

// State
let trackingData = {};
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 10;
let selectedDateRange = '7days';

/**
 * Initialize the dashboard
 */
async function initialize() {
  console.log('Email Tracker Dashboard initialized');
  
  // Load tracking data
  await loadTrackingData();
  
  // Process and display data
  processData();
  updateUI();
  
  // Set up event listeners
  setupEventListeners();
}

/**
 * Load tracking data from storage
 */
async function loadTrackingData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_TRACKING_DATA' },
      (response) => {
        if (response && response.success) {
          trackingData = response.data || {};
        } else {
          trackingData = {};
        }
        resolve();
      }
    );
  });
}

/**
 * Process tracking data based on filters
 */
function processData() {
  // Convert tracking data object to array
  const dataArray = Object.values(trackingData);
  
  // Apply date range filter
  const filteredByDate = filterByDateRange(dataArray, selectedDateRange);
  
  // Apply search filter
  const searchTerm = searchInput.value.toLowerCase();
  const filteredBySearch = searchTerm ? 
    filteredByDate.filter(session => {
      return session.emailSubject.toLowerCase().includes(searchTerm) ||
             (session.recipients && session.recipients.some(r => r.toLowerCase().includes(searchTerm)));
    }) : 
    filteredByDate;
  
  // Apply status filter
  const statusValue = statusFilter.value;
  filteredData = statusValue !== 'all' ? 
    filteredBySearch.filter(session => session.status === statusValue) : 
    filteredBySearch;
  
  // Sort by sent date (newest first)
  filteredData.sort((a, b) => b.sentTimestamp - a.sentTimestamp);
}

/**
 * Filter data by date range
 */
function filterByDateRange(data, range) {
  const now = new Date();
  let startDate;
  
  switch (range) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'yesterday':
      startDate = new Date(now.setDate(now.getDate() - 1));
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7days':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30days':
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case 'custom':
      // In a real implementation, we would show a date picker
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    default:
      startDate = new Date(0); // All data
  }
  
  return data.filter(session => session.sentTimestamp >= startDate.getTime());
}

/**
 * Update the UI with processed data
 */
function updateUI() {
  updateStatistics();
  updateCharts();
  updateTable();
}

/**
 * Update statistics display
 */
function updateStatistics() {
  const stats = calculateStatistics(filteredData);
  
  sentCount.textContent = stats.sent;
  openedCount.textContent = stats.opened;
  clickedCount.textContent = stats.clicked;
  openRate.textContent = stats.openRate + '%';
}

/**
 * Calculate statistics from tracking data
 */
function calculateStatistics(data) {
  const stats = {
    sent: data.length,
    opened: 0,
    clicked: 0,
    openRate: 0
  };
  
  // Count emails by status
  data.forEach(session => {
    if (session.pixelLoads && session.pixelLoads.length > 0) {
      stats.opened++;
    }
    
    if (session.linkClicks && session.linkClicks.length > 0) {
      stats.clicked++;
    }
  });
  
  // Calculate open rate
  stats.openRate = stats.sent > 0 ? 
    Math.round((stats.opened / stats.sent) * 100) : 0;
  
  return stats;
}

/**
 * Update charts with current data
 */
function updateCharts() {
  updateActivityChart();
  updateGeoChart();
  updateDeviceChart();
}

/**
 * Update activity over time chart
 */
function updateActivityChart() {
  const ctx = document.getElementById('activity-chart').getContext('2d');
  
  // Prepare data for chart
  const dates = getLast7Days();
  const sentData = new Array(7).fill(0);
  const openedData = new Array(7).fill(0);
  const clickedData = new Array(7).fill(0);
  
  // Count activities by date
  filteredData.forEach(session => {
    const sentDate = new Date(session.sentTimestamp);
    const sentIndex = dates.findIndex(date => 
      date.getDate() === sentDate.getDate() && 
      date.getMonth() === sentDate.getMonth() && 
      date.getFullYear() === sentDate.getFullYear()
    );
    
    if (sentIndex !== -1) {
      sentData[sentIndex]++;
      
      // Check for opens on this date
      if (session.pixelLoads) {
        session.pixelLoads.forEach(load => {
          const openDate = new Date(load.timestamp);
          const openIndex = dates.findIndex(date => 
            date.getDate() === openDate.getDate() && 
            date.getMonth() === openDate.getMonth() && 
            date.getFullYear() === openDate.getFullYear()
          );
          
          if (openIndex !== -1) {
            openedData[openIndex]++;
          }
        });
      }
      
      // Check for clicks on this date
      if (session.linkClicks) {
        session.linkClicks.forEach(click => {
          const clickDate = new Date(click.timestamp);
          const clickIndex = dates.findIndex(date => 
            date.getDate() === clickDate.getDate() && 
            date.getMonth() === clickDate.getMonth() && 
            date.getFullYear() === clickDate.getFullYear()
          );
          
          if (clickIndex !== -1) {
            clickedData[clickIndex]++;
          }
        });
      }
    }
  });
  
  // Format dates for display
  const dateLabels = dates.map(date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  
  // Destroy existing chart if it exists
  if (activityChart) {
    activityChart.destroy();
  }
  
  // Create new chart
  activityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dateLabels,
      datasets: [
        {
          label: 'Sent',
          data: sentData,
          borderColor: '#4a6cf7',
          backgroundColor: 'rgba(74, 108, 247, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Opened',
          data: openedData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Clicked',
          data: clickedData,
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

/**
 * Get array of the last 7 days (Date objects)
 */
function getLast7Days() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    dates.push(date);
  }
  return dates;
}

/**
 * Update geographical distribution chart
 */
function updateGeoChart() {
  const ctx = document.getElementById('geo-chart').getContext('2d');
  
  // Collect geolocation data
  const locationCounts = {};
  
  filteredData.forEach(session => {
    if (session.pixelLoads) {
      session.pixelLoads.forEach(load => {
        if (load.geolocation && load.geolocation.country) {
          const country = load.geolocation.country;
          locationCounts[country] = (locationCounts[country] || 0) + 1;
        }
      });
    }
    
    if (session.linkClicks) {
      session.linkClicks.forEach(click => {
        if (click.geolocation && click.geolocation.country) {
          const country = click.geolocation.country;
          locationCounts[country] = (locationCounts[country] || 0) + 1;
        }
      });
    }
  });
  
  // Prepare data for chart
  const countries = Object.keys(locationCounts);
  const counts = Object.values(locationCounts);
  
  // Generate colors
  const backgroundColors = countries.map((_, i) => {
    const hue = (i * 137) % 360; // Golden angle approximation for color distribution
    return `hsla(${hue}, 70%, 60%, 0.7)`;
  });
  
  // Destroy existing chart if it exists
  if (geoChart) {
    geoChart.destroy();
  }
  
  // Create new chart
  geoChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: countries.length > 0 ? countries : ['No Data'],
      datasets: [{
        data: counts.length > 0 ? counts : [1],
        backgroundColor: backgroundColors.length > 0 ? backgroundColors : ['#e9ecef'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 15,
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((value / total) * 100);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Update device breakdown chart
 */
function updateDeviceChart() {
  const ctx = document.getElementById('device-chart').getContext('2d');
  
  // Collect device data
  const deviceCounts = {
    browser: {},
    os: {},
    device: {}
  };
  
  filteredData.forEach(session => {
    const events = [
      ...(session.pixelLoads || []),
      ...(session.linkClicks || [])
    ];
    
    events.forEach(event => {
      if (event.device) {
        // Count browsers
        if (event.device.browser) {
          const browser = event.device.browser;
          deviceCounts.browser[browser] = (deviceCounts.browser[browser] || 0) + 1;
        }
        
        // Count operating systems
        if (event.device.os) {
          const os = event.device.os;
          deviceCounts.os[os] = (deviceCounts.os[os] || 0) + 1;
        }
        
        // Count device types
        if (event.device.device) {
          const deviceType = event.device.device;
          deviceCounts.device[deviceType] = (deviceCounts.device[deviceType] || 0) + 1;
        }
      }
    });
  });
  
  // Prepare data for chart - we'll use device type for this chart
  const deviceTypes = Object.keys(deviceCounts.device);
  const deviceTypeCounts = Object.values(deviceCounts.device);
  
  // Generate colors
  const backgroundColors = [
    'rgba(74, 108, 247, 0.7)',   // Primary
    'rgba(40, 167, 69, 0.7)',    // Success
    'rgba(255, 193, 7, 0.7)',    // Warning
    'rgba(108, 117, 125, 0.7)',  // Secondary
    'rgba(220, 53, 69, 0.7)'     // Danger
  ];
  
  // Destroy existing chart if it exists
  if (deviceChart) {
    deviceChart.destroy();
  }
  
  // Create new chart
  deviceChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: deviceTypes.length > 0 ? deviceTypes : ['No Data'],
      datasets: [{
        data: deviceTypeCounts.length > 0 ? deviceTypeCounts : [1],
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((value / total) * 100);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Update tracking table with paginated data
 */
function updateTable() {
  // Clear existing rows
  trackingTableBody.innerHTML = '';
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
  
  // Update page info
  pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  
  // Disable/enable pagination buttons
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage >= totalPages;
  
  // If no data, show empty message
  if (filteredData.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="7" style="text-align: center;">No tracking data found</td>`;
    trackingTableBody.appendChild(emptyRow);
    return;
  }
  
  // Add rows for current page
  for (let i = startIndex; i < endIndex; i++) {
    const session = filteredData[i];
    const row = createTableRow(session);
    trackingTableBody.appendChild(row);
  }
}

/**
 * Create a table row for a tracking session
 */
function createTableRow(session) {
  const row = document.createElement('tr');
  
  // Determine status
  let status = 'sent';
  if (session.linkClicks && session.linkClicks.length > 0) {
    status = 'clicked';
  } else if (session.pixelLoads && session.pixelLoads.length > 0) {
    status = 'opened';
  }
  
  // Format date
  const sentDate = new Date(session.sentTimestamp);
  const formattedDate = sentDate.toLocaleString();
  
  // Create row content
  row.innerHTML = `
    <td>${session.emailSubject || 'No Subject'}</td>
    <td>${formatRecipients(session.recipients)}</td>
    <td>${formattedDate}</td>
    <td><span class="status-badge status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
    <td>${session.pixelLoads ? session.pixelLoads.length : 0}</td>
    <td>${session.linkClicks ? session.linkClicks.length : 0}</td>
    <td>
      <button class="action-btn" data-action="view" data-id="${session.id}">View Details</button>
    </td>
  `;
  
  // Add event listener for view details button
  const viewBtn = row.querySelector('button[data-action="view"]');
  viewBtn.addEventListener('click', () => showEmailDetails(session));
  
  return row;
}

/**
 * Format recipients for display
 */
function formatRecipients(recipients) {
  if (!recipients || recipients.length === 0) {
    return 'Unknown';
  }
  
  if (recipients.length === 1) {
    return recipients[0];
  }
  
  return `${recipients[0]} +${recipients.length - 1} more`;
}

/**
 * Show email details in modal
 */
function showEmailDetails(session) {
  // Set email subject
  document.getElementById('modal-email-subject').textContent = session.emailSubject || 'No Subject';
  
  // Set overview information
  document.getElementById('modal-sent-date').textContent = new Date(session.sentTimestamp).toLocaleString();
  document.getElementById('modal-recipients').textContent = formatRecipients(session.recipients);
  document.getElementById('modal-open-count').textContent = session.pixelLoads ? session.pixelLoads.length : 0;
  document.getElementById('modal-click-count').textContent = session.linkClicks ? session.linkClicks.length : 0;
  
  // Populate opens table
  const opensTable = document.getElementById('modal-opens-table');
  opensTable.innerHTML = '';
  
  if (session.pixelLoads && session.pixelLoads.length > 0) {
    session.pixelLoads.forEach(load => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(load.timestamp).toLocaleString()}</td>
        <td>${formatDevice(load.device)}</td>
        <td>${formatLocation(load.geolocation)}</td>
        <td>${load.device ? load.device.browser : 'Unknown'}</td>
      `;
      opensTable.appendChild(row);
    });
  } else {
    opensTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">No opens recorded</td></tr>';
  }
  
  // Populate clicks table
  const clicksTable = document.getElementById('modal-clicks-table');
  clicksTable.innerHTML = '';
  
  if (session.linkClicks && session.linkClicks.length > 0) {
    session.linkClicks.forEach(click => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(click.timestamp).toLocaleString()}</td>
        <td>${click.linkId || 'Unknown'}</td>
        <td>${formatDevice(click.device)}</td>
        <td>${formatLocation(click.geolocation)}</td>
      `;
      clicksTable.appendChild(row);
    });
  } else {
    clicksTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">No clicks recorded</td></tr>';
  }
  
  // Show modal
  emailDetailModal.style.display = 'block';
}

/**
 * Format device information for display
 */
function formatDevice(device) {
  if (!device) return 'Unknown';
  
  return `${device.device || 'Unknown'} / ${device.os || 'Unknown'}`;
}

/**
 * Format location information for display
 */
function formatLocation(geolocation) {
  if (!geolocation) return 'Unknown';
  
  if (geolocation.city && geolocation.country) {
    return `${geolocation.city}, ${geolocation.country}`;
  }
  
  return geolocation.country || 'Unknown';
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Date range select
  dateRangeSelect.addEventListener('change', () => {
    selectedDateRange = dateRangeSelect.value;
    processData();
    updateUI();
  });
  
  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    await loadTrackingData();
    processData();
    updateUI();
  });
  
  // Search input
  searchInput.addEventListener('input', () => {
    processData();
    updateUI();
  });
  
  // Status filter
  statusFilter.addEventListener('change', () => {
    processData();
    updateUI();
  });
  
  // Pagination
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updateTable();
    }
  });
  
  nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      updateTable();
    }
  });
  
  // Close modal
  closeModal.addEventListener('click', () => {
    emailDetailModal.style.display = 'none';
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === emailDetailModal) {
      emailDetailModal.style.display = 'none';
    }
  });
  
  // Export data
  exportDataBtn.addEventListener('click', () => {
    exportTrackingData();
  });
}

/**
 * Export tracking data as JSON
 */
function exportTrackingData() {
  // Create a JSON blob
  const dataStr = JSON.stringify(trackingData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `email-tracking-data-${new Date().toISOString().split('T')[0]}.json`;
  
  // Trigger download
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);