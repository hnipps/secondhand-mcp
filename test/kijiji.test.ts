import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canadaArea, matchKijijiArea, matchKijijiAreas, parseLocationTree } from '../src/marketplaces/kijiji/locations.js';
import { detailsFromHtml, listingsFromSearchHtml } from '../src/marketplaces/kijiji/parse.js';
import { KijijiMarketplace, searchUrl } from '../src/marketplaces/kijiji/index.js';

const TREE = `var locationsTree = ${JSON.stringify({
  id: 0,
  nameEn: 'Canada',
  homePageSEOUrl: '/h-canada/0',
  leaf: false,
  children: [
    {
      id: 9004,
      nameEn: 'Ontario (A - L)',
      homePageSEOUrl: '/h-ontario/9004',
      leaf: false,
      children: [
        { id: 1700214, nameEn: 'London', homePageSEOUrl: '/h-london/1700214', leaf: true, children: [] },
      ],
    },
    {
      id: 100009004,
      nameEn: 'Ontario (M - Z)',
      homePageSEOUrl: '/h-ontario/9004',
      leaf: false,
      children: [
        {
          id: 1700272,
          nameEn: 'Toronto (GTA)',
          homePageSEOUrl: '/h-gta-greater-toronto-area/1700272',
          leaf: false,
          children: [
            {
              id: 1700273,
              nameEn: 'City of Toronto',
              homePageSEOUrl: '/h-city-of-toronto/1700273',
              leaf: true,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 9007,
      nameEn: 'British Columbia',
      homePageSEOUrl: '/h-british-columbia/9007',
      leaf: false,
      children: [
        { id: 1700287, nameEn: 'Vancouver', homePageSEOUrl: '/h-vancouver/1700287', leaf: true, children: [] },
      ],
    },
    {
      id: 9010,
      nameEn: 'Territories',
      homePageSEOUrl: '/h-territories/9010',
      leaf: false,
      children: [
        {
          id: 1700101,
          nameEn: 'Yukon',
          homePageSEOUrl: '/h-yukon/1700101',
          leaf: false,
          children: [
            { id: 1700102, nameEn: 'Whitehorse', homePageSEOUrl: '/h-whitehorse/1700102', leaf: true, children: [] },
          ],
        },
      ],
    },
  ],
})};`;

const AREAS = parseLocationTree(TREE);

function listing(id: string, title: string, amount: number | null, extra: Record<string, unknown> = {}) {
  return {
    __typename: 'StandardListing',
    id,
    title,
    description: `${title} in full`,
    url: `https://www.kijiji.ca/v-laptops/city-of-toronto/${id}`,
    imageUrls: [`https://media.kijiji.ca/${id}.jpg`],
    location: { name: 'Toronto', address: 'Toronto, ON M5V' },
    activationDate: '2026-06-18T23:06:12.000Z',
    price:
      amount == null
        ? { __typename: 'NonAmountPrice', type: 'CONTACT' }
        : { __typename: 'StandardAmountPrice', type: 'FIXED', amount, currency: 'CAD' },
    attributes: {
      all: [
        { canonicalName: 'condition', canonicalValues: ['usedgood'] },
        { canonicalName: 'forsaleby', canonicalValues: ['ownr'] },
      ],
    },
    ...extra,
  };
}

function pageHtml(rows: ReturnType<typeof listing>[]): string {
  const apollo: Record<string, unknown> = {};
  for (const row of rows) apollo[`StandardListing:${row.id}`] = row;
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { __APOLLO_STATE__: apollo } },
  })}</script>`;
}
function searchHtml(): string {
  const apollo = {
    ROOT_QUERY: {
      'searchResultsPageByUrl:/example': {
        results: {
          topListings: [{ __ref: 'StandardListing:1' }],
          'mainListings({"pagination":{"limit":40,"offset":0}})': [
            { __ref: 'StandardListing:2' },
            { __ref: 'StandardListing:1' },
          ],
        },
      },
    },
    'StandardListing:1': listing('1', 'Promoted laptop', 30000),
    'StandardListing:2': listing('2', 'Contact seller', null),
  };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { __APOLLO_STATE__: apollo } },
  })}</script>`;
}

describe('Kijiji areas', () => {
  it('picks the city leaf over the wider GTA area', () => {
    expect(matchKijijiArea(AREAS, 'Toronto, ON')).toMatchObject({ id: 1700273, slug: 'city-of-toronto', province: 'ON' });
  });

  it('picks Vancouver, BC and Whitehorse, YT', () => {
    expect(matchKijijiArea(AREAS, 'Vancouver, BC')?.id).toBe(1700287);
    expect(matchKijijiArea(AREAS, 'Whitehorse, YT')?.id).toBe(1700102);
  });

  it('does not answer London, Kentucky with London, Ontario', () => {
    expect(matchKijijiArea(AREAS, 'London, KY')).toBeNull();
    expect(matchKijijiArea(AREAS, 'London, ON')?.id).toBe(1700214);
  });

  it('refuses to pick one half of Ontario', () => {
    expect(matchKijijiArea(AREAS, 'Ontario')).toBeNull();
    expect(canadaArea(AREAS)).toMatchObject({ id: 0, slug: 'canada' });
  });

  it('returns both Ontario areas when the province is the query', () => {
    expect(matchKijijiAreas(AREAS, 'Ontario').map((area) => area.id)).toEqual([9004, 100009004]);
    expect(matchKijijiAreas(AREAS, 'Toronto, ON').map((area) => area.id)).toEqual([1700273]);
    expect(matchKijijiAreas(AREAS, 'British Columbia').map((area) => area.id)).toEqual([9007]);
  });
});

describe('Kijiji pages', () => {
  it('reads listings in page order and converts cents to CAD', () => {
    const listings = listingsFromSearchHtml(searchHtml(), '2026-10-09T00:00:00.000Z');
    expect(listings.map((listing) => [listing.id, listing.price, listing.condition, listing.location])).toEqual([
      ['1', 'CAD 300', 'Good', 'Toronto, ON M5V'],
      ['2', 'Contact', 'Good', 'Toronto, ON M5V'],
    ]);
    expect(listings[0].priceNumeric).toBe(300);
    expect(listings[0].url).toBe('https://www.kijiji.ca/v-laptops/city-of-toronto/1');
    expect(listings[0].postedAt).toBe('2026-06-18T23:06:12.000Z');
    expect(listings[0].dealer).toBe(false);
    expect(listings[0].offerType).toBeUndefined();
    expect(listings[0].shipping).toBeUndefined();
  });

  it('reads a dealer flag and an explicit shipping flag, and ignores local delivery', () => {
    const dealer = listing('9', 'Shop laptop', 10000, {
      attributes: {
        all: [
          { canonicalName: 'forsaleby', canonicalValues: ['delr'] },
          { canonicalName: 'fulfillment', canonicalValues: ['delivery', 'curbside'] },
        ],
      },
      flags: { shippedBySeller: null },
    });
    const shipper = listing('8', 'Ships', 20000, { flags: { shippedBySeller: true } });
    const html = pageHtml([dealer, shipper]);
    const listings = listingsFromSearchHtml(html, '2026-10-09T00:00:00.000Z');
    expect(listings.find((item) => item.id === '9')).toMatchObject({ dealer: true });
    expect(listings.find((item) => item.id === '9')?.shipping).toBeUndefined();
    expect(listings.find((item) => item.id === '8')).toMatchObject({ shipping: true, dealer: false });
  });

  it('reads the seller, offer type, and shipping attribute from a listing page', () => {
    const raw = listing('2', 'Wanted laptop', null, {
      type: 'WANTED',
      posterInfo: { posterId: '1020479423' },
      flags: { isFromDealer: false },
      attributes: {
        all: [
          { canonicalName: 'forsaleby', canonicalValues: ['ownr'] },
          { canonicalName: 'shipping', canonicalValues: ['false'] },
          { canonicalName: 'fulfillment', canonicalValues: ['delivery'] },
        ],
      },
    });
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          __APOLLO_STATE__: {
            'StandardListing:2': raw,
            'StandardProfileV2:1020479423': { __typename: 'StandardProfileV2', name: 'Omari' },
          },
        },
      },
    })}</script>`;
    expect(detailsFromHtml(html, '2')).toMatchObject({
      id: '2',
      seller: 'Omari',
      offerType: 'wanted',
      dealer: false,
      isShippingOffered: false,
      postedAt: '2026-06-18T23:06:12.000Z',
    });
  });

  it('reads a listing page by id', () => {
    const details = detailsFromHtml(searchHtml(), '2');
    expect(details).toMatchObject({
      id: '2',
      description: 'Contact seller in full',
      images: ['https://media.kijiji.ca/2.jpg'],
      location: 'Toronto, ON M5V',
      url: 'https://www.kijiji.ca/v-laptops/city-of-toronto/2',
    });
  });

  it('builds a buy-and-sell search url with price and sort', () => {
    expect(
      searchUrl({ id: 1700273, slug: 'city-of-toronto' }, 'MacBook Pro', 2, 50, 400, 'price_low_to_high')
    ).toBe(
      'https://www.kijiji.ca/b-buy-sell/city-of-toronto/macbook-pro/page-2/k0c10l1700273?price=50__400&sort=priceAsc'
    );
  });
});

describe('Kijiji search', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function htmlResponse(body: string) {
    return { ok: true, status: 200, text: async () => body };
  }

  it('searches both Ontario areas and does not fall back to Canada', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('j-locations')) return htmlResponse(TREE);
      if (url.includes('l9004') && !url.includes('l100009004')) return htmlResponse(pageHtml([listing('a', 'West', 10000)]));
      if (url.includes('l100009004')) return htmlResponse(pageHtml([listing('b', 'East', 20000)]));
      if (url.includes('l0')) return htmlResponse(pageHtml([listing('c', 'Canada', 30000)]));
      throw new Error(url);
    });

    const ontario = await new KijijiMarketplace().search({ query: 'laptop', location: 'Ontario', limit: 5 });
    expect(ontario.listings.map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(ontario.note).toBe('Kijiji splits Ontario into Ontario (A - L) and Ontario (M - Z). These results cover each of them.');
    expect(urls.some((url) => /l0(\?|$|\/)/.test(url) || url.includes('k0c10l0'))).toBe(false);

    const nowhere = await new KijijiMarketplace().search({ query: 'laptop', location: 'Narnia', limit: 5 });
    expect(nowhere.note).toContain('Canada');
    expect(nowhere.listings.map((item) => item.id)).toEqual(['c']);
  });

  it('drops dealer ads and ads that do not say they ship', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      if (url.includes('j-locations')) return htmlResponse(TREE);
      return htmlResponse(
        pageHtml([
          listing('owner', 'Owner', 10000),
          listing('dealer', 'Dealer', 20000, {
            attributes: { all: [{ canonicalName: 'forsaleby', canonicalValues: ['delr'] }] },
          }),
          listing('ship', 'Ship', 30000, { flags: { shippedBySeller: true } }),
        ])
      );
    });

    const owners = await new KijijiMarketplace().search({ query: 'laptop', location: 'Toronto, ON', dealer: false, limit: 10 });
    expect(owners.listings.map((item) => item.id).sort()).toEqual(['owner', 'ship']);
    expect(owners.note).toContain('Dealer ads are left out.');

    const shipped = await new KijijiMarketplace().search({
      query: 'laptop',
      location: 'Toronto, ON',
      shipping: true,
      limit: 10,
    });
    expect(shipped.listings.map((item) => item.id)).toEqual(['ship']);
    expect(shipped.note).toContain('local delivery is not shipping');
  });
});
