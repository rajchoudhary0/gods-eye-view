<script setup>
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { t } from '../../../i18n/index.js';
import { useSolarSystemStore } from '../../stores/solarSystem.js';
import { jdFromDate, orbitPath, planetPosition } from '../../../solar/ephemeris.js';
import { PLANETS, SHOWERS, STARS, SUN } from '../../../solar/bodies.js';

// The view over the globe once you zoom out past Earth: the planets where
// they are on the chosen date (JPL approximate elements), their orbits, and
// cards for planets, stars, meteor showers and live NASA/JPL small bodies.
const { open } = storeToRefs(useSolarSystemStore());

const AU_LIGHT_MIN = 8.3167; // light-minutes per AU
const AU_LD = 389.17; // lunar distances per AU
const MAX_AU = 50;
const UTC = 'UTC';
const LD = 'LD'; // lunar distances

const tab = ref('planets');
const date = ref(new Date());
const speed = ref(0); // days of simulated time per real second
const selected = ref(null);
const canvas = ref(null);
const stage = ref(null);

// ── Orrery ─────────────────────────────────────────────────────────────
let size = { w: 0, h: 0 };
let hits = [];
const radius = (au) => Math.sqrt(au / MAX_AU); // 0..1; keeps the inner planets legible

function project(p, scale, cx, cy) {
  const rxy = Math.hypot(p.x, p.y);
  const r = radius(rxy) * scale;
  const a = Math.atan2(p.y, p.x);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

function draw() {
  const el = canvas.value;
  const ctx = el?.getContext('2d');
  if (!ctx || !size.w) return;
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  const cx = size.w / 2;
  const cy = size.h / 2;
  const scale = Math.min(size.w, size.h) / 2 - 36;
  const jd = jdFromDate(date.value);
  hits = [];
  ctx.lineWidth = 1;
  // Asteroid belt band, 2.2 to 3.2 AU.
  ctx.strokeStyle = 'rgba(180,160,130,0.18)';
  ctx.setLineDash([2, 5]);
  for (const au of [2.2, 2.7, 3.2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius(au) * scale, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const body of PLANETS) {
    ctx.strokeStyle = selected.value?.id === body.id ? 'rgba(255,255,255,0.7)' : 'rgba(150,200,255,0.22)';
    ctx.beginPath();
    orbitPath(body.id, jd, 120).forEach((p, i) => {
      const [x, y] = project(p, scale, cx, cy);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  glow.addColorStop(0, 'rgba(255,212,90,1)');
  glow.addColorStop(1, 'rgba(255,212,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
  ctx.fill();
  hits.push({ body: SUN, x: cx, y: cy, r: 18 });
  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (const body of PLANETS) {
    const [x, y] = project(planetPosition(body.id, jd), scale, cx, cy);
    const r = body.radiusKm > 20000 ? 6 : body.id === 'pluto' ? 2.5 : 4;
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    if (selected.value?.id === body.id) {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(220,235,255,0.85)';
    ctx.fillText(body.name, x + r + 5, y);
    hits.push({ body, x, y, r: Math.max(r + 6, 12) });
  }
}

function fit() {
  const box = stage.value?.getBoundingClientRect();
  if (!box || !canvas.value) return;
  const dpr = devicePixelRatio || 1;
  size = { w: box.width, h: box.height };
  canvas.value.width = Math.round(box.width * dpr);
  canvas.value.height = Math.round(box.height * dpr);
  draw();
}

function pick(event) {
  const box = canvas.value.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  const hit = hits.filter((h) => Math.hypot(h.x - x, h.y - y) <= h.r).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  if (hit) {
    tab.value = 'planets';
    selectBody(hit.body);
  }
}

// ── Time ───────────────────────────────────────────────────────────────
let raf = 0;
let last = 0;
function tick(now) {
  if (!open.value || !speed.value) return void (raf = 0);
  date.value = new Date(date.value.getTime() + ((now - last) / 1000) * speed.value * 86400000);
  last = now;
  raf = requestAnimationFrame(tick);
}
watch(speed, (v) => {
  if (v && !raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
});
watch([date, selected], draw);

// ── Cards ──────────────────────────────────────────────────────────────
function selectBody(body) {
  const live = [];
  if (PLANETS.includes(body)) {
    const jd = jdFromDate(date.value);
    const p = planetPosition(body.id, jd);
    const e = planetPosition('earth', jd);
    const sun = Math.hypot(p.x, p.y, p.z);
    const earth = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    live.push(['Distance from Sun (now)', `${sun.toFixed(3)} AU`]);
    if (body.id !== 'earth') live.push(['Distance from Earth (now)', `${earth.toFixed(3)} AU · light time ${(earth * AU_LIGHT_MIN).toFixed(1)} min`]);
  }
  selected.value = { ...body, facts: [...live, ...body.facts] };
}
const selectOther = (item) => (selected.value = item);
watch(date, () => {
  if (selected.value && PLANETS.some((p) => p.id === selected.value.id)) selectBody(PLANETS.find((p) => p.id === selected.value.id));
});

// ── Live NASA/JPL data ─────────────────────────────────────────────────
const small = ref({ state: 'idle', approaches: [], fireballs: [] });
const rows = (payload) => payload.data.map((r) => Object.fromEntries(payload.fields.map((f, i) => [f, r[i]])));
async function loadSmall() {
  if (small.value.state !== 'idle') return;
  small.value.state = 'loading';
  try {
    const get = async (path) => {
      const r = await fetch(`/api/space-objects/${path}`);
      if (!r.ok) throw new Error(path);
      return r.json();
    };
    const [a, f] = await Promise.all([get('approaches'), get('fireballs')]);
    small.value = { state: 'ready', approaches: rows(a), fireballs: rows(f) };
  } catch {
    small.value.state = 'error';
  }
}
watch([open, tab], () => {
  if (open.value && tab.value === 'small') loadSmall();
});

// Diameter from absolute magnitude H, assuming albedo 0.14 (a typical asteroid).
const diameterM = (h) => Math.round(1329 / Math.sqrt(0.14) * 10 ** (-h / 5) * 1000);
const fmt = (n, d = 2) => (Number.isFinite(+n) ? (+n).toFixed(d) : '—');

async function selectApproach(row) {
  const base = {
    id: row.des, name: row.des, kind: 'Near-Earth object',
    facts: [
      ['Close approach', `${row.cd} UTC`],
      ['Nominal distance', `${fmt(row.dist * AU_LD, 1)} lunar distances (${fmt(row.dist, 4)} AU)`],
      ['Minimum possible distance', `${fmt(row.dist_min * AU_LD, 1)} lunar distances`],
      ['Relative velocity', `${fmt(row.v_rel)} km/s`],
      ['Absolute magnitude (H)', row.h],
      ['Estimated diameter', `≈ ${diameterM(+row.h).toLocaleString('en')} m (albedo 0.14 assumed)`],
    ],
    note: 'Loading orbit and physical data from NASA/JPL Small-Body Database…',
    url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(row.des)}`,
  };
  selected.value = base;
  try {
    const r = await fetch(`/api/space-objects/body?des=${encodeURIComponent(row.des)}`);
    if (!r.ok) throw new Error('body');
    const b = await r.json();
    if (selected.value?.id !== row.des) return;
    const el = Object.fromEntries((b.orbit?.elements ?? []).map((e) => [e.name, e]));
    const phys = (b.phys_par ?? []).filter((p) => p.name !== 'H').map((p) => [p.title, `${p.value}${p.units ? ` ${p.units}` : ''}`]);
    const orbit = [['a', 'Semi-major axis (AU)'], ['e', 'Eccentricity'], ['i', 'Inclination (deg)'], ['per', 'Orbital period (days)'], ['q', 'Perihelion (AU)'], ['ad', 'Aphelion (AU)']]
      .filter(([k]) => el[k]).map(([k, label]) => [label, +(+el[k].value).toFixed(4)]);
    const disc = b.discovery?.date || b.discovery?.who ? [['Discovered', `${b.discovery.date ?? ''} ${b.discovery.site ? `· ${b.discovery.site}` : ''}`.trim()], ['Discoverer', b.discovery.who ?? '—']] : [];
    selected.value = {
      ...base, name: b.object?.fullname ?? base.name,
      kind: [b.object?.orbit_class?.name, b.object?.pha ? 'potentially hazardous' : '', b.object?.kind === 'cn' || b.object?.kind === 'cu' ? 'comet' : 'asteroid'].filter(Boolean).join(' · '),
      facts: [...base.facts, ...orbit, ['Minimum orbit intersection distance (AU)', b.orbit?.moid ?? '—'], ...phys, ...disc],
      note: 'Source: NASA/JPL Small-Body Database and Close Approach Data.',
    };
  } catch {
    if (selected.value?.id === row.des) selected.value = { ...base, note: 'Orbit and physical data are unavailable right now.' };
  }
}

function selectFireball(f) {
  selected.value = {
    id: f.date, name: `Fireball · ${f.date}`, kind: 'Bolide (meteor) detected by US Government sensors',
    facts: [
      ['Time (UTC)', f.date], ['Location', `${f.lat}° ${f['lat-dir'] ?? ''}, ${f.lon}° ${f['lon-dir'] ?? ''}`],
      ['Altitude', f.alt ? `${f.alt} km` : 'not reported'], ['Entry velocity', f.vel ? `${f.vel} km/s` : 'not reported'],
      ['Total radiated energy', `${f.energy} × 10¹⁰ J`], ['Calculated total impact energy', `${f['impact-e']} kt TNT`],
    ],
    note: 'Source: NASA/JPL CNEOS Fireball Data API.',
    url: 'https://cneos.jpl.nasa.gov/fireballs/',
  };
}

// ── Open / close ───────────────────────────────────────────────────────
const close = () => (open.value = false);
const onKey = (e) => e.key === 'Escape' && close();
let observer;
watch(open, async (isOpen) => {
  document[isOpen ? 'addEventListener' : 'removeEventListener']('keydown', onKey);
  if (!isOpen) return;
  date.value = new Date();
  await nextTick();
  observer ??= new ResizeObserver(fit);
  observer.observe(stage.value);
  fit();
  if (!selected.value) selectBody(PLANETS[2]);
  if (tab.value === 'small') loadSmall();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  observer?.disconnect();
  cancelAnimationFrame(raf);
});

const tabs = computed(() => [
  ['planets', t('Planets')],
  ['small', t('Small bodies')],
  ['stars', t('Stars')],
  ['showers', t('Meteor showers')],
]);
const SPEEDS = [[0, '⏸'], [1, '1 d/s'], [30, '30 d/s'], [365, '1 y/s']];
</script>

<template>
<div v-if="open" id="solar-system-view" role="dialog" :aria-label="t('Solar system')">
  <header class="ss-head">
    <span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
    <strong>{{ t('Solar system') }}</strong>
    <span class="ss-date">{{ date.toISOString().slice(0, 16).replace('T', ' ') }} {{ UTC }}</span>
    <span class="ss-speeds" role="group" :aria-label="t('Time speed')">
      <button v-for="[v, label] in SPEEDS" :key="v" type="button" :aria-pressed="String(speed === v)" @click="speed = v">{{ label }}</button>
      <button type="button" @click="speed = 0; date = new Date()">{{ t('Today') }}</button>
    </span>
    <button type="button" class="ss-close" @click="close"><span class="material-symbols-outlined" aria-hidden="true">public</span>{{ t('Back to Earth') }}</button>
  </header>
  <div class="ss-body">
    <div ref="stage" class="ss-stage"><canvas ref="canvas" @click="pick" :aria-label="t('Orbits of the planets')"></canvas></div>
    <aside class="ss-side">
      <nav class="ss-tabs" role="tablist">
        <button v-for="[id, label] in tabs" :key="id" type="button" role="tab" :aria-selected="String(tab === id)" @click="tab = id">{{ label }}</button>
      </nav>
      <ul class="ss-list">
        <template v-if="tab === 'planets'">
          <li v-for="b in [SUN, ...PLANETS]" :key="b.id"><button type="button" :aria-pressed="String(selected?.id === b.id)" @click="selectBody(b)"><i :style="{ background: b.color }"></i>{{ b.name }}<small>{{ b.kind }}</small></button></li>
        </template>
        <template v-else-if="tab === 'small'">
          <li v-if="small.state === 'loading'" class="ss-note">{{ t('Loading NASA/JPL data…') }}</li>
          <li v-else-if="small.state === 'error'" class="ss-note">{{ t('NASA/JPL data is unavailable right now') }}</li>
          <template v-else>
            <li class="ss-group">{{ t('Close approaches, next 60 days') }}</li>
            <li v-for="r in small.approaches" :key="r.des + r.jd"><button type="button" @click="selectApproach(r)">{{ r.des }}<small>{{ r.cd.slice(0, 11) }} · {{ fmt(r.dist * AU_LD, 1) }} {{ LD }}</small></button></li>
            <li class="ss-group">{{ t('Recent fireballs') }}</li>
            <li v-for="f in small.fireballs" :key="f.date"><button type="button" @click="selectFireball(f)">{{ f.date.slice(0, 10) }}<small>{{ f.energy }} × 10¹⁰ J · {{ f.lat }}° {{ f['lat-dir'] }} {{ f.lon }}° {{ f['lon-dir'] }}</small></button></li>
          </template>
        </template>
        <template v-else-if="tab === 'stars'">
          <li v-for="s in STARS" :key="s.id"><button type="button" :aria-pressed="String(selected?.id === s.id)" @click="selectOther(s)">{{ s.name }}<small>{{ s.facts[0][1] }}</small></button></li>
        </template>
        <template v-else>
          <li v-for="s in SHOWERS" :key="s.id"><button type="button" :aria-pressed="String(selected?.id === s.id)" @click="selectOther(s)">{{ s.name }}<small>{{ s.facts[1][1] }}</small></button></li>
        </template>
      </ul>
      <section v-if="selected" class="ss-card">
        <h3>{{ selected.name }}</h3>
        <p class="ss-kind">{{ selected.kind }}</p>
        <dl><template v-for="[k, v] in selected.facts" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
        <p v-if="selected.note" class="ss-note">{{ selected.note }}</p>
        <a v-if="selected.url" :href="selected.url" target="_blank" rel="noopener noreferrer">{{ t('More at NASA') }}</a>
      </section>
    </aside>
  </div>
</div>
</template>
