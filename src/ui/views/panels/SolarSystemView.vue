<script setup>
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { t } from '../../../i18n/index.js';
import { useSolarSystemStore } from '../../stores/solarSystem.js';
import { jdFromDate, planetPosition } from '../../../solar/ephemeris.js';
import { MOONS } from '../../../solar/moons.js';
import { PLANETS, SHOWERS, STARS, SUN } from '../../../solar/bodies.js';

// The 3D solar system over the globe: planets at their real positions for the
// current time, a camera that flies to any body, and cards for planets, moons,
// asteroids, comets, stars, meteor showers and fireballs (NASA/JPL data).
const store = useSolarSystemStore();
const { open } = storeToRefs(store);

const AU_LIGHT_MIN = 8.3167;
const AU_LD = 389.17;
const UTC = 'UTC';
const LD = 'LD'; // lunar distances

const SPEEDS = [[1, 'LIVE'], [3600, '1 h/s'], [86400, '1 d/s'], [2592000, '30 d/s'], [31557600, '1 y/s']];
// Named asteroids and comets whose orbits are loaded from the JPL Small-Body Database.
const NAMED = [['1', 'Ceres'], ['4', 'Vesta'], ['2', 'Pallas'], ['433', 'Eros'], ['101955', 'Bennu'], ['99942', 'Apophis'], ['1P', 'Halley'], ['67P', '67P/Churyumov–Gerasimenko']];

const tab = ref('planets');
const speed = ref(1);
const clock = ref('');
const entered = ref(false);
const selected = ref(null);
const canvas = ref(null);
const labels = ref(null);
let scene = null;
let timer = 0;

// ── Cards ──────────────────────────────────────────────────────────────
const CARDS = new Map([[SUN.id, SUN], ...PLANETS.map((p) => [p.id, p]), ...MOONS.map((m) => [m.id, m])]);

function showBody(id) {
  const body = CARDS.get(id);
  if (!body) return;
  const live = [];
  if (PLANETS.includes(body)) {
    const jd = scene ? scene.jd : jdFromDate(new Date());
    const p = planetPosition(body.id, jd);
    const e = planetPosition('earth', jd);
    const sun = Math.hypot(p.x, p.y, p.z);
    const earth = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    live.push(['Distance from Sun (now)', `${sun.toFixed(3)} AU`]);
    if (body.id !== 'earth') live.push(['Distance from Earth (now)', `${earth.toFixed(3)} AU · light time ${(earth * AU_LIGHT_MIN).toFixed(1)} min`]);
  }
  selected.value = { ...body, facts: [...live, ...body.facts], note: body.note };
}

const fmt = (n, d = 2) => (Number.isFinite(+n) ? (+n).toFixed(d) : '—');
// Diameter from absolute magnitude H, assuming albedo 0.14 (a typical asteroid).
const diameterM = (h) => Math.round(1329 / Math.sqrt(0.14) * 10 ** (-h / 5) * 1000);

async function getJson(path) {
  const r = await fetch(`/api/space-objects/${path}`);
  if (!r.ok) throw new Error(path);
  return r.json();
}

// One small body's card: what we know now, then orbit and physical data from JPL.
async function showSmall(des, name, base = []) {
  const card = { id: des, name, kind: 'Small body', facts: base, note: 'Loading orbit and physical data from NASA/JPL Small-Body Database…', url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(des)}` };
  selected.value = card;
  try {
    const b = await getJson(`body?des=${encodeURIComponent(des)}`);
    if (selected.value?.id !== des) return;
    const el = Object.fromEntries((b.orbit?.elements ?? []).map((e) => [e.name, e]));
    const phys = (b.phys_par ?? []).filter((p) => p.name !== 'H' || !base.length).map((p) => [p.title, `${p.value}${p.units ? ` ${p.units}` : ''}`]);
    const orbit = [['a', 'Semi-major axis (AU)'], ['e', 'Eccentricity'], ['i', 'Inclination (deg)'], ['per', 'Orbital period (days)'], ['q', 'Perihelion (AU)'], ['ad', 'Aphelion (AU)']]
      .filter(([k]) => el[k]).map(([k, label]) => [label, +(+el[k].value).toFixed(4)]);
    const disc = b.discovery?.date || b.discovery?.who ? [['Discovered', `${b.discovery.date ?? ''} ${b.discovery.site ? `· ${b.discovery.site}` : ''}`.trim()], ['Discoverer', b.discovery.who ?? '—']] : [];
    selected.value = {
      ...card, name: b.object?.fullname ?? name,
      kind: [b.object?.orbit_class?.name, b.object?.pha ? 'potentially hazardous' : '', ['cn', 'cu'].includes(b.object?.kind) ? 'comet' : 'asteroid'].filter(Boolean).join(' · '),
      facts: [...base, ...orbit, ['Minimum orbit intersection distance (AU)', b.orbit?.moid ?? '—'], ...phys, ...disc],
      note: 'Source: NASA/JPL Small-Body Database and Close Approach Data.',
    };
  } catch {
    if (selected.value?.id === des) selected.value = { ...card, note: 'Orbit and physical data are unavailable right now.' };
  }
}

const selectApproach = (row) => {
  scene?.small.has(row.des) && scene.flyTo(row.des);
  return showSmall(row.des, row.des, [
    ['Close approach', `${row.cd} UTC`],
    ['Nominal distance', `${fmt(row.dist * AU_LD, 1)} lunar distances (${fmt(row.dist, 4)} AU)`],
    ['Minimum possible distance', `${fmt(row.dist_min * AU_LD, 1)} lunar distances`],
    ['Relative velocity', `${fmt(row.v_rel)} km/s`],
    ['Absolute magnitude (H)', row.h],
    ['Estimated diameter', `≈ ${diameterM(+row.h).toLocaleString('en')} m (albedo 0.14 assumed)`],
  ]);
};

function selectFireball(f) {
  scene?.flyTo('earth');
  selected.value = {
    id: f.date, name: `Fireball · ${f.date}`, kind: 'Bolide (meteor) detected by US Government sensors',
    facts: [
      ['Time (UTC)', f.date], ['Location', `${f.lat}° ${f['lat-dir'] ?? ''}, ${f.lon}° ${f['lon-dir'] ?? ''}`],
      ['Altitude', f.alt ? `${f.alt} km` : 'not reported'], ['Entry velocity', f.vel ? `${f.vel} km/s` : 'not reported'],
      ['Total radiated energy', `${f.energy} × 10¹⁰ J`], ['Calculated total impact energy', `${f['impact-e']} kt TNT`],
    ],
    note: 'Source: NASA/JPL CNEOS Fireball Data API. Orange dots on Earth mark these fireballs.',
    url: 'https://cneos.jpl.nasa.gov/fireballs/',
  };
}

const selectOther = (item) => (selected.value = item);

// ── Live NASA/JPL data ─────────────────────────────────────────────────
const small = ref({ state: 'idle', approaches: [], fireballs: [] });
const rows = (payload) => payload.data.map((r) => Object.fromEntries(payload.fields.map((f, i) => [f, r[i]])));
async function loadSmall() {
  if (small.value.state !== 'idle') return;
  small.value.state = 'loading';
  try {
    const [a, f] = await Promise.all([getJson('approaches'), getJson('fireballs')]);
    small.value = { state: 'ready', approaches: rows(a), fireballs: rows(f) };
    scene?.setFireballs(small.value.fireballs);
  } catch {
    small.value.state = 'error';
  }
}
// Named asteroids and comets: orbits drawn and moving in the scene.
async function loadNamed() {
  await Promise.all(NAMED.map(async ([des, name]) => {
    try {
      const b = await getJson(`body?des=${encodeURIComponent(des)}`);
      const e = Object.fromEntries((b.orbit?.elements ?? []).map((x) => [x.name, +x.value]));
      scene?.addSmallBody({ id: des, name, kind: 'Small body', elements: { a: e.a, e: e.e, i: e.i, om: e.om, w: e.w, ma: Number.isFinite(e.ma) ? e.ma : null, n: Number.isFinite(e.n) ? e.n : null, per: e.per, tp: e.tp, epoch: +b.orbit.epoch } });
    } catch { /* one missing body leaves the rest */ }
  }));
}
watch([open, tab], () => {
  if (open.value && tab.value === 'small') loadSmall();
});

// ── Scene ──────────────────────────────────────────────────────────────
function onFocus(id) {
  if (CARDS.has(id)) showBody(id);
  else if (scene?.small.has(id)) showSmall(id, scene.small.get(id).name);
}

function leave() {
  if (!scene) return void (open.value = false);
  scene.backToEarth(() => {
    entered.value = false;
    setTimeout(() => (open.value = false), 500);
  });
}
const onKey = (e) => {
  if (e.key === 'Escape') leave();
};

watch(open, async (isOpen) => {
  document[isOpen ? 'addEventListener' : 'removeEventListener']('keydown', onKey);
  if (!isOpen) {
    clearInterval(timer);
    scene?.dispose();
    scene = null;
    entered.value = false;
    return;
  }
  speed.value = 1;
  await nextTick();
  const { SolarScene } = await import('../../../solar/solarScene.js');
  if (!open.value) return;
  scene = new SolarScene(canvas.value, labels.value, { onPick: () => {}, onFocus });
  scene.intro(store.readView());
  timer = setInterval(() => (clock.value = new Date(scene.getTime()).toISOString().slice(0, 19).replace('T', ' ')), 250);
  requestAnimationFrame(() => (entered.value = true));
  loadNamed();
  if (tab.value === 'small') loadSmall();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  clearInterval(timer);
  scene?.dispose();
});

function setSpeed(v) {
  speed.value = v;
  v === 1 ? scene?.live() : scene?.setSpeed(v);
}

const tabs = computed(() => [
  ['planets', t('Planets')],
  ['small', t('Small bodies')],
  ['stars', t('Stars')],
  ['showers', t('Meteor showers')],
]);
const moonsOf = (id) => MOONS.filter((m) => m.parent === id);
const fly = (id) => scene?.flyTo(id);
</script>

<template>
<div v-if="open" id="solar-system-view" :class="{ 'is-on': entered }" role="dialog" :aria-label="t('Solar system')">
  <div class="ss-stage">
    <canvas ref="canvas" :aria-label="t('Orbits of the planets')"></canvas>
    <div ref="labels" class="ss-labels"></div>
  </div>
  <header class="ss-head">
    <span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
    <strong>{{ t('Solar system') }}</strong>
    <span class="ss-date">{{ clock }} {{ UTC }}</span>
    <span class="ss-speeds" role="group" :aria-label="t('Time speed')">
      <button v-for="[v, label] in SPEEDS" :key="v" type="button" :aria-pressed="String(speed === v)" @click="setSpeed(v)">{{ label }}</button>
    </span>
    <button type="button" @click="scene?.home()">{{ t('Overview') }}</button>
    <button type="button" class="ss-close" @click="leave"><span class="material-symbols-outlined" aria-hidden="true">public</span>{{ t('Back to Earth') }}</button>
  </header>
  <p class="ss-hint">{{ t('Drag to rotate · scroll to zoom · click a body to fly to it') }}</p>
  <aside class="ss-side">
    <nav class="ss-tabs" role="tablist">
      <button v-for="[id, label] in tabs" :key="id" type="button" role="tab" :aria-selected="String(tab === id)" @click="tab = id">{{ label }}</button>
    </nav>
    <ul class="ss-list">
      <template v-if="tab === 'planets'">
        <template v-for="b in [SUN, ...PLANETS]" :key="b.id">
          <li><button type="button" :aria-pressed="String(selected?.id === b.id)" @click="fly(b.id)"><i :style="{ background: b.color }"></i>{{ b.name }}<small>{{ b.kind }}</small></button></li>
          <li v-for="m in moonsOf(b.id)" :key="m.id" class="ss-moon"><button type="button" :aria-pressed="String(selected?.id === m.id)" @click="fly(m.id)"><i :style="{ background: m.color }"></i>{{ m.name }}<small>{{ m.kind }}</small></button></li>
        </template>
      </template>
      <template v-else-if="tab === 'small'">
        <li class="ss-group">{{ t('Asteroids and comets') }}</li>
        <li v-for="[des, name] in NAMED" :key="des"><button type="button" :aria-pressed="String(selected?.id === des)" @click="scene?.small.has(des) ? fly(des) : showSmall(des, name)">{{ name }}<small>{{ des }}</small></button></li>
        <li v-if="small.state === 'loading'" class="ss-note">{{ t('Loading NASA/JPL data…') }}</li>
        <li v-else-if="small.state === 'error'" class="ss-note">{{ t('NASA/JPL data is unavailable right now') }}</li>
        <template v-else-if="small.state === 'ready'">
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
</template>
