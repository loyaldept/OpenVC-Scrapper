document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    statusBanner: document.getElementById('status-banner'),
    statusText: document.getElementById('status-text'),
    notOnOpenvc: document.getElementById('not-on-openvc'),
    mainControls: document.getElementById('main-controls'),
    filterToggle: document.getElementById('filter-toggle'),
    filterPanel: document.getElementById('filter-panel'),
    toggleIcon: document.querySelector('.toggle-icon'),
    btnScrape: document.getElementById('btn-scrape'),
    btnStop: document.getElementById('btn-stop'),
    progressSection: document.getElementById('progress-section'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    resultsSection: document.getElementById('results-section'),
    resultCount: document.getElementById('result-count'),
    resultsPreview: document.getElementById('results-preview'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnCopy: document.getElementById('btn-copy'),
    btnClear: document.getElementById('btn-clear'),
  };

  let scrapedData = [];
  let isRunning = false;

  // Check if we're on OpenVC
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOpenVC = tab?.url?.includes('openvc.app');

  if (!isOpenVC) {
    elements.notOnOpenvc.classList.remove('hidden');
  }

  // Load saved results from storage
  const stored = await chrome.storage.local.get(['scrapedData']);
  if (stored.scrapedData?.length) {
    scrapedData = stored.scrapedData;
    renderResults();
  }

  // Filter toggle
  elements.filterToggle.addEventListener('click', () => {
    elements.filterPanel.classList.toggle('collapsed');
    elements.toggleIcon.classList.toggle('collapsed');
  });

  // Get current filters
  function getFilters() {
    const stages = [...document.querySelectorAll('.filter-stage:checked')].map(el => el.value);
    return {
      stages,
      checkMin: document.getElementById('check-min').value || null,
      checkMax: document.getElementById('check-max').value || null,
      location: document.getElementById('filter-location').value.trim() || null,
      sector: document.getElementById('filter-sector').value.trim() || null,
      type: document.getElementById('filter-type').value || null,
      leadsOnly: document.getElementById('filter-leads').checked,
      emailOnly: document.getElementById('filter-email-only').checked,
    };
  }

  // Get scrape mode
  function getScrapeMode() {
    return document.querySelector('input[name="scrape-mode"]:checked').value;
  }

  // Show status
  function showStatus(text, type = 'info') {
    elements.statusBanner.className = `status-banner ${type}`;
    elements.statusText.textContent = text;
    elements.statusBanner.classList.remove('hidden');
    if (type === 'success') {
      setTimeout(() => elements.statusBanner.classList.add('hidden'), 3000);
    }
  }

  // Start scraping
  elements.btnScrape.addEventListener('click', async () => {
    if (!isOpenVC) {
      showStatus('Navigate to openvc.app first', 'error');
      return;
    }

    isRunning = true;
    elements.btnScrape.classList.add('hidden');
    elements.btnStop.classList.remove('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = 'Starting scrape...';

    const mode = getScrapeMode();
    const filters = getFilters();

    chrome.tabs.sendMessage(tab.id, {
      action: 'startScrape',
      mode,
      filters,
    });
  });

  // Stop scraping
  elements.btnStop.addEventListener('click', () => {
    isRunning = false;
    chrome.tabs.sendMessage(tab.id, { action: 'stopScrape' });
    elements.btnScrape.classList.remove('hidden');
    elements.btnStop.classList.add('hidden');
    elements.progressSection.classList.add('hidden');
    showStatus('Scraping stopped', 'info');
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'scrapeProgress') {
      elements.progressFill.style.width = `${message.progress}%`;
      elements.progressText.textContent = message.text;
    }

    if (message.action === 'scrapeResult') {
      // Merge new data avoiding duplicates
      const existingNames = new Set(scrapedData.map(d => d.name));
      const newData = message.data.filter(d => !existingNames.has(d.name));
      scrapedData = [...scrapedData, ...newData];
      chrome.storage.local.set({ scrapedData });
      renderResults();
    }

    if (message.action === 'scrapeComplete') {
      isRunning = false;
      elements.btnScrape.classList.remove('hidden');
      elements.btnStop.classList.add('hidden');
      elements.progressSection.classList.add('hidden');
      showStatus(`Scraping complete! Found ${scrapedData.length} investors`, 'success');
    }

    if (message.action === 'scrapeError') {
      isRunning = false;
      elements.btnScrape.classList.remove('hidden');
      elements.btnStop.classList.add('hidden');
      elements.progressSection.classList.add('hidden');
      showStatus(message.error, 'error');
    }
  });

  // Render results preview
  function renderResults() {
    if (!scrapedData.length) {
      elements.resultsSection.classList.add('hidden');
      return;
    }

    elements.resultsSection.classList.remove('hidden');
    elements.resultCount.textContent = scrapedData.length;

    const preview = scrapedData.slice(0, 50);
    elements.resultsPreview.innerHTML = preview.map(item => `
      <div class="result-item">
        <div class="name">${escapeHtml(item.name || 'Unknown')}</div>
        <div class="details">${escapeHtml([item.stage, item.checkSize, item.location].filter(Boolean).join(' • '))}</div>
        ${item.email ? `<div class="email">${escapeHtml(item.email)}</div>` : ''}
      </div>
    `).join('');

    if (scrapedData.length > 50) {
      elements.resultsPreview.innerHTML += `
        <div class="result-item" style="text-align:center;color:#999;">
          ... and ${scrapedData.length - 50} more
        </div>`;
    }
  }

  // Export CSV
  elements.btnExportCsv.addEventListener('click', () => {
    if (!scrapedData.length) return;
    const headers = ['Name', 'Email', 'Website', 'Stage', 'Check Size', 'Location', 'Sectors', 'Type', 'Leads', 'Description', 'Team', 'Profile URL'];
    const rows = scrapedData.map(d => [
      d.name, d.email, d.website, d.stage, d.checkSize,
      d.location, d.sectors, d.type, d.leads, d.description, d.team, d.profileUrl,
    ].map(v => `"${(v || '').replace(/"/g, '""')}"`));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, 'openvc-investors.csv', 'text/csv');
    showStatus('CSV exported!', 'success');
  });

  // Export JSON
  elements.btnExportJson.addEventListener('click', () => {
    if (!scrapedData.length) return;
    const json = JSON.stringify(scrapedData, null, 2);
    downloadFile(json, 'openvc-investors.json', 'application/json');
    showStatus('JSON exported!', 'success');
  });

  // Copy to clipboard
  elements.btnCopy.addEventListener('click', async () => {
    if (!scrapedData.length) return;
    const text = scrapedData.map(d =>
      `${d.name} | ${d.email || 'N/A'} | ${d.stage || ''} | ${d.location || ''}`
    ).join('\n');
    await navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard!', 'success');
  });

  // Clear results
  elements.btnClear.addEventListener('click', () => {
    scrapedData = [];
    chrome.storage.local.remove('scrapedData');
    elements.resultsSection.classList.add('hidden');
    showStatus('Results cleared', 'info');
  });

  // Helpers
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
