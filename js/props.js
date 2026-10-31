// Bibliothèque de décors procéduraux (arbres, champignons, flèches rocheuses, cristaux, immeubles,
// épaves, nuages...). Chaque type renvoie une ou plusieurs « parties » (géométrie + matériau + palette)
// qui partagent les mêmes matrices d'instance.
import * as THREE from 'three';
import { toon, mergeColored, paint } from './toon.js';
import { rockMaterial, facadeMaterial } from './materials.js';
import { noise1, noise2 } from './util.js';

const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);

function rockGeometry(seed = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
    let s = map.get(k);
    if (s === undefined) {
      s = 1 + 0.28 * noise1(seed + x * 3.1 + y * 5.7 + z * 2.3) + 0.12 * noise1(seed * 2 + x * 9 + z * 7);
      map.set(k, s);
    }
    p.setXYZ(i, x * s, y * s * 0.8, z * s);
  }
  g.computeVertexNormals();
  return g;
}

function noisyColumn(rTop, rBot, segs, hSegs, amp, lean) {
  const g = new THREE.CylinderGeometry(rTop, rBot, 1, segs, hSegs);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const s = 1 + amp * noise2(a * 2.5, y * 6) + amp * 0.5 * noise2(a * 7, y * 13);
    p.setXYZ(i, x * s + lean * y * y, y, z * s);
  }
  g.computeVertexNormals();
  return g;
}

const BROWNS = [0x6a4428, 0x5a3820, 0x7a5030];
const GREENS = [0x3f7a32, 0x4a8a3a, 0x356a2c, 0x5a9a3a];

// Chaque fabrique renvoie { parts: [{ geo, mat, palette, outline }], radius, outlineScale }
export const PROP_TYPES = {
  rock(theme, P) {
    return { parts: [{ geo: rockGeometry(5, 1), mat: toon({ color: 0xffffff }), palette: P.colors || theme.rockColors }], radius: 1, kind: 'rock' };
  },

  mesa(theme) {
    const geo = new THREE.CylinderGeometry(1, 1.25, 1, 11, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const s = 1 + 0.12 * noise2(a * 3, y * 4) + (y > 0.45 ? 0 : 0.08 * noise2(a * 9, y * 9));
      p.setXYZ(i, x * s, y, z * s);
    }
    geo.translate(0, 0.5, 0);
    geo.computeVertexNormals();
    return { parts: [{ geo, mat: rockMaterial(theme.strata, theme.plateau, 9, {}, theme.glow), noOutline: true }], radius: 1.25, kind: 'mesa' };
  },

  spire(theme, P) {
    const geo = noisyColumn(0.12, 0.5, 9, 10, 0.16, 0.12);
    return { parts: [{ geo, mat: rockMaterial(theme.strata, theme.plateau, theme.bandH * 0.6, {}, theme.glow) }], radius: 0.5 };
  },

  iceSpike(theme, P) {
    const parts = [];
    const main = new THREE.ConeGeometry(0.28, 1, 6); main.translate(0, 0.5, 0);
    parts.push(paint(main, 0xf4faff));
    const a = new THREE.ConeGeometry(0.17, 0.62, 6); a.translate(0, 0.31, 0); a.rotateZ(0.35); a.translate(0.22, 0, 0.05);
    parts.push(paint(a, 0xcfe6f8));
    const b = new THREE.ConeGeometry(0.14, 0.5, 6); b.translate(0, 0.25, 0); b.rotateX(-0.4); b.translate(-0.05, 0, -0.22);
    parts.push(paint(b, 0xb4d6f2));
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: P.colors || [0xffffff, 0xe6f2ff, 0xd6eaff] }], radius: 0.4 };
  },

  lavaSpike(theme, P) {
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const h = 0.5 + k * 0.17;
      const c = new THREE.ConeGeometry(0.16 + 0.04 * k, h, 5);
      c.translate(0, h / 2, 0);
      c.rotateZ((k - 1.5) * 0.25);
      c.translate(Math.cos(k * 2.1) * 0.18, 0, Math.sin(k * 2.1) * 0.18);
      parts.push(paint(c, k === 3 ? 0x3a2a26 : 0x241c1a));
    }
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: P.colors || [0xffffff, 0xd8c8c0] }], radius: 0.45 };
  },

  crystal(theme, P) {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      const h = 0.45 + (k % 3) * 0.22;
      g.scale(0.11 + 0.03 * (k % 2), h, 0.11);
      g.translate(0, h * 0.8, 0);
      g.rotateZ((k - 2) * 0.32);
      g.rotateX((k % 2 ? 1 : -1) * 0.2);
      g.translate(Math.cos(k * 1.3) * 0.12, 0, Math.sin(k * 1.3) * 0.12);
      parts.push(paint(g, 0xffffff));
    }
    return {
      parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true, emissive: new THREE.Color(P.emissive ?? 0x3a1010) }), palette: P.colors || [0xe8483a, 0xffffff] }],
      radius: 0.35,
    };
  },

  bush(theme, P) {
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const g = ico(0.42 + 0.12 * (k % 2), 0);
      g.scale(1, 0.7, 1);
      g.translate(Math.cos(k * 1.7) * 0.38, 0.28 + (k === 3 ? 0.18 : 0), Math.sin(k * 1.7) * 0.38);
      parts.push(paint(g, 0xffffff));
    }
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: P.colors || GREENS, noOutline: true }], radius: 0.9 };
  },

  redwood(theme, P) {
    const trunk = mergeColored([
      paint(new THREE.CylinderGeometry(0.026, 0.05, 0.86, 7).translate(0, 0.43, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.05, 0.075, 0.06, 7).translate(0, 0.03, 0), 0xffffff),
    ]);
    const crown = [];
    [[0.7, 0.15, 0.26], [0.82, 0.12, 0.22], [0.93, 0.085, 0.16]].forEach(([y, r, h], k) => {
      const c = new THREE.ConeGeometry(r, h, 7);
      c.translate(Math.sin(k * 2) * 0.02, y, Math.cos(k * 2) * 0.02);
      crown.push(paint(c, 0xffffff));
    });
    return {
      parts: [
        { geo: trunk, mat: toon({ vertexColors: true }), palette: [0x7a3e22, 0x6a3420, 0x86482a] },
        { geo: mergeColored(crown), mat: toon({ vertexColors: true }), palette: [0x2f5a2a, 0x3a6a30, 0x284a24, 0x44723a] },
      ],
      radius: 0.07,
    };
  },

  broadleaf(theme, P) {
    const trunk = paint(new THREE.CylinderGeometry(0.035, 0.06, 0.55, 7).translate(0, 0.275, 0), 0xffffff);
    const crown = [];
    [[0, 0.62, 0, 0.26], [0.16, 0.55, 0.08, 0.2], [-0.12, 0.58, -0.12, 0.21], [0.02, 0.76, -0.04, 0.2]].forEach(([x, y, z, r], k) => {
      crown.push(paint(ico(r, k === 0 ? 1 : 0).translate(x, y, z), 0xffffff));
    });
    return {
      parts: [
        { geo: trunk, mat: toon({ vertexColors: true }), palette: BROWNS },
        { geo: mergeColored(crown), mat: toon({ vertexColors: true }), palette: P.colors || GREENS },
      ],
      radius: 0.12,
    };
  },

  giantTree(theme, P) {
    const tp = [paint(new THREE.CylinderGeometry(0.045, 0.1, 1.0, 9).translate(0, 0.5, 0), 0xffffff)];
    for (let k = 0; k < 5; k++) {
      const r = new THREE.BoxGeometry(0.035, 0.16, 0.12);
      r.translate(0, 0.06, 0.11);
      r.rotateX(0.5);
      r.rotateY((k / 5) * Math.PI * 2);
      tp.push(paint(r, 0xffffff));
    }
    const crown = [];
    [[0.6, 0.3, 0.07], [0.78, 0.26, 0.06], [0.95, 0.2, 0.06]].forEach(([y, r, h], k) => {
      const d = ico(1, 1); d.scale(r, h, r * 0.9);
      d.translate(Math.cos(k * 2.3) * 0.05, y, Math.sin(k * 2.3) * 0.05);
      crown.push(paint(d, 0xffffff));
    });
    return {
      parts: [
        { geo: mergeColored(tp), mat: toon({ vertexColors: true }), palette: [0x6a4a30, 0x5a3e28, 0x7a5638] },
        { geo: mergeColored(crown), mat: toon({ vertexColors: true }), palette: [0x3a6a2a, 0x4a7a30, 0x2f5a26] },
      ],
      radius: 0.12,
    };
  },

  swampTree(theme, P) {
    const tp = [];
    const a = new THREE.CylinderGeometry(0.045, 0.085, 0.55, 7); a.translate(0, 0.275, 0); a.rotateZ(0.22);
    const b = new THREE.CylinderGeometry(0.03, 0.045, 0.42, 7); b.translate(0, 0.21, 0); b.rotateZ(-0.35); b.translate(-0.12, 0.52, 0);
    tp.push(paint(a, 0xffffff), paint(b, 0xffffff));
    for (let k = 0; k < 3; k++) {
      const r = new THREE.CylinderGeometry(0.018, 0.03, 0.28, 4, 1, true);
      r.translate(0, -0.1, 0); r.rotateZ(0.9); r.rotateY((k / 3) * Math.PI * 2 + 0.4); r.translate(0, 0.08, 0);
      tp.push(paint(r, 0xffffff));
    }
    const crown = [];
    [[-0.18, 0.86, 0, 0.3], [0.1, 0.8, 0.12, 0.24], [-0.05, 0.95, -0.12, 0.2]].forEach(([x, y, z, r], k) => {
      const s = ico(r, k === 0 ? 1 : 0); s.scale(1, 0.55, 1); s.translate(x, y, z);
      crown.push(paint(s, 0xffffff));
    });
    for (let k = 0; k < 3; k++) {
      const m = new THREE.ConeGeometry(0.03, 0.26, 3, 1, true);
      m.rotateX(Math.PI);
      m.translate(-0.15 + Math.cos(k * 2.1) * 0.2, 0.68, Math.sin(k * 2.1) * 0.2);
      crown.push(paint(m, 0x8a9a7a));
    }
    return {
      parts: [
        { geo: mergeColored(tp), mat: toon({ vertexColors: true }), palette: [0x4a3a28, 0x3e3022, 0x56442e] },
        { geo: mergeColored(crown), mat: toon({ vertexColors: true }), palette: [0x3a4a2a, 0x445a30, 0x2e3e22] },
      ],
      radius: 0.15,
    };
  },

  palm(theme, P) {
    const tp = [];
    let x = 0, y = 0;
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.CylinderGeometry(0.03, 0.036, 0.24, 5, 1, true);
      seg.rotateZ(-0.1 * k);
      seg.translate(x, y + 0.12, 0);
      tp.push(paint(seg, k % 2 ? 0xffffff : 0xe0d0b0));
      x += Math.sin(0.1 * k) * 0.24;
      y += Math.cos(0.1 * k) * 0.24;
    }
    const leaves = [];
    for (let k = 0; k < 8; k++) {
      const l = new THREE.BoxGeometry(0.4, 0.012, 0.07);
      l.translate(0.2, 0, 0);
      l.rotateZ(-0.35 - (k % 2) * 0.15);
      l.rotateY((k / 8) * Math.PI * 2);
      l.translate(x, y, 0);
      leaves.push(paint(l, 0xffffff));
    }
    return {
      parts: [
        { geo: mergeColored(tp), mat: toon({ vertexColors: true }), palette: [0x9a7a50, 0x8a6a44, 0xa8885c] },
        { geo: mergeColored(leaves), mat: toon({ vertexColors: true, side: THREE.DoubleSide }), palette: [0x3a9a3a, 0x4aaa44, 0x2f8a34] },
      ],
      radius: 0.1,
    };
  },

  jungleTree(theme, P) {
    const trunk = paint(new THREE.CylinderGeometry(0.025, 0.05, 0.9, 7).translate(0, 0.45, 0), 0xffffff);
    const crown = [];
    const c1 = ico(1, 1); c1.scale(0.3, 0.1, 0.28); c1.translate(0, 0.92, 0); crown.push(paint(c1, 0xffffff));
    const c2 = ico(1, 0); c2.scale(0.2, 0.08, 0.2); c2.translate(0.1, 0.74, -0.06); crown.push(paint(c2, 0xffffff));
    const c3 = ico(1, 0); c3.scale(0.16, 0.07, 0.16); c3.translate(-0.12, 0.62, 0.08); crown.push(paint(c3, 0xffffff));
    return {
      parts: [
        { geo: trunk, mat: toon({ vertexColors: true }), palette: [0x7a6a50, 0x6a5a44, 0x8a7a5c] },
        { geo: mergeColored(crown), mat: toon({ vertexColors: true }), palette: [0x2f6a2a, 0x3a7a30, 0x285a24, 0x4a8a34] },
      ],
      radius: 0.07,
    };
  },

  fungus(theme, P) {
    const stalk = [paint(new THREE.CylinderGeometry(0.07, 0.11, 0.66, 8).translate(0, 0.33, 0), 0xffffff)];
    const gills = new THREE.CircleGeometry(0.4, 10); gills.rotateX(Math.PI / 2); gills.translate(0, 0.62, 0);
    stalk.push(paint(gills, 0xd8c8b0));
    const cap = new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.55, 1); cap.translate(0, 0.62, 0);
    return {
      parts: [
        { geo: mergeColored(stalk), mat: toon({ vertexColors: true }), palette: [0xf0e8d0, 0xe8dcc0, 0xf6f0e0] },
        { geo: mergeColored([paint(cap, 0xffffff)]), mat: toon({ vertexColors: true }), palette: P.colors || [0xe8408a, 0xff8a2a] },
      ],
      radius: 0.12,
    };
  },

  stalkPlant(theme, P) {
    const stem = [];
    let x = 0;
    for (let k = 0; k < 4; k++) {
      const s = new THREE.CylinderGeometry(0.035, 0.05, 0.24, 5, 1, true);
      s.translate(x, 0.12 + k * 0.22, 0);
      stem.push(paint(s, 0xffffff));
      x += 0.03;
    }
    const bulb = ico(0.12, 0); bulb.scale(1, 1.3, 1); bulb.translate(x, 0.98, 0);
    return {
      parts: [
        { geo: mergeColored(stem), mat: toon({ vertexColors: true }), palette: [0x5aa060, 0x4a9070, 0x6ab05a] },
        { geo: mergeColored([paint(bulb, 0xffffff)]), mat: toon({ vertexColors: true, emissive: new THREE.Color(0x202010) }), palette: P.colors || [0xffe04a] },
      ],
      radius: 0.08,
    };
  },

  domeHouse(theme, P) {
    const body = [paint(new THREE.CylinderGeometry(1, 1.05, 0.7, 14).translate(0, 0.35, 0), 0xffffff)];
    const door = new THREE.BoxGeometry(0.35, 0.45, 0.2); door.translate(0, 0.22, 1.0);
    body.push(paint(door, 0x4a3524));
    const dome = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, 0.7, 0);
    return {
      parts: [
        { geo: mergeColored(body), mat: toon({ vertexColors: true }), palette: [theme.stands.a, theme.stands.b, 0xf6efe0] },
        { geo: mergeColored([paint(dome, 0xffffff)]), mat: toon({ vertexColors: true }), palette: P.colors || [0x3a9a6a, 0xc9a040, 0x6a8ab0] },
      ],
      radius: 1.05,
    };
  },

  tower(theme, P) {
    const g = mergeColored([
      paint(new THREE.CylinderGeometry(0.06, 0.09, 0.82, 10).translate(0, 0.41, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.3, 0.16, 0.07, 18).translate(0, 0.84, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.31, 0.31, 0.012, 18).translate(0, 0.88, 0), 0xff9a4a),
      paint(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.885, 0), 0xf0e0c8),
      paint(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4).translate(0, 1.0, 0), 0x888888),
    ]);
    return { parts: [{ geo: g, mat: toon({ vertexColors: true }), palette: P.colors || [theme.stands.a, theme.stands.b] }], radius: 0.3 };
  },

  stiltPod(theme, P) {
    const legs = [];
    for (let k = 0; k < 4; k++) {
      const l = new THREE.CylinderGeometry(0.025, 0.035, 0.78, 6);
      l.translate(Math.cos(k * Math.PI / 2 + 0.6) * 0.3, 0.39, Math.sin(k * Math.PI / 2 + 0.6) * 0.3);
      legs.push(paint(l, 0xffffff));
    }
    const pod = ico(0.5, 2); pod.scale(1, 0.32, 1); pod.translate(0, 0.84, 0);
    const ring = new THREE.CylinderGeometry(0.47, 0.47, 0.035, 20); ring.translate(0, 0.83, 0);
    return {
      parts: [
        { geo: mergeColored(legs), mat: toon({ vertexColors: true }), palette: [0xb8c2c8, 0xa8b2b8] },
        { geo: mergeColored([paint(pod, 0xffffff), paint(ring, 0x5a8ab0)]), mat: toon({ vertexColors: true, emissive: new THREE.Color(0x0a1820) }), palette: [0xeef2f4, 0xdfe6ea] },
      ],
      radius: 0.5,
    };
  },

  building(theme, P) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const f = theme.facade || { wall: 0x8a8fa0, window: 0x2a3448, lit: 0xffd890, roof: 0x5a5f70 };
    return { parts: [{ geo: g, mat: facadeMaterial(f) }], radius: 0.72, building: true };
  },

  temple(theme, P) {
    const parts = [];
    const tiers = [[1, 0.18], [0.8, 0.18], [0.62, 0.18], [0.45, 0.16], [0.3, 0.14]];
    let y = 0;
    tiers.forEach(([w, h], k) => {
      const b = new THREE.BoxGeometry(w, h, w);
      b.translate(0, y + h / 2, 0);
      parts.push(paint(b, k === tiers.length - 1 ? 0xa8a898 : 0xffffff));
      const moss = new THREE.BoxGeometry(w * 1.01, 0.02, w * 1.01);
      moss.translate(0, y + h, 0);
      parts.push(paint(moss, 0x4f8a3a));
      y += h;
    });
    const stair = new THREE.BoxGeometry(0.16, 0.5, 0.5);
    stair.rotateX(0.75); stair.translate(0, 0.25, 0.42);
    parts.push(paint(stair, 0xc8c8b8));
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: [0x9a9a8a, 0x8a8c7e, 0xa8a898] }], radius: 0.7 };
  },

  wreckWedge(theme, P) {
    const hull = new THREE.BoxGeometry(1, 0.16, 2, 2, 1, 2);
    const p = hull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = (z + 1) / 2; // 0 = pointe avant, 1 = arrière
      p.setX(i, p.getX(i) * (0.05 + 0.95 * t));
      if (p.getY(i) > 0) p.setY(i, p.getY(i) * (0.4 + 0.6 * t));
    }
    hull.computeVertexNormals();
    const parts = [paint(hull, 0xffffff)];
    const tower = new THREE.BoxGeometry(0.28, 0.12, 0.26); tower.translate(0, 0.14, 0.62);
    parts.push(paint(tower, 0xd8d8d8));
    const bridge = new THREE.BoxGeometry(0.42, 0.04, 0.08); bridge.translate(0, 0.21, 0.66);
    parts.push(paint(bridge, 0xc8c8c8));
    for (const sx of [-0.25, 0, 0.25]) {
      const e = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10); e.rotateX(Math.PI / 2); e.translate(sx, 0, 1.03);
      parts.push(paint(e, 0x6a6a6a));
    }
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: [0x9aa0a8, 0x8a9098, 0xa8aeb4] }], radius: 1.0, tilt: 0.45 };
  },

  wreckRing(theme, P) {
    const g = new THREE.TorusGeometry(0.5, 0.06, 6, 28);
    g.translate(0, 0.32, 0);
    return { parts: [{ geo: mergeColored([paint(g, 0xffffff)]), mat: toon({ vertexColors: true }), palette: [0x8a9098, 0x7a7068, 0x9aa0a8] }], radius: 0.55, tilt: 0.25 };
  },

  wreckPart(theme, P) {
    const parts = [];
    const c = new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10); c.rotateZ(Math.PI / 2); c.translate(0, 0.22, 0);
    parts.push(paint(c, 0xffffff));
    const b = new THREE.BoxGeometry(0.6, 0.3, 0.5); b.rotateY(0.6); b.rotateZ(0.3); b.translate(0.2, 0.2, 0.35);
    parts.push(paint(b, 0xd0c8c0));
    const f = new THREE.BoxGeometry(0.05, 0.5, 0.3); f.rotateZ(-0.5); f.translate(-0.35, 0.3, -0.2);
    parts.push(paint(f, 0xb0a8a0));
    return { parts: [{ geo: mergeColored(parts), mat: toon({ vertexColors: true }), palette: [0x8a9098, 0x9a7a60, 0x7a8088] }], radius: 0.55, tilt: 0.3 };
  },

  cloudPuff(theme, P) {
    const parts = [];
    [[0, 0, 0, 0.6], [0.55, -0.05, 0.1, 0.45], [-0.5, -0.05, -0.1, 0.48], [0.15, 0.25, -0.2, 0.42], [-0.2, 0.05, 0.4, 0.4]].forEach(([x, y, z, r]) => {
      const s = ico(r, 1); s.translate(x, y, z); parts.push(paint(s, 0xffffff));
    });
    const g = mergeColored(parts);
    g.scale(1, 0.55, 1);
    return { parts: [{ geo: g, mat: toon({ vertexColors: true }), palette: P.colors || [0xffffff, 0xffeae2, 0xffdcd6], noOutline: true }], radius: 1.1 };
  },
};

export { rockGeometry };
