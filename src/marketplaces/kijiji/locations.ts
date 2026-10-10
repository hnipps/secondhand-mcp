/**
 * Kijiji areas come from the location tree the site itself publishes.
 * A city search has to use Kijiji's id. GeoNames ids are a different set.
 */

import { keyify, splitPlaceQuery } from '../places.js';

const LOCATIONS_URL = 'https://www.kijiji.ca/j-locations.json';

const PROVINCE_BY_NAME: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  newfoundland: 'NL',
  'newfoundland and labrador': 'NL',
  'nova scotia': 'NS',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
  'northwest territories': 'NT',
  nunavut: 'NU',
};

export interface KijijiArea {
  id: number;
  name: string;
  slug: string;
  /** Postal abbreviation when this node sits in one province. */
  province: string;
  leaf: boolean;
}

interface RawNode {
  id?: number;
  nameEn?: string;
  homePageSEOUrl?: string;
  leaf?: boolean;
  children?: RawNode[];
}

export function parseLocationTree(source: string): KijijiArea[] {
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) return [];
  const root = JSON.parse(source.slice(start, end + 1)) as RawNode;
  const areas: KijijiArea[] = [];
  walk(root, '', areas);
  return areas;
}

function walk(node: RawNode, inherited: string, out: KijijiArea[]): void {
  const name = node.nameEn ?? '';
  const fromName = provinceFromName(name);
  const province = fromName === undefined ? inherited : fromName;
  if (typeof node.id === 'number' && name) {
    out.push({
      id: node.id,
      name,
      slug: slugFrom(node.homePageSEOUrl, node.id),
      province,
      leaf: node.leaf === true,
    });
  }
  for (const child of node.children ?? []) walk(child, province, out);
}

function provinceFromName(name: string): string | undefined {
  const key = keyify(name.replace(/\s*\([^)]*\)/g, ' '));
  if (key === 'canada' || key === 'territories') return '';
  return PROVINCE_BY_NAME[key];
}

function slugFrom(url: string | undefined, id: number): string {
  const match = url?.match(/\/h-([^/]+)\//);
  return match?.[1] ?? String(id);
}

interface IndexedArea {
  area: KijijiArea;
  /** True when the query names this area, not a longer label that contains it. */
  primary: boolean;
}

export function matchKijijiArea(areas: KijijiArea[], query: string): KijijiArea | null {
  const { city, region } = splitPlaceQuery(query);
  const wanted = keyify(city);
  if (!wanted) return null;

  const indexed = areas.flatMap((area) => keysFor(area).map((entry) => ({ ...entry, area })));
  let hits = indexed.filter((entry) => entry.key === wanted);
  if (region) hits = hits.filter((entry) => entry.area.province === region);
  return pick(hits);
}

function pick(hits: Array<IndexedArea & { key: string }>): KijijiArea | null {
  if (hits.length === 0) return null;
  const primary = hits.some((entry) => entry.primary) ? hits.filter((entry) => entry.primary) : hits;
  const leaves = primary.filter((entry) => entry.area.leaf);
  const pool = leaves.length > 0 ? leaves : primary;
  const ids = new Set(pool.map((entry) => entry.area.id));
  // Province buckets such as the two Ontario halves are not one search area.
  if (ids.size > 1 && leaves.length === 0) return null;
  return [...pool].sort((a, b) => a.area.name.length - b.area.name.length)[0].area;
}

function keysFor(area: KijijiArea): Array<{ key: string; primary: boolean }> {
  const stripped = area.name.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const withoutPrefix = stripped.replace(/^(city of |ville de )/i, '');
  const parts = withoutPrefix.split('/').map((part) => keyify(part)).filter(Boolean);
  const full = keyify(withoutPrefix);
  const keys = new Set([full, ...parts]);
  return [...keys].map((key) => ({ key, primary: key === full || key === keyify(parts[0] ?? '') }));
}

let areasPromise: Promise<KijijiArea[]> | null = null;

export function loadKijijiAreas(fetchImpl: typeof fetch = fetch): Promise<KijijiArea[]> {
  if (!areasPromise) {
    areasPromise = fetchImpl(LOCATIONS_URL, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/javascript,*/*' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Kijiji locations responded ${response.status}`);
        const areas = parseLocationTree(await response.text());
        if (!areas.some((area) => area.id === 0)) throw new Error('Kijiji location tree had no Canada entry');
        return areas;
      })
      .catch((error) => {
        areasPromise = null;
        throw error;
      });
  }
  return areasPromise;
}

export function canadaArea(areas: KijijiArea[]): KijijiArea {
  return (
    areas.find((area) => area.id === 0) ?? {
      id: 0,
      name: 'Canada',
      slug: 'canada',
      province: '',
      leaf: false,
    }
  );
}

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
