# OpenVC Scrapper

Chrome extension to scrape VC names, emails, and contact info from [OpenVC](https://www.openvc.app) with powerful filtering and export capabilities.

## Features

- **3 Scrape Modes**:
  - **Current Page** — scrape visible investors on the page
  - **All Pages** — auto-scroll to load and scrape all investors
  - **Profile Detail** — visit each investor profile for full details (name, email, check size, team, etc.)

- **Filters**:
  - Investment stage (Pre-Seed, Seed, Series A/B, Growth)
  - Check size range (min/max)
  - Location / Geography
  - Sector / Vertical (SaaS, Fintech, AI, etc.)
  - Investor type (VC, Angel, Family Office, Corporate, Accelerator)
  - Lead investors only
  - Investors with email only

- **Export**:
  - CSV download
  - JSON download
  - Copy to clipboard

- **Smart Extraction**: Automatically tries multiple strategies — Next.js SSR data, DOM cards, fund links, deep scan

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `OpenVC-Scrapper` folder
6. The extension icon appears in your toolbar

## Usage

1. Navigate to [openvc.app/search](https://www.openvc.app/search)
2. Log in to your OpenVC account (recommended for full data access)
3. Click the **OpenVC Scrapper** extension icon
4. Set your desired filters
5. Choose a scrape mode and click **Start Scraping**
6. Export results as CSV, JSON, or copy to clipboard

## Data Fields

| Field | Description |
|-------|-------------|
| Name | Fund / Investor name |
| Email | Contact email |
| Website | Investor website |
| Stage | Investment stages (Pre-Seed, Seed, etc.) |
| Check Size | Typical investment amount |
| Location | Headquarters / Geography |
| Sectors | Industry verticals |
| Type | VC, Angel, Family Office, etc. |
| Leads | Whether they lead rounds |
| Description | Investor bio / description |
| Team | Team members |
| Profile URL | OpenVC profile link |

## Notes

- The extension runs in your browser session, so it works with your existing OpenVC login
- Some data (emails, advanced filters) may require an OpenVC account
- A polite delay is added between profile requests to avoid rate limiting
- Results persist in extension storage between sessions until cleared

## Disclaimer

This tool is for personal research purposes. Please respect OpenVC's terms of service and use responsibly.
