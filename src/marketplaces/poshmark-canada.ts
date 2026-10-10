/**
 * Poshmark Canada (poshmark.ca) search.
 *
 * The site's own search reads GET /vm-rest/posts?request=<json>. No login and
 * no browser. Prices are CAD and listings ship across Canada, not to a city.
 */

import { Listing, ListingDetails, SearchParams, SearchResult, Sort } from '../types.js';
import { BaseMarketplace } from './base.js';
import { lookupPlace } from './places.js';

const CANADA_SEARCH = 'https://poshmark.ca/vm-rest/posts';
const LISTING_URL = 'https://poshmark.ca/listing/';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CONDITION_PARAM: Record<string, string> = {
  new: 'nwt',
  like_new: 'uln',
  good: 'ug',
  fair: 'uf',
};

const CONDITION_LABEL: Record<string, string> = {
  nwt: 'New with tags',
  uln: 'Like new',
  ug: 'Good',
  uf: 'Fair',
  not_nwt: 'Pre-owned',
};

const SORT_PARAM: Partial<Record<Sort, string>> = {
  relevance: 'relevance',
  newest: 'added_desc',
  price_low_to_high: 'price_asc',
  price_high_to_low: 'price_desc',
  most_popular: 'like_count',
};

interface Money {
  val?: string;
  currency_code?: string;
}

interface CanadaPost {
  id?: string;
  title?: string;
  description?: string;
  price?: number;
  price_amount?: Money;
  brand?: string;
  size?: string;
  condition?: string;
  origin_domain?: string;
  creator_username?: string;
  picture_url?: string;
  cover_shot?: { url?: string; url_small?: string; url_large?: string };
  pictures?: Array<{ url?: string; url_large?: string }>;
  size_obj?: { display?: string; id?: string };
  colors?: Array<{ name?: string }>;
  first_published_at?: string;
  system_messages?: Array<{ popup_id?: string; message?: string }>;
}

export function isCanadianPoshmarkLocation(location: string | undefined): boolean {
  if (!location?.trim()) return false;
  if (location.trim().toLowerCase() === 'canada') return true;
  return lookupPlace(location)?.country === 'CA';
}

export function canadaSearchBody(params: SearchParams): Record<string, unknown> {
  const count = Math.min(48, Math.max(1, params.limit ?? 20));
  const filters: Record<string, unknown> = {};
  if (!params.showSold) filters.inventory_status = ['available'];
  if (params.department) filters.department = params.department;
  if (params.brand) filters.brand = [params.brand];
  const condition = params.condition ? CONDITION_PARAM[params.condition] : undefined;
  if (condition) filters.condition = [condition];

  const range: { min?: Money; max?: Money } = {};
  if (params.minPrice != null) range.min = { val: String(params.minPrice), currency_code: 'CAD' };
  if (params.maxPrice != null) range.max = { val: String(params.maxPrice), currency_code: 'CAD' };
  if (range.min || range.max) filters.price_amount_range = [range];

  const body: Record<string, unknown> = {
    query: params.query,
    count,
    experience: 'all',
    filters,
  };
  const sort = params.sort ? SORT_PARAM[params.sort] : undefined;
  if (sort) body.sort_by = sort;
  return body;
}

export function canadaSearchUrl(params: SearchParams): string {
  return `${CANADA_SEARCH}?request=${encodeURIComponent(JSON.stringify(canadaSearchBody(params)))}`;
}

export function listingsFromCanadaPosts(posts: unknown, scrapedAt: string): Listing[] {
  if (!Array.isArray(posts)) return [];
  const seen = new Set<string>();
  const listings: Listing[] = [];
  for (const post of posts) {
    const listing = toListing(post as CanadaPost, scrapedAt);
    if (!listing || seen.has(listing.id)) continue;
    seen.add(listing.id);
    listings.push(listing);
  }
  return listings;
}

export async function searchPoshmarkCanada(params: SearchParams): Promise<SearchResult> {
  const query = params.query.trim();
  if (!query) {
    return fail('Poshmark Canada search needs a query.');
  }

  try {
    const response = await fetch(canadaSearchUrl({ ...params, query }), {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!response.ok) return fail(`Poshmark Canada search responded ${response.status}`);

    const body = (await response.json()) as { data?: unknown };
    let listings = listingsFromCanadaPosts(body.data, new Date().toISOString());
    listings = listings.filter((listing) => withinPrice(listing, params.minPrice, params.maxPrice));
    listings = listings.filter((listing) => matchesSize(listing, params.sizes));
    listings = listings.filter((listing) => matchesColor(listing, body.data, params.colors));
    const limit = Math.max(0, params.limit ?? 20);
    listings = listings.slice(0, limit);

    return {
      marketplace: 'poshmark',
      success: true,
      listings,
      totalFound: listings.length,
      ...(listings.length === 0 && { note: 'No Poshmark Canada listings for that search.' }),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`Poshmark Canada search failed: ${reason}`);
  }
}

function fail(error: string): SearchResult {
  return { marketplace: 'poshmark', success: false, listings: [], error };
}

export function detailsFromCanadaPost(post: unknown, id: string): ListingDetails {
  if (!isCanadaPost(post) || post.id !== id) {
    const origin = post && typeof post === 'object' ? (post as CanadaPost).origin_domain : undefined;
    if (origin && origin !== 'ca') {
      throw new Error(`Poshmark Canada listing ${id} is a ${origin} listing, not a Canada listing`);
    }
    throw new Error(`Poshmark Canada listing ${id} was not on the page`);
  }
  const shippingCost = shippingLine(post);
  const postedAt = postedAtOf(post);
  return {
    id,
    description: post.description?.trim() || undefined,
    images: imageUrls(post),
    location: 'Canada',
    seller: post.creator_username?.trim() || undefined,
    isShippingOffered: true,
    ...(postedAt ? { postedAt } : {}),
    ...(shippingCost ? { shippingCost } : {}),
    url: `${LISTING_URL}${id}`,
  };
}

export async function getPoshmarkCanadaDetails(listingId: string): Promise<ListingDetails> {
  const id = await resolveListingId(listingId);
  const response = await fetch(`${CANADA_SEARCH}/${encodeURIComponent(id)}`, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Poshmark Canada listing ${id} responded ${response.status}`);
  return detailsFromCanadaPost(await response.json(), id);
}

export class PoshmarkCanadaMarketplace extends BaseMarketplace {
  readonly name = 'poshmark-ca';
  readonly displayName = 'Poshmark Canada';
  readonly requiresAuth = false;

  async search(params: SearchParams): Promise<SearchResult> {
    const result = await searchPoshmarkCanada(params);
    const listings = result.listings.map((listing) => ({ ...listing, marketplace: this.name }));
    const note =
      result.success && listings.length > 0
        ? 'Poshmark Canada (poshmark.ca). Prices are CAD and items ship across Canada. The city does not narrow these results. Search includes the post date. Shipping cost is on the listing, not the search. Tax is not included. Check it at checkout.'
        : result.note;
    return { ...result, marketplace: this.name, listings, ...(note ? { note } : {}) };
  }

  async getListingDetails(listingId: string): Promise<ListingDetails> {
    return getPoshmarkCanadaDetails(listingId);
  }
}

function canonicalListingId(value: string): string | undefined {
  return value.trim().match(/[a-f0-9]{24}/i)?.[0];
}

async function resolveListingId(value: string): Promise<string> {
  const direct = canonicalListingId(value);
  if (direct) return direct;
  const url = shortLink(value.trim());
  if (!url) throw new Error(`Poshmark Canada listing id is missing from "${value}"`);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
  });
  const resolved = canonicalListingId(response.url ?? '');
  if (!resolved) throw new Error(`Poshmark Canada listing id is missing from "${value}"`);
  return resolved;
}

function shortLink(value: string): string | undefined {
  if (/^https?:\/\/posh\.mk\/\S+/i.test(value)) return value;
  if (/^posh\.mk\/\S+/i.test(value)) return `https://${value}`;
  return undefined;
}

function isCanadaPost(value: unknown): value is CanadaPost {
  if (!value || typeof value !== 'object') return false;
  const post = value as CanadaPost;
  return typeof post.id === 'string' && (!post.origin_domain || post.origin_domain === 'ca');
}

function imageUrls(post: CanadaPost): string[] {
  const urls: string[] = [];
  const push = (value: string | undefined) => {
    const safe = httpsUrl(value);
    if (safe && !urls.includes(safe)) urls.push(safe);
  };
  for (const picture of post.pictures ?? []) push(picture.url_large || picture.url);
  push(post.cover_shot?.url_large);
  push(post.cover_shot?.url);
  push(post.picture_url);
  return urls;
}

function toListing(post: CanadaPost, scrapedAt: string): Listing | undefined {
  if (!post?.id || (post.origin_domain && post.origin_domain !== 'ca')) return undefined;
  const price = formatCad(post.price_amount, post.price);
  const image = httpsUrl(post.cover_shot?.url_small) || httpsUrl(post.cover_shot?.url) || httpsUrl(post.picture_url);
  const brand = post.brand?.trim() || undefined;
  const size = post.size_obj?.display?.trim() || post.size?.trim() || undefined;
  const postedAt = postedAtOf(post);
  return {
    id: post.id,
    title: post.title?.trim() || 'Poshmark listing',
    price: price.text,
    priceNumeric: price.numeric,
    currency: price.currency,
    location: 'Canada',
    url: `${LISTING_URL}${post.id}`,
    images: image ? [image] : undefined,
    seller: post.creator_username?.trim() || undefined,
    condition: post.condition ? CONDITION_LABEL[post.condition] : undefined,
    brand,
    size,
    ...(postedAt ? { postedAt } : {}),
    marketplace: 'poshmark',
    scrapedAt,
  };
}

function postedAtOf(post: CanadaPost): string | undefined {
  const value = post.first_published_at?.trim();
  return value || undefined;
}

function shippingLine(post: CanadaPost): string | undefined {
  const line = post.system_messages?.find((message) => message.popup_id === 'poshmark-shipping')?.message?.trim();
  return line || undefined;
}

function formatCad(amount: Money | undefined, fallback?: number): { text: string; numeric?: number; currency?: string } {
  const numeric = amount?.val != null && amount.val !== '' ? Number(amount.val) : fallback;
  if (numeric == null || !Number.isFinite(numeric)) return { text: 'Price not listed' };
  const currency = amount?.currency_code || 'CAD';
  return {
    text: numeric === 0 ? 'Free' : `${currency} ${Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)}`,
    numeric,
    currency,
  };
}

function withinPrice(listing: Listing, minPrice?: number, maxPrice?: number): boolean {
  if (listing.priceNumeric == null) return true;
  if (minPrice != null && listing.priceNumeric < minPrice) return false;
  if (maxPrice != null && listing.priceNumeric > maxPrice) return false;
  return true;
}

function matchesSize(listing: Listing, sizes: string[] | undefined): boolean {
  if (!sizes?.length) return true;
  const size = listing.size?.toLowerCase();
  if (!size) return false;
  return sizes.some((wanted) => wanted.toLowerCase() === size);
}

function matchesColor(listing: Listing, posts: unknown, colors: string[] | undefined): boolean {
  if (!colors?.length) return true;
  if (!Array.isArray(posts)) return false;
  const post = (posts as CanadaPost[]).find((item) => item?.id === listing.id);
  const names = (post?.colors ?? []).map((color) => color.name?.toLowerCase()).filter((name): name is string => Boolean(name));
  return colors.some((color) => names.includes(color.toLowerCase()));
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}
