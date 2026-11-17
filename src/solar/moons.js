/**
 * @module solar/moons
 * @description Major moons: mean orbital radius, period and radius from the
 * NASA/JPL planetary satellite physical and mean-orbit parameters
 * (https://ssd.jpl.nasa.gov/sats/phys_par/ and /sats/elem/). Drawn on
 * circular orbits in the parent's equatorial plane at a phase that is only
 * illustrative, except the Moon, which uses the full lunar ephemeris.
 */
// id, parent, name, orbit km, period days (negative = retrograde), radius km, colour, note
const M = [
  ['moon', 'earth', 'Moon', 384400, 27.3217, 1737.4, '#b8b8b8', 'Earth’s only natural satellite, tidally locked and moving away at about 3.8 cm per year. Its gravity drives Earth’s tides; 12 people walked on it between 1969 and 1972.'],
  ['phobos', 'mars', 'Phobos', 9376, 0.3189, 11.1, '#8a7f76', 'The larger, inner moon of Mars, an irregular body that orbits so close it circles Mars three times a day and is slowly spiralling inward.'],
  ['deimos', 'mars', 'Deimos', 23458, 1.263, 6.2, '#9a8f84', 'The smaller, outer moon of Mars, an irregular body with a smooth, dusty surface.'],
  ['io', 'jupiter', 'Io', 421700, 1.7691, 1821.6, '#e8d36a', 'The most volcanically active body in the solar system, kept molten by tidal flexing from Jupiter and its neighbours.'],
  ['europa', 'jupiter', 'Europa', 671100, 3.5512, 1560.8, '#d9cdb8', 'An ice-covered world with a global subsurface ocean holding about twice the water of Earth’s oceans; NASA’s Europa Clipper is headed there.'],
  ['ganymede', 'jupiter', 'Ganymede', 1070400, 7.1546, 2631.2, '#a89f94', 'The largest moon in the solar system, bigger than Mercury, and the only moon known to have its own magnetic field.'],
  ['callisto', 'jupiter', 'Callisto', 1882700, 16.689, 2410.3, '#6f6a64', 'The most heavily cratered object known, with an ancient surface and possibly a deep subsurface ocean.'],
  ['mimas', 'saturn', 'Mimas', 185539, 0.9424, 198.2, '#b9b9b9', 'Dominated by the huge Herschel crater, which gives it a look often compared to the Death Star.'],
  ['enceladus', 'saturn', 'Enceladus', 238020, 1.3702, 252.1, '#f4f6f8', 'An ice moon that vents water plumes from its south pole, feeding Saturn’s E ring and revealing a subsurface ocean.'],
  ['tethys', 'saturn', 'Tethys', 294619, 1.8878, 531.1, '#dcdcdc', 'Almost pure water ice, with the vast Odysseus crater and the huge Ithaca Chasma canyon.'],
  ['dione', 'saturn', 'Dione', 377396, 2.7369, 561.4, '#cfcfcf', 'A dense ice moon with bright wispy cliffs and a thin oxygen exosphere.'],
  ['rhea', 'saturn', 'Rhea', 527108, 4.5175, 763.8, '#c4c4c4', 'Saturn’s second-largest moon, a cratered ball of ice and rock.'],
  ['titan', 'saturn', 'Titan', 1221870, 15.9454, 2574.7, '#d9a441', 'The only moon with a thick atmosphere (mostly nitrogen) and the only other world with stable liquid on its surface: lakes and seas of methane and ethane. NASA’s Dragonfly rotorcraft is planned to land there.'],
  ['iapetus', 'saturn', 'Iapetus', 3560820, 79.3215, 734.5, '#8d8478', 'Two-toned: one hemisphere is dark as coal, the other bright as ice, and an equatorial ridge circles it.'],
  ['miranda', 'uranus', 'Miranda', 129390, 1.4135, 235.8, '#b3b3b3', 'Patchwork terrain with a 20 km-high cliff, Verona Rupes, among the tallest known.'],
  ['ariel', 'uranus', 'Ariel', 191020, 2.5204, 578.9, '#c8c8c8', 'The brightest Uranian moon, crossed by long canyons and smooth plains.'],
  ['umbriel', 'uranus', 'Umbriel', 266300, 4.1442, 584.7, '#6e6e6e', 'The darkest of the large Uranian moons, with an ancient, heavily cratered surface.'],
  ['titania', 'uranus', 'Titania', 435910, 8.7059, 788.9, '#bdb5ad', 'The largest moon of Uranus, with huge fault valleys.'],
  ['oberon', 'uranus', 'Oberon', 583520, 13.463, 761.4, '#9d948b', 'The outermost large moon of Uranus, old and heavily cratered.'],
  ['triton', 'neptune', 'Triton', 354759, -5.8769, 1353.4, '#e6d5cf', 'Orbits Neptune backwards, a sign it is a captured Kuiper belt object. Voyager 2 saw nitrogen geysers on its nitrogen-ice surface, one of the coldest places known.'],
  ['charon', 'pluto', 'Charon', 19591, 6.3872, 606, '#9a8f85', 'About half the diameter of Pluto; the two orbit a point in space between them, so they are often called a double dwarf planet.'],
];

export const MOONS = M.map(([id, parent, name, aKm, period, radiusKm, color, note]) => ({
  id, parent, name, aKm, period, radiusKm, color, note, kind: `Moon of ${parent[0].toUpperCase()}${parent.slice(1)}`,
  facts: [
    ['Parent planet', parent[0].toUpperCase() + parent.slice(1)],
    ['Mean radius', `${radiusKm.toLocaleString('en')} km`],
    ['Mean orbital radius', `${aKm.toLocaleString('en')} km`],
    ['Orbital period', `${Math.abs(period)} days${period < 0 ? ' (retrograde)' : ''}`],
    ['Rotation', 'Tidally locked: one face always toward its planet'],
  ],
}));
