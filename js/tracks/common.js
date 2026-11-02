// Outils communs aux circuits : thème par défaut, fusion de thèmes, générateur de tracés.
import { mulberry32, lerp, smoothstep } from '../util.js';

// Thème par défaut (désert de Sablor). Chaque circuit ne redéfinit que ce qui change.
export const DEFAULT_THEME = {
  // ciel et lumière
  skyTop: 0x3f86d8,
  skyHorizon: 0xf6dcae,
  fog: 0xeccb98,
  fogNear: 260,
  fogFar: 3100,
  suns: [{ dir: [0.45, 0.62, -0.42], color: 0xfffaea, glow: 0xffcc8c, size: 1.15 }],
  sunDir: [0.45, 0.62, -0.42], // direction de la lumière principale
  sunColor: 0xfff1d8,
  sunIntensity: 2.3,
  hemiSky: 0xbfd6ff,
  hemiGround: 0xd29a5c,
  hemiIntensity: 1.25,
  stars: 0,
  planet: null, // { dir, size, color, color2, bands, ring }
  // sol
  ground: { base: 0xe2b877, dark: 0xc7945a, light: 0xf0d29b },
  dunes: { amp: 1, freq: 1 },
  shoulder: 0xd6a668,
  water: null,      // { offset (sous le point le plus bas de la piste), color, lava }
  clouds: null,     // { y, color, color2 } mer de nuages
  elevated: null,   // { floorY, pylons, pylonColor, deckColor } piste suspendue
  // piste
  road: {
    base: '#cf9e66', speckDark: 'rgba(120,70,30,0.10)', speckLight: 'rgba(255,235,190,0.12)',
    rippleDark: 'rgba(110,60,25,0.22)', rippleLight: 'rgba(255,230,180,0.18)', groove: 'rgba(90,50,20,0.22)',
    kerbA: '#f3ead8', kerbB: '#c2482a', line: null,
  },
  edge: 'open',     // 'open' (sable de part et d'autre) ou 'rails' (barrières continues)
  railColor: 0x6fe0ff,
  markerColors: [0xf2e8d5, 0xd0502c],
  flagColors: [0xe9542f, 0x2f6fd0, 0xf2c14e, 0x3aa86b],
  poles: true,
  // falaises
  wallStyle: 'rock', // 'rock' ou 'city' (façades d'immeubles)
  strata: [0xd9925a, 0xc4703f, 0xe8b37c, 0xb35d35, 0xdba46c, 0xa8532f, 0xe0b98a],
  plateau: 0xd9ad72,
  bandH: 7.5,
  glow: null,        // intensité lumineuse par strate (lave...)
  facade: null,      // { wall, window, lit, roof, winW, winH, glow }
  archStone: null,   // { strata, top, bandH, glow } (par défaut : strates inversées)
  archClay: { strata: [0xb5583a, 0xa34a30, 0xc56a45, 0x9c432b, 0xbb5f3e, 0xa85236, 0xc77250], top: 0xd08a5a, bandH: 2.2, smooth: false },
  // décor lointain
  mountains: { color: 0xc49a76, style: 'peaks', height: 1 },
  props: [
    { type: 'rock', count: 700 },
    { type: 'mesa', count: 34, place: 'far' },
  ],
  rockColors: [0xb27447, 0xc08656, 0x9c6239, 0xc9946a],
  stands: { a: 0xe3c08f, b: 0xc9a070, awnings: [0x2f6fd0, 0xd9542f] },
  domes: false,
  gantry: { frame: 0x8a6a4a, cap: 0x5b4632, beam: 0x6f5236, banner: 0xd9542f },
  weather: null,     // 'snow' | 'rain' | 'ash' | 'pollen' | 'fireflies' | 'dust' | 'spores' (ou tableau)
  traffic: null,     // { count, colors }
  raiders: { name: 'PILLARD', robe: 0xc9b48e, sash: 0xd2401f, head: 0xd8c7a3 },
  tunnel: null,      // { strata, top, bandH, glow, emissive, light, smooth, ribs, shell: 'rock' | 'city' | 'box' }
  bridgeColor: null, // couleur des tabliers de pont
  pylonColor: null,
  flames: 'fire',    // style des jets de flammes : 'fire' | 'toxic' | 'plasma'
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function mergeTheme(over) {
  const out = {};
  for (const k of Object.keys(DEFAULT_THEME)) {
    const d = DEFAULT_THEME[k];
    const o = over ? over[k] : undefined;
    if (o === undefined) out[k] = d;
    else if (isPlainObject(d) && isPlainObject(o)) out[k] = { ...d, ...o };
    else out[k] = o;
  }
  for (const k of Object.keys(over || {})) if (!(k in out)) out[k] = over[k];
  return out;
}

// --------------------------------------------------------------- générateur de tracés
// Boucle « étoilée » (rayon fonction de l'angle) : jamais d'auto-intersection.
// L = { seed, n, R, aspect, rot, harm: [[k, amp, phase]], wobble, elev, baseY,
//       canyons: [[i0, i1]] (indices de points de contrôle), wOpen, wCanyon, hCanyon }
export function generatePoints(L) {
  const rnd = mulberry32(L.seed);
  const n = L.n;
  const pts = [];
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28;
  const inCanyon = (i) => (L.canyons || []).some(([a, b]) => i >= a && i <= b);
  const cr = Math.cos(L.rot || 0), sr = Math.sin(L.rot || 0);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + (rnd() - 0.5) * ((Math.PI * 2) / n) * 0.3;
    let r = 1;
    for (const [k, amp, ph] of L.harm || []) r += amp * Math.cos(k * th + ph);
    r *= L.R * (1 + (rnd() - 0.5) * (L.wobble || 0));
    const x0 = Math.cos(th) * r * (L.aspect || 1), z0 = Math.sin(th) * r;
    const x = x0 * cr - z0 * sr, z = x0 * sr + z0 * cr;
    const y = (L.baseY || 0) + (L.elev || 0) * (0.6 * Math.sin(th * 2 + p1) + 0.4 * Math.sin(th * 3 + p2));
    const c = inCanyon(i);
    const w = c ? L.wCanyon * (0.9 + rnd() * 0.22) : L.wOpen * (0.94 + rnd() * 0.1);
    const H = c ? L.hCanyon * (0.85 + rnd() * 0.3) : 0;
    pts.push([Math.round(x), Math.round(y * 10) / 10, Math.round(z), Math.round(w), Math.round(H)]);
  }
  return pts;
}

// Tracé urbain : coins à angle droit arrondis (rayon r) et longues lignes droites.
// corners = [[x, z, y, largeur, hauteur des façades], ...] ; les attributs valent pour la ligne droite qui suit.
export function rectilinearPoints(R) {
  const C = R.corners, n = C.length, r = R.radius || 70, sp = R.spacing || 240;
  const pts = [];
  let firstSeg = 0;
  for (let k = 0; k < n; k++) {
    const P = C[k], Q = C[(k + 1) % n];
    const dx = Q[0] - P[0], dz = Q[1] - P[1];
    const L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const segN = Math.max(1, Math.round((L - 2 * r) / sp));
    if (k === 0) firstSeg = segN + 1;
    for (let s = 0; s <= segN; s++) {
      const d = r + (L - 2 * r) * (s / segN);
      const y = lerp(P[2], Q[2], smoothstep(0, 1, d / L));
      pts.push([Math.round(P[0] + ux * d), Math.round(y * 10) / 10, Math.round(P[1] + uz * d), P[3], P[4]]);
    }
  }
  // le départ au milieu de la première ligne droite
  const shift = Math.floor(firstSeg / 2);
  return pts.slice(shift).concat(pts.slice(0, shift));
}

// Position (en indice de point de contrôle) d'une section, pour que le décor automatique l'évite.
export function sectionSpan(S, pts) {
  const n = pts.length;
  const nearest = (x, z) => {
    let b = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[2] - z) ** 2; if (d < bd) { bd = d; b = i; } });
    return b;
  };
  if (S.near) {
    const c = nearest(S.near[0], S.near[1]);
    const sp = Math.hypot(pts[(c + 1) % n][0] - pts[c][0], pts[(c + 1) % n][2] - pts[c][2]) || 200;
    const h = (S.len || 300) / 2 / sp;
    return [c - h, c + h];
  }
  if (S.type === 'jump') return [S.at - 0.6, S.at + 0.7];
  return [S.from, S.to];
}

// Arches, ponts naturels et rochers placés automatiquement le long du tracé.
export function generateFeatures(L, pts, sections = []) {
  const rnd = mulberry32(L.seed * 7 + 3);
  const n = pts.length;
  const H = (i) => pts[((i % n) + n) % n][4];
  const W = (i) => pts[((i % n) + n) % n][3];
  const arches = [];
  const boulders = [];
  // ponts naturels au-dessus des canyons
  for (let i = 0; i < n; i++) {
    if (H(i) > 0 && H(i + 1) > 0 && rnd() < (L.bridgeRate ?? 0.75)) arches.push({ at: i + 0.3 + rnd() * 0.4, type: 'bridge' });
  }
  // zones ouvertes : arches de pierre, colonnades, arche à pilier central
  const spans = sections.map((S) => sectionSpan(S, pts));
  const free = (i) => spans.every(([a, b]) => i + 1.5 < a - 0.5 || i > b + 0.5);
  const open = (i) => H(i - 1) === 0 && H(i) === 0 && H(i + 1) === 0 && H(i + 2) === 0 && free(i);
  const cands = [];
  for (let i = 2; i < n - 2; i++) if (open(i)) cands.push(i);
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const used = [];
  const take = (gap = 2) => {
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      if (used.every((u) => Math.abs(u - c) >= gap)) { used.push(c); cands.splice(k, 1); return c; }
    }
    return -1;
  };
  for (const f of L.features || ['stone', 'clay', 'split', 'stone']) {
    const c = take();
    if (c < 0) break;
    if (f === 'stone') arches.push({ at: c + 0.4 + rnd() * 0.2, type: 'stone', height: 22 + rnd() * 10, thick: 3.6 + rnd() * 1.2 });
    else if (f === 'clay') arches.push({ at: c + 0.15, type: 'clay', count: 4 + Math.floor(rnd() * 3), spacing: 34 + rnd() * 16, height: 15 + rnd() * 5 });
    else if (f === 'split' && W(c) >= 38) arches.push({ at: c + 0.5, type: 'split', height: 20 + rnd() * 4, thick: 3.2 });
  }
  // rochers sur la piste
  const nb = L.boulders ?? 4;
  for (let k = 0; k < nb; k++) {
    const c = take(1);
    if (c < 0) break;
    boulders.push({ at: c + 0.5, lat: (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 6), r: 2.4 + rnd() * 1.0 });
  }
  return { arches, boulders };
}

// Construit la définition complète d'un circuit (points + arches + thème fusionné).
export function resolveTrack(def) {
  if (def._resolved) return def._resolved;
  const out = { ...def };
  if (!out.points) {
    out.points = def.layout.corners ? rectilinearPoints(def.layout) : generatePoints(def.layout);
    const f = generateFeatures(def.layout, out.points, def.sections || []);
    if (!out.arches) out.arches = f.arches;
    if (!out.boulders) out.boulders = f.boulders;
  }
  out.sections = def.sections || [];
  out.arches = out.arches || [];
  out.boulders = out.boulders || [];
  out.theme = mergeTheme(def.theme);
  def._resolved = out;
  return out;
}
