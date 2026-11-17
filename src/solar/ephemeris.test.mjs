import assert from 'node:assert/strict';
import test from 'node:test';
import { jdFromDate, orbitPath, planetPosition, PLANET_IDS } from './ephemeris.js';

const r = ({ x, y, z }) => Math.hypot(x, y, z);

test('Earth is at its perihelion distance in early January and aphelion in July', () => {
  assert.ok(Math.abs(r(planetPosition('earth', jdFromDate(new Date('2000-01-03T12:00Z')))) - 0.9833) < 0.002);
  assert.ok(Math.abs(r(planetPosition('earth', jdFromDate(new Date('2000-07-04T12:00Z')))) - 1.0167) < 0.002);
});

test('every planet stays between its perihelion and aphelion, and its orbit closes', () => {
  const jd = jdFromDate(new Date('2026-11-17T00:00Z'));
  for (const id of PLANET_IDS) {
    const path = orbitPath(id, jd);
    const rs = path.map(r);
    const p = r(planetPosition(id, jd));
    assert.ok(p >= Math.min(...rs) - 1e-3 && p <= Math.max(...rs) + 1e-3, id);
    assert.ok(r({ x: path[0].x - path.at(-1).x, y: path[0].y - path.at(-1).y, z: path[0].z - path.at(-1).z }) < 1e-9, id);
  }
});

test('Mars is between its perihelion and aphelion distance on 2000-01-01', () => {
  const m = planetPosition('mars', jdFromDate(new Date('2000-01-01T12:00Z')));
  assert.ok(r(m) > 1.38 && r(m) < 1.67);
});
