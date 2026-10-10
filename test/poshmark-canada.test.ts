import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/browser.js', () => ({
  findChrome: vi.fn(() => '/usr/bin/chromium'),
  getBrowser: vi.fn(),
  newPage: vi.fn(),
  closeBrowser: vi.fn(),
  rotateBrowser: vi.fn(),
  withBrowserLock: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { newPage } from '../src/browser.js';
import { initializeMarketplaces } from '../src/marketplaces/index.js';
import { PoshmarkMarketplace } from '../src/marketplaces/poshmark.js';
import {
  canadaSearchBody,
  canadaSearchUrl,
  detailsFromCanadaPost,
  getPoshmarkCanadaDetails,
  isCanadianPoshmarkLocation,
  listingsFromCanadaPosts,
  PoshmarkCanadaMarketplace,
  searchPoshmarkCanada,
} from '../src/marketplaces/poshmark-canada.js';
import { listingDetails } from '../src/tools/listing-details.js';
import { searchMarketplace } from '../src/tools/search-marketplace.js';

const POST = {
  id: '6a3ad071a95105ecf5a6914c',
  title: 'Vintage Grapevine Jacket',
  origin_domain: 'ca',
  price_amount: { val: '45.0', currency_code: 'CAD', currency_symbol: 'C$' },
  brand: 'Nike',
  condition: 'uln',
  creator_username: 'closet',
  size_obj: { display: 'M', id: 'M' },
  cover_shot: { url_small: 'https://img.example/small.jpg', url: 'https://img.example/full.jpg' },
  colors: [{ name: 'Green' }],
  first_published_at: '2026-09-29T16:16:49-07:00',
};

describe('Canadian location detection', () => {
  it('treats a Canadian city and the country name as Canada', () => {
    expect(isCanadianPoshmarkLocation('Toronto, ON')).toBe(true);
    expect(isCanadianPoshmarkLocation('canada')).toBe(true);
  });

  it('leaves a US city and an empty location on the US site', () => {
    expect(isCanadianPoshmarkLocation('Austin, TX')).toBe(false);
    expect(isCanadianPoshmarkLocation(undefined)).toBe(false);
    expect(isCanadianPoshmarkLocation('   ')).toBe(false);
  });
});

describe('Poshmark Canada request', () => {
  it('asks poshmark.ca for available CAD listings, cheapest first', () => {
    const body = canadaSearchBody({
      query: 'lululemon',
      limit: 10,
      sort: 'price_low_to_high',
      maxPrice: 80,
      condition: 'like_new',
      brand: 'Nike',
      department: 'Women',
    });
    expect(body).toMatchObject({
      query: 'lululemon',
      count: 10,
      experience: 'all',
      sort_by: 'price_asc',
    });
    expect(body.filters).toEqual({
      inventory_status: ['available'],
      department: 'Women',
      brand: ['Nike'],
      condition: ['uln'],
      price_amount_range: [{ max: { val: '80', currency_code: 'CAD' } }],
    });
    expect(canadaSearchUrl({ query: 'coat' })).toMatch(/^https:\/\/poshmark\.ca\/vm-rest\/posts\?request=/);
  });

  it('omits a condition Poshmark Canada does not encode', () => {
    const body = canadaSearchBody({ query: 'coat', condition: 'any' });
    expect(body.filters).toEqual({ inventory_status: ['available'] });
  });
});

describe('Poshmark Canada listings', () => {
  const scrapedAt = '2026-10-10T00:00:00.000Z';

  it('shapes a Canadian post into a CAD listing on poshmark.ca', () => {
    const [listing] = listingsFromCanadaPosts([POST], scrapedAt);
    expect(listing).toMatchObject({
      id: POST.id,
      title: 'Vintage Grapevine Jacket',
      price: 'CAD 45',
      priceNumeric: 45,
      currency: 'CAD',
      location: 'Canada',
      url: `https://poshmark.ca/listing/${POST.id}`,
      images: ['https://img.example/small.jpg'],
      seller: 'closet',
      condition: 'Like new',
      brand: 'Nike',
      size: 'M',
      marketplace: 'poshmark',
      scrapedAt,
      postedAt: '2026-09-29T16:16:49-07:00',
    });
  });

  it('drops a post that did not originate in Canada', () => {
    expect(listingsFromCanadaPosts([{ ...POST, origin_domain: 'us' }], scrapedAt)).toEqual([]);
  });

  it('keeps cents and a missing price', () => {
    const [cents] = listingsFromCanadaPosts([{ ...POST, id: 'a', price_amount: { val: '12.5', currency_code: 'CAD' } }], scrapedAt);
    const [missing] = listingsFromCanadaPosts([{ ...POST, id: 'b', price_amount: undefined, price: undefined }], scrapedAt);
    expect(cents.price).toBe('CAD 12.50');
    expect(missing.price).toBe('Price not listed');
  });
});

describe('searchPoshmarkCanada', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters the parsed page by price, size and color', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        data: [
          POST,
          { ...POST, id: 'cheap', price_amount: { val: '5.0', currency_code: 'CAD' }, size_obj: { display: 'S' } },
          { ...POST, id: 'blue', colors: [{ name: 'Blue' }] },
        ],
      }),
    }));

    const result = await searchPoshmarkCanada({
      query: 'jacket',
      minPrice: 20,
      sizes: ['M'],
      colors: ['Green'],
      limit: 5,
    });

    expect(result.success).toBe(true);
    expect(result.listings.map((listing) => listing.id)).toEqual([POST.id]);
  });

  it('reports an HTTP failure without throwing', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, json: async () => ({}) }));
    const result = await searchPoshmarkCanada({ query: 'jacket' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });
});

describe('Poshmark marketplace routing', () => {
  beforeEach(() => {
    vi.mocked(newPage).mockReset();
    vi.unstubAllGlobals();
  });

  it('searches poshmark.ca for a Canadian city and does not open a browser', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      expect(String(url)).toContain('https://poshmark.ca/vm-rest/posts?request=');
      return { ok: true, json: async () => ({ data: [POST] }) };
    });

    const result = await new PoshmarkMarketplace().search({ query: 'jacket', location: 'Toronto, ON' });

    expect(newPage).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.listings[0].url).toBe(`https://poshmark.ca/listing/${POST.id}`);
    expect(result.note).toContain('poshmark.ca');
  });
});

describe('Poshmark Canada marketplace', () => {
  beforeEach(() => {
    vi.mocked(newPage).mockReset();
    vi.unstubAllGlobals();
  });

  it('searches poshmark.ca even when the location is in the US', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      expect(String(url)).toContain('https://poshmark.ca/vm-rest/posts?request=');
      return { ok: true, json: async () => ({ data: [POST] }) };
    });

    const result = await new PoshmarkCanadaMarketplace().search({ query: 'jacket', location: 'Austin, TX' });

    expect(newPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      marketplace: 'poshmark-ca',
      success: true,
      note: 'Poshmark Canada (poshmark.ca). Prices are CAD and items ship across Canada. The city does not narrow these results. Search includes the post date. Shipping cost is on the listing, not the search. Tax is not included. Check it at checkout.',
    });
    expect(result.listings[0]).toMatchObject({
      marketplace: 'poshmark-ca',
      price: 'CAD 45',
      url: `https://poshmark.ca/listing/${POST.id}`,
    });
  });

  it('reads a listing from the Canada post endpoint', () => {
    expect(detailsFromCanadaPost({ ...POST, description: 'Soft wool coat.' }, POST.id)).toEqual({
      id: POST.id,
      description: 'Soft wool coat.',
      images: ['https://img.example/full.jpg'],
      location: 'Canada',
      seller: 'closet',
      isShippingOffered: true,
      postedAt: '2026-09-29T16:16:49-07:00',
      url: `https://poshmark.ca/listing/${POST.id}`,
    });
  });

  it('reads the shipping cost from the listing and not a tax amount', () => {
    const details = detailsFromCanadaPost(
      {
        ...POST,
        description: 'Soft wool coat.',
        system_messages: [
          { popup_id: 'seller-discount', message: 'Seller Discount: 20% off 4+ Bundle' },
          { popup_id: 'poshmark-shipping', message: 'C$12.49 Expedited (1-7 day) Shipping on all orders' },
        ],
      },
      POST.id
    );
    expect(details.shippingCost).toBe('C$12.49 Expedited (1-7 day) Shipping on all orders');
    expect(JSON.stringify(details)).not.toMatch(/tax/i);
  });

  it('follows a posh.mk short link to the listing id', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('posh.mk')) {
        return { ok: true, url: 'https://poshmark.com/listing/Till-Next-Year-67400cf61ce666a4d259ef1e', status: 200 };
      }
      return { ok: true, json: async () => ({ ...POST, id: '67400cf61ce666a4d259ef1e' }) };
    });

    const details = await getPoshmarkCanadaDetails('https://posh.mk/vaBL0gLUIOb');
    expect(calls[0]).toBe('https://posh.mk/vaBL0gLUIOb');
    expect(calls[1]).toBe('https://poshmark.ca/vm-rest/posts/67400cf61ce666a4d259ef1e');
    expect(details.id).toBe('67400cf61ce666a4d259ef1e');
  });

  it('rejects a short link that does not land on a listing id', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, url: 'https://www.poshmark.com/', status: 200 }));
    await expect(getPoshmarkCanadaDetails('posh.mk/not-a-listing')).rejects.toThrow(/listing id is missing/);
  });

  it('says when a resolved short link is not a Canada listing', () => {
    expect(() => detailsFromCanadaPost({ ...POST, origin_domain: 'us' }, POST.id)).toThrow(/not a Canada listing/);
  });
});

describe('MCP tools', () => {
  beforeEach(() => {
    vi.mocked(newPage).mockReset();
    vi.unstubAllGlobals();
    initializeMarketplaces();
  });

  it('search_marketplace poshmark-ca returns the Canadian listing', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ data: [POST] }) }));

    const result = await searchMarketplace({
      query: 'jacket',
      marketplace: 'poshmark-ca',
      location: 'Austin, TX',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';

    expect(result.isError).toBeUndefined();
    expect(text).toContain('on poshmark-ca');
    expect(text).toContain('CAD 45');
    expect(text).toContain(`https://poshmark.ca/listing/${POST.id}`);
    expect(newPage).not.toHaveBeenCalled();
  });

  it('get_listing_details reads the poshmark.ca post', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      expect(String(url)).toBe(`https://poshmark.ca/vm-rest/posts/${POST.id}`);
      return { ok: true, json: async () => ({ ...POST, description: 'Soft wool coat.' }) };
    });

    const result = await listingDetails({ listingId: POST.id, marketplace: 'poshmark-ca' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';

    expect(result.isError).toBeUndefined();
    expect(text).toContain(`https://poshmark.ca/listing/${POST.id}`);
    expect(text).toContain('Soft wool coat.');
    expect(text).toContain('Seller: closet');
  });
});
