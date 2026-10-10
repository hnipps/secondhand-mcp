import { Listing, ListingDetails, ListingPart, SearchParams, SearchResult, Sort } from '../types.js';

const ALL_MARKETPLACES_PER_SOURCE = 10;

export function formatSingleResult(result: SearchResult, params: SearchParams, includeImages: boolean): string {
  if (!result.success) {
    return `❌ ${result.marketplace}: ${result.error}`;
  }

  if (result.listings.length === 0) {
    return `No listings found for "${params.query}" in ${params.location}`;
  }

  const lines = [
    `🔍 Found ${result.listings.length} listings for "${params.query}" on ${result.marketplace}`,
    `📍 Location: ${params.location}`,
  ];
  if (result.note) lines.push(result.note);
  lines.push('');

  for (const listing of orderListings(result.listings, params.sort)) {
    lines.push(`**${listing.price}** - ${listing.title}`);
    if (listing.location) {
      lines.push(`   📍 ${listing.location}`);
    }
    lines.push(...listingFooter(listing, includeImages, '   '));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMultipleResults(results: SearchResult[], params: SearchParams, includeImages: boolean): string {
  const lines = [
    `🔍 Search results for "${params.query}" across all marketplaces`,
    `📍 Location: ${params.location}`,
    '',
  ];

  for (const result of results) {
    lines.push(`## ${result.marketplace}`);

    if (!result.success) {
      lines.push(`❌ Error: ${result.error}`);
    } else if (result.listings.length === 0) {
      lines.push('No listings found');
    } else {
      lines.push(`Found ${result.listings.length} listings:`);
      if (result.note) lines.push(result.note);
      for (const listing of orderListings(result.listings, params.sort).slice(0, ALL_MARKETPLACES_PER_SOURCE)) {
        lines.push(`  • **${listing.price}** - ${listing.title}`);
        lines.push(...listingFooter(listing, includeImages, '    '));
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function orderListings(listings: Listing[], sort: Sort | undefined): Listing[] {
  if (sort === 'newest') return byPostedAt(listings);
  if (sort === 'price_high_to_low') return byPrice(listings, 'desc');
  if (sort === 'relevance' || sort === 'most_popular') return [...listings];
  return byPrice(listings, 'asc');
}

function byPrice(listings: Listing[], direction: 'asc' | 'desc'): Listing[] {
  return [...listings].sort((a, b) => {
    if (a.priceNumeric == null && b.priceNumeric == null) return 0;
    if (a.priceNumeric == null) return 1;
    if (b.priceNumeric == null) return -1;
    return direction === 'asc' ? a.priceNumeric - b.priceNumeric : b.priceNumeric - a.priceNumeric;
  });
}

function byPostedAt(listings: Listing[]): Listing[] {
  return [...listings].sort((a, b) => {
    const at = a.postedAt ? Date.parse(a.postedAt) : Number.NaN;
    const bt = b.postedAt ? Date.parse(b.postedAt) : Number.NaN;
    const aOk = Number.isFinite(at);
    const bOk = Number.isFinite(bt);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return bt - at;
  });
}

function listingFooter(listing: Listing, includeImages: boolean, indent: string): string[] {
  const lines: string[] = [];
  const photos = photoLine(listing.images, includeImages);
  if (photos) lines.push(indent + photos);
  lines.push(`${indent}🆔 ${listing.id}`);
  lines.push(`${indent}🔗 ${listing.url}`);
  for (const line of listingFacts(listing)) lines.push(indent + line);
  return lines;
}

function listingFacts(listing: Listing): string[] {
  const lines: string[] = [];
  if (listing.postedAt) lines.push(`📅 Posted ${postedDay(listing.postedAt)}`);
  if (listing.seller) lines.push(`👤 ${listing.seller}`);
  if (listing.dealer === true) lines.push('🏪 Dealer');
  else if (listing.dealer === false) lines.push('Owner');
  if (listing.offerType === 'wanted') lines.push('Wanted ad');
  else if (listing.offerType === 'offer') lines.push('For sale');
  if (listing.shippingCost) lines.push(`📦 ${listing.shippingCost}`);
  else if (listing.shipping === true) lines.push('📦 Ships');
  else if (listing.shipping === false) lines.push('📦 Shipping not offered');
  return lines;
}

function postedDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? value;
}

function photoLine(images: string[] | undefined, includeImages: boolean): string | undefined {
  if (!images?.length) return undefined;
  if (includeImages) return `🖼️ Images: ${images.join(' , ')}`;
  return `📷 ${images.length} photo${images.length > 1 ? 's' : ''}`;
}

const UNAVAILABLE_NOTES: Record<ListingPart, string> = {
  photos: "Photos couldn't be loaded right now; asking again may bring them back.",
  description: "The description, location and seller couldn't be loaded right now; asking again may bring them back.",
};

export function formatListingDetails(details: ListingDetails): string {
  const lines = [
    `📋 Listing Details`,
    `🔗 ${details.url}`,
    '',
  ];

  if (details.description) {
    lines.push(`**Description:** ${details.description}`);
    lines.push('');
  }

  if (details.location) {
    lines.push(`📍 ${details.location}`);
  }

  if (details.seller) {
    lines.push(`👤 Seller: ${details.seller}`);
  }

  if (details.postedAt) {
    lines.push(`📅 Posted ${postedDay(details.postedAt)}`);
  }

  if (details.dealer === true) lines.push('🏪 Dealer');
  else if (details.dealer === false) lines.push('Owner');

  if (details.offerType === 'wanted') lines.push('Wanted ad');
  else if (details.offerType === 'offer') lines.push('For sale');

  if (details.deliveryTypes && details.deliveryTypes.length > 0) {
    lines.push(`🚚 Delivery: ${details.deliveryTypes.join(', ')}`);
  }

  if (details.shippingCost) {
    lines.push(`📦 ${details.shippingCost}`);
  } else if (details.isShippingOffered === true) {
    lines.push(`📦 Shipping available`);
  } else if (details.isShippingOffered === false) {
    lines.push(`📦 Shipping not offered`);
  }

  for (const part of details.unavailable ?? []) {
    lines.push(`⚠️ ${UNAVAILABLE_NOTES[part]}`);
  }

  if (details.images.length > 0) {
    lines.push('');
    lines.push(`🖼️ Photos (${details.images.length}):`);
    for (const img of details.images) {
      lines.push(`   ${img}`);
    }
  }

  return lines.join('\n');
}
