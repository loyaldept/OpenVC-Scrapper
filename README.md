<div align="center">

# OpenVC Scrapper

### Scrape 16,000+ VC contacts from OpenVC in one click.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/loyaldept/OpenVC-Scrapper)
[![License](https://img.shields.io/badge/License-MIT-6C5CE7?style=for-the-badge)](LICENSE)
[![Built by](https://img.shields.io/badge/Built%20by-Zuhayr%20Zhanoff-000?style=for-the-badge)](mailto:founders@trysiml.com)

**Extract VC names, emails, websites, check sizes, stages, and more — with powerful filters and one-click CSV/JSON export.**

---

</div>

## What It Does

OpenVC Scrapper is a Chrome extension that lets you extract investor data directly from [OpenVC](https://www.openvc.app) — the largest open database of VCs and angel investors. No API keys, no Python scripts, no headless browsers. Just install, click, and export.

## Features

### 3 Scrape Modes

| Mode | What it does |
|------|-------------|
| **Current Page** | Instantly scrapes all visible investors on the page |
| **All Pages (Auto-Scroll)** | Automatically scrolls through the entire list and captures everything |
| **Profile Detail** | Visits each investor's profile page for complete data (emails, team, description) |

### Powerful Filters

Filter results before or after scraping:

- **Stage** — Pre-Seed, Seed, Series A, Series B, Growth
- **Check Size** — Set min/max investment range
- **Location** — Filter by geography (USA, Europe, Asia, etc.)
- **Sector** — SaaS, Fintech, AI, Health, Climate, etc.
- **Investor Type** — VC, Angel, Family Office, Corporate VC, Accelerator, Micro VC
- **Lead Investors Only** — Show only investors who lead rounds
- **Email Only** — Show only investors with available email

### Export Options

- **CSV** — Ready for Excel, Google Sheets, or your CRM
- **JSON** — For developers and automation pipelines
- **Clipboard** — Quick copy-paste into any tool

### Data Fields Captured

| Field | Example |
|-------|---------|
| Name | Sequoia Capital |
| Email | contact@sequoiacap.com |
| Website | sequoiacap.com |
| Stage | Seed, Series A |
| Check Size | $500K - $5M |
| Location | USA |
| Sectors | SaaS, AI, Fintech |
| Type | Venture Capital |
| Leads | Yes |
| Description | Investor bio |
| Team | Partner names |
| Profile URL | openvc.app/fund/... |

---

## Installation

### Step 1 — Download the Extension

**Option A: Clone with Git**
```bash
git clone https://github.com/loyaldept/OpenVC-Scrapper.git
```

**Option B: Download ZIP**
1. Click the green **Code** button at the top of this repo
2. Click **Download ZIP**
3. Unzip the downloaded file to a folder on your computer

### Step 2 — Load into Chrome

1. Open Chrome and type `chrome://extensions/` in the address bar
2. Toggle **Developer mode** ON (top right corner)
3. Click **Load unpacked**
4. Navigate to and select the `OpenVC-Scrapper` folder
5. The extension icon (purple **VC** badge) will appear in your toolbar

> **Tip:** Click the puzzle icon in Chrome's toolbar and pin **OpenVC Scrapper** for quick access.

### Step 3 — Start Scraping

1. Go to [openvc.app/search](https://www.openvc.app/search)
2. Log in to your OpenVC account *(recommended for full data access)*
3. Click the **OpenVC Scrapper** icon in your toolbar
4. Set your filters (optional)
5. Choose a scrape mode
6. Click **Start Scraping**
7. Export your results as CSV, JSON, or copy to clipboard

---

## How It Works

The extension runs inside your browser using your existing OpenVC session — no external servers, no data sent anywhere. It uses 4 smart extraction strategies:

1. **Next.js SSR Data** — Extracts structured data from the page's server-rendered JSON
2. **DOM Card Parsing** — Reads investor cards and table rows directly
3. **Fund Link Extraction** — Discovers investor profiles from page links
4. **Deep Scan** — Falls back to pattern matching across the full page

Results are stored locally in your browser and persist between sessions until you clear them.

---

## Project Structure

```
OpenVC-Scrapper/
├── manifest.json            # Chrome Extension config (Manifest V3)
├── popup/
│   ├── popup.html           # Extension popup interface
│   ├── popup.css            # UI styling
│   └── popup.js             # Filter logic, export, controls
├── content/
│   ├── content.js           # Core scraper (4 extraction strategies)
│   └── content.css          # Visual indicators during scraping
├── background/
│   └── background.js        # Service worker & context menu
└── icons/                   # Extension icons
```

---

## FAQ

**Q: Do I need an OpenVC account?**
A: The extension works without one, but logging in gives access to more data (emails, advanced filters).

**Q: Will this get my account banned?**
A: The extension adds polite delays between requests. However, use responsibly and respect OpenVC's terms of service.

**Q: Where is my data stored?**
A: Locally in your browser's extension storage. Nothing is sent to any external server.

**Q: Can I use the exported CSV in my CRM?**
A: Yes. The CSV is compatible with HubSpot, Salesforce, Apollo, Google Sheets, Excel, and any tool that imports CSV.

---

## Disclaimer

This tool is for **personal research and educational purposes only**. Please respect OpenVC's terms of service. The author is not responsible for misuse of this tool.

---

<div align="center">

### Built by [Zuhayr Zhanoff](mailto:founders@trysiml.com)

**founders@trysiml.com**

If this saved you time, give it a star.

</div>
