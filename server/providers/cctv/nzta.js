import { CCTV_SOURCE_FETCH_TIMEOUT_MS } from './constants.js';
import {
  cameraDisplayCode,
  fallbackHeadingFromId,
  prioritizeSources,
} from './normalize.js';
import { readResponseTextCapped } from '../common/http.js';

const ORIGIN = 'https://trafficnz.info';
export const NZTA_CAMERAS_URL = `${ORIGIN}/service/traffic/rest/4/cameras/all`;
export const NZTA_MAX_CATALOG_BYTES = 2 * 1024 * 1024; // ~330 KB observed
const IMAGE_PATH_RE = /^\/camera\/[1-9]\d{0,8}\.jpg$/;
const ANCHORS = [
  { lat: -36.8485, lon: 174.7633 }, // Auckland
  { lat: -41.2865, lon: 174.7762 }, // Wellington
  { lat: -43.5321, lon: 172.6362 }, // Christchurch
  { lat: -37.7870, lon: 175.2793 }, // Hamilton
  { lat: -45.8788, lon: 170.5028 }, // Dunedin
];

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e]);
/** First direct-or-nested `<tag>` text in one camera block (flat feed). */
const field = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? decode(m[1]).trim() : '';
};

/** One `<camera>` XML block -> CCTV source; offline/invalid rows -> null. */
export function nztaCameraToSource(block) {
  if (typeof block !== 'string') return null;
  const id = field(block, 'id');
  if (!/^[1-9]\d{0,8}$/.test(id)) return null;
  if (field(block, 'offline') !== 'false') return null;
  if (field(block, 'underMaintenance') !== 'false') return null;
  const path = field(block, 'imageUrl');
  if (!IMAGE_PATH_RE.test(path) || path !== `/camera/${id}.jpg`) return null;
  const lat = Number(field(block, 'latitude'));
  const lon = Number(field(block, 'longitude'));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -48.5 ||
    lat > -34 ||
    lon < 166 ||
    lon > 179
  )
    return null;
  const cameraId = `nzta-${id}`;
  const name = (field(block, 'name') || `New Zealand ${id}`).slice(0, 160);
  const description = field(block, 'description').slice(0, 160);
  const url = `${ORIGIN}${path}`;
  return {
    id: cameraId,
    name: description ? `${name} — ${description}` : name,
    city: 'New Zealand',
    cityId: 'new-zealand',
    provider: 'NZ Transport Agency Waka Kotahi',
    lat,
    lon,
    headingDeg: fallbackHeadingFromId(cameraId),
    headingConfidence: 'low',
    pitchDeg: -18,
    fovDeg: 44,
    rangeM: 145,
    mountHeightM: 8,
    feedType: 'image',
    url,
    snapshotUrl: url,
    sourceKind: 'nzta-public',
    credit: 'NZ Transport Agency Waka Kotahi — highway camera stills',
    code: cameraDisplayCode(name.toUpperCase()),
  };
}

/** One bounded keyless request per shared catalog refresh. */
export async function loadNztaSources() {
  try {
    const signal = AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS);
    const response = await fetch(NZTA_CAMERAS_URL, {
      headers: { Accept: 'application/xml' },
      redirect: 'manual',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Catalog HTTP ${response.status}`);
    }
    const xml = await readResponseTextCapped(
      response,
      NZTA_MAX_CATALOG_BYTES,
      signal,
    );
    const cameras = new Map();
    for (const [block] of xml.matchAll(/<camera>[\s\S]*?<\/camera>/g)) {
      const camera = nztaCameraToSource(block);
      if (camera && !cameras.has(camera.id)) cameras.set(camera.id, camera);
    }
    const rawCap = Number(process.env.CCTV_NZTA_MAX_SOURCES || 400);
    const cap = Number.isFinite(rawCap)
      ? Math.max(1, Math.min(1000, Math.floor(rawCap)))
      : 400;
    const sources = prioritizeSources([...cameras.values()], cap, ANCHORS);
    console.log(
      `[CCTV] Loaded NZTA camera sources: ${cameras.size} (using ${sources.length})`,
    );
    return sources;
  } catch (error) {
    console.warn('[CCTV] NZTA camera download error:', error?.message || error);
    return [];
  }
}
