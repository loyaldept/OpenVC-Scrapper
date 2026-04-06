(() => {
  let shouldStop = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startScrape') {
      shouldStop = false;
      handleScrape(message.mode, message.filters);
    }
    if (message.action === 'stopScrape') {
      shouldStop = true;
    }
  });

  async function handleScrape(mode, filters) {
    try {
      let data = [];

      if (mode === 'current') {
        sendProgress(10, 'Scanning current page...');
        data = scrapeCurrentPage(document);
        sendProgress(80, `Found ${data.length} investors on this page`);
      } else if (mode === 'all') {
        data = await scrapeAllPages(filters);
      } else if (mode === 'profiles') {
        data = await scrapeWithProfiles();
      }

      // Apply local filters
      data = applyFilters(data, filters);
      sendProgress(100, `Done! ${data.length} investors total`);

      chrome.runtime.sendMessage({ action: 'scrapeResult', data });
      chrome.runtime.sendMessage({ action: 'scrapeComplete' });
    } catch (err) {
      chrome.runtime.sendMessage({ action: 'scrapeError', error: err.message });
    }
  }

  // ============================================================
  // SCRAPE CURRENT PAGE - uses exact OpenVC DOM selectors
  // ============================================================
  function scrapeCurrentPage(doc) {
    const investors = [];

    // OpenVC uses: table#results_tb tbody tr (excluding sponsor/ad rows)
    const rows = doc.querySelectorAll('table#results_tb tbody tr:not(.sponsorRow)');

    if (rows.length === 0) {
      // Fallback: try any table with fund links
      const fallbackRows = doc.querySelectorAll('table tbody tr');
      fallbackRows.forEach(row => {
        const investor = extractFromRow(row);
        if (investor) investors.push(investor);
      });

      // If still nothing, try link-based extraction
      if (investors.length === 0) {
        const fundLinks = doc.querySelectorAll('a[href*="fund/"]');
        const seen = new Set();
        fundLinks.forEach(link => {
          const href = link.getAttribute('href') || '';
          if (!href.includes('fund/')) return;
          const slug = href.split('fund/')[1];
          if (!slug || seen.has(slug)) return;
          seen.add(slug);
          const name = decodeURIComponent(slug).replace(/-/g, ' ');
          investors.push({
            name,
            email: '',
            website: '',
            stage: '',
            checkSize: '',
            location: '',
            sectors: '',
            type: '',
            leads: '',
            description: '',
            team: '',
            openRate: '',
            profileUrl: `https://www.openvc.app/fund/${slug}`,
          });
        });
      }

      return investors;
    }

    rows.forEach(row => {
      const investor = extractFromRow(row);
      if (investor) investors.push(investor);
    });

    return investors;
  }

  // Extract investor data from a table row using OpenVC's exact structure
  function extractFromRow(row) {
    // Skip ad/sponsor rows
    if (row.classList.contains('sponsorRow')) return null;

    // Name: td.nameCell #invOverflow or td[data-label="Investor name"]
    const nameCell = row.querySelector('td.nameCell') || row.querySelector('td[data-label="Investor name"]');
    const nameEl = nameCell?.querySelector('#invOverflow') || nameCell?.querySelector('div');
    const name = nameEl?.textContent?.trim() || '';
    if (!name) return null;

    // Profile URL from the fund link
    const fundLink = row.querySelector('a.VClink') || row.querySelector('a[href*="fund/"]');
    const href = fundLink?.getAttribute('href') || '';
    const profileUrl = href.startsWith('http') ? href : `https://www.openvc.app/${href}`;

    // Type: second div inside nameCell link (e.g. "VC firm", "Solo angel")
    const typeEl = nameCell?.querySelectorAll('a.VClink > div, a.VClink div');
    let type = '';
    if (typeEl && typeEl.length > 1) {
      type = typeEl[typeEl.length - 1]?.textContent?.trim() || '';
    }
    // Also check for type link like "investor-lists/angel-investors"
    const typeLink = nameCell?.querySelector('a[href*="investor-lists/"]');
    if (typeLink) type = typeLink.textContent.trim();

    // Geography: td[data-label="Target countries"] badges
    const geoCell = row.querySelector('td[data-label="Target countries"]');
    const geoBadges = geoCell?.querySelectorAll('span.badge') || [];
    const location = [...geoBadges].map(b => b.textContent.trim()).join(', ');

    // Check size: td[data-label="Check size"]
    const checkCell = row.querySelector('td[data-label="Check size"]');
    const checkSize = checkCell?.textContent?.trim()?.replace(/\s+/g, ' ') || '';

    // Stages: td[data-label="Funding stages"] badges
    const stageCell = row.querySelector('td[data-label="Funding stages"]');
    const stageBadges = stageCell?.querySelectorAll('span.badge') || [];
    const stage = [...stageBadges].map(b => b.textContent.trim()).join(', ');

    // Investment thesis: td.criteriaCell or td[data-label="Funding requirement"]
    const thesisCell = row.querySelector('td.criteriaCell') || row.querySelector('td[data-label="Funding requirement"]');
    const description = thesisCell?.textContent?.trim() || '';

    // Open rate: td[data-label="Open rate"]
    const openRateCell = row.querySelector('td[data-label="Open rate"]');
    const openRate = openRateCell?.querySelector('span.h6')?.textContent?.trim() || '';

    // Record ID from buttons
    const recordBtn = row.querySelector('button.convertManual') || row.querySelector('button[data-id]');
    const recordId = recordBtn?.getAttribute('data-id') || '';

    // Email from mailto (rarely present in table, but check)
    const mailtoLink = row.querySelector('a[href^="mailto:"]');
    const email = mailtoLink ? mailtoLink.getAttribute('href').replace('mailto:', '') : '';

    return {
      name,
      email,
      website: '',
      stage,
      checkSize,
      location,
      sectors: description.substring(0, 200),
      type,
      leads: '',
      description,
      team: '',
      openRate,
      recordId,
      profileUrl,
    };
  }

  // ============================================================
  // SCRAPE ALL PAGES - fetches each page via pagination
  // ============================================================
  async function scrapeAllPages() {
    const allData = [];

    // Get total pages from pagination
    const lastPageEl = document.querySelector('#pageLast a') || document.querySelector('#pageLast');
    const lastPageLink = lastPageEl?.getAttribute('href') || lastPageEl?.querySelector('a')?.getAttribute('href') || '';
    let totalPages = 1;

    // Try data-page attribute first
    const dataPage = lastPageEl?.getAttribute('data-page') || lastPageEl?.querySelector('a')?.getAttribute('data-page');
    if (dataPage) {
      totalPages = parseInt(dataPage, 10);
    } else {
      // Parse from URL
      const pageMatch = lastPageLink.match(/page=(\d+)/);
      if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
    }

    // Also try counting from the pagination nav
    if (totalPages <= 1) {
      const allPageLinks = document.querySelectorAll('#pagination a[data-page]');
      allPageLinks.forEach(link => {
        const p = parseInt(link.getAttribute('data-page'), 10);
        if (p > totalPages) totalPages = p;
      });
    }

    // If we still can't find pagination, try the investor count
    if (totalPages <= 1) {
      const countEl = document.querySelector('#resultsnbCont');
      const countMatch = countEl?.textContent?.match(/([\d,]+)\s*investor/);
      if (countMatch) {
        const total = parseInt(countMatch[1].replace(/,/g, ''), 10);
        totalPages = Math.ceil(total / 20);
      }
    }

    if (totalPages <= 1) totalPages = 304; // Fallback to known total

    // Build base URL preserving current search filters
    const currentUrl = new URL(window.location.href);
    const baseUrl = `${currentUrl.origin}${currentUrl.pathname}`;
    const params = new URLSearchParams(currentUrl.search);

    sendProgress(1, `Found ${totalPages} pages. Starting scrape...`);

    // Scrape current page first
    const currentPageData = scrapeCurrentPage(document);
    allData.push(...currentPageData);
    sendProgress(2, `Page 1/${totalPages} — ${allData.length} investors`);

    // Scrape remaining pages
    for (let page = 2; page <= totalPages; page++) {
      if (shouldStop) break;

      const progress = 2 + ((page - 1) / totalPages) * 95;
      sendProgress(progress, `Page ${page}/${totalPages} — ${allData.length} investors so far`);

      try {
        params.set('page', page);
        const url = `${baseUrl}?${params.toString()}`;
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'text/html',
          },
        });

        if (!response.ok) {
          console.warn(`Page ${page} returned ${response.status}, skipping`);
          continue;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const pageData = scrapeCurrentPage(doc);
        allData.push(...pageData);

        // Send intermediate results every 10 pages
        if (page % 10 === 0) {
          chrome.runtime.sendMessage({ action: 'scrapeResult', data: allData });
        }
      } catch (err) {
        console.warn(`Failed to scrape page ${page}:`, err);
      }

      // Polite delay to avoid rate limiting (300-600ms)
      await sleep(300 + Math.random() * 300);
    }

    return deduplicateInvestors(allData);
  }

  // ============================================================
  // SCRAPE WITH PROFILE DETAILS - visits each /fund/ page
  // ============================================================
  async function scrapeWithProfiles() {
    sendProgress(2, 'Collecting investor links from current page...');

    // Get all fund links from current page
    const links = new Set();
    const fundLinks = document.querySelectorAll('a[href*="fund/"]');
    fundLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!href.includes('fund/')) return;
      const fullUrl = href.startsWith('http') ? href : `https://www.openvc.app/${href.replace(/^\//, '')}`;
      links.add(fullUrl);
    });

    if (links.size === 0) {
      throw new Error('No investor profiles found. Navigate to openvc.app/search first.');
    }

    const urls = [...links];
    const allData = [];

    for (let i = 0; i < urls.length; i++) {
      if (shouldStop) break;

      sendProgress(
        2 + (i / urls.length) * 95,
        `Profile ${i + 1}/${urls.length} — ${allData.length} scraped`
      );

      try {
        const data = await scrapeProfilePage(urls[i]);
        if (data) allData.push(data);
      } catch (e) {
        console.warn(`Failed to scrape ${urls[i]}:`, e);
      }

      await sleep(500 + Math.random() * 500);
    }

    return allData;
  }

  // Scrape a single /fund/ profile page
  async function scrapeProfilePage(url) {
    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const investor = {
      name: '',
      email: '',
      website: '',
      stage: '',
      checkSize: '',
      location: '',
      sectors: '',
      type: '',
      leads: '',
      description: '',
      team: '',
      openRate: '',
      profileUrl: url,
    };

    // Name from h1 in #fundHeader
    const h1 = doc.querySelector('#fundHeader h1') || doc.querySelector('h1');
    if (h1) investor.name = h1.textContent.trim();
    if (!investor.name) {
      const title = doc.querySelector('title');
      if (title) investor.name = title.textContent.split('|')[0].trim();
    }

    // Website & LinkedIn from #socialIcons
    const socialLinks = doc.querySelectorAll('#socialIcons a');
    socialLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.includes('linkedin')) {
        investor.linkedin = href;
      } else if (href.startsWith('http')) {
        investor.website = href;
      }
    });

    // Parse detail tables (table.fundDetail)
    const detailTables = doc.querySelectorAll('table.fundDetail');
    detailTables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const label = cells[0].textContent.trim().toLowerCase();
        const value = cells[1].textContent.trim();

        if (label.includes('who we are') || label.includes('description')) {
          investor.description = value;
        } else if (label.includes('firm type') || label.includes('type')) {
          investor.type = value;
        } else if (label.includes('global hq') || label.includes('headquarters')) {
          investor.location = value;
        } else if (label.includes('funding requirements') || label.includes('thesis')) {
          investor.sectors = value.substring(0, 300);
        } else if (label.includes('funding stages') || label.includes('stage')) {
          const badges = cells[1].querySelectorAll('span.badge');
          investor.stage = badges.length
            ? [...badges].map(b => b.textContent.trim()).join(', ')
            : value;
        } else if (label.includes('check size')) {
          investor.checkSize = value;
          // Also try data attributes
          const minAttr = cells[0].getAttribute('data-min');
          const maxAttr = cells[0].getAttribute('data-max');
          if (minAttr && maxAttr) {
            investor.checkSizeMin = minAttr;
            investor.checkSizeMax = maxAttr;
          }
        } else if (label.includes('target countries') || label.includes('geography')) {
          const badges = cells[1].querySelectorAll('span.badge');
          investor.location = badges.length
            ? [...badges].map(b => b.textContent.trim()).join(', ')
            : value;
        } else if (label.includes('value add')) {
          investor.valueAdd = value;
        }
      });
    });

    // Team members from #teamCont
    const teamMembers = doc.querySelectorAll('table.teamDetail a.profileCont, #teamCont a.profileCont');
    if (teamMembers.length) {
      investor.team = [...teamMembers].map(el => el.textContent.trim()).join(', ');
    }

    // Email from mailto links
    const mailtoLink = doc.querySelector('a[href^="mailto:"]');
    if (mailtoLink) {
      investor.email = mailtoLink.getAttribute('href').replace('mailto:', '');
    }

    return investor;
  }

  // ============================================================
  // FILTERS
  // ============================================================
  function applyFilters(data, filters) {
    if (!filters) return data;

    return data.filter(item => {
      if (filters.stages?.length) {
        const itemStage = (item.stage || '').toLowerCase();
        const matches = filters.stages.some(s => {
          const stage = s.replace(/-/g, ' ');
          return itemStage.includes(stage) ||
            itemStage.includes('idea') && stage === 'pre seed' ||
            itemStage.includes('prototype') && stage === 'seed' ||
            itemStage.includes('early revenue') && stage === 'series a' ||
            itemStage.includes('scaling') && stage === 'series b' ||
            itemStage.includes('growth') && stage === 'growth';
        });
        if (!matches) return false;
      }

      if (filters.checkMin || filters.checkMax) {
        const size = parseCheckSize(item.checkSize);
        if (size === 0) return true; // Keep if unparseable
        if (filters.checkMin && size < Number(filters.checkMin)) return false;
        if (filters.checkMax && size > Number(filters.checkMax)) return false;
      }

      if (filters.location) {
        const loc = (item.location || '').toLowerCase();
        const filterLoc = filters.location.toLowerCase();
        if (!filterLoc.split(',').some(l => loc.includes(l.trim()))) return false;
      }

      if (filters.sector) {
        const combined = `${item.sectors} ${item.description} ${item.name}`.toLowerCase();
        const filterSectors = filters.sector.toLowerCase().split(',');
        if (!filterSectors.some(s => combined.includes(s.trim()))) return false;
      }

      if (filters.type) {
        const itemType = (item.type || '').toLowerCase();
        const filterType = filters.type.replace(/-/g, ' ').toLowerCase();
        if (!itemType.includes(filterType)) return false;
      }

      if (filters.leadsOnly && (!item.leads || item.leads.toLowerCase() === 'no')) return false;
      if (filters.emailOnly && !item.email) return false;

      return true;
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function parseCheckSize(str) {
    if (!str) return 0;
    const match = str.match(/[\d,.]+\s*[kmb]?/gi);
    if (!match) return 0;
    const first = match[0].toLowerCase();
    const num = parseFloat(first.replace(/[,]/g, '')) || 0;
    if (first.includes('b')) return num * 1000000000;
    if (first.includes('m')) return num * 1000000;
    if (first.includes('k')) return num * 1000;
    return num;
  }

  function deduplicateInvestors(investors) {
    const seen = new Map();
    investors.forEach(inv => {
      if (!inv.name) return;
      const key = inv.name.toLowerCase().trim();
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, inv);
      } else {
        Object.keys(inv).forEach(k => {
          if (inv[k] && !existing[k]) existing[k] = inv[k];
        });
      }
    });
    return [...seen.values()];
  }

  function sendProgress(progress, text) {
    chrome.runtime.sendMessage({
      action: 'scrapeProgress',
      progress: Math.round(progress),
      text,
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
