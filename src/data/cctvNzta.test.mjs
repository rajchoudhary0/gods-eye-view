import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nztaCameraToSource,
  loadNztaSources,
  NZTA_CAMERAS_URL,
} from '../../server/providers/cctv/nzta.js';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';

const block = (o = {}) => {
  const f = {
    id: '714',
    name: 'SH1 Tinwald &amp; Co',
    description: 'South along Hinds Highway',
    imageUrl: '/camera/714.jpg',
    latitude: '-43.919632',
    longitude: '171.721055',
    offline: 'false',
    underMaintenance: 'false',
    ...o,
  };
  return `<camera>${Object.entries(f).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</camera>`;
};

test('NZTA maps a camera block to a pinned image source', () => {
  const c = nztaCameraToSource(block());
  assert.equal(c.id, 'nzta-714');
  assert.equal(c.url, 'https://trafficnz.info/camera/714.jpg');
  assert.equal(c.cityId, 'new-zealand');
  assert.match(c.name, /SH1 Tinwald & Co/);
});

test('NZTA rejects offline, bad-coordinate and off-path rows', () => {
  for (const o of [
    { offline: 'true' },
    { underMaintenance: 'true' },
    { latitude: '43.9' },
    { longitude: '-171.7' },
    { imageUrl: 'https://evil.test/camera/714.jpg' },
    { imageUrl: '/camera/9.jpg' },
    { id: '0' },
  ])
    assert.equal(nztaCameraToSource(block(o)), null);
  assert.equal(nztaCameraToSource(null), null);
});

function mockFeed(t) {
  const requested = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(String(url));
    if (url === NZTA_CAMERAS_URL)
      return new Response(
        `<response>${block()}${block()}${block({ id: '9', imageUrl: '/camera/9.jpg', offline: 'true' })}</response>`,
      );
    return Response.json([]);
  });
  return requested;
}

test('loader deduplicates and skips offline cameras', async (t) => {
  mockFeed(t);
  assert.deepEqual((await loadNztaSources()).map((c) => c.id), ['nzta-714']);
});

for (const [flag, expectLoaded] of [['1', true], [undefined, false], ['true', false]])
  test(`CCTV_NZTA_ENABLED=${flag} ${expectLoaded ? 'loads' : 'never contacts'} NZTA`, async (t) => {
    const requested = mockFeed(t);
    const saved = process.env.CCTV_NZTA_ENABLED;
    try {
      if (flag === undefined) delete process.env.CCTV_NZTA_ENABLED;
      else process.env.CCTV_NZTA_ENABLED = flag;
      const sources = await createCctvCatalog({ sourceRoot: '/nonexistent' })();
      assert.equal(sources.some((c) => c.id === 'nzta-714'), expectLoaded);
      assert.equal(requested.includes(NZTA_CAMERAS_URL), expectLoaded);
    } finally {
      if (saved === undefined) delete process.env.CCTV_NZTA_ENABLED;
      else process.env.CCTV_NZTA_ENABLED = saved;
    }
  });
