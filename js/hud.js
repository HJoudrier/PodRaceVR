// Interfaces de course : HUD HTML (écran) et HUD intégré au cockpit (VR et vue cockpit).
import * as THREE from 'three';
import { SYSTEMS, SYSTEM_LABELS, SYSTEM_SHORT } from './damage.js';
import { formatTime, clamp } from './util.js';

const $ = (id) => document.getElementById(id);

function healthColor(h) {
  if (h > 60) return '#5fd35a';
  if (h > 30) return '#f2c14e';
  return '#e8452c';
}

function repairKeyName(source) {
  if (source === 'xr') return 'X';
  if (source === 'touch') return '🔧';
  if (source === 'gamepad') return 'X';
  return 'R';
}

export class Hud {
  constructor(track) {
    this.track = track;
    this.root = $('hud');
    this.el = {
      pos: $('hud-pos'), posCount: $('hud-poscount'), lap: $('hud-lap'), time: $('hud-time'),
      lapTime: $('hud-laptime'), best: $('hud-best'), speed: $('hud-speed'), speedBar: $('hud-speedbar'),
      heat: $('hud-heat'), boost: $('hud-boost'), damage: $('hud-damage'), repair: $('hud-repair'),
      msg: $('hud-msg'), msgSub: $('hud-msgsub'), alert: $('hud-alert'), wrong: $('hud-wrongway'), map: $('hud-map'),
    };
    this.rows = {};
    this.el.damage.innerHTML = '';
    for (const k of SYSTEMS) {
      const row = document.createElement('div');
      row.className = 'dmg-row';
      row.innerHTML = `<span class="dmg-sel">▶</span><span class="dmg-name"><span class="dmg-long">${SYSTEM_LABELS[k]}</span><span class="dmg-short">${SYSTEM_SHORT[k]}</span></span><span class="dmg-bar"><span class="dmg-fill"></span></span><span class="dmg-state"></span>`;
      this.el.damage.appendChild(row);
      this.rows[k] = { row, fill: row.querySelector('.dmg-fill'), state: row.querySelector('.dmg-state') };
    }
    this.msgTimer = 0;
    this.alertTimer = 0;
    this.mapTimer = 0;
    this.buildMapPath();
  }

  setTrack(track) {
    this.track = track;
    this.buildMapPath();
  }

  buildMapPath() {
    const t = this.track;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < t.N; i++) {
      minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
      minZ = Math.min(minZ, t.pz[i]); maxZ = Math.max(maxZ, t.pz[i]);
    }
    this.mapBounds = { minX, maxX, minZ, maxZ };
  }

  mapXY(x, z, size, pad) {
    const b = this.mapBounds;
    const sc = (size - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const ox = (size - (b.maxX - b.minX) * sc) / 2, oz = (size - (b.maxZ - b.minZ) * sc) / 2;
    return [ox + (x - b.minX) * sc, oz + (z - b.minZ) * sc];
  }

  drawMap(ctx, size, race, pad = 14) {
    const t = this.track;
    ctx.clearRect(0, 0, size, size);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= t.N; i += 6) {
      const k = i % t.N;
      const [x, y] = this.mapXY(t.px[k], t.pz[k], size, pad);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(40,20,8,0.85)';
    ctx.lineWidth = size / 22;
    ctx.stroke();
    ctx.strokeStyle = '#f0d29b';
    ctx.lineWidth = size / 45;
    ctx.stroke();
    // canyons en ocre foncé
    ctx.strokeStyle = '#b5653a';
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < t.N; i += 6) {
      const [x, y] = this.mapXY(t.px[i], t.pz[i], size, pad);
      if (t.wallH[i] > 8) { if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y); } else on = false;
    }
    ctx.stroke();
    const [sx, sy] = this.mapXY(t.px[0], t.pz[0], size, pad);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - size / 40, sy - 2, size / 20, 4);
    if (!race) return;
    for (const r of race.racers) {
      if (r.isPlayer) continue;
      const [x, y] = this.mapXY(r.pos.x, r.pos.z, size, pad);
      ctx.fillStyle = '#' + r.podDef.look.c1.toString(16).padStart(6, '0');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, size / 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const p = race.player;
    const [x, y] = this.mapXY(p.pos.x, p.pos.z, size, pad);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d0302a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, size / 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  message(text, sub = '', dur = 1.5, cls = '') {
    this.el.msg.textContent = text;
    this.el.msgSub.textContent = sub;
    this.el.msg.className = 'show ' + cls;
    this.el.msgSub.className = sub ? 'show' : '';
    this.msgTimer = dur;
  }

  alert(text) {
    this.el.alert.textContent = text;
    this.el.alert.classList.add('show');
    this.alertTimer = 2.6;
  }

  update(dt, race, inputSource) {
    const p = race.player;
    const e = this.el;
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) { e.msg.className = ''; e.msgSub.className = ''; }
    }
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) e.alert.classList.remove('show');
    }
    e.pos.textContent = p.place;
    e.posCount.textContent = '/' + race.racers.length;
    e.lap.textContent = `TOUR ${race.displayLap(p)}/${race.laps}`;
    e.time.textContent = formatTime(race.state === 'countdown' ? 0 : p.finished ? p.finishTime : race.time);
    e.lapTime.textContent = 'Tour : ' + formatTime(race.state === 'countdown' ? 0 : (p.finished ? p.lapTimes[p.lapTimes.length - 1] : race.time - p.lapStart));
    e.best.textContent = 'Meilleur : ' + (isFinite(p.bestLap) ? formatTime(p.bestLap) : '--');
    const kmh = Math.round(Math.abs(p.speed) * 3.6);
    e.speed.textContent = kmh;
    e.speedBar.style.width = clamp(Math.abs(p.speed) / 240, 0, 1) * 100 + '%';
    e.speedBar.classList.toggle('boost', p.boost);
    const d = p.damage;
    e.heat.style.width = clamp(d.heat, 0, 100) + '%';
    e.heat.classList.toggle('hot', d.heat > 75);
    for (const k of SYSTEMS) {
      const r = this.rows[k];
      const h = d.health[k];
      r.fill.style.width = h + '%';
      r.fill.style.background = healthColor(h);
      let st = Math.round(h) + '%';
      if (d.fire[k]) st = 'FEU !';
      else if (k === 'steering' && d.jam !== 0) st = 'BLOQUÉE';
      else if (h <= 0) st = 'HS';
      r.state.textContent = st;
      r.row.classList.toggle('target', d.target === k);
      r.row.classList.toggle('repairing', d.target === k && d.repairing);
      r.row.classList.toggle('critical', !!d.fire[k] || (k === 'steering' && d.jam !== 0) || h < 30);
    }
    const urgent = d.anyProblem() || d.health.hull < 50;
    if (d.repairing) {
      e.repair.textContent = `🔧 Réparation : ${SYSTEM_LABELS[d.target]}…`;
      e.repair.className = 'show working';
    } else if (urgent && race.state !== 'countdown') {
      e.repair.textContent = `Maintenez ${repairKeyName(inputSource)} pour réparer : ${SYSTEM_LABELS[d.target]}`;
      e.repair.className = 'show';
    } else e.repair.className = '';
    e.wrong.classList.toggle('show', p.wrongWayTime > 1.2);

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 20;
      const ctx = e.map.getContext('2d');
      this.drawMap(ctx, e.map.width, race);
    }
  }
}

// ---------------------------------------------------------------- HUD 3D (cockpit / VR)
function makeCanvasPlane(w, h, cw, ch, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (opts.depthTest === false) mesh.renderOrder = 999;
  return { canvas, ctx: canvas.getContext('2d'), tex, mesh };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class CockpitHud {
  constructor(hud) {
    this.hud = hud;
    this.dash = makeCanvasPlane(0.82, 0.352, 1024, 440);
    this.dash.mesh.position.z = 0.012;
    this.msg = makeCanvasPlane(2.6, 0.65, 1024, 256, { depthTest: false });
    this.msg.mesh.position.set(0, 0.55, -3.6);
    this.msg.mesh.visible = false;
    this.panel = makeCanvasPlane(2.4, 1.5, 1024, 640, { depthTest: false });
    this.panel.mesh.position.set(0, 0.05, -2.7);
    this.panel.mesh.visible = false;
    this.timer = 0;
    this.vr = false; // messages flottants uniquement en VR (l'écran a son HUD HTML)
    this.msgTimer = 0;
    this.alertText = '';
    this.alertTimer = 0;
  }

  attach(dashAnchor, dolly) {
    dashAnchor.add(this.dash.mesh);
    dolly.add(this.msg.mesh);
    dolly.add(this.panel.mesh);
  }

  detach() {
    for (const o of [this.dash.mesh, this.msg.mesh, this.panel.mesh]) if (o.parent) o.parent.remove(o);
  }

  message(text, sub = '', dur = 1.5, color = '#ffd36b') {
    const { ctx, canvas, tex } = this.msg;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 130px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(40,15,5,0.9)';
    ctx.strokeText(text, 512, sub ? 100 : 128);
    ctx.fillStyle = color;
    ctx.fillText(text, 512, sub ? 100 : 128);
    if (sub) {
      ctx.font = '700 52px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeText(sub, 512, 205);
      ctx.fillStyle = '#fff';
      ctx.fillText(sub, 512, 205);
    }
    tex.needsUpdate = true;
    this.msg.mesh.visible = this.vr;
    this.msgTimer = dur;
  }

  alert(text) { this.alertText = text; this.alertTimer = 2.6; }

  showPanel(title, lines, footer) {
    const { ctx, canvas, tex } = this.panel;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 40);
    ctx.fillStyle = 'rgba(48,26,12,0.88)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#e8a04a';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd36b';
    ctx.font = '900 70px "Trebuchet MS", sans-serif';
    ctx.fillText(title, 512, 95);
    ctx.font = '600 38px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      ctx.fillStyle = l.highlight ? '#ffffff' : '#f0d9b5';
      if (l.highlight) { ctx.fillStyle = 'rgba(255,211,107,0.25)'; ctx.fillRect(40, 132 + i * 50, 944, 46); ctx.fillStyle = '#fff'; }
      ctx.fillText(l.left, 60, 168 + i * 50);
      ctx.textAlign = 'right';
      ctx.fillText(l.right || '', 964, 168 + i * 50);
      ctx.textAlign = 'left';
    });
    if (footer) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fe0ff';
      ctx.font = '700 40px "Trebuchet MS", sans-serif';
      ctx.fillText(footer, 512, 600);
    }
    tex.needsUpdate = true;
    this.panel.mesh.visible = this.vr;
  }

  hidePanel() { this.panel.mesh.visible = false; }

  update(dt, race, inputSource) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.mesh.visible = false;
    }
    if (this.alertTimer > 0) this.alertTimer -= dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / 10;
    this.drawDash(race, inputSource);
  }

  drawDash(race, inputSource) {
    const { ctx, canvas, tex } = this.dash;
    const p = race.player;
    const d = p.damage;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 4, 4, W - 8, H - 8, 30);
    ctx.fillStyle = 'rgba(18,14,10,0.92)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#c98a4a';
    ctx.stroke();

    // vitesse au centre
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const kmh = Math.round(Math.abs(p.speed) * 3.6);
    ctx.fillStyle = p.boost ? '#9fe0ff' : '#ffd36b';
    ctx.font = '900 118px "Trebuchet MS", sans-serif';
    ctx.fillText(kmh, 512, 128);
    ctx.font = '700 28px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#e8d2ad';
    ctx.fillText('KM/H', 512, 160);
    // barre de surchauffe
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(382, 176, 260, 14);
    ctx.fillStyle = d.heat > 75 ? '#ff5533' : '#ff9a3a';
    ctx.fillRect(382, 176, 260 * clamp(d.heat / 100, 0, 1), 14);
    ctx.font = '700 20px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#c9b08a';
    ctx.fillText('SURCHAUFFE', 512, 212);
    // position / tour / temps
    ctx.font = '900 62px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${p.place}/${race.racers.length}`, 512, 282);
    ctx.font = '700 30px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#e8d2ad';
    ctx.fillText(`TOUR ${race.displayLap(p)}/${race.laps}`, 512, 322);
    ctx.fillText(formatTime(p.finished ? p.finishTime : Math.max(0, race.time)), 512, 358);

    // systèmes à gauche
    ctx.textAlign = 'left';
    SYSTEMS.forEach((k, i) => {
      const y = 62 + i * 82;
      const h = d.health[k];
      const sel = d.target === k;
      if (sel) {
        ctx.fillStyle = d.repairing ? 'rgba(120,220,255,0.25)' : 'rgba(255,211,107,0.18)';
        ctx.fillRect(18, y - 34, 320, 70);
      }
      ctx.font = '700 28px "Trebuchet MS", sans-serif';
      ctx.fillStyle = sel ? '#fff' : '#d9c3a0';
      ctx.fillText((sel ? '▶ ' : '') + SYSTEM_SHORT[k], 28, y - 4);
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(28, y + 6, 220, 18);
      ctx.fillStyle = healthColor(h);
      ctx.fillRect(28, y + 6, 220 * h / 100, 18);
      let st = Math.round(h) + '%';
      const crit = d.fire[k] || (k === 'steering' && d.jam !== 0);
      if (d.fire[k]) st = 'FEU';
      else if (k === 'steering' && d.jam !== 0) st = 'BLOQ';
      ctx.fillStyle = crit ? (Math.floor(performance.now() / 250) % 2 ? '#ff4422' : '#ffd36b') : '#e8d2ad';
      ctx.font = '700 26px "Trebuchet MS", sans-serif';
      ctx.fillText(st, 258, y + 23);
    });

    // carte à droite
    const ms = 310;
    ctx.save();
    ctx.translate(W - ms - 30, (H - ms) / 2);
    this.hud.drawMap(ctx, ms, race, 10);
    ctx.restore();

    // bandeau d'alerte / réparation en bas
    ctx.textAlign = 'center';
    ctx.font = '800 30px "Trebuchet MS", sans-serif';
    const by = H - 26;
    if (this.alertTimer > 0) {
      ctx.fillStyle = Math.floor(performance.now() / 200) % 2 ? '#ff4422' : '#ffd36b';
      ctx.fillText(this.alertText, 512, by);
    } else if (d.repairing) {
      ctx.fillStyle = '#9fe0ff';
      ctx.fillText('🔧 RÉPARATION : ' + SYSTEM_LABELS[d.target].toUpperCase(), 512, by);
    } else if (d.anyProblem()) {
      ctx.fillStyle = '#ffb36b';
      ctx.fillText(`Maintenez ${repairKeyName(inputSource)} : réparer ${SYSTEM_LABELS[d.target].toLowerCase()}`, 512, by);
    }
    if (p.wrongWayTime > 1.2) {
      ctx.fillStyle = '#ff4422';
      ctx.font = '900 44px "Trebuchet MS", sans-serif';
      ctx.fillText('MAUVAIS SENS', 512, 60);
    }
    tex.needsUpdate = true;
  }
}
