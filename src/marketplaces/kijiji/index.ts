/**
 * Kijiji search and listing pages are server-rendered.
 * The Apollo cache in each page is the result set. No login and no browser.
 */

import { BaseMarketplace } from '../base.js';
import { Listing, ListingDetails, SearchParams, SearchResult, Sort } from '../../types.js';
import { USER_AGENT, canadaArea, loadKijijiAreas, matchKijijiAreas, KijijiArea } from './locations.js';
import { detailsFromHtml, listingsFromSearchHtml } from './parse.js';

const PAGE_SIZE = 40;
const MAX_PAGES = 3;

const SORT_PARAM: Partial<Record<Sort, string>> = {
  relevance: 'relevance',
  newest: 'dateDesc',
  price_low_to_high: 'priceAsc',
  price_high_to_low: 'priceDesc',
};

export class KijijiMarketplace extends BaseMarketplace {
  readonly name = 'kijiji';
  readonly displayName = 'Kijiji';
  readonly requiresAuth = false;

  async search(params: SearchParams): Promise<SearchResult> {
    const query = params.query;
    const location = params.location ?? 'san francisco';
    const limit = Math.max(0, params.limit ?? 20);

    try {
      const areas = await loadKijijiAreas();
      const matched = matchKijijiAreas(areas, location);
      const searched = matched.length > 0 ? matched : [canadaArea(areas)];
      const pages = await Promise.all(
        searched.map((area) => collectPages(area, query, limit, params.minPrice, params.maxPrice, params.sort, params))
      );
      const listings = mergePages(pages, limit);
      const result: SearchResult = {
        marketplace: this.name,
        success: true,
        listings,
        totalFound: listings.length,
      };
      const note = searchNote(location, matched, params);
      if (note) result.note = note;
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return this.createError(`Kijiji search failed: ${reason}`);
    }
  }

  async getListingDetails(listingId: string): Promise<ListingDetails> {
    const id = listingId.trim();
    const response = await fetch(`https://www.kijiji.ca/v-view-details/${encodeURIComponent(id)}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`Kijiji listing ${id} responded ${response.status}`);
    return detailsFromHtml(await response.text(), id);
  }
}

async function collectPages(
  area: { id: number; slug: string },
  query: string,
  limit: number,
  minPrice: number | undefined,
  maxPrice: number | undefined,
  sort: Sort | undefined,
  params: SearchParams
): Promise<Listing[]> {
  const listings: Listing[] = [];
  const seen = new Set<string>();
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(limit / PAGE_SIZE)));
  const scrapedAt = new Date().toISOString();

  for (let page = 1; page <= pages && listings.length < limit; page++) {
    const response = await fetch(searchUrl(area, query, page, minPrice, maxPrice, sort), {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`Kijiji search responded ${response.status}`);
    const batch = listingsFromSearchHtml(await response.text(), scrapedAt);
    if (batch.length === 0) break;
    for (const listing of batch) {
      if (seen.has(listing.id) || !keepsListing(listing, params)) continue;
      seen.add(listing.id);
      listings.push(listing);
      if (listings.length >= limit) break;
    }
  }
  return listings;
}

function mergePages(pages: Listing[][], limit: number): Listing[] {
  const merged: Listing[] = [];
  const seen = new Set<string>();
  const cursors = pages.map(() => 0);
  while (merged.length < limit) {
    let added = false;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      while (cursors[i] < page.length && seen.has(page[cursors[i]].id)) cursors[i] += 1;
      if (cursors[i] >= page.length) continue;
      const listing = page[cursors[i]];
      cursors[i] += 1;
      seen.add(listing.id);
      merged.push(listing);
      added = true;
      if (merged.length >= limit) break;
    }
    if (!added) break;
  }
  return merged;
}

function keepsListing(listing: Listing, params: SearchParams): boolean {
  if (params.dealer === true && listing.dealer !== true) return false;
  if (params.dealer === false && listing.dealer !== false) return false;
  if (params.shipping === true && listing.shipping !== true) return false;
  return true;
}

function searchNote(location: string, matched: KijijiArea[], params: SearchParams): string | undefined {
  const notes: string[] = [];
  if (matched.length === 0) {
    notes.push(`Kijiji has no area named "${location}", so these results cover Canada.`);
  } else if (matched.length > 1) {
    const names = matched.map((area) => area.name).join(' and ');
    notes.push(`Kijiji splits ${location} into ${names}. These results cover each of them.`);
  }
  if (params.dealer === false) notes.push('Dealer ads are left out.');
  if (params.dealer === true) notes.push('Only dealer ads are included.');
  if (params.shipping === true) {
    notes.push('Only ads that say they ship are included. Kijiji search cards usually omit that, and local delivery is not shipping.');
  }
  return notes.length > 0 ? notes.join(' ') : undefined;
}

export function searchUrl(
  area: { id: number; slug: string },
  query: string,
  page: number,
  minPrice?: number,
  maxPrice?: number,
  sort?: Sort
): string {
  const keyword = querySlug(query);
  const pageSeg = page > 1 ? `page-${page}/` : '';
  const path = `/b-buy-sell/${area.slug}/${keyword}/${pageSeg}k0c10l${area.id}`;
  const params = new URLSearchParams();
  const price = priceParam(minPrice, maxPrice);
  if (price) params.set('price', price);
  const sortParam = sort ? SORT_PARAM[sort] : undefined;
  if (sortParam) params.set('sort', sortParam);
  const qs = params.toString();
  return `https://www.kijiji.ca${path}${qs ? `?${qs}` : ''}`;
}

function querySlug(query: string): string {
  const slug = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'items';
}

function priceParam(minPrice?: number, maxPrice?: number): string | undefined {
  if (minPrice == null && maxPrice == null) return undefined;
  const low = minPrice != null ? String(Math.floor(minPrice)) : '';
  const high = maxPrice != null ? String(Math.floor(maxPrice)) : '';
  return `${low}__${high}`;
}
