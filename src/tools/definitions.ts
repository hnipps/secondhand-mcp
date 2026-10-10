import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { listMarketplaceNames } from '../marketplaces/index.js';

// Every tool only reads marketplace data. Nothing here can message a seller,
// make an offer, or buy anything.
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

type AnnotatedTool = Tool & {
  annotations?: { title?: string } & Partial<typeof READ_ONLY>;
};

export const tools: AnnotatedTool[] = [
  {
    name: 'search_marketplace',
    description: `Search live listings on secondhand marketplaces by keyword. Marketplaces: ${listMarketplaceNames().join(', ')}. Returns up to \`limit\` listings with id, title, price, location, seller and a thumbnail; call get_listing_details with an id for the description, every photo and shipping. Requirements: Facebook Marketplace needs no credentials but is local, so pass \`location\` as "City, ST" or, in Canada, "City, PR"; Kijiji is Canada-only and uses the same location string; eBay needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the server environment; Depop and Poshmark US need Chrome or Chromium on the machine. Poshmark Canada is \`poshmark-ca\`. It searches poshmark.ca in CAD with no browser, and a city does not narrow it. Search results include the post date. They do not include a city, a shipping cost, or tax. Open the listing for the shipping cost, and check tax at checkout. \`get_listing_details\` accepts a posh.mk short link. Behavior: read-only, no login, no purchases. Facebook may rate-limit repeated searches from one IP, and results for a query are cached for 90 seconds. A Kijiji location outside Canada returns Canada-wide results and says so. Location Ontario searches both Kijiji Ontario areas, not all of Canada. Kijiji search cards include the posted date and whether the seller is a dealer. Pass dealer false to drop dealer ads, or dealer true to keep only those. Pass shipping true to keep only ads that say they ship. Search cards usually omit that flag, and local delivery is not shipping. Whether an ad is wanted or for sale is on the listing, not the search card. Errors: a marketplace that fails returns success:false with the reason instead of throwing; an unknown marketplace name lists the valid ones; an empty result usually means the query was too specific, so widen the keywords or drop a price bound before concluding nothing exists. Not for: buying, messaging sellers, saved searches, or new-retail catalogs.`,
    annotations: { title: 'Search Marketplace', ...READ_ONLY },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "stroller", "iPhone 14", "vintage couch")'
        },
        marketplace: {
          type: 'string',
          description: `Marketplace to search. Options: ${listMarketplaceNames().join(', ')}, or "all" to search all marketplaces`,
          default: 'facebook'
        },
        location: {
          type: 'string',
          description: 'City and region. Facebook and Kijiji: "City, ST" in the US ("Austin, TX") or "City, PR" in Canada ("Toronto, ON", "Vancouver, BC"). Resolve neighborhoods, postal codes, metro areas and "near me" to a city and region before calling. A bare city name is ambiguous. Kijiji ignores a location it does not cover and searches Canada instead. Kijiji treats Ontario as both of its Ontario areas, not as all of Canada. For Poshmark Canada, pass marketplace "poshmark-ca". That search ignores the city. A Canadian location on marketplace "poshmark" also searches poshmark.ca when that marketplace is registered. Depop and eBay ignore location.',
          default: 'san francisco'
        },
        radiusMiles: {
          type: 'number',
          description: 'How far around the location to search, in miles (default 25, max 500). Facebook only. Widen it for a metro area or a rural town.',
          default: 25
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price filter (optional)'
        },
        minPrice: {
          type: 'number',
          description: 'Minimum price filter (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20). eBay paginates automatically to fetch more than 200 (eBay caps offset + limit at 10,000).',
          default: 20
        },
        offset: {
          type: 'number',
          description: 'Starting result offset for pagination (default: 0). eBay only; other marketplaces ignore it.',
          default: 0
        },
        showSold: {
          type: 'boolean',
          description: 'Include sold/unavailable items in results (default: false)',
          default: false
        },
        includeImages: {
          type: 'boolean',
          description: 'Include full image URLs in results (default: false). Use get_listing_details for full photos.',
          default: false
        },
        sort: {
          type: 'string',
          description: 'Sort order. relevance and most_popular keep the marketplace order. price_low_to_high and price_high_to_low put listings without a numeric price last. newest uses the posted date and puts listings without one last. When sort is omitted, results are printed cheapest first, and listings without a numeric price still go last. Kijiji has no most_popular sort and ignores it.'
        },
        condition: {
          type: 'string',
          description: 'Item condition filter. eBay: new, like_new, good, fair. Depop: new, like_new, excellent, good, fair, used. Poshmark: new (NWT), like_new (NWOT), good, fair. Use "any" for no filter.',
        },
        category: {
          type: 'string',
          description: 'Product category. Depop: tops, bottoms, dresses, coats-jackets, footwear, accessories, bags, jewellery, activewear, swimwear. Poshmark: use underscore-separated names like Jackets_&_Coats, Dresses, Shoes, Accessories, etc.',
        },
        brand: {
          type: 'string',
          description: 'Filter by brand (Poshmark only). e.g. "Nike", "Levi\'s", "Gucci"',
        },
        department: {
          type: 'string',
          description: 'Filter by department (Poshmark only). Options: Women, Men, Kids',
        },
        sizes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by sizes (Depop, Poshmark). Example: ["S", "M", "L"] or ["US 9", "US 10"]',
        },
        colors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by colors (Depop, Poshmark). Options: black, white, red, blue, green, yellow, orange, pink, purple, brown, grey, cream, multi, silver, gold',
        },
        dealer: {
          type: 'boolean',
          description: 'Kijiji only. true keeps dealer ads. false keeps owner ads. Other marketplaces ignore it.',
        },
        shipping: {
          type: 'boolean',
          description: 'Kijiji only. true keeps ads whose search card says the seller ships. Search cards usually omit that flag, so this can return nothing. Local delivery is not shipping. Other marketplaces ignore it.',
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_listing_details',
    description: 'Get one listing in full using an id from search_marketplace or from a marketplace URL: description, every photo, location, seller and shipping options. Photos: by default (imageMode:"urls") you get direct full-resolution CDN image URLs to fetch yourself, which is the most reliable option because some CDNs block server-side fetches. Set imageMode:"inline" (or includeImages:true) to have the server fetch the photos and return them as base64 image blocks; if that fetch is blocked the server falls back to URLs. Use imageSize to trade resolution for payload and maxImages to cap the count. Requirements: the same as search_marketplace for that marketplace. Behavior: read-only, one listing per call, no login. Errors: a listing that has been removed, or an id from the wrong marketplace, returns an error message rather than a partial listing. Not for: searching (use search_marketplace) or fetching many listings at once.',
    annotations: { title: 'Get Listing Details', ...READ_ONLY },
    inputSchema: {
      type: 'object',
      properties: {
        listingId: {
          type: 'string',
          description: 'The listing id from search results, a marketplace URL, or a posh.mk short link for Poshmark Canada'
        },
        marketplace: {
          type: 'string',
          description: 'Which marketplace the listing is from (default: facebook)',
          default: 'facebook'
        },
        imageMode: {
          type: 'string',
          enum: ['urls', 'inline'],
          description: 'How photos are returned. "urls" (default): direct full-resolution CDN image URLs for you to fetch yourself — most reliable, bypasses CDN blocking of server-side fetches, defaults to full resolution. "inline": server fetches every photo and returns them as base64 image blocks in this one call; if the server fetch is blocked it automatically falls back to returning the URLs.',
          default: 'urls'
        },
        includeImages: {
          type: 'boolean',
          description: 'Deprecated alias for imageMode:"inline". If true and imageMode is unset, photos are fetched server-side and returned inline as base64.',
          default: false
        },
        imageSize: {
          type: 'string',
          enum: ['thumb', 'standard', 'full'],
          description: 'Resolution for eBay images: thumb (~400px), standard (~800px), full (~1600px). Defaults to full for imageMode "urls" and standard for "inline". Non-eBay images are returned as-is.',
        },
        maxImages: {
          type: 'number',
          description: 'Cap the number of photos returned (default: all). Use to keep the response small for listings with many photos.'
        }
      },
      required: ['listingId']
    }
  },
  {
    name: 'list_marketplaces',
    description: 'List the marketplaces this server can search right now, with each one\'s display name, whether it needs credentials, and whether it is currently reachable. Call it once when a search fails with an unknown-marketplace error or before offering a marketplace the user did not name. Behavior: read-only, no arguments, no network calls beyond a health check. Not for: searching or fetching listings.',
    annotations: { title: 'List Marketplaces', ...READ_ONLY },
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  // `search` and `fetch` follow the ChatGPT Deep Research tool contract:
  // exact names, a single string argument each, JSON result shapes
  // { results: [{ id, title, text, url }] } and { id, title, text, url, metadata }.
  // https://developers.openai.com/api/docs/guides/deep-research
  {
    name: 'search',
    description: 'Search every available secondhand marketplace at once with a single query string, following the ChatGPT deep research tool contract. Returns results whose ids (marketplace:listingId) can be passed to the fetch tool. Behavior: read-only; Facebook results use the server\'s default location because this contract carries no location, so prefer search_marketplace when a place matters. Not for: filtered or local searches.',
    annotations: { title: 'Search', ...READ_ONLY },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch',
    description: 'Fetch one listing in full for an id returned by the search tool, following the ChatGPT deep research tool contract. Id format: marketplace:listingId (for example "facebook:12345" or "ebay:v1|123|456"). Behavior: read-only. Errors: an id without the marketplace prefix, or for a removed listing, returns an error message. Not for: ids from search_marketplace, which take get_listing_details.',
    annotations: { title: 'Fetch', ...READ_ONLY },
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Result ID from the search tool (format: marketplace:listingId)'
        }
      },
      required: ['id']
    }
  }
];
