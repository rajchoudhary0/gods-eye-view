/**
 * @module solar/textures
 * @description Surface textures. Earth uses NASA Blue Marble from NASA GIBS,
 * and the Moon, Mars and Mercury use NASA Trek global mosaics (both public,
 * CORS-enabled). Every other body gets a procedural texture painted in the
 * browser from its known colours: banded gas giants, cratered grey moons.
 */
import * as THREE from 'three';

const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&FORMAT=image/jpeg&WIDTH=4096&HEIGHT=2048&LAYERS=';
const TREK = 'https://trek.nasa.gov/tiles/';
const TREK_LAYERS = {
  moon: 'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02',
  mars: 'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m',
  mercury: 'Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m',
};

const finish = (texture) => {
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

// Deterministic value noise, periodic in x so a texture wraps without a seam.
function noiser(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y, period) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const h = (i, j) => hash(((i % period) + period) % period, j);
    const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const bottom = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

function paint(width, height, seed, pixel) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const noise = noiser(seed);
  const fbm = (u, v, base) => {
    let sum = 0;
    let amp = 0.5;
    let f = base;
    for (let o = 0; o < 5; o++, amp /= 2, f *= 2) sum += amp * noise(u * f, v * f * 0.5, f);
    return sum;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x / width, y / height, fbm);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Cloud-band palettes (top to bottom) from the planets' well-known colours.
const BANDS = {
  jupiter: ['#e9dcc3', '#c79a6c', '#f1e6d2', '#a9744a', '#e3cfae', '#b5835a', '#efe3cc', '#c08d63'],
  saturn: ['#f2e6bf', '#d8bf88', '#efe0b0', '#cdb078', '#f0e3b8', '#d4ba84'],
  uranus: ['#b4eef1', '#a0e4e9', '#b9f0f2', '#9fe3e8'],
  neptune: ['#3e68f5', '#4a78ff', '#3558e6', '#4f7dff', '#2f50d8'],
  venus: ['#f1dcab', '#e7c786', '#f5e7c4', '#e2bf7c'],
};

/** A texture for a body with no NASA map: banded giants, cratered rock. */
export function proceduralTexture(id, color) {
  const bands = BANDS[id];
  if (bands) {
    const rgb = bands.map(hex);
    const canvas = paint(1024, 512, id.length * 7, (u, v, fbm) => {
      const turbulence = (fbm(u, v * 6, 2) - 0.5) * (id === 'venus' ? 0.9 : 0.35);
      const t = Math.min(0.9999, Math.max(0, v + turbulence * 0.5)) * (rgb.length - 1);
      const i = Math.floor(t);
      const c = mix(rgb[i], rgb[Math.min(i + 1, rgb.length - 1)], (t - i) * (t - i) * (3 - 2 * (t - i)));
      const shade = 0.88 + fbm(u, v, 6) * 0.24;
      return c.map((x) => x * shade);
    });
    return finish(new THREE.CanvasTexture(canvas));
  }
  const base = hex(color);
  const canvas = paint(512, 256, [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0), (u, v, fbm) => {
    const n = fbm(u, v, 5);
    const crater = fbm(u, v, 24) > 0.62 ? 0.72 : 1;
    const k = (0.7 + n * 0.6) * crater;
    return base.map((x) => Math.min(255, x * k));
  });
  return finish(new THREE.CanvasTexture(canvas));
}

export function sunTexture() {
  const canvas = paint(512, 256, 3, (u, v, fbm) => {
    const n = fbm(u, v, 10);
    return [255, 150 + n * 100, 30 + n * 60].map((x) => Math.min(255, x));
  });
  return finish(new THREE.CanvasTexture(canvas));
}

export function ringTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  // The ring's UVs span 0..2.27 Saturn radii across the texture; the rings run
  // 1.24 (C ring) to 2.27 (A ring edge), with the Cassini division near 0.62.
  const inner = 1.24 / 2.27;
  const bands = [[0, 0.18, 0.28], [0.18, 0.55, 0.92], [0.55, 0.62, 0.05], [0.62, 0.98, 0.72], [0.98, 1.0, 0.04]];
  for (const [from, to, alpha] of bands) {
    const r0 = (inner + from * (1 - inner)) * 512;
    const r1 = (inner + to * (1 - inner)) * 512;
    ctx.strokeStyle = `rgba(222,205,165,${alpha})`;
    ctx.lineWidth = r1 - r0 + 1;
    ctx.beginPath();
    ctx.arc(512, 512, (r0 + r1) / 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
  return finish(new THREE.CanvasTexture(canvas));
}

/** Earth's NASA Blue Marble, as soon as it arrives. */
export function loadEarthTexture(apply) {
  // A small image first so Earth is never blank, then the 4096-wide one.
  for (const w of [1024, 4096]) {
    const url = `${GIBS.replace('WIDTH=4096&HEIGHT=2048', `WIDTH=${w}&HEIGHT=${w / 2}`)}BlueMarble_NextGeneration`;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (t) => apply(finish(t)), undefined, () => {});
  }
}

/** A NASA Trek global mosaic stitched from 32 tiles (level 2: 8 x 4). */
export function loadTrekTexture(id, apply) {
  const layer = TREK_LAYERS[id];
  if (!layer) return;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  let loaded = 0;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 8; col++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, col * 256, row * 256, 256, 256);
        if (++loaded === 32) apply(finish(new THREE.CanvasTexture(canvas)));
      };
      img.onerror = () => {};
      img.src = `${TREK}${layer}/1.0.0/default/default028mm/2/${row}/${col}.jpg`;
    }
}
export const hasTrekTexture = (id) => id in TREK_LAYERS;
