/**
 * @module solar/solarScene
 * @description The 3D solar system: real heliocentric positions for the
 * current time (JPL approximate elements; the Moon from the full lunar
 * ephemeris), planets that spin about their IAU poles, moons, orbits, named
 * asteroids and comets, the real bright-star catalogue, and a camera that
 * flies from any body to any other on a logarithmic distance scale.
 *
 * Units are AU, axes the J2000 ecliptic (Z up). Bodies are drawn at their
 * true size, but never smaller than a few pixels, so one scene reads from a
 * whole-system view down to a planet's surface.
 */
import * as THREE from 'three';
import { jdFromDate, orbitPath, planetPosition, PLANET_IDS } from './ephemeris.js';
import { moonPositionInertial } from '../geo/celestial.js';
import { MOONS } from './moons.js';
import { PLANETS, SUN } from './bodies.js';
import { hasTrekTexture, loadEarthTexture, loadTrekTexture, proceduralTexture, ringTexture, sunTexture } from './textures.js';
import { STAR_CATALOGUE_URL } from '../sky/assets.js';

const RAD = Math.PI / 180;
const AU_KM = 149597870.7;
const OBLIQUITY = 23.4392911 * RAD;
const MIN_PIXELS = 0.006; // minimum display radius as a fraction of camera distance
const EARTH_R_AU = 6371 / AU_KM;
const eclFromEq = new THREE.Matrix4().makeRotationX(-OBLIQUITY);

// IAU pole right ascension and declination (deg), prime meridian at J2000 and its rate (deg/day).
const FRAMES = {
  sun: [286.13, 63.87, 84.176, 14.1844], mercury: [281.01, 61.41, 329.5469, 6.1385025],
  venus: [272.76, 67.16, 160.2, -1.4813688], earth: [0, 90, 0, 0], moon: [266.86, 65.64, 38.3213, 13.17635815],
  mars: [317.68, 52.89, 176.63, 350.89198226], jupiter: [268.06, 64.5, 284.95, 870.536],
  saturn: [40.59, 83.54, 38.9, 810.7939024], uranus: [257.31, -15.18, 203.81, -501.1600928],
  neptune: [299.36, 43.46, 249.978, 536.3128492], pluto: [132.99, -6.16, 302.695, -56.364],
};
const gmstDeg = (jd) => (((280.46061837 + 360.98564736629 * (jd - 2451545)) % 360) + 360) % 360;

/** Body-fixed to ecliptic rotation for a body at a Julian date. */
function orientation(id, jd) {
  const [ra, dec, w0, rate] = FRAMES[id];
  const w = id === 'earth' ? gmstDeg(jd) - 90 : w0 + rate * (jd - 2451545);
  return eclFromEq.clone()
    .multiply(new THREE.Matrix4().makeRotationZ((ra + 90) * RAD))
    .multiply(new THREE.Matrix4().makeRotationX((90 - dec) * RAD))
    .multiply(new THREE.Matrix4().makeRotationZ(w * RAD));
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const ecl = ({ x, y, z }) => new THREE.Vector3(x, y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY));
const planetVec = (id, jd) => { const p = planetPosition(id, jd); return new THREE.Vector3(p.x, p.y, p.z); };

function glowTexture(inner = 'rgba(255,214,120,1)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, 'rgba(255,190,80,0.35)');
  g.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Position (AU, ecliptic) of a small body from its JPL Keplerian elements at a Julian date. */
function smallBodyPosition(el, jd) {
  const { a, e, i, om, w, epoch } = el;
  const n = el.n ?? 360 / el.per;
  const M = ((el.ma != null ? el.ma + n * (jd - epoch) : n * (jd - el.tp)) % 360) * RAD;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 40; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w * RAD), Math.sin(w * RAD), Math.cos(om * RAD), Math.sin(om * RAD), Math.cos(i * RAD), Math.sin(i * RAD)];
  return new THREE.Vector3((cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp, (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp, sw * si * xp + cw * si * yp);
}

export class SolarScene {
  constructor(canvas, labelLayer, { onPick, onFocus } = {}) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.onPick = onPick;
    this.onFocus = onFocus;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setClearColor(0x02040a, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 1e-10, 1e6);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.16));
    this.scene.add(new THREE.PointLight(0xffffff, 1.5, 0, 0));
    this.bodies = new Map();
    this.small = new Map();
    this.speed = 1;
    this.baseMs = Date.now();
    this.wall0 = performance.now();
    this.target = new THREE.Vector3();
    this.yaw = 0.6;
    this.pitch = 0.6;
    this.logDist = Math.log(14);
    this.focusId = 'sun';
    this.flight = null;
    this.stopped = false;
    this.buildSky();
    this.buildSun();
    PLANETS.forEach((p) => this.buildPlanet(p));
    MOONS.forEach((m) => this.buildMoon(m));
    this.buildBelt();
    this.bindInput();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ── Time ─────────────────────────────────────────────────────────────
  getTime() { return this.baseMs + (performance.now() - this.wall0) * this.speed; }
  setSpeed(speed) { this.baseMs = this.getTime(); this.wall0 = performance.now(); this.speed = speed; }
  live() { this.baseMs = Date.now(); this.wall0 = performance.now(); this.speed = 1; }

  // ── Construction ─────────────────────────────────────────────────────
  addLabel(id, name, cls = '') {
    const el = document.createElement('div');
    el.className = `ss-label ${cls}`;
    el.textContent = name;
    this.labelLayer.appendChild(el);
    return el;
  }

  makeBody({ id, name, kind, radiusKm, color, map, parent, emissive }) {
    const group = new THREE.Group();
    const mat = emissive ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : color, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    mesh.rotation.x = Math.PI / 2; // poles along +Z, longitude 0 along +X, east toward +Y
    group.add(mesh);
    this.scene.add(group);
    const body = { id, name, kind, group, mesh, mat, realAU: radiusKm / AU_KM, color, parent, pos: new THREE.Vector3(), label: this.addLabel(id, name, parent ? 'moon' : ''), radiusAU: radiusKm / AU_KM };
    this.bodies.set(id, body);
    return body;
  }

  buildSun() {
    const b = this.makeBody({ id: 'sun', name: 'Sun', kind: SUN.kind, radiusKm: 695700, color: SUN.color, map: sunTexture(), emissive: true });
    b.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.scene.add(b.glow);
  }

  buildPlanet(p) {
    const textured = hasTrekTexture(p.id) || p.id === 'earth';
    const b = this.makeBody({ ...p, radiusKm: p.radiusKm, map: textured ? null : proceduralTexture(p.id, p.color) });
    b.mat.color.set(textured ? 0x9aa0aa : 0xffffff);
    if (p.id === 'earth') loadEarthTexture((t) => { b.mat.map = t; b.mat.color.set(0xffffff); b.mat.needsUpdate = true; });
    else if (textured) loadTrekTexture(p.id, (t) => { b.mat.map = t; b.mat.color.set(0xffffff); b.mat.needsUpdate = true; });
    if (p.id === 'saturn') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.27, 128), new THREE.MeshBasicMaterial({ map: ringTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      b.group.add(ring);
    }
    if (p.id === 'earth') {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.02, 48, 24), new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec3 n; void main(){ float i = pow(0.62 - dot(n, vec3(0.,0.,1.)), 3.0); gl_FragColor = vec4(0.3,0.6,1.0,1.0)*i; }',
      }));
      b.group.add(halo);
      b.markers = new THREE.Group();
      b.group.add(b.markers);
    }
    // Orbit line, fixed at the time the scene opened.
    const pts = orbitPath(p.id, jdFromDate(new Date()), 256).map((q) => new THREE.Vector3(q.x, q.y, q.z));
    b.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.4 }));
    this.scene.add(b.orbit);
  }

  buildMoon(m) {
    const b = this.makeBody({ ...m, map: proceduralTexture(m.id, m.color), parent: m.parent });
    if (m.id === 'moon') {
      b.mat.color.set(0x9aa0aa);
      b.mat.map = proceduralTexture('moon', m.color);
      loadTrekTexture('moon', (t) => { b.mat.map = t; b.mat.color.set(0xffffff); b.mat.needsUpdate = true; });
    }
    b.aAU = m.aKm / AU_KM;
    b.period = m.period;
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * 2 * Math.PI), Math.sin((i / 128) * 2 * Math.PI), 0))), new THREE.LineBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.35 }));
    b.orbit = ring;
    this.scene.add(ring);
  }

  buildBelt() {
    const n = 3500;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const a = 2.1 + Math.random() * 1.2;
      const t = Math.random() * 2 * Math.PI;
      pos.set([a * Math.cos(t), a * Math.sin(t), (Math.random() - 0.5) * 0.25 * a * 0.3], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.belt = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8a58a, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
    this.scene.add(this.belt);
  }

  async buildSky() {
    this.sky = new THREE.Group();
    this.sky.applyMatrix4(eclFromEq);
    this.scene.add(this.sky);
    try {
      const { stars } = await (await fetch(STAR_CATALOGUE_URL)).json();
      const n = stars.length / 4;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const [ra, dec, mag, bv] = [stars[k * 4] * RAD, stars[k * 4 + 1] * RAD, stars[k * 4 + 2], stars[k * 4 + 3]];
        pos.set([5e3 * Math.cos(dec) * Math.cos(ra), 5e3 * Math.cos(dec) * Math.sin(ra), 5e3 * Math.sin(dec)], k * 3);
        const b = Math.max(0.25, Math.min(1, 1.1 - mag * 0.15));
        const warm = Math.max(0, Math.min(1, ((bv ?? 0.6) + 0.3) / 2));
        col.set([b * (0.75 + 0.25 * warm), b * 0.9, b * (1 - 0.3 * warm)], k * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false }));
      pts.renderOrder = -10;
      pts.frustumCulled = false;
      this.sky.add(pts);
    } catch { /* a missing catalogue leaves a black sky */ }
  }

  /** Named asteroids and comets, from `{id, name, elements}` JPL records. */
  addSmallBody({ id, name, kind, elements }) {
    if (this.small.has(id) || !elements || !(elements.e < 1)) return;
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd9a0, depthTest: false, transparent: true }));
    this.scene.add(dot);
    // One revolution of the same elements, as the orbit line.
    const orbit = Array.from({ length: 200 }, (_, k) => smallBodyPosition({ ...elements, ma: (k / 200) * 360, n: 0, epoch: 0 }, 0));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbit), new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.25 }));
    this.scene.add(line);
    this.small.set(id, { id, name, kind, elements, dot, line, pos: new THREE.Vector3(), label: this.addLabel(id, name, 'small') });
  }

  /** Mark fireball locations on Earth. */
  setFireballs(rows) {
    const earth = this.bodies.get('earth');
    earth.markers.clear();
    for (const f of rows) {
      const lat = (+f.lat * (f['lat-dir'] === 'S' ? -1 : 1)) * RAD;
      const lon = (+f.lon * (f['lon-dir'] === 'W' ? -1 : 1)) * RAD;
      if (!Number.isFinite(lat + lon)) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff7a3c, depthTest: false, transparent: true }));
      s.position.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)).multiplyScalar(1.004);
      s.scale.setScalar(0.012 + Math.min(0.03, Math.log10(1 + +f.energy) * 0.012));
      earth.markers.add(s);
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────
  positionOf(id) { return (this.bodies.get(id) ?? this.small.get(id))?.pos.clone() ?? new THREE.Vector3(); }
  /** Log distance that frames a body's whole disk; small bodies are seen from 0.05 AU. */
  focusDistance(id) {
    const b = this.bodies.get(id);
    return Math.log(b ? b.radiusAU * 3.4 : 0.05);
  }

  /** Begin at Earth framed as the globe was (`view`: {lat, lon, heightM}), then pull out. */
  intro(view) {
    this.update();
    const earth = this.bodies.get('earth');
    if (view && earth) {
      const lat = view.lat * RAD;
      const lon = view.lon * RAD;
      const local = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
      const dir = local.applyQuaternion(earth.group.quaternion);
      this.yaw = Math.atan2(dir.y, dir.x);
      this.pitch = Math.asin(dir.z);
      this.target = earth.pos.clone();
      this.logDist = Math.log(EARTH_R_AU + view.heightM / 1000 / AU_KM);
      this.focusId = 'earth';
      this.flyTo('sun', { distance: 14, pitch: 0.75, yaw: Math.atan2(-earth.pos.y, -earth.pos.x) + 0.5, duration: 6500 });
    } else this.flyTo('sun', { distance: 14, instant: true });
  }

  /** Fly the camera to a body: its target follows the body as it moves. */
  flyTo(id, { distance, yaw, pitch, duration, instant } = {}) {
    if (!this.bodies.has(id) && !this.small.has(id)) return;
    const logTo = distance ? Math.log(distance) : this.focusDistance(id);
    const goal = { id, logDist: logTo, yaw: yaw ?? this.yaw, pitch: pitch ?? Math.max(-1.2, Math.min(1.2, this.pitch)) };
    if (instant) {
      Object.assign(this, { focusId: id, logDist: goal.logDist, yaw: goal.yaw, pitch: goal.pitch, flight: null });
      this.target = this.positionOf(id);
    } else {
      const decades = Math.abs(goal.logDist - this.logDist) / Math.LN10;
      this.flight = {
        from: { target: this.target.clone(), logDist: this.logDist, yaw: this.yaw, pitch: this.pitch },
        goal, t0: performance.now(), duration: duration ?? Math.min(6000, 1600 + decades * 650),
      };
      this.focusId = id;
    }
    this.onFocus?.(id);
  }

  home() { this.flyTo('sun', { distance: 14, pitch: 0.75 }); }
  backToEarth(done) {
    this.flyTo('earth', { distance: EARTH_R_AU + 36000 / AU_KM, duration: 3500 });
    this.onArrive = done;
  }

  bindInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy * 0.006));
      this.flight = null;
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && drag.moved < 5) this.pick(e);
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const min = this.minLogDist();
      this.flight = null;
      this.logDist = Math.max(min, Math.min(Math.log(400), this.logDist + e.deltaY * 0.0015));
      this.onArrive = null;
    }, { passive: false });
  }

  minLogDist() {
    const b = this.bodies.get(this.focusId);
    return Math.log(b ? b.radiusAU * 1.15 : 1e-4);
  }

  pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    for (const item of [...this.bodies.values(), ...this.small.values()]) {
      if (!item.screen || item.hidden) continue;
      const d = Math.hypot(item.screen.x - x, item.screen.y - y);
      if (d <= Math.max(14, item.screen.r) && (!best || d < best.d)) best = { d, id: item.id };
    }
    if (best) { this.flyTo(best.id); this.onPick?.(best.id); }
  }

  // ── Frame ────────────────────────────────────────────────────────────
  update() {
    const ms = this.getTime();
    const jd = jdFromDate(new Date(ms));
    this.jd = jd;
    for (const id of PLANET_IDS) {
      const b = this.bodies.get(id);
      b.pos.copy(planetVec(id, jd));
      b.group.quaternion.setFromRotationMatrix(orientation(id, jd));
    }
    this.bodies.get('sun').group.quaternion.setFromRotationMatrix(orientation('sun', jd));
    for (const m of MOONS) {
      const b = this.bodies.get(m.id);
      const parent = this.bodies.get(m.parent);
      let offset;
      if (m.id === 'moon') offset = ecl(moonPositionInertial(ms)).multiplyScalar(1 / 1000 / AU_KM);
      else {
        const phase = (2 * Math.PI * (jd - 2451545)) / m.period + m.aKm;
        offset = new THREE.Vector3(Math.cos(phase), Math.sin(phase), 0).multiplyScalar(b.aAU).applyQuaternion(parent.group.quaternion);
      }
      b.pos.copy(parent.pos).add(offset);
      // Tidally locked: +X (longitude 0) faces the parent, the pole follows the parent's.
      const x = offset.clone().negate().normalize();
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(m.id === 'moon' ? new THREE.Quaternion().setFromRotationMatrix(orientation('moon', jd)) : parent.group.quaternion);
      const y = z.clone().cross(x).normalize();
      b.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y)));
      b.orbit.position.copy(parent.pos);
      b.orbit.scale.setScalar(m.id === 'moon' ? offset.length() : b.aAU);
      if (m.id === 'moon') b.orbit.quaternion.identity(); else b.orbit.quaternion.copy(parent.group.quaternion);
    }
    for (const s of this.small.values()) s.pos.copy(smallBodyPosition(s.elements, jd));
  }

  frame(now) {
    if (this.stopped) return;
    requestAnimationFrame(this.frame);
    this.update();
    // Flight.
    if (this.flight) {
      const { from, goal, t0, duration } = this.flight;
      const k = Math.min(1, (now - t0) / duration);
      const t = ease(k);
      const dest = this.positionOf(goal.id);
      this.target.lerpVectors(from.target, dest, t);
      this.logDist = from.logDist + (goal.logDist - from.logDist) * t;
      let dyaw = goal.yaw - from.yaw;
      dyaw -= Math.round(dyaw / (2 * Math.PI)) * 2 * Math.PI;
      this.yaw = from.yaw + dyaw * t;
      this.pitch = from.pitch + (goal.pitch - from.pitch) * t;
      if (k === 1) { this.flight = null; const cb = this.onArrive; this.onArrive = null; cb?.(); }
    } else {
      this.target.copy(this.positionOf(this.focusId));
    }
    const dist = Math.exp(this.logDist);
    const dir = new THREE.Vector3(Math.cos(this.pitch) * Math.cos(this.yaw), Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch));
    this.camera.position.copy(this.target).addScaledVector(dir, dist);
    this.camera.near = Math.max(1e-11, dist * 1e-4);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    this.layout();
    this.renderer.render(this.scene, this.camera);
  }

  /** Display sizes, visibility and labels for this frame. */
  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (this.canvas.width !== Math.round(w * devicePixelRatio) || this.canvas.height !== Math.round(h * devicePixelRatio)) {
      this.renderer.setPixelRatio(devicePixelRatio);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
    }
    // Keep the focused body clear of the side panel on wide screens.
    const shift = w > 720 ? Math.min(360, w * 0.44) / 2 : 0;
    this.camera.setViewOffset(w, h, shift, 0, w, h);
    const focusBody = this.bodies.get(this.focusId);
    const pxPerAU = (dist) => h / 2 / Math.tan((this.camera.fov / 2) * RAD) / dist;
    const place = (item, radius, show, name) => {
      const dist = this.camera.position.distanceTo(item.pos);
      const shown = Math.max(radius, dist * MIN_PIXELS);
      const v = item.pos.clone().project(this.camera);
      const behind = v.z > 1 || v.z < -1;
      item.hidden = !show || behind;
      item.screen = { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, r: shown * pxPerAU(dist) };
      item.label.style.display = item.hidden || name === false ? 'none' : 'block';
      item.label.style.transform = `translate(${item.screen.x + Math.max(6, item.screen.r + 4)}px, ${item.screen.y}px)`;
      return shown;
    };
    for (const b of this.bodies.values()) {
      const moon = Boolean(b.parent);
      if (moon) {
        const camToParent = this.camera.position.distanceTo(this.bodies.get(b.parent).pos);
        const maxA = Math.max(...MOONS.filter((m) => m.parent === b.parent).map((m) => m.aKm)) / AU_KM;
        b.near = camToParent < maxA * 35 || focusBody?.parent === b.parent || focusBody?.id === b.parent;
      }
      const show = moon ? b.near : true;
      const shown = place(b, b.radiusAU, show);
      b.group.visible = show;
      b.group.position.copy(b.pos);
      b.group.scale.setScalar(shown);
      if (b.orbit) {
        const dist = this.camera.position.distanceTo(b.pos);
        b.orbit.visible = moon ? b.near : dist > 0.15;
        if (!moon) b.orbit.material.opacity = Math.min(0.45, dist * 0.08);
      }
      if (b.id === 'sun') { b.glow.position.copy(b.pos); b.glow.scale.setScalar(shown * 7); }
    }
    for (const s of this.small.values()) {
      const dist = this.camera.position.distanceTo(s.pos);
      place(s, 0, true);
      s.dot.position.copy(s.pos);
      s.dot.scale.setScalar(Math.max(dist * 0.006, 1e-7));
      s.line.visible = dist > 0.5 || this.focusId === s.id;
    }
    this.belt.material.opacity = Math.max(0.05, Math.min(0.7, this.camera.position.length() * 0.05));
  }

  dispose() {
    this.stopped = true;
    this.renderer.dispose();
    this.labelLayer.replaceChildren();
  }
}
