"use strict";
/* ============ vue : projections ============ */

const PROJ_MAX = 360;        // mois projetés (30 ans) — borne du zoom
const PROJ_MINSPAN = 3;      // largeur minimale de la fenêtre (mois)
const PROJ_MAIN_H = 300, PROJ_BRUSH_H = 52;

let _projTableAll = false;
let _projView = { i0: 0, i1: 60 };   // fenêtre courante (indices dans la projection)

const PHASE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#64748b"];
const PROJ_MODES = [
  { value: "wealth", label: "Patrimoine" },
  { value: "balance", label: "Solde" },
  { value: "scenarios", label: "Scénarios" },
];
const RANGE_PRESETS = [
  { m: 6, l: "6 mois" }, { m: 12, l: "1 an" }, { m: 24, l: "2 ans" }, { m: 60, l: "5 ans" },
  { m: 120, l: "10 ans" }, { m: 240, l: "20 ans" }, { m: 359, l: "30 ans" },
];
const MARK_PRESETS = [
  { m: 3, l: "3 mois" }, { m: 6, l: "6 mois" }, { m: 12, l: "1 an" }, { m: 24, l: "2 ans" }, { m: 36, l: "3 ans" },
  { m: 60, l: "5 ans" }, { m: 120, l: "10 ans" }, { m: 240, l: "20 ans" }, { m: 359, l: "30 ans" },
];

function horizonLabel(m) { return m < 12 ? m + " mois" : (m / 12 % 1 === 0 ? m / 12 : (m / 12).toFixed(1)) + " an" + (m >= 24 ? "s" : ""); }

/* ---------- découpe en chapitres de vie ---------- */
function lifeChapters(b, proj) {
  const byIdx = {};
  for (const ev of b.events) {
    if (!ev.date) continue;
    const ix = proj.findIndex(r => r.ym === ymOf(ev.date));
    if (ix > 0 && ix < proj.length) (byIdx[ix] = byIdx[ix] || []).push(ev);
  }
  const cuts = Object.keys(byIdx).map(Number).sort((a, z) => a - z);
  const phases = [];
  let prevIdx = 0, prevEv = null;
  const push = (s, e, ev) => phases.push({ startIdx: s, endIdx: e, ev, color: PHASE_COLORS[phases.length % PHASE_COLORS.length] });
  for (const ix of cuts) { push(prevIdx, ix, prevEv); prevIdx = ix; prevEv = byIdx[ix][0]; }
  push(prevIdx, proj.length - 1, prevEv);

  for (const p of phases) {
    const last = p === phases[phases.length - 1];
    const hi = last ? p.endIdx : p.endIdx - 1;
    let netSum = 0, cnt = 0;
    for (let i = p.startIdx; i <= hi; i++) { netSum += proj[i].net; cnt++; }
    p.months = Math.max(1, p.endIdx - p.startIdx);
    p.avgNet = cnt ? netSum / cnt : 0;
    p.nwEnd = proj[p.endIdx].netWorth;
    p.nwDelta = proj[p.endIdx].netWorth - proj[p.startIdx].netWorth;
    p.startYm = proj[p.startIdx].ym;
    p.endYm = proj[p.endIdx].ym;
    p.name = p.ev ? `${p.ev.emoji || "📌"} ${p.ev.name}` : "Situation actuelle";
  }
  return phases;
}

/* ---------- préparation des données du graphe ---------- */
function buildChartData(b, proj, mode, cur, phasesFull) {
  const data = {
    ym: proj.map(r => r.ym),
    markers: proj.flatMap((r, i) => r.events.map(e => ({ idx: i, label: e.name, emoji: e.emoji }))),
    phases: phasesFull.map(p => ({ startIdx: p.startIdx, endIdx: p.endIdx, color: p.color })),
    overview: proj.map(r => r.netWorth),
    cur, mode,
  };
  if (mode === "wealth") {
    data.up = [
      { name: "Solde courant", color: "#10b981", values: proj.map(r => Math.max(0, r.balance)) },
      { name: "Comptes épargne", color: "#0ea5e9", values: proj.map(r => r.savingsTotal) },
      { name: "Objectifs", color: "#8b5cf6", values: proj.map(r => r.goalsTotal) },
    ];
    data.down = [{ name: "Dettes", color: "#ef4444", values: proj.map(r => -r.debtBalance) }];
    if (proj.some(r => r.balance < 0))
      data.down.push({ name: "Découvert", color: "#f97316", values: proj.map(r => Math.min(0, r.balance)) });
    data.line = { name: "Patrimoine net", color: "var(--tx)", values: proj.map(r => r.netWorth) };
  } else if (mode === "balance") {
    data.series = [
      { name: "Solde courant", color: "#10b981", values: proj.map(r => r.balance), fill: true },
      { name: "Patrimoine net", color: "#8b5cf6", values: proj.map(r => r.netWorth), dash: true },
    ];
  } else {
    const expn = project(b, { months: PROJ_MAX, scenarioMode: "expected" });
    const opt = project(b, { months: PROJ_MAX, scenarioMode: "optimistic" });
    const pess = project(b, { months: PROJ_MAX, scenarioMode: "pessimistic" });
    data.line = { name: "Attendu", color: "#8b5cf6", values: expn.map(r => r.netWorth) };
    data.band = {
      lo: expn.map((r, i) => Math.min(r.netWorth, opt[i].netWorth, pess[i].netWorth)),
      hi: expn.map((r, i) => Math.max(r.netWorth, opt[i].netWorth, pess[i].netWorth)),
    };
    data.overview = expn.map(r => r.netWorth);
  }
  return data;
}

/* ---------- SVG du graphe principal (tranche [i0..i1], Y auto-échelle) ---------- */
function projMainSvg(W, H, win, data, mode, hidden, cur) {
  const i0 = win.i0, i1 = win.i1, n = i1 - i0 + 1;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const plot = { left: 56, top: 16, w: Math.max(10, W - 56 - 14), h: H - 16 - 30 };
  const X = k => plot.left + (n === 1 ? plot.w / 2 : k / (n - 1) * plot.w);

  const up = mode === "wealth" ? data.up.filter(s => !hidden.has(s.name)) : [];
  const down = mode === "wealth" ? data.down.filter(s => !hidden.has(s.name)) : [];
  const lineOn = mode !== "balance" && data.line && !hidden.has(data.line.name);

  const vals = [0];
  if (mode === "wealth") {
    for (let k = 0; k < n; k++) {
      let u = 0, d = 0;
      for (const s of up) u += Math.max(0, s.values[i0 + k] || 0);
      for (const s of down) d += Math.min(0, s.values[i0 + k] || 0);
      vals.push(u, d);
    }
    if (lineOn) for (let k = 0; k < n; k++) vals.push(data.line.values[i0 + k]);
  } else if (mode === "balance") {
    for (const s of data.series) for (let k = 0; k < n; k++) vals.push(s.values[i0 + k]);
  } else {
    for (let k = 0; k < n; k++) vals.push(data.band.lo[i0 + k], data.band.hi[i0 + k], data.line.values[i0 + k]);
  }
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) max = min + 1;
  const pad = (max - min) * 0.06; max += pad; if (min < 0) min -= pad;
  const ticks = niceTicks(min, max, 5);
  min = Math.min(min, ticks[0]); max = Math.max(max, ticks[ticks.length - 1]);
  const Y = v => plot.top + (1 - (v - min) / (max - min)) * plot.h;

  // bandes de chapitres (découpées à la fenêtre)
  for (const p of data.phases) {
    const a = p.startIdx - i0, b2 = p.endIdx - i0;
    if (b2 < 0 || a > n - 1) continue;
    const xa = X(Math.max(0, a)), xb = X(Math.min(n - 1, b2));
    svg.append(svgEl("rect", { x: xa, y: plot.top, width: Math.max(0, xb - xa), height: plot.h, fill: p.color, opacity: 0.05 }));
    if (a > 0 && a < n) svg.append(svgEl("line", { x1: X(a), x2: X(a), y1: plot.top, y2: plot.top + plot.h, stroke: p.color, "stroke-width": 1, "stroke-dasharray": "3 3", "stroke-opacity": 0.45 }));
  }
  for (const t of ticks) {
    svg.append(svgEl("line", { x1: plot.left, x2: plot.left + plot.w, y1: Y(t), y2: Y(t), stroke: t === 0 ? "var(--tx3)" : "var(--chart-grid)", "stroke-width": 1 }));
    const lb = svgEl("text", { x: plot.left - 7, y: Y(t) + 3.5, "text-anchor": "end", "font-size": 10.5, fill: "var(--tx3)" });
    lb.textContent = fmtAxis(t, cur); svg.append(lb);
  }
  const stepX = Math.max(1, Math.ceil(n / (W / 82)));
  for (const k of labelIdxs(n, stepX)) {
    const t = svgEl("text", { x: X(k), y: H - 9, "text-anchor": "middle", "font-size": 10.5, fill: "var(--tx3)" });
    t.textContent = fmtYmShort(data.ym[i0 + k]); svg.append(t);
  }

  const drawMk = () => {
    for (const m of data.markers) {
      const k = m.idx - i0; if (k < 0 || k > n - 1) continue;
      const x = X(k);
      svg.append(svgEl("line", { x1: x, x2: x, y1: plot.top, y2: plot.top + plot.h, stroke: "var(--violet)", "stroke-width": 1.2, "stroke-dasharray": "2 3", "stroke-opacity": 0.7, class: "j-fade" }));
      const t = svgEl("text", { x, y: plot.top + 9, "text-anchor": "middle", "font-size": 11, class: "j-fade" });
      t.textContent = m.emoji || "📌"; svg.append(t);
    }
  };

  const dots = [];
  if (mode === "wealth") {
    const ribbon = (series, sign) => {
      const cur2 = new Array(n).fill(0);
      for (const s of series) {
        const top = [], bot = [];
        for (let k = 0; k < n; k++) {
          const v = sign > 0 ? Math.max(0, s.values[i0 + k] || 0) : Math.min(0, s.values[i0 + k] || 0);
          bot[k] = cur2[k]; top[k] = cur2[k] + v; cur2[k] = top[k];
        }
        const d = "M" + top.map((v, k) => `${X(k)},${Y(v)}`).join(" L") + " L" + bot.map((v, k) => `${X(k)},${Y(v)}`).reverse().join(" L") + " Z";
        svg.append(svgEl("path", { d, fill: s.color, "fill-opacity": sign > 0 ? 0.82 : 0.6, class: "j-area" }));
      }
    };
    ribbon(up, 1); ribbon(down, -1); drawMk();
    if (lineOn) {
      const pts = []; for (let k = 0; k < n; k++) pts.push(`${X(k)},${Y(data.line.values[i0 + k])}`);
      svg.append(svgEl("path", { d: "M" + pts.join(" L"), fill: "none", stroke: data.line.color, "stroke-width": 2.4, "stroke-linejoin": "round", pathLength: 1, class: "j-line" }));
      dots.push({ color: data.line.color, arr: data.line.values });
    }
  } else if (mode === "balance") {
    drawMk();
    for (const s of data.series) {
      const pts = []; for (let k = 0; k < n; k++) pts.push(`${X(k)},${Y(s.values[i0 + k])}`);
      if (s.fill) svg.append(svgEl("path", { d: `M${X(0)},${Y(Math.max(min, 0))} L` + pts.join(" L") + ` L${X(n - 1)},${Y(Math.max(min, 0))} Z`, fill: s.color, "fill-opacity": 0.1, class: "j-area" }));
      const a = { d: "M" + pts.join(" L"), fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round" };
      if (s.dash) { a["stroke-dasharray"] = "5 4"; a.class = "j-fade"; } else { a.pathLength = 1; a.class = "j-line"; }
      svg.append(svgEl("path", a));
      dots.push({ color: s.color, arr: s.values });
    }
  } else {
    const hiP = [], loP = [];
    for (let k = 0; k < n; k++) { hiP.push(`${X(k)},${Y(data.band.hi[i0 + k])}`); loP.push(`${X(k)},${Y(data.band.lo[i0 + k])}`); }
    svg.append(svgEl("path", { d: "M" + hiP.join(" L") + " L" + loP.reverse().join(" L") + " Z", fill: "var(--violet)", "fill-opacity": 0.14, class: "j-area" }));
    drawMk();
    const pts = []; for (let k = 0; k < n; k++) pts.push(`${X(k)},${Y(data.line.values[i0 + k])}`);
    svg.append(svgEl("path", { d: "M" + pts.join(" L"), fill: "none", stroke: data.line.color, "stroke-width": 2.4, pathLength: 1, class: "j-line" }));
    dots.push({ color: data.line.color, arr: data.line.values });
  }

  const guide = svgEl("line", { y1: plot.top, y2: plot.top + plot.h, stroke: "var(--tx3)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 });
  svg.append(guide);
  const dotEls = dots.map(d => { const c = svgEl("circle", { r: 4, fill: d.color, stroke: "var(--panel)", "stroke-width": 1.5, opacity: 0, class: "chart-dot" }); svg.append(c); return c; });

  svg._geom = { plot, n, i0, X, Y, guide, dots, dotEls, tipHtml: k => projTip(k, win, data, mode, hidden, cur) };
  return svg;
}

function projTip(k, win, data, mode, hidden, cur) {
  const abs = win.i0 + k;
  const row = (c, name, v) => `<div class="t-row"><span style="color:${c}">●</span><span>${esc(name)}</span><b>${fmtMoney(Math.abs(v), cur)}</b></div>`;
  let html = `<div class="t-title">${esc(fmtYm(data.ym[abs]))}</div>`;
  if (mode === "wealth") {
    for (const s of data.up) if (!hidden.has(s.name) && (s.values[abs] || 0) > 0.5) html += row(s.color, s.name, s.values[abs]);
    for (const s of data.down) if (!hidden.has(s.name) && (s.values[abs] || 0) < -0.5) html += row(s.color, s.name, s.values[abs]);
    if (!hidden.has(data.line.name)) html += `<div class="t-row" style="border-top:1px solid rgba(255,255,255,.16); margin-top:3px; padding-top:4px"><span style="color:${data.line.color}">●</span><span>${esc(data.line.name)}</span><b>${fmtMoney(data.line.values[abs], cur)}</b></div>`;
  } else if (mode === "balance") {
    for (const s of data.series) html += row(s.color, s.name, s.values[abs]);
  } else {
    html += row(data.line.color, "Attendu", data.line.values[abs]);
    html += `<div class="t-row"><span></span><span>Fourchette</span><b>${fmtMoney(data.band.lo[abs], cur, { dec: 0 })} – ${fmtMoney(data.band.hi[abs], cur, { dec: 0 })}</b></div>`;
  }
  for (const m of data.markers.filter(m => m.idx === abs)) html += `<div class="t-row">${m.emoji || "📌"} ${esc(m.label)}</div>`;
  return html;
}

/* ---------- mini-aperçu + sélecteur (brush) ---------- */
function projBrushSvg(W, H, win, data) {
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const plot = { left: 8, top: 8, w: Math.max(10, W - 16), h: H - 16 };
  const arr = data.overview, n = arr.length;
  let mn = Math.min(0, ...arr), mx = Math.max(0, ...arr); if (mn === mx) mx = mn + 1;
  const X = i => plot.left + i / (n - 1) * plot.w, Y = v => plot.top + (1 - (v - mn) / (mx - mn)) * plot.h;
  const pts = arr.map((v, i) => `${X(i)},${Y(v)}`);
  svg.append(svgEl("path", { d: `M${X(0)},${Y(Math.max(mn, 0))} L` + pts.join(" L") + ` L${X(n - 1)},${Y(Math.max(mn, 0))} Z`, fill: "var(--violet)", "fill-opacity": 0.12 }));
  svg.append(svgEl("path", { d: "M" + pts.join(" L"), fill: "none", stroke: "var(--violet)", "stroke-width": 1.3, "stroke-opacity": 0.7 }));
  const xa = X(win.i0), xb = X(win.i1), cy = plot.top + plot.h / 2;
  // extérieur estompé
  svg.append(svgEl("rect", { x: plot.left, y: plot.top, width: Math.max(0, xa - plot.left), height: plot.h, rx: 5, fill: "var(--panel)", "fill-opacity": 0.66 }));
  svg.append(svgEl("rect", { x: xb, y: plot.top, width: Math.max(0, plot.left + plot.w - xb), height: plot.h, rx: 5, fill: "var(--panel)", "fill-opacity": 0.66 }));
  // cadre de sélection (neutre, fin)
  svg.append(svgEl("rect", { x: xa, y: plot.top + 0.5, width: Math.max(2, xb - xa), height: plot.h - 1, rx: 5, fill: "none", stroke: "var(--tx3)", "stroke-width": 1 }));
  // poignées : barre arrondie + grip
  for (const x of [xa, xb]) {
    svg.append(svgEl("rect", { x: x - 4, y: plot.top + 2, width: 8, height: plot.h - 4, rx: 4, fill: "var(--panel)", stroke: "var(--line2)", "stroke-width": 1 }));
    svg.append(svgEl("line", { x1: x - 1.4, x2: x - 1.4, y1: cy - 4, y2: cy + 4, stroke: "var(--tx3)", "stroke-width": 1.1 }));
    svg.append(svgEl("line", { x1: x + 1.4, x2: x + 1.4, y1: cy - 4, y2: cy + 4, stroke: "var(--tx3)", "stroke-width": 1.1 }));
  }
  svg._plot = { plot, X, monthAt: px => clamp(Math.round((px - plot.left) / plot.w * (n - 1)), 0, n - 1) };
  return svg;
}

/* ---------- contrôleur interactif (zoom molette, glisser, brush, tactile) ---------- */
function buildProjChart(data, mode, hidden, cur) {
  const MAX = data.ym.length - 1;
  const wrap = el("div", { class: "pc-wrap" });
  const main = el("div", { class: "chart-box pc-main" });
  const tip = el("div", { class: "chart-tip", style: "opacity:0" });
  main.append(tip);
  const brush = el("div", { class: "chart-box pc-brush" });
  const hint = el("div", { class: "pc-hint" }, el("span", { html: ico("search", 12) }),
    el("span", {}, "Molette pour zoomer · glisser pour déplacer · poignées ci-dessous pour ajuster la période"));
  wrap.append(main, brush, hint);

  const clampWin = (i0, i1) => {
    let span = Math.round(i1 - i0);
    span = clamp(span, PROJ_MINSPAN, MAX);
    i0 = clamp(Math.round(i0), 0, MAX - span);
    return { i0, i1: i0 + span };
  };
  let win = clampWin(_projView.i0, _projView.i1);
  let G = null;

  const scheduleSettle = debounce(() => { persist(); renderApp(); }, 280);
  function setWin(i0, i1, settle) {
    win = clampWin(i0, i1);
    _projView = { i0: win.i0, i1: win.i1 };
    State.settings.projView = { a: win.i0, b: win.i1 };
    drawMain(); drawBrush();
    if (settle) scheduleSettle();
  }
  function drawMain() {
    const W = main.clientWidth; if (!W) return;
    [...main.querySelectorAll("svg")].forEach(s => s.remove());
    const svg = projMainSvg(W, main.clientHeight || PROJ_MAIN_H, win, data, mode, hidden, cur);
    main.insertBefore(svg, tip);
    G = svg._geom;
  }
  function drawBrush() {
    const W = brush.clientWidth; if (!W) return;
    brush.innerHTML = "";
    brush.append(projBrushSvg(W, brush.clientHeight || PROJ_BRUSH_H, win, data));
  }

  // tooltip / crosshair
  function showTipAt(clientX) {
    if (!G) return;
    const r = main.getBoundingClientRect();
    const k = clamp(Math.round((clientX - r.left - G.plot.left) / G.plot.w * (G.n - 1)), 0, G.n - 1);
    const cx = G.X(k);
    G.guide.setAttribute("x1", cx); G.guide.setAttribute("x2", cx); G.guide.setAttribute("opacity", 1);
    G.dots.forEach((d, di) => { const c = G.dotEls[di]; c.setAttribute("cx", cx); c.setAttribute("cy", G.Y(d.arr[win.i0 + k])); c.setAttribute("opacity", 1); });
    tip.innerHTML = G.tipHtml(k);
    tip.style.opacity = 1;
    tip.style.left = clamp(cx, 72, r.width - 72) + "px";
    tip.style.top = (G.plot.top + 12) + "px";
  }
  function hideTip() { if (!G) return; G.guide.setAttribute("opacity", 0); G.dotEls.forEach(c => c.setAttribute("opacity", 0)); tip.style.opacity = 0; }

  // pan + tactile
  let panning = false, panX = 0, panY = 0, panW = null, axis = null, moved = false, ptType = "mouse";
  main.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    panning = true; panX = e.clientX; panY = e.clientY; panW = { ...win }; axis = null; moved = false; ptType = e.pointerType;
    try { main.setPointerCapture(e.pointerId); } catch (_) {}
  });
  main.addEventListener("pointermove", e => {
    if (!panning) { showTipAt(e.clientX); return; }
    const dx = e.clientX - panX, dy = e.clientY - panY;
    if (axis === null) {
      if (ptType === "mouse") axis = "x";
      else {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (axis === "y") { panning = false; try { main.releasePointerCapture(e.pointerId); } catch (_) {} return; }
      }
    }
    moved = true; hideTip();
    const span = panW.i1 - panW.i0;
    const dM = Math.round(dx / G.plot.w * span);
    setWin(panW.i0 - dM, panW.i1 - dM, true);
  });
  const endPan = e => {
    if (!panning) return;
    panning = false; try { main.releasePointerCapture(e.pointerId); } catch (_) {}
    if (ptType !== "mouse" && !moved) showTipAt(e.clientX);
    scheduleSettle();
  };
  main.addEventListener("pointerup", endPan);
  main.addEventListener("pointercancel", endPan);
  main.addEventListener("pointerleave", () => { if (!panning) hideTip(); });
  main.addEventListener("wheel", e => {
    e.preventDefault(); if (!G) return;
    const r = main.getBoundingClientRect();
    const ratio = clamp((e.clientX - r.left - G.plot.left) / G.plot.w, 0, 1);
    const span = win.i1 - win.i0;
    const f = e.deltaY < 0 ? 0.82 : 1 / 0.82;
    const newSpan = clamp(Math.round(span * f), PROJ_MINSPAN, MAX);
    const anchor = win.i0 + ratio * span;
    setWin(Math.round(anchor - ratio * newSpan), Math.round(anchor - ratio * newSpan) + newSpan, true);
  }, { passive: false });

  // brush
  let bmode = null, bAnchor = 0, bW = null;
  const brushAt = clientX => { const svg = brush.querySelector("svg"); const r = brush.getBoundingClientRect(); return svg ? svg._plot.monthAt(clientX - r.left) : 0; };
  brush.addEventListener("pointerdown", e => {
    const svg = brush.querySelector("svg"); if (!svg) return;
    const r = brush.getBoundingClientRect(); const px = e.clientX - r.left;
    const xa = svg._plot.X(win.i0), xb = svg._plot.X(win.i1);
    if (Math.abs(px - xa) < 11) bmode = "l";
    else if (Math.abs(px - xb) < 11) bmode = "r";
    else if (px > xa && px < xb) { bmode = "b"; bAnchor = brushAt(e.clientX); bW = { ...win }; }
    else bmode = "c";
    try { brush.setPointerCapture(e.pointerId); } catch (_) {}
    onBrush(e);
  });
  brush.addEventListener("pointermove", e => { if (bmode) onBrush(e); });
  const endBrush = e => { if (bmode) { bmode = null; try { brush.releasePointerCapture(e.pointerId); } catch (_) {} scheduleSettle(); } };
  brush.addEventListener("pointerup", endBrush);
  brush.addEventListener("pointercancel", endBrush);
  function onBrush(e) {
    const m = brushAt(e.clientX);
    if (bmode === "l") setWin(Math.min(m, win.i1 - PROJ_MINSPAN), win.i1, true);
    else if (bmode === "r") setWin(win.i0, Math.max(m, win.i0 + PROJ_MINSPAN), true);
    else if (bmode === "b") { const d = m - bAnchor; setWin(bW.i0 + d, bW.i1 + d, true); }
    else if (bmode === "c") { const span = win.i1 - win.i0; setWin(m - span / 2, m + span / 2, true); }
  }

  requestAnimationFrame(() => { drawMain(); drawBrush(); });
  if (window.ResizeObserver) {
    let lw = 0;
    const ro = new ResizeObserver(() => { const w = main.clientWidth; if (Math.abs(w - lw) > 4) { lw = w; drawMain(); drawBrush(); } });
    ro.observe(main);
  }
  return wrap;
}

/* ============ vue ============ */
function viewProjection(root) {
  const b = curBudget();
  const cur = b.currency;
  const mode = State.settings.projMode || "wealth";
  State.settings.projHidden = State.settings.projHidden || {};
  const hidden = new Set(Object.keys(State.settings.projHidden).filter(k => State.settings.projHidden[k]));
  const marks = State.settings.projMarks || (State.settings.projMarks = [12, 60, 120]);

  const proj = project(b, { months: PROJ_MAX, scenarioMode: State.settings.scenarioMode });
  const phasesFull = lifeChapters(b, proj);
  const data = buildChartData(b, proj, mode, cur, phasesFull);
  const hasVariable = b.items.some(i => i.variable);

  const v = State.settings.projView || { a: 0, b: 60 };
  const i0 = clamp(v.a | 0, 0, PROJ_MAX - PROJ_MINSPAN);
  const i1 = clamp(v.b | 0, i0 + PROJ_MINSPAN, PROJ_MAX - 1);
  _projView = { i0, i1 };
  const slice = proj.slice(i0, i1 + 1);
  const visPhases = phasesFull.filter(p => p.startIdx <= i1 && p.endIdx >= i0);

  /* ---- contrôles ---- */
  const controls = el("div", { class: "flex", style: "flex-wrap:wrap; gap:10px 14px" },
    segControl(PROJ_MODES, mode, m => { State.settings.projMode = m; persist(); renderApp(); }, true),
    el("span", { class: "spacer" }),
    el("div", { class: "flex", style: "gap:7px" }, el("span", { class: "small muted nowrap" }, "Hypothèse"),
      segControl([
        { value: "expected", label: "Attendu" }, { value: "optimistic", label: "Optimiste" }, { value: "pessimistic", label: "Pessimiste" },
      ], State.settings.scenarioMode, m => { State.settings.scenarioMode = m; persist(); renderApp(); }, true)),
    el("button", { class: "btn btn-sm btn-ghost btn-ico", title: "Imprimer / PDF", html: ico("print", 15), onclick: () => window.print() }),
    el("button", { class: "btn btn-sm btn-ghost btn-ico", title: "Exporter en CSV", html: ico("down", 15), onclick: () => exportProjectionCSV(slice) }));

  /* ---- carte graphique ---- */
  const rangeChips = el("div", { class: "pc-chips" }, RANGE_PRESETS.map(rp => {
    const on = i0 === 0 && i1 === Math.min(rp.m, PROJ_MAX - 1);
    return el("button", { class: "pc-chip" + (on ? " on" : ""), onclick: () => { State.settings.projView = { a: 0, b: Math.min(rp.m, PROJ_MAX - 1) }; persist(); renderApp(); } }, rp.l);
  }));
  const lg = (c, t) => el("span", { class: "lg" }, el("span", { class: "cat-dot", style: "background:" + c }), t);
  const legend = mode === "wealth"
    ? el("div", { class: "leg-toggles" }, [...data.up, ...data.down, data.line].map(s => seriesToggle(s.name, s.color, hidden)))
    : mode === "balance"
      ? el("div", { class: "legend" }, lg("#10b981", "Solde courant"), lg("#8b5cf6", "Patrimoine net"), data.markers.length ? el("span", { class: "lg" }, "📌 événements de vie") : null)
      : el("div", { class: "legend" }, lg("#8b5cf6", "Attendu"),
        el("span", { class: "lg" }, el("span", { class: "cat-dot", style: "background:rgba(139,92,246,.35)" }), "Fourchette pessimiste → optimiste"));
  const heroHead = el("div", { class: "card-head", style: "flex-wrap:wrap; row-gap:9px" },
    el("h3", {}, mode === "wealth" ? "Composition du patrimoine" : mode === "balance" ? "Solde courant & patrimoine net" : "Fourchette du patrimoine net"),
    el("span", { class: "spacer" }), rangeChips);
  const scenNote = mode === "scenarios" && !hasVariable
    ? el("div", { class: "alert a-info", style: "margin:12px 18px 0" }, el("span", { class: "a-ico", html: ico("info", 16) }),
      el("span", {}, "Aucun poste variable : les trois hypothèses sont identiques. Marquez un revenu ou une dépense comme « variable » (fourchette min/max) pour ouvrir une fourchette."))
    : null;
  const chartCard = el("div", { class: "card" }, heroHead, legend, scenNote, buildProjChart(data, mode, hidden, cur));

  /* ---- synthèse (fenêtre affichée) ---- */
  const synthCard = el("div", { class: "card synth" },
    projSummary(slice, visPhases, cur).map(s => el("div", { class: "s-line" + (s.tone ? " " + s.tone : "") },
      el("span", { class: "s-ico" }, s.ico), el("span", { html: s.html }))));

  /* ---- repères temporels ---- */
  const reperesCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Repères temporels"), el("span", { class: "spacer" }),
      el("span", { class: "xs muted nowrap" }, "patrimoine net · depuis aujourd'hui")),
    el("div", { class: "rep-chips" }, MARK_PRESETS.map(mp => {
      const on = marks.includes(mp.m);
      return el("button", {
        class: "pc-chip" + (on ? " on" : ""), onclick: () => {
          const set = new Set(marks); set.has(mp.m) ? set.delete(mp.m) : set.add(mp.m);
          State.settings.projMarks = [...set].sort((a, z) => a - z); persist(); renderApp();
        }
      }, mp.l);
    })),
    el("div", { class: "miles", style: "padding:8px 16px 14px" }, repereCards(proj, cur, marks)));

  /* ---- chapitres de vie ---- */
  const chaptersCard = visPhases.length > 1 ? el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Chapitres de vie"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("events") }, "Gérer les événements →")),
    el("div", { class: "phases" }, visPhases.map(p => phaseRow(p, cur)))
  ) : el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Chapitres de vie")),
    emptyState("🧭", "Une seule période sur cette fenêtre",
      "Anticipez vos changements de situation (premier emploi, déménagement, naissance, retraite…) : ils découpent vos projections en chapitres et apparaissent sur le graphique.",
      el("button", { class: "btn btn-p btn-sm", onclick: () => go("events") }, "Planifier un événement")));

  /* ---- flux mensuels ---- */
  const avgNet = slice.reduce((s, r) => s + r.net, 0) / slice.length;
  const fluxCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Flux mensuels"), el("span", { class: "spacer" }),
      el("span", { class: "small muted nowrap" }, `capacité moyenne ${fmtMoney(avgNet, cur, { sign: true, dec: 0 })}/mois`)),
    el("div", { class: "card-pad" }, chartBars({
      labels: slice.map(r => r.ym), pos: slice.map(r => r.income), neg: slice.map(r => r.expense), cur, height: 210,
    })));

  /* ---- tableau détaillé (replié) ---- */
  const shown = _projTableAll ? slice : slice.slice(0, 12);
  const tbl = el("table", { class: "tbl" },
    el("thead", {}, el("tr", {}, el("th", {}, "Mois"), el("th", {}, "Revenus"), el("th", {}, "Dépenses"),
      el("th", {}, "Reste"), el("th", {}, "Solde cumulé"), el("th", {}, "Patrimoine net"))),
    el("tbody", {}, shown.map(r => el("tr", { class: r.events.length ? "tr-event" : "" },
      el("td", {}, fmtYm(r.ym) + (r.events.length ? " " + r.events.map(e => `${e.emoji || "📌"} ${e.name}`).join(", ") : "")),
      el("td", { class: "pos" }, fmtMoney(r.income, cur, { dec: 0 })),
      el("td", {}, fmtMoney(r.expense, cur, { dec: 0 })),
      el("td", { class: r.net < 0 ? "neg" : "pos" }, fmtMoney(r.net, cur, { dec: 0, sign: true })),
      el("td", { class: r.balance < 0 ? "neg" : "" }, el("b", {}, fmtMoney(r.balance, cur, { dec: 0 }))),
      el("td", { class: r.netWorth < 0 ? "neg" : "" }, fmtMoney(r.netWorth, cur, { dec: 0 }))
    ))));
  const tableCard = el("details", { class: "card", style: "padding:0 0 2px" },
    el("summary", { class: "tbl-summary" }, el("span", { html: ico("list", 15) }), el("span", {}, "Détail mois par mois"),
      el("span", { class: "spacer" }), el("span", { class: "xs muted" }, `${slice.length} mois affichés`)),
    el("div", { class: "tbl-wrap", style: "padding:4px 8px 4px" }, tbl),
    slice.length > 12 ? el("div", { style: "padding:8px 16px 14px; text-align:center" },
      el("button", { class: "btn btn-sm", onclick: () => { _projTableAll = !_projTableAll; renderApp(); } },
        _projTableAll ? "Réduire" : `Afficher les ${slice.length} mois`)) : null);

  root.append(el("div", { class: "content-inner grid", style: "gap:16px" },
    controls, chartCard, synthCard, reperesCard, chaptersCard,
    el("div", { class: "grid g2" }, fluxCard, tableCard)));
}

/* Phrases de synthèse — factuelles, chiffrées. */
function projSummary(slice, phases, cur) {
  const first = slice[0], last = slice[slice.length - 1];
  const out = [];
  const nwD = last.netWorth - first.netWorth;
  out.push({
    ico: nwD >= 0 ? "📈" : "📉",
    html: `De <b>${fmtYm(first.ym)}</b> à <b>${fmtYm(last.ym)}</b>, le patrimoine net passe de <b>${fmtMoney(first.netWorth, cur, { dec: 0 })}</b> à <b>${fmtMoney(last.netWorth, cur, { dec: 0 })}</b> (${fmtMoney(nwD, cur, { dec: 0, sign: true })}, soit ${fmtMoney(nwD / slice.length, cur, { dec: 0, sign: true })}/mois).`,
  });
  let lowI = 0;
  for (let i = 1; i < slice.length; i++) if (slice[i].balance < slice[lowI].balance) lowI = i;
  const firstNeg = slice.find(r => r.balance < 0);
  if (firstNeg) out.push({ ico: "⚠️", tone: "neg", html: `Solde courant négatif dès <b>${fmtYm(firstNeg.ym)}</b> (${fmtMoney(firstNeg.balance, cur)}). Point bas : ${fmtMoney(slice[lowI].balance, cur)} en ${fmtYm(slice[lowI].ym)}.` });
  else out.push({ ico: "🛟", html: `Solde courant toujours positif sur la fenêtre ; point bas <b>${fmtMoney(slice[lowI].balance, cur)}</b> en ${fmtYm(slice[lowI].ym)}.` });
  if (phases.length > 1) {
    const best = [...phases].sort((a, z) => z.avgNet - a.avgNet)[0];
    const worst = [...phases].sort((a, z) => a.avgNet - z.avgNet)[0];
    out.push({
      ico: "🧭",
      html: `Période la plus favorable : <b>${esc(best.name)}</b> (${fmtMoney(best.avgNet, cur, { sign: true, dec: 0 })}/mois)`
        + (worst !== best ? ` · la plus tendue : <b>${esc(worst.name)}</b> (${fmtMoney(worst.avgNet, cur, { sign: true, dec: 0 })}/mois).` : "."),
    });
  }
  return out;
}

/* Cartes de repères temporels (cliquables → zoome jusqu'à ce repère). */
function repereCards(proj, cur, marks) {
  const base = proj[0].netWorth;
  const cards = [el("div", { class: "mile now" },
    el("div", { class: "m-when" }, "Aujourd'hui · " + proj[0].ym.slice(0, 4)),
    el("div", { class: "m-val" }, fmtMoney(base, cur, { dec: 0 })),
    el("div", { class: "m-delta muted" }, "patrimoine net actuel"))];
  for (const m of marks) {
    if (m > proj.length) continue;
    const idx = Math.min(m - 1, proj.length - 1), val = proj[idx].netWorth, d = val - base;
    const lbl = (MARK_PRESETS.find(x => x.m === m) || { l: m + " mois" }).l;
    cards.push(el("div", {
      class: "mile", style: "cursor:pointer",
      title: "Zoomer jusqu'à ce repère",
      onclick: () => { State.settings.projView = { a: 0, b: Math.min(m, PROJ_MAX - 1) }; persist(); renderApp(); }
    },
      el("div", { class: "m-when" }, `Dans ${lbl} · ${proj[idx].ym.slice(0, 4)}`),
      el("div", { class: "m-val" + (val < 0 ? " neg" : "") }, fmtMoney(val, cur, { dec: 0 })),
      el("div", { class: "m-delta " + (d >= 0 ? "pos" : "neg") }, fmtMoney(d, cur, { dec: 0, sign: true }))));
  }
  return el("div", { class: "miles", style: "padding:0" }, cards);
}

/* Carte d'un chapitre de vie. */
function phaseRow(p, cur) {
  const span = p.ev ? `${fmtYm(p.startYm)} → ${fmtYm(p.endYm)}` : `dès ${fmtYm(p.startYm)}`;
  const yrs = p.months / 12;
  const dur = p.months < 12 ? `${p.months} mois` : `${yrs % 1 === 0 ? yrs : yrs.toFixed(1)} an${yrs >= 2 ? "s" : ""}`;
  return el("div", { class: "phase", style: `--p-col:${p.color}` },
    el("div", { class: "ph-top" }, el("span", { class: "ph-name" }, p.name), el("span", { class: "spacer" }),
      el("span", { class: "badge b-mut nowrap" }, dur)),
    el("div", { class: "ph-when" }, span),
    el("div", { class: "ph-stats" },
      phStat("Flux moyen", fmtMoney(p.avgNet, cur, { sign: true, dec: 0 }) + "/mois", p.avgNet < 0 ? "neg" : "pos"),
      phStat("Patrimoine net en fin", fmtMoney(p.nwEnd, cur, { dec: 0 }), p.nwEnd < 0 ? "neg" : ""),
      phStat("Évolution sur la période", fmtMoney(p.nwDelta, cur, { sign: true, dec: 0 }), p.nwDelta >= 0 ? "pos" : "neg")));
  function phStat(label, value, tone) {
    return el("div", { class: "ph-stat" }, el("div", { class: "v " + (tone || "") }, value), el("div", { class: "l" }, label));
  }
}

/* Pastille de légende cliquable (masque/affiche une série du graphe patrimoine). */
function seriesToggle(name, color, hidden) {
  const off = hidden.has(name);
  return el("button", {
    class: "chip-leg" + (off ? " off" : ""),
    onclick: () => { State.settings.projHidden[name] = !off; persist(); renderApp(); }
  }, el("span", { class: "cat-dot", style: `background:${color}` }), name);
}
