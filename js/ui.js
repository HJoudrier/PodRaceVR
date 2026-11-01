// Hangar : sélection du podracer, atelier de réglage, options de course.
import { PODS, STAT_KEYS, STAT_LABELS, TUNING_MIN, TUNING_MAX, tuningPointsLeft, DIFFICULTY, BREAKDOWNS, RAIDERS } from './config.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const css = (c) => (typeof c === 'number' ? hex(c) : c);

const WEATHER_LABELS = {
  snow: 'Neige', rain: 'Pluie', ash: 'Cendres', embers: 'Braises', pollen: 'Pollen', fireflies: 'Lucioles',
  dust: 'Poussière', saltdust: 'Poudre de sel', spores: 'Spores',
};

// Petite vignette du circuit : ciel, sol et tracé vu de dessus (canyons en couleur de roche).
export function drawTrackPreview(canvas, pv) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const th = pv.theme;
  const groundCol = th.clouds ? th.clouds.color : th.elevated && th.water ? th.water.color : th.elevated ? th.ground.base : th.ground.base;
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, css(th.skyTop));
  grd.addColorStop(0.38, css(th.skyHorizon));
  grd.addColorStop(0.42, css(groundCol));
  grd.addColorStop(1, css(th.ground.dark || groundCol));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  if (th.planet) {
    ctx.fillStyle = css(th.planet.color);
    ctx.beginPath(); ctx.arc(W * 0.2, H * 0.17, H * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  (th.suns || []).forEach((s, k) => {
    ctx.fillStyle = css(s.color);
    ctx.beginPath(); ctx.arc(W * (0.82 - k * 0.09), H * (0.12 + k * 0.05), H * 0.05 * (s.size || 1), 0, Math.PI * 2); ctx.fill();
  });
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of pv.line) { minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u); minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v); }
  const sc = Math.min((W * 0.86) / (maxU - minU), (H * 0.8) / (maxV - minV));
  const X = (p) => W / 2 + (p.u - (minU + maxU) / 2) * sc;
  const Y = (p) => H * 0.55 + (p.v - (minV + maxV) / 2) * sc * 0.9;
  const path = () => {
    ctx.beginPath();
    pv.line.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = 'rgba(30,15,5,0.9)'; ctx.lineWidth = Math.max(4, W / 30); ctx.stroke();
  path(); ctx.strokeStyle = css(th.road.base); ctx.lineWidth = Math.max(2, W / 60); ctx.stroke();
  ctx.strokeStyle = css(th.strata[1]);
  ctx.lineWidth = Math.max(2, W / 60);
  ctx.beginPath();
  let on = false;
  pv.line.forEach((p) => {
    if (p.canyon) { if (!on) { ctx.moveTo(X(p), Y(p)); on = true; } else ctx.lineTo(X(p), Y(p)); } else on = false;
  });
  ctx.stroke();
  const s0 = pv.line[0];
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(s0), Y(s0), Math.max(3, W / 45), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function trackTags(pv) {
  const th = pv.theme, def = pv.def;
  const tags = [`${(pv.length / 1000).toFixed(1).replace('.', ',')} km`];
  let canyons = 0;
  const n = def.points.length;
  for (let i = 0; i < n; i++) if (def.points[i][4] > 0 && def.points[(i - 1 + n) % n][4] === 0) canyons++;
  if (canyons) tags.push(`${canyons} canyon${canyons > 1 ? 's' : ''}`);
  if (th.elevated) tags.push('Piste suspendue');
  if (th.water) tags.push(th.water.lava ? 'Lave' : 'Eau');
  if (th.clouds) tags.push('Nuages');
  const w = !th.weather ? [] : Array.isArray(th.weather) ? th.weather : [th.weather];
  for (const k of w) if (WEATHER_LABELS[k]) tags.push(WEATHER_LABELS[k]);
  if (th.traffic) tags.push('Trafic');
  return tags;
}

export class Menu {
  constructor(settings, handlers) {
    this.s = settings;
    this.h = handlers;
    this.buildPods();
    this.buildTuning();
    this.buildOptions();
    $('tune-reset').onclick = () => {
      for (const k of STAT_KEYS) this.s.tuning[k] = 0;
      this.refreshTuning();
      this.changed();
    };
    $('btn-start').onclick = () => this.h.onStart();
    $('btn-start2').onclick = () => this.h.onStart();
    $('btn-vr').onclick = () => this.h.onStartVR();
    $('btn-help').onclick = () => $('help').classList.remove('hidden');
    const openTracks = () => { this.buildTrackGrid(); $('tracks').classList.remove('hidden'); };
    $('btn-tracks').onclick = openTracks;
    $('track-current').onclick = openTracks;
    $('track-current').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') openTracks(); };
    $('tracks-close').onclick = () => $('tracks').classList.add('hidden');
    $('help-close').onclick = () => $('help').classList.add('hidden');
    this.refreshAll();
    this.refreshTrack();
  }

  changed() { this.h.onChange(this.s); }

  buildTrackGrid() {
    if (this.trackCards) { this.refreshTrack(); return; }
    const grid = $('track-grid');
    grid.innerHTML = '';
    this.trackCards = [];
    for (const t of this.h.tracks) {
      const pv = this.h.preview(t.id);
      const card = document.createElement('div');
      card.className = 'track-card';
      card.dataset.id = t.id;
      const cv = document.createElement('canvas');
      cv.width = 300; cv.height = 200;
      drawTrackPreview(cv, pv);
      card.appendChild(cv);
      const info = document.createElement('div');
      info.innerHTML = `<div class="tc-planet">${t.planet}</div><div class="tc-name">${t.name}</div><div class="tc-desc">${t.desc}</div>
        <div class="tc-tags">${trackTags(pv).map((x) => `<span>${x}</span>`).join('')}</div>`;
      card.appendChild(info);
      card.onclick = () => {
        $('tracks').classList.add('hidden');
        this.h.onTrack(t.id);
      };
      grid.appendChild(card);
      this.trackCards.push(card);
    }
    this.refreshTrack();
  }

  refreshTrack() {
    if (!this.h.preview) return;
    const id = this.s.trackId;
    const t = this.h.tracks.find((x) => x.id === id) || this.h.tracks[0];
    const pv = this.h.preview(t.id);
    drawTrackPreview($('track-mini'), pv);
    $('track-planet').textContent = t.planet;
    $('track-name').textContent = t.name;
    $('track-meta').textContent = trackTags(pv).join(' · ');
    $('menu-sub').textContent = `${t.planet} — ${t.name}`;
    if (this.trackCards) this.trackCards.forEach((c) => c.classList.toggle('sel', c.dataset.id === t.id));
  }

  show(v) { $('menu').classList.toggle('hidden', !v); }

  setVR(supported, note) {
    $('btn-vr').disabled = !supported;
    $('vr-note').textContent = note || '';
  }

  buildPods() {
    const list = $('pod-list');
    list.innerHTML = '';
    for (const p of PODS) {
      const card = document.createElement('div');
      card.className = 'pod-card';
      card.dataset.id = p.id;
      card.innerHTML = `<span class="pod-swatch" style="background:linear-gradient(135deg, ${hex(p.look.c1)} 55%, ${hex(p.look.c2)} 55%)"></span><span>${p.name}</span>`;
      card.onclick = () => {
        if (this.s.podId !== p.id) {
          this.s.podId = p.id;
          for (const k of STAT_KEYS) this.s.tuning[k] = 0;
        }
        this.refreshAll();
        this.changed();
      };
      list.appendChild(card);
    }
  }

  buildTuning() {
    const rows = $('tune-rows');
    rows.innerHTML = '';
    this.tuneEls = {};
    for (const k of STAT_KEYS) {
      const row = document.createElement('div');
      row.className = 'tune-row';
      row.innerHTML = `<span class="tune-label">${STAT_LABELS[k]}</span><span class="tune-bar">${'<span class="tune-seg"></span>'.repeat(10)}</span>
        <span class="tune-btns"><button data-d="-1" aria-label="moins">−</button><button data-d="1" aria-label="plus">+</button></span>`;
      row.querySelectorAll('button').forEach((b) => {
        b.onclick = () => this.tune(k, parseInt(b.dataset.d, 10));
      });
      rows.appendChild(row);
      this.tuneEls[k] = { segs: [...row.querySelectorAll('.tune-seg')], minus: row.querySelector('[data-d="-1"]'), plus: row.querySelector('[data-d="1"]') };
    }
  }

  tune(k, d) {
    const pod = PODS.find((p) => p.id === this.s.podId);
    const t = this.s.tuning;
    const nv = t[k] + d;
    if (nv < TUNING_MIN || nv > TUNING_MAX) return;
    const final = pod.base[k] + nv;
    if (final < 1 || final > 10) return;
    if (d > 0 && tuningPointsLeft(t) <= 0) return;
    t[k] = nv;
    this.refreshTuning();
    this.changed();
  }

  refreshTuning() {
    const pod = PODS.find((p) => p.id === this.s.podId);
    const t = this.s.tuning;
    const left = tuningPointsLeft(t);
    $('tune-points').textContent = `Points de réglage disponibles : ${left}`;
    for (const k of STAT_KEYS) {
      const el = this.tuneEls[k];
      const base = pod.base[k];
      const fin = Math.max(1, Math.min(10, base + t[k]));
      el.segs.forEach((seg, i) => {
        const n = i + 1;
        seg.className = 'tune-seg';
        if (n <= Math.min(base, fin)) seg.classList.add('base');
        else if (n <= fin) seg.classList.add('plus');
        else if (n <= base) seg.classList.add('minus');
      });
      el.minus.disabled = t[k] <= TUNING_MIN || fin <= 1;
      el.plus.disabled = t[k] >= TUNING_MAX || fin >= 10 || left <= 0;
    }
  }

  buildOptions() {
    const box = $('race-opts');
    box.innerHTML = '';
    const stepper = (label, key, min, max) => {
      const row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = `<span>${label}</span><span class="stepper"><button data-d="-1">−</button><span></span><button data-d="1">+</button></span>`;
      const val = row.querySelector('.stepper span');
      const upd = () => (val.textContent = this.s[key]);
      row.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          this.s[key] = Math.max(min, Math.min(max, this.s[key] + parseInt(b.dataset.d, 10)));
          upd();
          this.changed();
        };
      });
      upd();
      box.appendChild(row);
    };
    const seg = (label, key, options) => {
      const row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = `<span>${label}</span><span class="seg"></span>`;
      const segEl = row.querySelector('.seg');
      const btns = [];
      for (const [val, text] of options) {
        const b = document.createElement('button');
        b.textContent = text;
        b.onclick = () => {
          this.s[key] = val;
          btns.forEach((x) => x.classList.toggle('sel', x === b));
          this.changed();
        };
        b.classList.toggle('sel', this.s[key] === val);
        btns.push(b);
        segEl.appendChild(b);
      }
      box.appendChild(row);
    };
    const sep = (label) => {
      const d = document.createElement('div');
      d.className = 'opt-sep';
      d.textContent = label;
      box.appendChild(d);
    };
    stepper('Tours', 'laps', 1, 10);
    stepper('Adversaires', 'opponents', 1, 7);
    seg('Difficulté', 'difficulty', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]));
    seg('Avaries', 'breakdowns', Object.entries(BREAKDOWNS).map(([k, v]) => [k, v.label]));
    seg('Pillards', 'raiders', Object.entries(RAIDERS).map(([k, v]) => [k, v.label]));
    seg('Caméra', 'camera', [['chase', 'Poursuite'], ['cockpit', 'Cockpit']]);
    seg('Qualité', 'quality', [['auto', 'Auto'], ['basse', 'Basse'], ['moyenne', 'Moyenne'], ['haute', 'Haute']]);
    seg('Flou de vitesse', 'motionBlur', [['off', 'Aucun'], ['leger', 'Léger'], ['normal', 'Normal'], ['fort', 'Fort']]);
    const vol = document.createElement('div');
    vol.className = 'opt-row';
    vol.innerHTML = `<span>Volume</span><input type="range" min="0" max="1" step="0.05">`;
    const input = vol.querySelector('input');
    input.value = this.s.volume;
    input.oninput = () => { this.s.volume = parseFloat(input.value); this.changed(); };
    box.appendChild(vol);
    sep('Téléphone / tablette');
    seg('Tactile', 'touch', [['auto', 'Auto'], ['on', 'Activé'], ['off', 'Désactivé']]);
    seg('Direction', 'touchSteer', [['joystick', 'Joystick'], ['tilt', 'Inclinaison']]);
    seg('Accélérateur', 'autoThrottle', [[false, 'Bouton GAZ'], [true, 'Automatique']]);
    sep('Réalité virtuelle');
    seg('Contrôle VR', 'vrControl', [['standard', 'Standard'], ['leviers', 'Leviers']]);
    seg('Confort VR', 'vignette', [[true, 'Vignette'], [false, 'Aucun']]);
    seg('Fréquence VR', 'vrRate', [[72, '72 Hz'], [90, '90 Hz'], [120, '120 Hz']]);
  }

  refreshAll() {
    document.querySelectorAll('.pod-card').forEach((c) => c.classList.toggle('sel', c.dataset.id === this.s.podId));
    const pod = PODS.find((p) => p.id === this.s.podId);
    $('pod-desc').textContent = pod.desc;
    this.refreshTuning();
  }
}
