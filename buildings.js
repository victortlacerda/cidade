import * as THREE from 'three';
import './style.css';
import { ZONE_POS, ZONE_INFO, TOUR_ORDER, PLOT } from '../config.js';
import { H } from '../scene/terrain.js';
import catalogo from '../data/catalogo.json';

const SVG = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  mark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2a2200" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/></svg>',
};

export function initUI({ engine, controls, dn }) {
  const zonas = Object.fromEntries(catalogo.map((z) => [z.id, z]));
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tilt top"></div><div class="tilt bottom"></div>
    <div id="labels"></div>
    <header class="bar">
      <div class="brand"><div class="mark">${SVG.mark}</div><div><b>Cidade Geotécnica</b><small>Protótipo da cidade · nome provisório</small></div></div>
      <div class="spacer"></div>
      <div class="seg" role="group" aria-label="Modo de navegação">
        <button id="m-ex" aria-pressed="true">Explorar</button><button id="m-tour" aria-pressed="false">Tour guiado</button>
      </div>
      <div class="tools">
        <button class="ico" id="b-night" aria-label="Alternar dia e noite" title="Dia / noite">${SVG.moon}</button>
        <button class="ico" id="b-home" aria-label="Voltar à visão geral" title="Visão geral">${SVG.home}</button>
      </div>
    </header>
    <aside class="panel" id="panel" aria-live="polite"></aside>
    <section class="tour" id="tour"><div class="card" id="t-card"></div><div class="steps" id="t-steps"></div></section>
    <div class="hint" id="hint"><kbd>Arrastar</kbd> mover · <kbd>Botão direito</kbd> girar · <kbd>Roda</kbd> zoom · <kbd>W A S D</kbd> / <kbd>Q E</kbd></div>
    <div class="loading" id="loading">Construindo a cidade…</div>`);
  const $ = (id) => document.getElementById(id);

  // ---------- rótulos ----------
  const anchors = {}, labels = {};
  for (const id of TOUR_ORDER) {
    const [cx, cz] = ZONE_POS[id];
    anchors[id] = new THREE.Vector3(cx, Math.max(13, H(cx, cz) + 11), cz + (id === 'A' || id === 'F' || id === 'H' || id === 'D' ? 4 : 0));
    const b = document.createElement('button');
    b.className = 'zl'; b.setAttribute('aria-label', `Zona ${id}, ${zonas[id].nome}`);
    b.innerHTML = `<span class="L">${id}</span><span class="n">${zonas[id].nome.replace(' e disposição de rejeitos', ' e rejeitos')}</span>`;
    b.addEventListener('click', () => selectZone(id));
    b.addEventListener('pointerenter', () => setHover(id));
    b.addEventListener('pointerleave', () => setHover(null));
    $('labels').appendChild(b); labels[id] = b;
  }

  // ---------- realce no chão ----------
  const rings = {};
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2b705, transparent: true, opacity: 0.0, depthWrite: false });
  for (const id of TOUR_ORDER) {
    const [cx, cz] = ZONE_POS[id];
    const g = new THREE.Group();
    const t = 0.9, y = 0.5;
    const mk = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), ringMat); m.position.set(x, y, z); g.add(m); };
    mk(PLOT.w + 1.6, t, cx, cz - PLOT.d / 2); mk(PLOT.w + 1.6, t, cx, cz + PLOT.d / 2);
    mk(t, PLOT.d, cx - PLOT.w / 2, cz); mk(t, PLOT.d, cx + PLOT.w / 2, cz);
    g.visible = false; engine.scene.add(g); rings[id] = g;
  }

  let hover = null, selected = null, tourOn = false, tourIdx = 0;
  function zoneAt(x, z) {
    for (const id of TOUR_ORDER) {
      const [cx, cz] = ZONE_POS[id];
      if (Math.abs(x - cx) <= PLOT.w / 2 + 2 && Math.abs(z - cz) <= PLOT.d / 2 + 2) return id;
    }
    return null;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const r = engine.renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, engine.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let t = 0; const step = 1.2;
    for (let i = 0; i < 1100; i++, t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > 116 || Math.abs(z) > 71) { if (y < 0) return null; continue; }
      if (y < H(x, z)) return zoneAt(x, z);
    }
    return null;
  }
  function setHover(id) {
    hover = id;
    for (const k of TOUR_ORDER) labels[k].classList.toggle('hot', k === id);
    engine.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
  }
  controls.on('move', (e) => { if (e.buttons === 0 && e.pointerType === 'mouse') setHover(pick(e)); });

  // ---------- painel ----------
  const panel = $('panel');
  function renderPanel(id) {
    const z = zonas[id];
    const rows = z.obras.map((o) => {
      const fen = /\(fenômeno\)/.test(o.nome);
      const nome = o.nome.replace(' (fenômeno)', '');
      return `<li><code>${o.id}</code><span class="nm">${nome}</span><span>${fen ? '<span class="chip">fenômeno</span> ' : ''}${o.p === 1 ? '<span class="chip p1">agora</span>' : ''}</span></li>`;
    }).join('');
    panel.innerHTML = `
      <header><div class="L">${id}</div><div><h2>${z.nome}</h2><p class="sub">Zona ${id} · ${z.obras.length} obras</p></div>
      <button class="x" aria-label="Fechar painel">${SVG.x}</button></header>
      <p class="d">${ZONE_INFO[id].curta}</p>
      <h3>Obras do catálogo</h3><ul>${rows}</ul>
      <footer>O repositório de estudo (links, vídeos, arquivos) desta zona entra numa fase seguinte do roadmap.<button id="p-back">Voltar à cidade</button></footer>`;
    panel.querySelector('.x').addEventListener('click', clearSelection);
    panel.querySelector('#p-back').addEventListener('click', clearSelection);
  }

  function frame(id) {
    const [cx, cz] = ZONE_POS[id];
    const ty = id === 'D' ? -2 : id === 'A' || id === 'H' || id === 'F' ? 4 : 1;
    controls.flyTo({ tx: cx, ty, tz: cz + 2, yaw: 0.42, pitch: 0.82, dist: 118 });
  }
  function highlight(id) {
    for (const k of TOUR_ORDER) {
      rings[k].visible = k === id;
      labels[k].classList.toggle('dim', !!id && k !== id);
    }
    ringMat.opacity = id ? 0.85 : 0;
  }
  function selectZone(id) {
    selected = id;
    highlight(id); frame(id);
    if (!tourOn) { renderPanel(id); panel.classList.add('open'); }
    $('hint').classList.add('gone');
  }
  function clearSelection() {
    selected = null; highlight(null); panel.classList.remove('open');
    if (!tourOn) controls.home();
  }
  controls.on('click', (e) => { const id = pick(e); if (id) selectZone(id); else if (selected && !tourOn) clearSelection(); });

  // ---------- tour ----------
  function renderTour() {
    const id = TOUR_ORDER[tourIdx], z = zonas[id];
    $('t-card').innerHTML = `<div class="k">Passo ${tourIdx + 1} de ${TOUR_ORDER.length} · Zona ${id}</div><h2>${z.nome}</h2><p>${ZONE_INFO[id].curta}</p>`;
    $('t-steps').innerHTML = `<button class="nav" id="t-prev" aria-label="Anterior">‹</button>` +
      TOUR_ORDER.map((k, i) => `<button data-i="${i}" ${i === tourIdx ? 'aria-current="step"' : ''} aria-label="Zona ${k}, ${zonas[k].nome}">${i + 1}</button>`).join('') +
      `<button class="nav" id="t-next" aria-label="Próximo">›</button>`;
    $('t-prev').onclick = () => goTour(tourIdx - 1); $('t-next').onclick = () => goTour(tourIdx + 1);
    $('t-steps').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => goTour(+b.dataset.i)));
  }
  function goTour(i) {
    tourIdx = (i + TOUR_ORDER.length) % TOUR_ORDER.length;
    renderTour(); selected = TOUR_ORDER[tourIdx]; highlight(selected); frame(selected);
  }
  function setMode(tour) {
    tourOn = tour;
    $('m-ex').setAttribute('aria-pressed', String(!tour)); $('m-tour').setAttribute('aria-pressed', String(tour));
    $('tour').classList.toggle('open', tour);
    panel.classList.remove('open');
    $('hint').classList.toggle('gone', tour || !!selected);
    if (tour) goTour(0); else { selected = null; highlight(null); controls.home(); }
  }
  $('m-ex').onclick = () => setMode(false); $('m-tour').onclick = () => setMode(true);
  $('b-home').onclick = () => { if (tourOn) setMode(false); else clearSelection(); controls.home(); };
  $('b-night').onclick = () => {
    const n = !dn.isNight(); dn.setNight(n);
    $('b-night').innerHTML = n ? SVG.sun : SVG.moon;
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (tourOn) setMode(false); else if (selected) clearSelection(); }
    if (tourOn && (e.key === ']' || e.key === 'Enter')) goTour(tourIdx + 1);
  });

  // ---------- posição dos rótulos ----------
  const v = new THREE.Vector3();
  engine.onUpdate((dt, t) => {
    const w = innerWidth, h = innerHeight;
    for (const id of TOUR_ORDER) {
      v.copy(anchors[id]).project(engine.camera);
      const el = labels[id];
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('off', behind || x < -60 || x > w + 60 || y < -40 || y > h + 40);
    }
    if (selected && rings[selected]) ringMat.opacity = 0.55 + 0.3 * Math.sin(t * 3);
  });
  setHover(null);
  requestAnimationFrame(() => setTimeout(() => $('loading').classList.add('done'), 400));
}
