// Matériaux "cartoon" : ombrage en paliers (cel shading) + contours par coque inversée.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

let gradientMap = null;
export function getGradientMap() {
  if (!gradientMap) {
    // 3 paliers de lumière : ombre / mi-teinte / plein soleil
    const data = new Uint8Array([90, 170, 255]);
    gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toon(params = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: getGradientMap(), ...params });
}

const outlineCache = new Map();
// Contour noir : on gonfle la géométrie le long des normales et on ne dessine que les faces arrière.
export function outlineMaterial(thickness = 0.06, color = 0x24140a) {
  const key = thickness + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader =
      'uniform float outlineThickness;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed += normalize(normal) * outlineThickness;'
      );
  };
  m.customProgramCacheKey = () => 'outline' + thickness;
  outlineCache.set(key, m);
  return m;
}

// Normales lissées (moyennées par position) : indispensable pour des contours sans trous sur les arêtes vives.
export function smoothNormalsClone(geo) {
  const g = geo.clone();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const map = new Map();
  const key = (i) =>
    Math.round(pos.getX(i) * 100) + '_' + Math.round(pos.getY(i) * 100) + '_' + Math.round(pos.getZ(i) * 100);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let acc = map.get(k);
    if (!acc) { acc = [0, 0, 0]; map.set(k, acc); }
    acc[0] += nrm.getX(i); acc[1] += nrm.getY(i); acc[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// Ajoute un attribut couleur uniforme à une géométrie.
export function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Fusionne des géométries hétérogènes (on ne garde que position / normal / color).
export function mergeColored(list) {
  const prepared = list.map((g) => {
    let geo = g.index ? g : g; // toutes indexées par construction
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') geo.deleteAttribute(name);
    }
    if (!geo.attributes.color) paint(geo, 0xffffff);
    if (!geo.index) {
      const idx = [];
      for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i);
      geo.setIndex(idx);
    }
    return geo;
  });
  return mergeGeometries(prepared, false);
}

// Crée un mesh cartoon + son contour, regroupés.
export function toonMesh(geo, mat, outline = 0.05) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);
  if (outline > 0) {
    const o = new THREE.Mesh(smoothNormalsClone(geo), outlineMaterial(outline));
    group.add(o);
    group.userData.outline = o;
  }
  group.userData.mesh = mesh;
  return group;
}

// Texture de dégradé radial (ombres portées, halos).
export function radialTexture(size = 128, inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
