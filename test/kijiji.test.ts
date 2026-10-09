import { describe, expect, it } from 'vitest';
import { canadaArea, matchKijijiArea, parseLocationTree } from '../src/marketplaces/kijiji/locations.js';
import { detailsFromHtml, listingsFromSearchHtml } from '../src/marketplaces/kijiji/parse.js';
import { searchUrl } from '../src/marketplaces/kijiji/index.js';

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

function listing(id: string, title: string, amount: number | null) {
  return {
    __typename: 'StandardListing',
    id,
    title,
    description: `${title} in full`,
    url: `https://www.kijiji.ca/v-laptops/city-of-toronto/${id}`,
    imageUrls: [`https://media.kijiji.ca/${id}.jpg`],
    location: { name: 'Toronto', address: 'Toronto, ON M5V' },
    price:
      amount == null
        ? { __typename: 'NonAmountPrice', type: 'CONTACT' }
        : { __typename: 'StandardAmountPrice', type: 'FIXED', amount, currency: 'CAD' },
    attributes: { all: [{ canonicalName: 'condition', canonicalValues: ['usedgood'] }] },
  };
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
