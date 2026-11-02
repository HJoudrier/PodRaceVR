// Catalogue des circuits.
import * as THREE from 'three';
import { SABLOR } from './sablor.js';
import { PLANETS } from './planets.js';
import { resolveTrack, sectionSpan } from './common.js';

export const TRACKS = [SABLOR, ...PLANETS];

export function getTrackDef(id) {
  const def = TRACKS.find((t) => t.id === id) || TRACKS[0];
  return resolveTrack(def);
}

// Aperçu léger pour le menu : polyligne normalisée, longueur et zones de canyon (sans construire la géométrie).
const previewCache = new Map();
export function trackPreview(id) {
  if (previewCache.has(id)) return previewCache.get(id);
  const def = getTrackDef(id);
  const pts = def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const length = curve.getLength();
  const n = def.points.length;
  const line = [];
  const S = 160;
  const spans = (def.sections || []).map((s) => ({ type: s.type, span: sectionSpan(s, def.points) }));
  const inSpan = (tt, type) => spans.some((s) => s.type === type && tt >= s.span[0] && tt <= s.span[1]);
  for (let k = 0; k <= S; k++) {
    const t = (k / S) % 1;
    const p = curve.getPoint(t);
    const tt = t * n;
    const i0 = Math.floor(tt) % n;
    line.push({
      x: p.x, z: p.z,
      canyon: def.points[i0][4] > 0 && def.points[(i0 + 1) % n][4] > 0,
      tunnel: inSpan(tt, 'tunnel'), bridge: inSpan(tt, 'bridge'), jump: inSpan(tt, 'jump'), flames: inSpan(tt, 'flames'),
    });
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of line) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 1 / Math.max(maxX - minX, maxZ - minZ);
  for (const p of line) { p.u = (p.x - (minX + maxX) / 2) * sc; p.v = (p.z - (minZ + maxZ) / 2) * sc; }
  const th = def.theme;
  const out = { line, length, laps: def.laps, theme: th, def };
  previewCache.set(id, out);
  return out;
}
