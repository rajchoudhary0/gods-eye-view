/**
 * @module solar/bodies
 * @description Reference data shown on the solar-system cards.
 * Planets and the Sun: NASA Space Science Data Coordination Archive planetary
 * fact sheets (https://nssdc.gsfc.nasa.gov/planetary/factsheet/) and NASA
 * Solar System Exploration (https://science.nasa.gov/solar-system/); moon
 * counts as NASA reports them. Stars: SIMBAD/Hipparcos-Gaia values, rounded.
 * Meteor showers: International Meteor Organization working list.
 * Static on purpose: these change over decades, not days.
 */
const nasa = (slug) => `https://science.nasa.gov/${slug}/`;

// Planet fields, in order: mass 1e24 kg, diameter km, density kg/m3, gravity m/s2,
// escape km/s, rotation h, day h, from Sun 1e6 km, perihelion, aphelion,
// period days, orbital km/s, inclination deg, eccentricity, obliquity deg,
// mean temp C, moons.
const P = (id, name, kind, v, extra) => {
  const [mass, diameter, density, gravity, escape, rotation, day, dist, peri, aph, period, speed, incl, ecc, tilt, temp, moons] = v;
  return { id, name, kind, color: extra.color, radiusKm: diameter / 2, url: nasa(extra.slug ?? id), facts: [
    ['Type', extra.type], ['Mass', `${mass} × 10²⁴ kg`], ['Diameter', `${diameter.toLocaleString('en')} km`],
    ['Density', `${density} kg/m³`], ['Surface gravity', `${gravity} m/s²`], ['Escape velocity', `${escape} km/s`],
    ['Rotation period', `${rotation} h`], ['Length of day', `${day} h`],
    ['Distance from Sun', `${dist} million km`], ['Perihelion', `${peri} million km`], ['Aphelion', `${aph} million km`],
    ['Orbital period', `${period.toLocaleString('en')} days`], ['Orbital velocity', `${speed} km/s`],
    ['Orbital inclination', `${incl}°`], ['Orbital eccentricity', ecc], ['Axial tilt', `${tilt}°`],
    ['Mean temperature', `${temp} °C`], ['Moons', moons], ['Rings', extra.rings ? 'Yes' : 'No'], ['Atmosphere', extra.atmosphere],
  ] };
};

export const SUN = {
  id: 'sun', name: 'Sun', kind: 'G2V star', color: '#ffd45a', url: nasa('sun'),
  facts: [
    ['Type', 'G-type main-sequence star (G2V)'], ['Mass', '1.989 × 10³⁰ kg'], ['Diameter', '1,391,400 km'],
    ['Surface gravity', '274 m/s²'], ['Escape velocity', '617.5 km/s'], ['Luminosity', '3.828 × 10²⁶ W'],
    ['Surface temperature', '5,772 K'], ['Core temperature', '≈15.7 million K'], ['Rotation (equator)', '≈25.4 days'],
    ['Age', '≈4.6 billion years'], ['Composition', '≈73% hydrogen, ≈25% helium by mass'],
    ['Distance from Earth', '1 AU ≈ 149.6 million km (light takes ≈8 min 20 s)'],
  ],
};

export const PLANETS = [
  P('mercury', 'Mercury', 'Terrestrial planet', [0.33, 4879, 5429, 3.7, 4.3, 1407.6, 4222.6, 57.9, 46.0, 69.8, 88.0, 47.4, 7.0, 0.205, 0.034, 167, 0], { color: '#b5a99a', type: 'Terrestrial planet', atmosphere: 'Trace exosphere' }),
  P('venus', 'Venus', 'Terrestrial planet', [4.87, 12104, 5243, 8.9, 10.4, -5832.5, 2802.0, 108.2, 107.5, 108.9, 224.7, 35.0, 3.4, 0.007, 177.4, 464, 0], { color: '#e6c27a', type: 'Terrestrial planet (retrograde rotation)', atmosphere: 'Dense CO₂, 92 bar at surface' }),
  P('earth', 'Earth', 'Terrestrial planet', [5.97, 12756, 5514, 9.8, 11.2, 23.9, 24.0, 149.6, 147.1, 152.1, 365.2, 29.8, 0.0, 0.017, 23.4, 15, 1], { color: '#4f9dff', type: 'Terrestrial planet', atmosphere: 'Nitrogen 78%, oxygen 21%' }),
  P('mars', 'Mars', 'Terrestrial planet', [0.642, 6792, 3934, 3.7, 5.0, 24.6, 24.7, 228.0, 206.7, 249.3, 687.0, 24.1, 1.9, 0.094, 25.2, -65, 2], { color: '#d9603b', type: 'Terrestrial planet', atmosphere: 'Thin CO₂, ≈0.6% of Earth’s pressure' }),
  P('jupiter', 'Jupiter', 'Gas giant', [1898, 142984, 1326, 23.1, 59.5, 9.9, 9.9, 778.5, 740.6, 816.4, 4331, 13.1, 1.3, 0.049, 3.1, -110, 95], { color: '#d8ae86', type: 'Gas giant', rings: true, atmosphere: 'Hydrogen ≈90%, helium ≈10%' }),
  P('saturn', 'Saturn', 'Gas giant', [568, 120536, 687, 9.0, 35.5, 10.7, 10.7, 1432.0, 1357.6, 1506.5, 10747, 9.7, 2.5, 0.052, 26.7, -140, 274], { color: '#ead6a6', type: 'Gas giant', rings: true, atmosphere: 'Hydrogen ≈96%, helium ≈3%' }),
  P('uranus', 'Uranus', 'Ice giant', [86.8, 51118, 1271, 8.7, 21.3, -17.2, 17.2, 2867.0, 2732.7, 3001.4, 30589, 6.8, 0.8, 0.047, 97.8, -195, 28], { color: '#9fe3e8', type: 'Ice giant (retrograde rotation)', rings: true, atmosphere: 'Hydrogen, helium, methane' }),
  P('neptune', 'Neptune', 'Ice giant', [102, 49528, 1638, 11.0, 23.5, 16.1, 16.1, 4515.0, 4471.1, 4558.9, 59800, 5.4, 1.8, 0.010, 28.3, -200, 16], { color: '#4a6dff', type: 'Ice giant', rings: true, atmosphere: 'Hydrogen, helium, methane' }),
  P('pluto', 'Pluto', 'Dwarf planet', [0.013, 2376, 1853, 0.7, 1.3, -153.3, 153.3, 5906.4, 4436.8, 7375.9, 90560, 4.7, 17.2, 0.244, 122.5, -225, 5], { color: '#c9b8a6', type: 'Dwarf planet (Kuiper belt)', slug: 'pluto', atmosphere: 'Thin nitrogen, methane, carbon monoxide' }),
];

// name, distance ly, spectral class, apparent mag, mass (Sun = 1), note
export const STARS = [
  ['Proxima Centauri', 4.25, 'M5.5Ve', 11.13, 0.12, 'Nearest star to the Sun; flare star with at least two confirmed planets.'],
  ['Alpha Centauri A', 4.37, 'G2V', -0.01, 1.1, 'Sun-like star in the triple system with Alpha Centauri B and Proxima.'],
  ['Barnard’s Star', 5.96, 'M4V', 9.51, 0.16, 'Fastest apparent motion of any star: about 10.4″ per year.'],
  ['Sirius A', 8.6, 'A1V', -1.46, 2.06, 'Brightest star in the night sky; has a white-dwarf companion, Sirius B.'],
  ['Vega', 25.0, 'A0Va', 0.03, 2.14, 'Former and future pole star; surrounded by a dusty debris disk.'],
  ['Arcturus', 36.7, 'K1.5III', -0.05, 1.08, 'Brightest star of the northern celestial hemisphere; an orange giant.'],
  ['TRAPPIST-1', 40.7, 'M8V', 18.8, 0.09, 'Ultracool dwarf with seven known Earth-sized planets.'],
  ['Canopus', 310, 'A9II', -0.74, 8, 'Second-brightest star in the night sky; a bright giant.'],
  ['Polaris', 433, 'F7Ib', 1.98, 5.4, 'Current North Star; a Cepheid variable in a triple system.'],
  ['Betelgeuse', 548, 'M1-2Ia-ab', 0.5, 16.5, 'Red supergiant in Orion that will end as a supernova; pulsates irregularly.'],
  ['Rigel', 860, 'B8Ia', 0.13, 21, 'Blue supergiant in Orion, tens of thousands of times more luminous than the Sun.'],
].map(([name, ly, cls, mag, mass, note]) => ({ id: name, name, kind: 'Star', facts: [
  ['Distance', `${ly} light-years`], ['Spectral class', cls], ['Apparent magnitude', mag], ['Mass', `≈${mass} Suns`],
], note }));

// name, window, peak, ZHR, parent body, speed km/s
export const SHOWERS = [
  ['Quadrantids', 'Jan 1–5', 'Jan 3–4', 110, '2003 EH1 (asteroid)', 41],
  ['Lyrids', 'Apr 14–30', 'Apr 22', 18, 'C/1861 G1 Thatcher', 49],
  ['Eta Aquariids', 'Apr 19–May 28', 'May 6', 50, '1P/Halley', 66],
  ['Perseids', 'Jul 17–Aug 24', 'Aug 12–13', 100, '109P/Swift–Tuttle', 59],
  ['Orionids', 'Oct 2–Nov 7', 'Oct 21', 20, '1P/Halley', 66],
  ['Leonids', 'Nov 6–30', 'Nov 17', 15, '55P/Tempel–Tuttle', 71],
  ['Geminids', 'Dec 4–20', 'Dec 14', 150, '3200 Phaethon (asteroid)', 35],
  ['Ursids', 'Dec 17–26', 'Dec 22', 10, '8P/Tuttle', 33],
].map(([name, window, peak, zhr, parent, speed]) => ({ id: name, name, kind: 'Meteor shower', facts: [
  ['Active', window], ['Peak', peak], ['Zenithal hourly rate', `${zhr} meteors/h under ideal skies`], ['Parent body', parent], ['Entry speed', `${speed} km/s`],
] }));
