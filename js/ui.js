// Hangar : sélection du podracer, atelier de réglage, options de course.
import { PODS, STAT_KEYS, STAT_LABELS, TUNING_MIN, TUNING_MAX, tuningPointsLeft, DIFFICULTY, BREAKDOWNS, RAIDERS } from './config.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

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
    $('help-close').onclick = () => $('help').classList.add('hidden');
    this.refreshAll();
  }

  changed() { this.h.onChange(this.s); }

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
