/**
 * Kijiji search and listing pages embed an Apollo cache in __NEXT_DATA__.
 * Prices are integer cents. A missing amount is a contact listing, not zero.
 */

import { Listing, ListingDetails } from '../../types.js';

interface ApolloState {
  [key: string]: unknown;
  ROOT_QUERY?: Record<string, unknown>;
}

interface RawPrice {
  __typename?: string;
  type?: string;
  amount?: number;
  currency?: string;
}

interface RawListing {
  __typename?: string;
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  imageUrls?: string[];
  location?: { name?: string; address?: string };
  price?: RawPrice;
  activationDate?: string;
  type?: string;
  posterInfo?: { posterId?: string };
  flags?: { isFromDealer?: boolean | null; shippedBySeller?: boolean | null };
  attributes?: { all?: Array<{ canonicalName?: string; canonicalValues?: string[] }> };
}

const CONDITION_LABEL: Record<string, string> = {
  new: 'New',
  usedlikenew: 'Like new',
  usedgood: 'Good',
  usedfair: 'Fair',
  used: 'Used',
};

export function readApollo(html: string): ApolloState | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const page = JSON.parse(match[1]) as { props?: { pageProps?: { __APOLLO_STATE__?: ApolloState } } };
    return page.props?.pageProps?.__APOLLO_STATE__ ?? null;
  } catch {
    return null;
  }
}

export function listingsFromSearchHtml(html: string, scrapedAt: string): Listing[] {
  const apollo = readApollo(html);
  if (!apollo) return [];
  const ordered = orderedRefs(apollo)
    .map((ref) => apollo[ref])
    .filter(isListing);
  const listings = (ordered.length > 0 ? ordered : Object.values(apollo).filter(isListing)).map((raw) =>
    toListing(raw, scrapedAt)
  );
  const seen = new Set<string>();
  return listings.filter((listing) => {
    if (seen.has(listing.id)) return false;
    seen.add(listing.id);
    return true;
  });
}

export function detailsFromHtml(html: string, id: string): ListingDetails {
  const apollo = readApollo(html);
  const raw = apollo ? findListing(apollo, id) : undefined;
  if (!raw?.url) throw new Error(`Kijiji listing ${id} was not on the page`);
  const images = raw.imageUrls ?? [];
  const description = raw.description?.trim();
  const shipping = shippingFlag(raw);
  const offerType = offerTypeOf(raw);
  const dealer = dealerFlag(raw);
  const postedAt = postedAtOf(raw);
  const seller = apollo ? sellerName(apollo, raw) : undefined;
  return {
    id,
    description,
    images,
    location: placeName(raw),
    url: raw.url,
    ...(seller ? { seller } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(dealer !== undefined ? { dealer } : {}),
    ...(offerType ? { offerType } : {}),
    ...(shipping !== undefined ? { isShippingOffered: shipping } : {}),
    unavailable: description ? undefined : ['description'],
  };
}

function orderedRefs(apollo: ApolloState): string[] {
  const root = apollo.ROOT_QUERY;
  if (!root) return [];
  const key = Object.keys(root).find((name) => name.startsWith('searchResultsPageByUrl:'));
  const page = key ? (root[key] as { results?: Record<string, unknown> } | undefined) : undefined;
  const results = page?.results;
  if (!results) return [];
  const refs: string[] = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const ref = (value as { __ref?: string }).__ref;
    if (ref) refs.push(ref);
  };
  const top = results.topListings;
  if (Array.isArray(top)) top.forEach(push);
  const mainKey = Object.keys(results).find((name) => name.startsWith('mainListings'));
  const main = mainKey ? results[mainKey] : undefined;
  if (Array.isArray(main)) main.forEach(push);
  return refs;
}

function findListing(apollo: ApolloState, id: string): RawListing | undefined {
  const direct = apollo[`StandardListing:${id}`];
  if (isListing(direct) && direct.id === id) return direct;
  for (const value of Object.values(apollo)) {
    if (isListing(value) && value.id === id) return value;
  }
  return undefined;
}

function isListing(value: unknown): value is RawListing {
  if (!value || typeof value !== 'object') return false;
  const listing = value as RawListing;
  return listing.__typename === 'StandardListing' && typeof listing.id === 'string' && typeof listing.title === 'string';
}

function toListing(raw: RawListing, scrapedAt: string): Listing {
  const price = formatPrice(raw.price);
  const postedAt = postedAtOf(raw);
  const dealer = dealerFlag(raw);
  const shipping = shippingFlag(raw);
  const offerType = offerTypeOf(raw);
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    price: price.text,
    priceNumeric: price.numeric,
    currency: price.currency,
    location: placeName(raw),
    url: raw.url ?? `https://www.kijiji.ca/v-view-details/${raw.id}`,
    images: raw.imageUrls?.slice(0, 1),
    condition: conditionLabel(raw),
    ...(postedAt ? { postedAt } : {}),
    ...(dealer !== undefined ? { dealer } : {}),
    ...(shipping !== undefined ? { shipping } : {}),
    ...(offerType ? { offerType } : {}),
    marketplace: 'kijiji',
    scrapedAt,
  };
}

function placeName(raw: RawListing): string | undefined {
  return raw.location?.address || raw.location?.name || undefined;
}

function formatPrice(price: RawPrice | undefined): { text: string; numeric?: number; currency?: string } {
  if (price?.__typename === 'StandardAmountPrice' && typeof price.amount === 'number') {
    const numeric = price.amount / 100;
    const currency = price.currency ?? 'CAD';
    return {
      text: numeric === 0 ? 'Free' : `${currency} ${formatAmount(numeric)}`,
      numeric,
      currency,
    };
  }
  return { text: 'Contact' };
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function conditionLabel(raw: RawListing): string | undefined {
  const value = attributeValues(raw, 'condition')[0];
  if (!value) return undefined;
  return CONDITION_LABEL[value] ?? value;
}

function attributeValues(raw: RawListing, name: string): string[] {
  return raw.attributes?.all?.find((attribute) => attribute.canonicalName === name)?.canonicalValues ?? [];
}

function postedAtOf(raw: RawListing): string | undefined {
  return typeof raw.activationDate === 'string' && raw.activationDate ? raw.activationDate : undefined;
}

function dealerFlag(raw: RawListing): boolean | undefined {
  if (raw.flags?.isFromDealer === true) return true;
  if (raw.flags?.isFromDealer === false) return false;
  const by = attributeValues(raw, 'forsaleby');
  if (by.includes('delr')) return true;
  if (by.includes('ownr')) return false;
  return undefined;
}

function shippingFlag(raw: RawListing): boolean | undefined {
  const values = attributeValues(raw, 'shipping');
  if (values.includes('true')) return true;
  if (values.includes('false')) return false;
  if (raw.flags?.shippedBySeller === true) return true;
  return undefined;
}

function offerTypeOf(raw: RawListing): 'offer' | 'wanted' | undefined {
  if (raw.type === 'OFFER') return 'offer';
  if (raw.type === 'WANTED') return 'wanted';
  return undefined;
}

function sellerName(apollo: ApolloState, raw: RawListing): string | undefined {
  const id = raw.posterInfo?.posterId;
  if (!id) return undefined;
  for (const key of [`StandardProfileV2:${id}`, `CommercialProfileV2:${id}`]) {
    const profile = apollo[key] as { name?: string } | undefined;
    const name = profile?.name?.trim();
    if (name) return name;
  }
  return undefined;
}
