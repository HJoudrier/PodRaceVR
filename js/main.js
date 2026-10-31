// Point d'entrée : rendu, boucle de jeu, caméras, menus, pause, résultats et session WebXR (Meta Quest).
import * as THREE from 'three';
import { TATOOINE } from './tracks/tatooine.js';
import { Track } from './track.js';
import { Environment } from './environment.js';
import { Effects } from './effects.js';
import { AudioSys } from './audio.js';
import { Raiders } from './raiders.js';
import { Input } from './input.js';
import { Hud, CockpitHud } from './hud.js';
import { Race } from './race.js';
import { Menu } from './ui.js';
import { loadSettings, saveSettings, PODS } from './config.js';
import { buildPod, animatePod, EYE } from './podModel.js';
import { formatTime, clamp, damp, wrapAngle } from './util.js';

const $ = (id) => document.getElementById(id);

function showError(e) {
  const el = $('error');
  el.textContent = 'Erreur : ' + ((e && (e.message || e.reason)) || e);
  el.classList.remove('hidden');
  console.error(e);
}
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

const settings = loadSettings();

// ------------------------------------------------------------------ rendu
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.15, 7000);
scene.add(camera);

// Vignette : confort en VR (rétrécit le champ dans les virages), flash rouge sur les dégâts, effet de vitesse à l'écran.
const vignette = (() => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(0, 0, 0) }, uInner: { value: 1 }, uOuter: { value: 2 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uStrength; uniform vec3 uColor; uniform float uInner; uniform float uOuter; varying vec2 vP;\n' +
      'void main(){ float d = length(vP) / 0.3; float a = smoothstep(uInner, uOuter, d) * uStrength; gl_FragColor = vec4(uColor, a);\n#include <colorspace_fragment>\n}',
    transparent: true, depthTest: false, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  m.position.z = -0.3;
  m.renderOrder = 1000;
  m.frustumCulled = false;
  return m;
})();
camera.add(vignette);

let track, env, effects, audio, raiders, input, hud, cockpitHud, menu;
let race = null;
let mode = 'loading';
let camMode = settings.camera;
const dolly = new THREE.Group();
let showroom = null;
const cam = { yaw: 0, fov: 72, y: 0 };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
const listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), vel: new THREE.Vector3() };
const bufSize = new THREE.Vector2();

const isXR = () => renderer.xr.isPresenting;

async function init() {
  await new Promise((r) => setTimeout(r, 40));
  track = new Track(TATOOINE);
  scene.add(track.build());
  env = new Environment(scene, track).build();
  effects = new Effects(scene);
  audio = new AudioSys();
  audio.setVolume(settings.volume);
  raiders = new Raiders(scene, track, effects, audio).build();
  input = new Input();
  input.vrControl = settings.vrControl;
  hud = new Hud(track);
  cockpitHud = new CockpitHud(hud);
  menu = new Menu(settings, {
    onChange: (s) => {
      saveSettings(s);
      if (!showroom || showroom.id !== s.podId) setShowroomPod(s.podId);
      audio.setVolume(s.volume);
      input.vrControl = s.vrControl;
    },
    onStart: () => startRace(false),
    onStartVR: () => startRace(true),
  });
  setupXR();
  setupButtons();
  window.addEventListener('resize', onResize);
  goMenu();
  $('loading').classList.add('hidden');
  renderer.setAnimationLoop(loop);
}

function onResize() {
  if (isXR()) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ------------------------------------------------------------------ WebXR
function setupXR() {
  if (!navigator.xr) {
    menu.setVR(false, 'WebXR indisponible ici. Sur Meta Quest 3, ouvrez cette page (en HTTPS) dans le navigateur du casque.');
    return;
  }
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    menu.setVR(ok, ok ? 'Casque détecté : la course démarre directement dans le cockpit. Asseyez-vous confortablement !' : 'Mode VR immersif non disponible sur cet appareil.');
  }).catch(() => menu.setVR(false, 'Impossible de vérifier la prise en charge de la VR.'));
}

function enterVR() {
  // requestSession doit être appelé directement dans le geste utilisateur (clic)
  return navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }).then(async (session) => {
    session.addEventListener('end', onXREnd);
    await renderer.xr.setSession(session);
    try {
      if (session.updateTargetFrameRate && session.supportedFrameRates) {
        const rates = Array.from(session.supportedFrameRates);
        const want = settings.vrRate;
        const best = rates.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), rates[0]);
        if (best) await session.updateTargetFrameRate(best);
      }
    } catch (e) { /* fréquence non modifiable */ }
  });
}

function onXREnd() {
  if (mode !== 'menu') goMenu();
  onResize();
}

// ------------------------------------------------------------------ hangar
function setShowroomPod(id) {
  if (showroom) { scene.remove(showroom.pod.root); scene.remove(showroom.pod.shadow); }
  const def = PODS.find((p) => p.id === id) || PODS[0];
  const pod = buildPod(def.look, {});
  const smp = track.sample(75, 0);
  const yaw = Math.atan2(-smp.tx, -smp.tz);
  pod.root.position.set(smp.x, smp.y + 1.8, smp.z);
  pod.root.rotation.y = yaw;
  pod.shadow.position.set(smp.x, smp.y + 0.12, smp.z);
  pod.shadow.rotation.y = yaw;
  scene.add(pod.root, pod.shadow);
  showroom = { id, pod, angle: showroom ? showroom.angle : 2.4, t: 0 };
}

function updateMenu(dt) {
  if (!showroom) return;
  showroom.angle += dt * 0.22;
  showroom.t += dt;
  const p = showroom.pod;
  animatePod(p, { throttle: 0.25 + 0.15 * Math.sin(showroom.t * 1.3), steer: 0, boost: false, bank: Math.sin(showroom.t * 0.7) * 0.08, engineHealth: [1, 1], fire: [false, false] }, showroom.t, dt);
  const c = p.root.localToWorld(tmpV.set(0, 0.4, -2.5));
  const a = showroom.angle;
  const narrow = window.innerWidth < 1000;
  const R = narrow ? 26 : 22;
  camera.position.set(c.x + Math.sin(a) * R, c.y + 6, c.z + Math.cos(a) * R);
  camera.lookAt(c.x, c.y - (narrow ? 6 : 3.2), c.z);
  camera.fov = 50;
  camera.updateProjectionMatrix();
}

function goMenu() {
  if (isXR()) { renderer.xr.getSession().end(); }
  endRace();
  mode = 'menu';
  input.gameActive = false;
  menu.show(true);
  hud.show(false);
  for (const id of ['pause', 'results']) $(id).classList.add('hidden');
  scene.add(camera);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  setShowroomPod(settings.podId);
  env.setStartLights(0);
  effects.clear();
  vignette.material.uniforms.uStrength.value = 0;
}

function endRace() {
  if (!race) return;
  cockpitHud.detach();
  if (dolly.parent) dolly.parent.remove(dolly);
  race.dispose();
  race = null;
  audio.stopRace();
  raiders.reset();
}

// ------------------------------------------------------------------ course
function startRace(vr) {
  audio.init();
  saveSettings(settings);
  if (vr) {
    enterVR().then(() => beginRace()).catch((e) => showError(e));
  } else {
    beginRace();
  }
}

function beginRace() {
  endRace();
  if (showroom) { scene.remove(showroom.pod.root); scene.remove(showroom.pod.shadow); showroom = null; }
  effects.clear();
  race = new Race({ scene, track, env, effects, audio, raiders, settings, hud, cockpitHud });
  const pm = race.player.model;
  pm.root.add(dolly);
  dolly.position.copy(EYE);
  cockpitHud.attach(pm.dashAnchor, dolly);
  cockpitHud.hidePanel();
  audio.startRace(race.racers.length - 1);
  mode = 'race';
  input.gameActive = true;
  menu.show(false);
  for (const id of ['pause', 'results', 'help']) $(id).classList.add('hidden');
  hud.show(!isXR());
  camMode = settings.camera;
  applyCameraMode(true);
  hud.message('PRÊTS ?', `${race.laps} tour${race.laps > 1 ? 's' : ''} · ${race.racers.length} pilotes`, 1.6);
  cockpitHud.message('PRÊTS ?', `${race.laps} tour${race.laps > 1 ? 's' : ''} · ${race.racers.length} pilotes`, 1.6);
}

function applyCameraMode(snap = false) {
  if (!race) return;
  const cockpit = isXR() || camMode === 'cockpit';
  cockpitHud.vr = isXR();
  $('hud').classList.toggle('cockpit', cockpit);
  race.levelPlayerCockpit = cockpit;
  race.player.model.pilot.visible = !cockpit;
  if (cockpit) {
    dolly.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
  } else {
    scene.add(camera);
    if (snap) { cam.yaw = race.player.yaw; cam.y = 0; cam.hint = race.player.hint; }
  }
  cam.fov = cockpit ? 82 : 72;
}

function pauseGame() {
  mode = 'paused';
  if (isXR()) {
    cockpitHud.showPanel('PAUSE', [
      { left: 'A', right: 'Reprendre la course' },
      { left: 'Y', right: 'Recommencer' },
      { left: 'B', right: 'Quitter (retour au hangar)' },
    ], 'Maintenez le bouton Meta pour recentrer la vue');
  } else {
    $('pause').classList.remove('hidden');
  }
}

function resumeGame() {
  mode = 'race';
  $('pause').classList.add('hidden');
  cockpitHud.hidePanel();
}

function showResults() {
  mode = 'results';
  const res = race.results();
  const me = res.find((r) => r.isPlayer);
  const title = me.place === 1 ? 'Victoire !' : `Arrivée : ${me.place}e place`;
  $('results-title').textContent = title;
  const body = $('results-body');
  body.innerHTML = '';
  for (const r of res) {
    const tr = document.createElement('tr');
    if (r.isPlayer) tr.className = 'me';
    tr.innerHTML = `<td>${r.place}</td><td>${r.name}</td><td>${r.pod}</td><td class="${r.estimated ? 'est' : ''}">${r.estimated ? '≈ ' : ''}${formatTime(r.time)}</td><td>${isFinite(r.best) ? formatTime(r.best) : '--'}</td>`;
    body.appendChild(tr);
  }
  if (isXR()) {
    cockpitHud.showPanel(title.toUpperCase(), res.slice(0, 8).map((r) => ({
      left: `${r.place}. ${r.name}`, right: (r.estimated ? '≈ ' : '') + formatTime(r.time), highlight: r.isPlayer,
    })), 'A : rejouer      B : quitter');
  } else {
    $('results').classList.remove('hidden');
  }
}

function setupButtons() {
  $('btn-resume').onclick = () => resumeGame();
  $('btn-restart').onclick = () => { audio.init(); beginRace(); };
  $('btn-quit').onclick = () => goMenu();
  $('btn-again').onclick = () => { audio.init(); beginRace(); };
  $('btn-menu').onclick = () => goMenu();
}

// ------------------------------------------------------------------ caméra
function updateCamera(dt) {
  if (!race) return;
  const p = race.player;
  const spd = Math.abs(p.speed);
  const sf = clamp(spd / 230, 0, 1.2);
  const cockpit = isXR() || camMode === 'cockpit';
  const shake = race.shake || 0;
  if (!isXR()) {
    if (cockpit) {
      camera.position.set((Math.random() - 0.5) * shake * 0.08, (Math.random() - 0.5) * shake * 0.08 + Math.sin(race.time * 37) * sf * 0.006, 0);
      camera.rotation.set((Math.random() - 0.5) * shake * 0.02, 0, -p.bank * 0.08);
      cam.fov = damp(cam.fov, 80 + sf * 16 + (p.boost ? 8 : 0), 3, dt);
    } else {
      cam.yaw += wrapAngle(p.yaw - cam.yaw) * (1 - Math.exp(-5.5 * dt));
      const dist = 15.5 + sf * 3;
      const bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw);
      const targetY = p.pos.y + 4.4 - sf * 0.6;
      cam.y = cam.y ? damp(cam.y, targetY, 8, dt) : targetY;
      camera.position.set(p.pos.x + bx * dist, cam.y, p.pos.z + bz * dist);
      // la caméra reste dans le canyon (pas de vue à travers la roche)
      const q = track.query(camera.position.x, camera.position.z, cam.hint ?? p.hint, cam.q || (cam.q = {}));
      cam.hint = q.index;
      if (q.wallH > 5) {
        const lim = q.width / 2 - 1.2;
        if (Math.abs(q.lateral) > lim) {
          const over = (Math.abs(q.lateral) - lim) * Math.sign(q.lateral);
          camera.position.x -= q.rx * over;
          camera.position.z -= q.rz * over;
        }
      }
      if (camera.position.y < q.y + 1.5) camera.position.y = q.y + 1.5;
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5 + Math.sin(race.time * 41) * sf * 0.03;
      tmpV.set(p.pos.x - bx * 12, p.pos.y + 1.2, p.pos.z - bz * 12);
      camera.lookAt(tmpV);
      camera.rotateZ(-p.bank * 0.15);
      cam.fov = damp(cam.fov, 70 + sf * 20 + (p.boost ? 9 : 0), 3, dt);
    }
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }

  // vignette
  const u = vignette.material.uniforms;
  const dmg = race.flashDamage || 0;
  if (isXR()) {
    const turn = settings.vignette ? clamp(Math.abs(p.bank) * 1.4 + (p.scraping > 0.5 ? 0.3 : 0), 0, 1) * clamp(spd / 80, 0, 1) : 0;
    const s = Math.max(turn * 0.95, dmg * 0.8);
    const inner = Math.tan(THREE.MathUtils.degToRad(58 - 28 * turn));
    u.uInner.value = inner;
    u.uOuter.value = inner + 0.55;
    u.uStrength.value = s;
    u.uColor.value.setRGB(dmg > turn ? 0.6 : 0, 0, 0);
  } else {
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const corner = Math.hypot(tv * camera.aspect, tv);
    u.uInner.value = corner * 0.55;
    u.uOuter.value = corner * 1.02;
    u.uStrength.value = clamp(sf * 0.35 + (p.boost ? 0.15 : 0) + dmg * 0.9, 0, 1);
    u.uColor.value.setRGB(dmg > 0.05 ? 0.55 : 0.12, dmg > 0.05 ? 0.02 : 0.06, 0.02);
  }
}

// ------------------------------------------------------------------ boucle principale
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const session = renderer.xr.getSession();
  const inp = input.poll(dt, session);
  try {
    if (mode === 'menu') {
      updateMenu(dt);
    } else if (mode === 'race') {
      if (inp.pause) pauseGame();
      else {
        if (inp.camera && !isXR()) {
          camMode = camMode === 'chase' ? 'cockpit' : 'chase';
          settings.camera = camMode;
          saveSettings(settings);
          applyCameraMode(true);
        }
        race.update(dt, inp);
        if (race.state === 'finished') showResults();
      }
    } else if (mode === 'paused') {
      if (isXR()) {
        if (inp.confirm) resumeGame();
        else if (inp.cycle) beginRace();
        else if (inp.back) goMenu();
      } else if (inp.pause) resumeGame();
    } else if (mode === 'results') {
      if (race) race.update(dt, inp);
      if (inp.confirm) beginRace();
      else if (inp.back) goMenu();
    }

    if (race) {
      updateCamera(dt);
      const p = race.player;
      camera.getWorldPosition(listener.pos);
      camera.getWorldDirection(listener.fwd);
      listener.vel.copy(p.vel);
      renderer.getDrawingBufferSize(bufSize);
      effects.setPixelScale(bufSize.y / 2);
      effects.update(dt, listener.pos, p.vel, Math.abs(p.speed), p.boost, p.groundY);
      audio.update(dt, listener, p, race.racers.filter((r) => !r.isPlayer), mode === 'paused');
      if (!isXR()) {
        hud.update(dt, race, input.source);
        $('hud-flash').style.opacity = clamp((race.flashDamage || 0) * 1.4, 0, 1);
      }
      cockpitHud.update(dt, race, input.source);
    } else {
      renderer.getDrawingBufferSize(bufSize);
      effects.setPixelScale(bufSize.y / 2);
      effects.update(dt, camera.position, tmpV3.set(0, 0, 0), 0, false, 0);
    }
    env.update(camera);
  } catch (e) {
    showError(e);
    renderer.setAnimationLoop(null);
    return;
  }
  renderer.render(scene, camera);
}

// petit accès de débogage
window.__pod = {
  get race() { return race; }, get track() { return track; }, scene, camera, renderer, settings,
  beginRace: () => { audio.init(); beginRace(); }, goMenu: () => goMenu(),
  // simulation accélérée sans rendu (tests) : inp = 'auto' -> pilote automatique
  sim(sec, inp = 'auto', cruise = 400) {
    const base = { throttle: 1, brake: 0, steer: 0, boost: false, repair: false, cycle: false, camera: false, pause: false, reset: false };
    for (let t = 0; t < sec; t += 1 / 60) {
      let i = inp;
      if (inp === 'auto') { i = race.player.autopilotInput(track, cruise, race); i.repair = race.player.damage.anyProblem() && race.player.damage.health.hull < 60; }
      race.update(1 / 60, { ...base, ...i });
      if (race.state === 'finished') break;
    }
  },
};

init().catch(showError);
