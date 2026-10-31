// Matériaux cartoon calculés dans le shader à partir de la position monde (aucune texture à charger) :
// - roche à strates horizontales (avec strates lumineuses optionnelles : veines de lave)
// - façades d'immeubles (grille de fenêtres, certaines éclairées)
import * as THREE from 'three';
import { toon } from './toon.js';

const WORLD_VARYINGS_VERT = `
  #ifdef USE_INSTANCING
    vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    vWNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vWNrm = normalize(mat3(modelMatrix) * objectNormal);
  #endif`;

function injectWorldVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WORLD_VARYINGS_VERT);
}

export function rockMaterial(strata, top, bandH = 7, extra = {}, glow = null) {
  const m = toon({ color: 0xffffff, ...extra });
  const cols = strata.map((c) => new THREE.Color(c));
  while (cols.length < 8) cols.push(cols[cols.length % strata.length].clone());
  const g = new Array(8).fill(0);
  if (glow) glow.forEach((v, i) => { if (i < 8) g[i] = v; });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uStrata = { value: cols.slice(0, 8) };
    shader.uniforms.uTop = { value: new THREE.Color(top) };
    shader.uniforms.uBandH = { value: bandH };
    shader.uniforms.uGlow = { value: g };
    injectWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform vec3 uStrata[8];\nuniform vec3 uTop;\nuniform float uBandH;\nuniform float uGlow[8];'
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float bc = (vWPos.y + sin(vWPos.x * 0.011 + vWPos.z * 0.007) * 4.0 + sin(vWPos.z * 0.043) * 1.2) / uBandH;
        int bi = int(mod(floor(bc), 7.0));
        vec3 rawBand = uStrata[bi];
        vec3 rc = rawBand;
        float fe = fract(bc);
        rc *= (fe < 0.06) ? 0.78 : 1.0;
        float flatness = smoothstep(0.72, 0.88, vWNrm.y);
        rc = mix(rc, uTop, flatness);
        vec4 diffuseColor = vec4( diffuse * rc, opacity );`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += rawBand * uGlow[bi] * (1.0 - flatness);'
      );
  };
  m.customProgramCacheKey = () => 'rock2';
  return m;
}

// f = { wall, window, lit, roof, winW, winH, glow }
export function facadeMaterial(f, extra = {}) {
  const m = toon({ color: 0xffffff, ...extra });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWall = { value: new THREE.Color(f.wall) };
    shader.uniforms.uWin = { value: new THREE.Color(f.window) };
    shader.uniforms.uLit = { value: new THREE.Color(f.lit) };
    shader.uniforms.uRoof = { value: new THREE.Color(f.roof) };
    shader.uniforms.uWinSize = { value: new THREE.Vector2(f.winW || 4, f.winH || 3.6) };
    shader.uniforms.uWinGlow = { value: f.glow ?? 0.8 };
    injectWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform vec3 uWall;\nuniform vec3 uWin;\nuniform vec3 uLit;\nuniform vec3 uRoof;\nuniform vec2 uWinSize;\nuniform float uWinGlow;'
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 fn = normalize(vWNrm);
        float roof = step(0.6, fn.y);
        float fu = abs(fn.x) > abs(fn.z) ? vWPos.z : vWPos.x;
        vec2 cell = vec2(floor(fu / uWinSize.x), floor(vWPos.y / uWinSize.y));
        vec2 ff = vec2(fract(fu / uWinSize.x), fract(vWPos.y / uWinSize.y));
        float win = step(0.2, ff.x) * step(ff.x, 0.8) * step(0.28, ff.y) * step(ff.y, 0.78) * (1.0 - roof);
        win *= 1.0 - smoothstep(350.0, 1100.0, length(vWPos - cameraPosition));
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float lit = win * step(0.58, hsh);
        vec3 fc = mix(uWall, uWin, win);
        fc = mix(fc, uLit, lit);
        fc = mix(fc, uRoof, roof);
        vec4 diffuseColor = vec4( diffuse * fc, opacity );`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += uLit * lit * uWinGlow;'
      );
  };
  m.customProgramCacheKey = () => 'facade1';
  return m;
}
