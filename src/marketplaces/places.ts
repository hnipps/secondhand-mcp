/**
 * Offline city lookup for the United States and Canada.
 *
 * Facebook's location search ranks by check-ins, so bare city names land on
 * whatever is popular rather than what was asked for. Resolving cities from
 * GeoNames data instead is deterministic, and picking the most populous match
 * is the disambiguation Facebook is missing.
 *
 * all-the-cities is the only surveyed dataset carrying population, the field
 * that decides which Austin or which Toronto someone meant.
 *
 * Canadian admin codes in that dataset are GeoNames numbers ("08"), not
 * postal abbreviations. They are translated at index time so "Toronto, ON"
 * and "Toronto, Ontario" share one key.
 *
 * Data: geonames.org, CC BY 4.0, via the all-the-cities package.
 */

import allCities from 'all-the-cities';
import { LocationCoordinates } from '../types.js';

const US_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

/** GeoNames admin1 numbers for Canada, from the all-the-cities dump. */
const CA_FROM_ADMIN: Record<string, string> = {
  '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS',
  '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU',
};

const CA_CODES: Record<string, string> = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', newfoundland: 'NL', 'nova scotia': 'NS',
  ontario: 'ON', 'prince edward island': 'PE', quebec: 'QC', saskatchewan: 'SK',
  yukon: 'YT', 'northwest territories': 'NT', nunavut: 'NU',
};

const REGION_CODES: Record<string, string> = { ...US_CODES, ...CA_CODES };

const REGION_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_CODES).map(([name, code]) => [code, name])
);

/** "nj" → "new jersey", "on" → "ontario". Undefined for an unknown code. */
export function regionNameForCode(code: string): string | undefined {
  return REGION_NAMES[code.trim().toUpperCase()];
}

/**
 * Shorthand people type that is not a place name in any dataset. Values are
 * GeoNames names, so they resolve through the same index as anything else.
 */
const CITY_ALIASES: Record<string, string> = {
  nyc: 'new york city', 'new york': 'new york city', 'ny city': 'new york city',
  sf: 'san francisco', 'the city': 'san francisco',
  la: 'los angeles', lax: 'los angeles',
  dc: 'washington dc', philly: 'philadelphia', vegas: 'las vegas',
  nola: 'new orleans', atl: 'atlanta', chi: 'chicago',
  'the bay': 'san francisco', 'bay area': 'san francisco',
  mtl: 'montreal', yyz: 'toronto', yvr: 'vancouver',
};

export interface IndexedPlace extends LocationCoordinates {
  country: 'US' | 'CA';
  region: string;
}

interface CityRecord {
  name: string;
  region: string;
  country: 'US' | 'CA';
  latitude: number;
  longitude: number;
  population: number;
}

let index: Map<string, CityRecord> | null = null;
/** Largest population anywhere carrying each name, indexed country or not. */
let worldMax: Map<string, number> | null = null;

function regionFor(country: string, adminCode: string): { country: 'US' | 'CA'; region: string } | null {
  if (country === 'US' && REGION_NAMES[adminCode]) return { country: 'US', region: adminCode };
  const postal = country === 'CA' ? CA_FROM_ADMIN[adminCode] : undefined;
  return postal ? { country: 'CA', region: postal } : null;
}

function buildIndex(): Map<string, CityRecord> {
  const idx = new Map<string, CityRecord>();
  const world = new Map<string, number>();

  for (const c of allCities) {
    const worldKey = keyify(c.name);
    if ((world.get(worldKey) ?? 0) < c.population) world.set(worldKey, c.population);

    const region = regionFor(c.country, String(c.adminCode));
    if (!region) continue;
    const rec: CityRecord = {
      name: c.name,
      region: region.region,
      country: region.country,
      latitude: c.loc.coordinates[1],
      longitude: c.loc.coordinates[0],
      population: c.population,
    };
    const name = keyify(c.name);

    // Most populous wins both the bare name and the name+region key, which is
    // what makes "portland" Oregon and bare "toronto" Ontario.
    for (const key of [name, `${name}|${region.region.toLowerCase()}`]) {
      const cur = idx.get(key);
      if (!cur || rec.population > cur.population) idx.set(key, rec);
    }
  }

  worldMax = world;
  return idx;
}

function normalize(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** GeoNames carries punctuation ("St. Louis", "Montréal") that nobody types
 *  consistently, so keys and queries are flattened the same way. */
export function keyify(value: string): string {
  return normalize(value).replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

/** Split "austin, tx" / "toronto ontario" into a city and a region code. */
export function splitPlaceQuery(query: string): { city: string; region?: string } {
  return splitCityRegion(normalize(query));
}

function splitCityRegion(q: string): { city: string; region?: string } {
  const comma = q.lastIndexOf(',');
  if (comma > 0) {
    const tail = q.slice(comma + 1).trim();
    const code = tail.length === 2 ? tail.toUpperCase() : REGION_CODES[tail];
    if (code) return { city: q.slice(0, comma).trim(), region: code };
  }

  // No comma: peel the longest trailing region name, then a bare code. Longest
  // wins so "charleston west virginia" is not read as a city in Virginia.
  let longest: { name: string; code: string } | undefined;
  for (const [name, code] of Object.entries(REGION_CODES)) {
    if (q.endsWith(` ${name}`) && (!longest || name.length > longest.name.length)) {
      longest = { name, code };
    }
  }
  if (longest) {
    return {
      city: q.slice(0, q.length - longest.name.length - 1).trim(),
      region: longest.code,
    };
  }
  const m = q.match(/^(.+?)\s+([a-z]{2})$/);
  if (m && Object.values(REGION_CODES).includes(m[2].toUpperCase())) {
    return { city: m[1].trim(), region: m[2].toUpperCase() };
  }

  return { city: q };
}

export function lookupPlace(query: string): IndexedPlace | null {
  if (!index) index = buildIndex();

  const q = normalize(query);
  const { city, region } = splitCityRegion(q);
  const name = keyify(CITY_ALIASES[keyify(city)] ?? city);

  const code = region?.toLowerCase();
  const hit =
    (code && index.get(`${name}|${code}`)) ||
    // GeoNames folds the district into the name ("Washington, D.C."), so the
    // key still carries the region that was just split off the query.
    (code && index.get(`${name} ${code}|${code}`)) ||
    (!region ? index.get(name) : undefined);
  if (!hit) return null;

  // Bare "london" means London, UK, which this index does not cover. Without
  // a region, only answer when the indexed city is the largest of that name.
  if (!region && (worldMax?.get(keyify(hit.name)) ?? 0) > hit.population) return null;

  // A region was named but that city does not exist there.
  if (region && hit.region !== region) return null;

  // "Washington, D.C." already carries its region; don't render it twice.
  const carriesRegion = keyify(hit.name).endsWith(` ${keyify(hit.region)}`);

  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    country: hit.country,
    region: hit.region,
    name: carriesRegion ? hit.name : `${hit.name}, ${hit.region}`,
  };
}
