(() => {
  let shouldStop = false;

  // Listen for messages from popup
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
        data = scrapePage();
        sendProgress(80, `Found ${data.length} investors on this page`);
      } else if (mode === 'all') {
        data = await scrapeAllPages();
      } else if (mode === 'profiles') {
        data = await scrapeWithProfiles();
      }

      // Apply filters
      data = applyFilters(data, filters);
      sendProgress(100, `Done! ${data.length} investors after filtering`);

      chrome.runtime.sendMessage({ action: 'scrapeResult', data });
      chrome.runtime.sendMessage({ action: 'scrapeComplete' });
    } catch (err) {
      chrome.runtime.sendMessage({ action: 'scrapeError', error: err.message });
    }
  }

  // Scrape the current page's investor listings
  function scrapePage() {
    const investors = [];

    // Strategy 1: Try to extract from __NEXT_DATA__ (Next.js SSR data)
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const nextData = JSON.parse(nextDataEl.textContent);
        const extracted = extractFromNextData(nextData);
        if (extracted.length) return extracted;
      } catch (e) {
        // Fall through to DOM scraping
      }
    }

    // Strategy 2: Scrape investor cards/rows from DOM
    // OpenVC uses various card layouts - try multiple selectors
    const selectors = [
      // Table rows
      'table tbody tr',
      // Card-based layouts
      '[class*="investor"] [class*="card"]',
      '[class*="fund"] [class*="card"]',
      'a[href*="/fund/"]',
      // List items
      '[class*="investor"] [class*="item"]',
      '[class*="list"] [class*="row"]',
      // Generic data rows
      '[data-investor]',
      '[data-fund]',
    ];

    // Try each selector strategy
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const investor = extractFromElement(el);
          if (investor && investor.name) {
            investors.push(investor);
          }
        });
        if (investors.length > 0) break;
      }
    }

    // Strategy 3: Find all links to /fund/ pages and extract names
    if (investors.length === 0) {
      const fundLinks = document.querySelectorAll('a[href*="/fund/"]');
      fundLinks.forEach(link => {
        const href = link.getAttribute('href');
        const name = decodeURIComponent(href.split('/fund/')[1] || '').replace(/-/g, ' ');
        if (name && !investors.find(i => i.name === name)) {
          const container = link.closest('tr, [class*="card"], [class*="row"], [class*="item"], div') || link;
          const investor = extractFromElement(container);
          investor.name = investor.name || name;
          investor.profileUrl = `https://www.openvc.app${href}`;
          if (investor.name) investors.push(investor);
        }
      });
    }

    // Strategy 4: Deep DOM scan - look for patterns
    if (investors.length === 0) {
      const allElements = document.querySelectorAll('div, article, section, li');
      allElements.forEach(el => {
        const text = el.textContent;
        const links = el.querySelectorAll('a[href*="/fund/"]');
        if (links.length === 1 && el.children.length > 1) {
          const investor = extractFromElement(el);
          const href = links[0].getAttribute('href');
          investor.profileUrl = href.startsWith('http') ? href : `https://www.openvc.app${href}`;
          if (investor.name) investors.push(investor);
        }
      });
    }

    return deduplicateInvestors(investors);
  }

  // Extract investor data from a DOM element (card, row, etc.)
  function extractFromElement(el) {
    const text = el.textContent || '';
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
      profileUrl: '',
    };

    // Name: usually the first heading or strong element, or the link text
    const nameEl = el.querySelector('h1, h2, h3, h4, h5, strong, [class*="name"], [class*="title"]');
    const fundLink = el.querySelector('a[href*="/fund/"]');
    if (nameEl) {
      investor.name = nameEl.textContent.trim();
    } else if (fundLink) {
      investor.name = fundLink.textContent.trim() ||
        decodeURIComponent(fundLink.getAttribute('href').split('/fund/')[1] || '');
    }

    // Profile URL
    if (fundLink) {
      const href = fundLink.getAttribute('href');
      investor.profileUrl = href.startsWith('http') ? href : `https://www.openvc.app${href}`;
    }

    // Email: look for mailto or email patterns
    const mailtoLink = el.querySelector('a[href^="mailto:"]');
    if (mailtoLink) {
      investor.email = mailtoLink.getAttribute('href').replace('mailto:', '');
    } else {
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      if (emailMatch) investor.email = emailMatch[0];
    }

    // Website
    const websiteLink = el.querySelector('a[href^="http"]:not([href*="openvc"])');
    if (websiteLink) {
      investor.website = websiteLink.getAttribute('href');
    }

    // Stage
    const stages = ['pre-seed', 'seed', 'series a', 'series b', 'series c', 'growth', 'late stage'];
    const lowerText = text.toLowerCase();
    const foundStages = stages.filter(s => lowerText.includes(s));
    investor.stage = foundStages.join(', ');

    // Check size - look for currency patterns
    const checkMatch = text.match(/[\$€£]\s*[\d,.]+\s*[kmb]?(?:\s*[-–]\s*[\$€£]?\s*[\d,.]+\s*[kmb]?)?/i) ||
      text.match(/(?:up to|min|max)?\s*(?:USD|EUR|GBP)?\s*[\d,.]+\s*(?:k|m|mln|million|thousand)/i);
    if (checkMatch) investor.checkSize = checkMatch[0].trim();

    // Location
    const locationEl = el.querySelector('[class*="location"], [class*="country"], [class*="geo"]');
    if (locationEl) investor.location = locationEl.textContent.trim();

    // Sectors
    const sectorEl = el.querySelector('[class*="sector"], [class*="vertical"], [class*="industry"]');
    if (sectorEl) investor.sectors = sectorEl.textContent.trim();

    // Tags/pills that might contain stage, sector, or type info
    const tags = el.querySelectorAll('[class*="tag"], [class*="pill"], [class*="badge"], [class*="chip"]');
    if (tags.length) {
      const tagTexts = [...tags].map(t => t.textContent.trim());
      if (!investor.sectors) investor.sectors = tagTexts.join(', ');
    }

    // Type
    const types = ['venture capital', 'angel', 'family office', 'corporate', 'accelerator', 'micro vc', 'syndicate'];
    const foundType = types.find(t => lowerText.includes(t));
    if (foundType) investor.type = foundType;

    // Lead investor
    if (lowerText.includes('lead') || lowerText.includes('leads')) {
      investor.leads = 'Yes';
    }

    return investor;
  }

  // Extract data from Next.js __NEXT_DATA__
  function extractFromNextData(data) {
    const investors = [];

    function traverse(obj, depth = 0) {
      if (depth > 10 || !obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(item => traverse(item, depth + 1));
        return;
      }
      if (typeof obj === 'object') {
        // Check if this looks like an investor/fund object
        if (obj.name && (obj.email || obj.website || obj.checkSize || obj.stage || obj.fundName)) {
          investors.push({
            name: obj.name || obj.fundName || obj.fund_name || '',
            email: obj.email || obj.contact_email || '',
            website: obj.website || obj.url || '',
            stage: Array.isArray(obj.stage) ? obj.stage.join(', ') : (obj.stage || ''),
            checkSize: obj.checkSize || obj.check_size || obj.ticket_size || '',
            location: obj.location || obj.country || obj.hq || obj.headquarters || '',
            sectors: Array.isArray(obj.sectors) ? obj.sectors.join(', ') :
              (obj.sectors || obj.verticals || ''),
            type: obj.type || obj.investor_type || '',
            leads: obj.leads || obj.lead_investor || '',
            description: obj.description || obj.bio || '',
            team: Array.isArray(obj.team) ? obj.team.map(t => t.name || t).join(', ') :
              (obj.team || ''),
            profileUrl: obj.profileUrl || obj.url || '',
          });
        }
        Object.values(obj).forEach(v => traverse(v, depth + 1));
      }
    }

    traverse(data);
    return deduplicateInvestors(investors);
  }

  // Scrape all pages by auto-scrolling
  async function scrapeAllPages() {
    const allData = [];
    let lastHeight = 0;
    let attempts = 0;
    const maxAttempts = 100;

    sendProgress(5, 'Auto-scrolling to load all investors...');

    while (attempts < maxAttempts && !shouldStop) {
      // Scrape current visible content
      const pageData = scrapePage();
      const existingNames = new Set(allData.map(d => d.name));
      const newItems = pageData.filter(d => !existingNames.has(d.name));
      allData.push(...newItems);

      sendProgress(
        Math.min(90, 5 + (attempts / maxAttempts) * 85),
        `Found ${allData.length} investors... scrolling for more`
      );

      // Scroll down
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(1500);

      // Click "Load More" or "Show More" buttons if present
      const loadMoreBtn = document.querySelector(
        'button[class*="load-more"], button[class*="show-more"], ' +
        '[class*="load-more"] button, [class*="pagination"] button:last-child, ' +
        'button:not([disabled])'
      );
      if (loadMoreBtn) {
        const btnText = loadMoreBtn.textContent.toLowerCase();
        if (btnText.includes('load') || btnText.includes('more') || btnText.includes('next')) {
          loadMoreBtn.click();
          await sleep(2000);
        }
      }

      // Check if we've reached the bottom
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        attempts++;
        if (attempts > 3) break;
      } else {
        attempts = 0;
      }
      lastHeight = newHeight;
    }

    return deduplicateInvestors(allData);
  }

  // Scrape by visiting each investor profile for detailed info
  async function scrapeWithProfiles() {
    sendProgress(5, 'Collecting investor profile links...');

    // First, gather all fund profile URLs from current/all pages
    const links = new Set();
    const fundLinks = document.querySelectorAll('a[href*="/fund/"]');
    fundLinks.forEach(link => {
      const href = link.getAttribute('href');
      const fullUrl = href.startsWith('http') ? href : `https://www.openvc.app${href}`;
      links.add(fullUrl);
    });

    if (links.size === 0) {
      throw new Error('No investor profiles found on this page. Navigate to the search page first.');
    }

    const urls = [...links];
    const allData = [];

    for (let i = 0; i < urls.length; i++) {
      if (shouldStop) break;

      sendProgress(
        5 + (i / urls.length) * 90,
        `Scraping profile ${i + 1}/${urls.length}...`
      );

      try {
        const data = await scrapeProfilePage(urls[i]);
        if (data) allData.push(data);
      } catch (e) {
        console.warn(`Failed to scrape ${urls[i]}:`, e);
      }

      // Polite delay between requests
      await sleep(1000 + Math.random() * 1000);
    }

    return allData;
  }

  // Fetch and parse a single investor profile page
  async function scrapeProfilePage(url) {
    const response = await fetch(url);
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
      profileUrl: url,
    };

    // Try __NEXT_DATA__ first
    const nextDataEl = doc.getElementById('__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const data = JSON.parse(nextDataEl.textContent);
        const extracted = extractFromNextData(data);
        if (extracted.length) return { ...extracted[0], profileUrl: url };
      } catch (e) {}
    }

    // Name from title or h1
    const title = doc.querySelector('title');
    if (title) {
      investor.name = title.textContent.split('|')[0].trim();
    }
    const h1 = doc.querySelector('h1');
    if (h1) investor.name = h1.textContent.trim();

    // Extract from full page content
    const fullData = extractFromElement(doc.body);
    return {
      ...investor,
      ...fullData,
      name: investor.name || fullData.name,
      profileUrl: url,
    };
  }

  // Apply user-selected filters
  function applyFilters(data, filters) {
    return data.filter(item => {
      // Stage filter
      if (filters.stages?.length) {
        const itemStage = (item.stage || '').toLowerCase();
        const matches = filters.stages.some(s => itemStage.includes(s.replace('-', ' ')));
        if (!matches) return false;
      }

      // Check size filter
      if (filters.checkMin || filters.checkMax) {
        const size = parseCheckSize(item.checkSize);
        if (filters.checkMin && size < Number(filters.checkMin)) return false;
        if (filters.checkMax && size > Number(filters.checkMax)) return false;
      }

      // Location filter
      if (filters.location) {
        const loc = (item.location || '').toLowerCase();
        const filterLoc = filters.location.toLowerCase();
        if (!filterLoc.split(',').some(l => loc.includes(l.trim()))) return false;
      }

      // Sector filter
      if (filters.sector) {
        const sectors = (item.sectors || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const combined = `${sectors} ${name} ${desc}`;
        const filterSectors = filters.sector.toLowerCase().split(',');
        if (!filterSectors.some(s => combined.includes(s.trim()))) return false;
      }

      // Type filter
      if (filters.type) {
        const itemType = (item.type || '').toLowerCase();
        if (!itemType.includes(filters.type.replace('-', ' '))) return false;
      }

      // Lead investor filter
      if (filters.leadsOnly) {
        if (!item.leads || item.leads.toLowerCase() === 'no') return false;
      }

      // Email only filter
      if (filters.emailOnly) {
        if (!item.email) return false;
      }

      return true;
    });
  }

  // Parse check size string to number
  function parseCheckSize(str) {
    if (!str) return 0;
    const clean = str.replace(/[^0-9.kmb]/gi, '').toLowerCase();
    const num = parseFloat(clean) || 0;
    if (clean.includes('b')) return num * 1000000000;
    if (clean.includes('m')) return num * 1000000;
    if (clean.includes('k')) return num * 1000;
    return num;
  }

  // Deduplicate by name
  function deduplicateInvestors(investors) {
    const seen = new Map();
    investors.forEach(inv => {
      if (!inv.name) return;
      const existing = seen.get(inv.name);
      if (!existing) {
        seen.set(inv.name, inv);
      } else {
        // Merge - keep non-empty values
        Object.keys(inv).forEach(key => {
          if (inv[key] && !existing[key]) {
            existing[key] = inv[key];
          }
        });
      }
    });
    return [...seen.values()];
  }

  // Send progress update to popup
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
