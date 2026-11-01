// Géométrie des tunnels et souterrains : paroi intérieure (roche, glace, lave, cristal, bois, métal...),
// rangées de lumières qui défilent, nervures pour les tunnels artificiels, colline ou bâtiment qui recouvre
// le tunnel, façades percées aux deux entrées.
import * as THREE from 'three';
import { toon, mergeColored } from './toon.js';
import { rockMaterial, facadeMaterial } from './materials.js';
import { sweepTube } from './track.js';
import { noise1 } from './util.js';

const darken = (c, f) => new THREE.Color(c).multiplyScalar(f).getHex();

export function tunnelStyle(theme) {
  const t = theme.tunnel || {};
  const city = !!theme.elevated || theme.wallStyle === 'city';
  return {
    strata: t.strata || theme.strata.map((c) => darken(c, 0.55)),
    top: t.top ?? darken(theme.plateau, 0.5),
    bandH: t.bandH ?? 3,
    glow: t.glow || null,
    emissive: t.emissive ?? 0x000000,
    light: t.light ?? 0xffe2a8,
    smooth: t.smooth ?? city,
    ribs: t.ribs ?? (t.smooth || city ? 0x9aa0aa : null),
    shell: t.shell || (city ? 'city' : 'rock'),
    shellStrata: t.shellStrata || null,
    shellTop: t.shellTop ?? theme.plateau,
    spacing: t.spacing ?? 9,
  };
}

// Profil intérieur (de gauche à droite en passant par la voûte), en coordonnées locales [latéral, hauteur].
export function innerProfile(e, h, smooth, s, seed = 0) {
  const Hw = Math.min(7, h * 0.5);
  const pts = [[-e, -0.5], [-e, Hw * 0.5], [-e, Hw]];
  const A = 9;
  for (let a = 1; a < A; a++) {
    const ang = Math.PI - (a / A) * Math.PI;
    pts.push([Math.cos(ang) * e, Hw + Math.sin(ang) * (h - Hw)]);
  }
  pts.push([e, Hw], [e, Hw * 0.5], [e, -0.5]);
  if (!smooth) {
    // paroi rocheuse : bosses vers l'extérieur uniquement (la zone de pilotage reste dégagée)
    for (let j = 1; j < pts.length - 1; j++) {
      const [x, y] = pts[j];
      const dx = x, dy = y - Hw * 0.5;
      const l = Math.hypot(dx, dy) || 1;
      const amt = 1.6 * (0.5 + 0.5 * noise1(s / 6 + j * 3.7 + seed));
      pts[j] = [x + (dx / l) * amt, y + (dy / l) * amt];
    }
  }
  return pts;
}

function outerProfile(e, h, kind, s, floorRel) {
  if (kind === 'city' || kind === 'box') {
    const W = e + 22, top = h + 26;
    return [[-W, floorRel], [-W, top * 0.5], [-W, top], [0, top], [W, top], [W, top * 0.5], [W, floorRel]];
  }
  const n = (k) => noise1(s / 35 + k * 5.1);
  return [
    [-(e + 70), -7], [-(e + 46), h * 0.45 + 3 * n(1)], [-(e + 22), h + 4 + 3 * n(2)], [-e * 0.3, h + 8 + 3 * n(3)],
    [e * 0.3, h + 8 + 3 * n(4)], [e + 22, h + 4 + 3 * n(5)], [e + 46, h * 0.45 + 3 * n(6)], [e + 70, -7],
  ];
}

function sweepProfile(track, T, profileFn, outward) {
  const N = track.N;
  const n = (T.i1 - T.i0 + N) % N;
  const pos = [], idx = [];
  let P = 0;
  for (let k = 0; k <= n; k++) {
    const i = (T.i0 + k) % N;
    const prof = profileFn(i, k);
    P = prof.length;
    for (const [l, h] of prof) {
      pos.push(track.px[i] + track.rx[i] * l, track.py[i] + h, track.pz[i] + track.rz[i] * l);
    }
  }
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < P - 1; j++) {
      const a = k * P + j, b = (k + 1) * P + j, c = k * P + j + 1, d = (k + 1) * P + j + 1;
      if (outward) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function facadeGeometry(track, i, inner, outer) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ShapeGeometry(shape);
  g.deleteAttribute('uv');
  g.applyMatrix4(track.frameMatrix(i));
  return g;
}

export function buildSections(track) {
  if (!track.tunnels.length) return;
  const th = track.theme;
  const st = tunnelStyle(th);
  const N = track.N;
  const inners = [], shells = [], facades = [], ribs = [];
  const lights = [];
  const el = th.elevated;
  track.tunnels.forEach((T, ti) => {
    const seed = ti * 17.3;
    const profIn = (i) => innerProfile(track.width[i] / 2 + 0.6, T.h, st.smooth, i * track.step, seed);
    const floorRel = (i) => (el && st.shell === 'city' ? (el.blockBottom ?? el.floorY - track.py[i]) : -7);
    const profOut = (i) => outerProfile(track.width[i] / 2 + 0.6, T.h, st.shell, i * track.step, floorRel(i));
    inners.push(sweepProfile(track, T, profIn, false));
    shells.push(sweepProfile(track, T, profOut, true));
    for (const i of [T.i0, T.i1]) {
      // façade légèrement plus large que l'ouverture pour fermer les jointures
      const inner = innerProfile(track.width[i] / 2 + 0.6, T.h, true, 0).map(([x, y]) => [x * 1.0, y]);
      facades.push(facadeGeometry(track, i, inner, profOut(i)));
    }
    // lumières et nervures
    const n = (T.i1 - T.i0 + N) % N;
    const lstep = Math.max(1, Math.round(st.spacing / track.step));
    for (let k = 1; k < n; k += lstep) {
      const i = (T.i0 + k) % N;
      const e = track.width[i] / 2 + 0.6;
      const Hw = Math.min(7, T.h * 0.5);
      lights.push([i, -(e - 0.05), Hw * 0.8, 0]);
      lights.push([i, e - 0.05, Hw * 0.8, 0]);
      if ((k / lstep) % 2 === 0) lights.push([i, 0, T.h - 0.35, 1]);
      if (st.ribs && (k / lstep) % 1 === 0) {
        const path = innerProfile(e - 0.25, T.h - 0.25, true, 0).map(([x, y]) => new THREE.Vector3(x, y, 0));
        const g = sweepTube(path, path.map(() => 0.32), 5, 0, 1);
        g.applyMatrix4(track.frameMatrix(i));
        ribs.push(g);
      }
    }
  });

  const merge = (list) => mergeColored(list);
  const innerMat = rockMaterial(st.strata, st.top, st.bandH, { emissive: new THREE.Color(st.emissive) }, st.glow);
  const inner = new THREE.Mesh(merge(inners), innerMat);
  inner.name = 'tunnels';
  track.group.add(inner);
  const shellMat = st.shell === 'city' && th.facade
    ? facadeMaterial(th.facade, { side: THREE.DoubleSide })
    : st.shell === 'box' && st.shellStrata
      ? rockMaterial(st.shellStrata, st.shellTop, 3, { side: THREE.DoubleSide })
      : rockMaterial(th.strata, th.plateau, th.bandH || 7.5, { side: THREE.DoubleSide }, th.glow);
  track.group.add(new THREE.Mesh(merge(shells), shellMat));
  track.group.add(new THREE.Mesh(merge(facades), shellMat));
  if (ribs.length) track.group.add(new THREE.Mesh(merge(ribs), toon({ color: st.ribs })));

  // rangées de lumières : repères qui défilent à toute vitesse
  const wallGeo = new THREE.BoxGeometry(0.35, 0.28, 3.2);
  const ceilGeo = new THREE.BoxGeometry(1.4, 0.18, 2.4);
  const lm = new THREE.MeshBasicMaterial({ color: st.light });
  const walls = new THREE.InstancedMesh(wallGeo, lm, lights.length);
  const ceils = new THREE.InstancedMesh(ceilGeo, lm, lights.length);
  let nw = 0, nc = 0;
  for (const [i, lat, y, kind] of lights) {
    const m = track.frameMatrix(i, lat, y);
    if (kind === 0) walls.setMatrixAt(nw++, m);
    else ceils.setMatrixAt(nc++, m);
  }
  walls.count = nw; ceils.count = nc;
  track.group.add(walls, ceils);
}
