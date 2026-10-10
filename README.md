[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/jlsookiki-secondhand-mcp-badge.png)](https://mseep.ai/app/jlsookiki-secondhand-mcp)
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/3c5664f0-af0e-47f3-8027-de49f25cad5c)

# Secondhand MCP

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants search secondhand marketplaces. Search Facebook Marketplace, eBay, Depop, Poshmark, and Kijiji for used and secondhand items. Filter by price, category, condition, size, and color, then get full listing details with photos, descriptions, and seller info.

Works with Claude Desktop, Claude Code, Cursor, and other clients that run MCP servers locally.

> [!TIP]
> **Using ChatGPT? This one won't work there.**
>
> It runs on your computer, so it only works where your computer is — Claude Desktop, Claude Code, Cursor. [Secondhand MCP Cloud](https://secondhandmcp.com) is the same search, always on, so whichever assistant you actually use can reach it. Free tier, no card.

| | This repo | [Cloud](https://secondhandmcp.com) |
|---|---|---|
| Claude Desktop, Code, Cursor | ✅ | ✅ |
| ChatGPT, Claude, and other assistants | — | ✅ |
| Searching from your phone | — | ✅ |
| Chrome running in the background | needed | not needed |
| Price | free, forever | free tier, then $4.99 |

## Supported Marketplaces

| Marketplace | Auth Required | Notes |
|-------------|---------------|-------|
| Facebook Marketplace | No | Location-based search, including Canadian cities |
| Kijiji | No | Canadian classifieds. City and province, or all of Canada |
| eBay | Yes (API keys) | Official Browse API. Set `EBAY_MARKETPLACE_ID` to `EBAY_CA` for ebay.ca |
| Depop | No | Requires Chrome installed |
| Poshmark | No | US site. Requires Chrome installed |
| Poshmark Canada | No | poshmark.ca. CAD, ships across Canada. No browser |

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "secondhand": {
      "command": "npx",
      "args": ["-y", "secondhand-mcp"],
      "env": {
        "EBAY_CLIENT_ID": "your-ebay-client-id",
        "EBAY_CLIENT_SECRET": "your-ebay-client-secret",
        "EBAY_MARKETPLACE_ID": "EBAY_US"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "secondhand": {
      "command": "npx",
      "args": ["-y", "secondhand-mcp"],
      "env": {
        "EBAY_CLIENT_ID": "your-ebay-client-id",
        "EBAY_CLIENT_SECRET": "your-ebay-client-secret",
        "EBAY_MARKETPLACE_ID": "EBAY_US"
      }
    }
  }
}
```

eBay, Depop, and Poshmark are all optional — if eBay API keys are missing or Chrome isn't installed, those marketplaces are automatically disabled and the rest still work.

### Depop & Poshmark / Chrome Requirement

Depop and Poshmark require a headless browser. If **Google Chrome or Chromium** is installed on your system, both are automatically enabled — no config needed. If Chrome isn't found, they are silently skipped.

On macOS, the first time you search Depop or Poshmark, you may see a system prompt asking to allow Node.js to control Chrome. This is expected — puppeteer needs to launch Chrome in headless mode. Allow it once and it won't ask again.

The browser runs invisibly in the background and only launches when you actually search Depop or Poshmark.

## Configuration

### Choosing Marketplaces

By default all marketplaces are enabled. To limit which are active, set the `MARKETPLACES` env var (comma-separated):

```json
{
  "env": {
    "MARKETPLACES": "facebook,ebay"
  }
}
```

Valid values: `facebook`, `kijiji`, `ebay`, `depop`, `poshmark`, `poshmark-ca`

### eBay API Keys

eBay uses the official [Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html). You need a free eBay developer account:

1. Create an account at [developer.ebay.com](https://developer.ebay.com)
2. Create an application to get a Client ID and Client Secret
3. Add them to your MCP config as `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`

### eBay Marketplace / Region

By default the server targets the **US** eBay site. To search a different regional marketplace, set the `EBAY_MARKETPLACE_ID` environment variable:

```json
{
  "env": {
    "EBAY_MARKETPLACE_ID": "EBAY_DE"
  }
}
```

Common values:

| Value | Site |
|-------|------|
| `EBAY_US` | ebay.com (default) |
| `EBAY_DE` | ebay.de |
| `EBAY_GB` | ebay.co.uk |
| `EBAY_AU` | ebay.com.au |
| `EBAY_FR` | ebay.fr |
| `EBAY_IT` | ebay.it |
| `EBAY_ES` | ebay.es |
| `EBAY_CA` | ebay.ca |

The full list is available in the [eBay API docs](https://developer.ebay.com/api-docs/static/rest-request-components.html#marketpl).

## Tools

### `search_marketplace`

Search for items across marketplaces.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | | Search terms |
| `marketplace` | No | `facebook` | `facebook`, `kijiji`, `ebay`, `depop`, `poshmark`, `poshmark-ca`, or `all` |
| `location` | No | `san francisco` | City for Facebook and Kijiji. US: `City, ST` (`Austin, TX`). Canada: `City, PR` (`Toronto, ON`, `Vancouver, BC`). Kijiji searches all of Canada when the place is not in Canada, and says so. `Ontario` searches both Kijiji Ontario areas, not all of Canada. |
| `radiusMiles` | No | `25` | Search radius in miles, up to 500 (Facebook only) |
| `maxPrice` | No | | Maximum price |
| `minPrice` | No | | Minimum price |
| `limit` | No | `20` | Max results |
| `showSold` | No | `false` | Include sold items (Facebook only) |
| `includeImages` | No | `false` | Include image URLs in output |
| `sort` | No | cheapest first | Printed order. `relevance` and `most_popular` keep marketplace order. Price sorts put listings without a numeric price last. `newest` uses the posted date. When omitted, results are cheapest first, and unpriced listings still go last. Kijiji ignores `most_popular`. |
| `dealer` | No | | Kijiji only. `true` keeps dealer ads. `false` keeps owner ads. |
| `shipping` | No | | Kijiji only. `true` keeps ads that say they ship. Search cards usually omit that flag. Local delivery is not shipping. |
| `condition` | No | | Item condition. eBay: `new`, `like_new`, `good`, `fair`. Depop: `new`, `like_new`, `excellent`, `good`, `fair`, `used`. Poshmark: `new` (NWT), `like_new` (NWOT), `good`, `fair` |
| `category` | No | | Product category. Depop: `tops`, `bottoms`, `dresses`, `coats-jackets`, `footwear`, `accessories`, `bags`, `jewellery`, `activewear`, `swimwear`. Poshmark: `Jackets_&_Coats`, `Dresses`, `Shoes`, `Accessories`, etc. |
| `brand` | No | | Brand filter (Poshmark only): e.g. `"Nike"`, `"Levi's"`, `"Gucci"` |
| `department` | No | | Department filter (Poshmark only): `Women`, `Men`, `Kids` |
| `sizes` | No | | Size filter (Depop, Poshmark): e.g. `["S", "M", "L"]` or `["US 9", "US 10"]` |
| `colors` | No | | Color filter (Depop, Poshmark): `black`, `white`, `red`, `blue`, `green`, `yellow`, `orange`, `pink`, `purple`, `brown`, `grey`, `cream`, `multi`, `silver`, `gold` |

**Data returned per marketplace:**

| Field | Facebook | Kijiji | eBay | Depop | Poshmark |
|-------|----------|--------|------|-------|----------|
| Title | Yes | Yes | Yes | Yes | Yes |
| Price | Yes | Yes | Yes | Yes | Yes |
| Location | City | City | City, State | — | — |
| Condition | — | When the ad has one | Yes | — | — |
| Posted date | — | Yes | — | — | Canada search |
| Dealer | — | Yes | — | — | — |
| Photo count | 1 thumbnail | 1 thumbnail | 1 thumbnail | 1 thumbnail | 1 thumbnail |
| Seller | Yes | Name is on the listing, not the search card | Yes | — | Canada search |

### `get_listing_details`

Get full details for a specific listing using an ID from search results.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `listingId` | Yes | | Listing ID from search results |
| `marketplace` | No | `facebook` | `facebook`, `kijiji`, `ebay`, `depop`, `poshmark`, or `poshmark-ca` |

**Data returned per marketplace:**

| Field | Facebook | Kijiji | eBay | Depop | Poshmark |
|-------|----------|--------|------|-------|----------|
| Description | Yes | Yes | Yes | Yes | Yes |
| All photos | Yes | Yes | Yes | Yes | Yes |
| Location | City | City | City, State, Country | — | — |
| Seller | Name | Name | Username | Username | Username |
| Delivery types | Yes | — | — | — | — |
| Shipping | Yes/No | Yes/No on the listing. Search cards rarely say | Service codes | Yes/No | Always included. Cost is on the listing |
| Offer type | — | For sale or wanted, on the listing | — | — | — |
| Posted date | — | Yes | — | — | Yes |

### `list_marketplaces`

List all enabled marketplaces and their status.

### `search` / `fetch` (deep research)

Convenience pair following the [ChatGPT Deep Research tool contract](https://developers.openai.com/api/docs/guides/deep-research) — exact names, a single string argument each:

- `search(query)` — searches every enabled marketplace at once and returns `{ results: [{ id, title, text, url }] }`, where `id` is `marketplace:listingId`
- `fetch(id)` — returns full listing details for a `search` result ID as `{ id, title, text, url, metadata }`

Useful for research-style clients that expect these standard tool names; for filtered searches use `search_marketplace`.

## How It Works

**Facebook Marketplace** searches listings by location, radius, price, and query. City names in the US and Canada resolve offline. No login or browser needed. Facebook serves non-browser callers a gated version of its search API from time to time (a single result with more pages behind it, or stubs with no listing inside). When that happens the server reads the logged-out search page instead, which still carries a full first page of results.

**Kijiji** searches kijiji.ca buy-and-sell ads. Pass a Canadian city and province, such as `Toronto, ON`. A place Kijiji does not cover, including the default San Francisco, returns Canada-wide results and a note that says so. `Ontario` searches both Kijiji Ontario areas. Prices are Canadian dollars. Search cards include the posted date and a dealer flag. Whether an ad is wanted or for sale, the seller name, and whether it ships are on the listing. No login or browser needed.

**eBay** uses the official eBay Browse API with OAuth 2.0 client credentials. Tokens are cached and auto-refreshed. The target regional marketplace is controlled by `EBAY_MARKETPLACE_ID` (default: `EBAY_US`). Use `EBAY_CA` for ebay.ca.

**Depop** uses a headless browser to search listings with support for category, condition, size, and color filters. The browser instance is shared across requests.

**Poshmark** uses a headless browser to search poshmark.com. It supports condition, size, color, sort, and price filters. A Canadian location on this marketplace searches poshmark.ca instead, but the marketplace is registered only when Chrome or Chromium is installed.

**Poshmark Canada** (`poshmark-ca`) searches poshmark.ca without a browser. Prices are CAD. Items ship across Canada, so a city does not narrow the results. Search results include the post date. They do not include a shipping cost or tax. Open the listing for the shipping cost, and check tax at checkout. A `posh.mk` short link works as the listing id. Pass `marketplace` as `poshmark-ca`.

## Development

```bash
git clone https://github.com/jlsookiki/secondhand-mcp.git
cd secondhand-mcp
npm install
npm run build
```

### Adding a Marketplace

1. Create a new file in `src/marketplaces/`
2. Extend `BaseMarketplace` and implement `search()` and optionally `getListingDetails()`
3. Add the constructor to `allMarketplaces` in `src/marketplaces/index.ts`

## Limitations

- **Facebook**: May break if Facebook changes their frontend
- **Kijiji**: May break if Kijiji changes the search page. Covers Canada only.
- **eBay**: Requires developer API keys (free tier available)
- **Depop**: Requires Chrome/Chromium installed; slower than Facebook/eBay (~5s per search)
- **Poshmark**: US search requires Chrome/Chromium. No official API, so the US site is page scraping.
- **Poshmark Canada**: No browser. May break if poshmark.ca changes `/vm-rest/posts`.
- **Rate limiting**: Don't make too many requests too quickly

## License

MIT
