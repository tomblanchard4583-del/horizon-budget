"use strict";
/* ============ graphiques SVG maison (responsives, tooltips) ============ */
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}
function niceTicks(min, max, n) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / (n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = lo; v <= max + step * 0.01; v += step) ticks.push(round2(v));
  return ticks;
}
const fmtAxis = (v, cur) => {
  const a = Math.abs(v);
  let s;
  if (a >= 1e6) s = (v / 1e6).toFixed(1).replace(".0", "") + " M";
  else if (a >= 1000) s = (v / 1000).toFixed(1).replace(".0", "") + " k";
  else s = String(Math.round(v));
  return s + (cur === "EUR" ? "€" : "");
};

/* Conteneur responsive : dessine via cb(width) et redessine au resize. */
function chartBox(height, draw) {
  const box = el("div", { class: "chart-box", style: `height:${height}px` });
  const render = () => {
    const w = box.clientWidth;
    if (!w) return;
    box.innerHTML = "";
    box.append(draw(w, height));
  };
  requestAnimationFrame(render);
  if (window.ResizeObserver) {
    let last = 0;
    const ro = new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - last) > 4) { last = w; render(); } });
    ro.observe(box);
  }
  return box;
}

function attachTip(box, svg, plot, count, idxToTip, idxToX) {
  const tip = el("div", { class: "chart-tip", style: "opacity:0" });
  box.append(tip);
  const guide = svgEl("line", { y1: plot.top, y2: plot.top + plot.h, stroke: "var(--tx3)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 });
  svg.append(guide);
  const move = e => {
    const r = box.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    let idx = Math.round((x - plot.left) / plot.w * (count - 1));
    idx = clamp(idx, 0, count - 1);
    const cx = idxToX(idx);
    guide.setAttribute("x1", cx); guide.setAttribute("x2", cx); guide.setAttribute("opacity", 1);
    tip.innerHTML = idxToTip(idx);
    tip.style.opacity = 1;
    tip.style.left = clamp(cx, 70, r.width - 70) + "px";
    tip.style.top = plot.top + 14 + "px";
  };
  const leave = () => { tip.style.opacity = 0; guide.setAttribute("opacity", 0); };
  box.addEventListener("mousemove", move);
  box.addEventListener("touchstart", move, { passive: true });
  box.addEventListener("touchmove", move, { passive: true });
  box.addEventListener("mouseleave", leave);
}

/*
 * Courbes / aires : { labels:[ym], series:[{name,color,values,fill,dash}], height, cur,
 *                     markers:[{idx,label,emoji}], zeroLine }
 */
function chartLine(opts) {
  const H = opts.height || 260;
  return chartBox(H, (W) => {
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const plot = { left: 52, top: 14, w: W - 52 - 14, h: H - 14 - 30 };
    const all = opts.series.flatMap(s => s.values);
    let min = Math.min(0, ...all), max = Math.max(0, ...all);
    if (min === max) max = min + 1;
    const pad = (max - min) * 0.06; max += pad; if (min < 0) min -= pad;
    const ticks = niceTicks(min, max, 5);
    min = Math.min(min, ticks[0]); max = Math.max(max, ticks[ticks.length - 1]);
    const X = i => plot.left + (opts.labels.length === 1 ? plot.w / 2 : i / (opts.labels.length - 1) * plot.w);
    const Y = v => plot.top + (1 - (v - min) / (max - min)) * plot.h;

    for (const t of ticks) {
      svg.append(svgEl("line", { x1: plot.left, x2: plot.left + plot.w, y1: Y(t), y2: Y(t), stroke: t === 0 ? "var(--tx3)" : "var(--chart-grid)", "stroke-width": 1 }));
      const lbl = svgEl("text", { x: plot.left - 7, y: Y(t) + 3.5, "text-anchor": "end", "font-size": 10.5, fill: "var(--tx3)" });
      lbl.textContent = fmtAxis(t, opts.cur);
      svg.append(lbl);
    }
    const nX = opts.labels.length;
    const stepX = Math.max(1, Math.ceil(nX / (W / 78)));
    opts.labels.forEach((l, i) => {
      if (i % stepX !== 0 && i !== nX - 1) return;
      const t = svgEl("text", { x: X(i), y: H - 9, "text-anchor": "middle", "font-size": 10.5, fill: "var(--tx3)" });
      t.textContent = opts.fmtX ? opts.fmtX(l) : fmtYmShort(l);
      svg.append(t);
    });

    for (const s of opts.series) {
      const pts = s.values.map((v, i) => `${X(i)},${Y(v)}`);
      if (s.fill) {
        const area = svgEl("path", { d: `M${X(0)},${Y(Math.max(min, 0))} L` + pts.join(" L") + ` L${X(s.values.length - 1)},${Y(Math.max(min, 0))} Z`, fill: s.color, opacity: 0.1 });
        svg.append(area);
      }
      svg.append(svgEl("path", { d: "M" + pts.join(" L"), fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-dasharray": s.dash ? "5 4" : "" }));
    }

    // marqueurs d'événements de vie
    for (const m of opts.markers || []) {
      const x = X(m.idx);
      svg.append(svgEl("line", { x1: x, x2: x, y1: plot.top, y2: plot.top + plot.h, stroke: "var(--violet)", "stroke-width": 1.2, "stroke-dasharray": "2 3", opacity: 0.7 }));
      const t = svgEl("text", { x, y: plot.top + 9, "text-anchor": "middle", "font-size": 11 });
      t.textContent = m.emoji || "📌";
      svg.append(t);
    }

    attachTipWrapper(svg, plot, opts, X);
    return svg;

    function attachTipWrapper(svg, plot, opts, X) {
      requestAnimationFrame(() => {
        const boxEl = svg.parentElement;
        if (!boxEl) return;
        attachTip(boxEl, svg, plot, opts.labels.length, idx => {
          let html = `<div class="t-title">${esc(opts.fmtX ? opts.fmtX(opts.labels[idx]) : fmtYm(opts.labels[idx]))}</div>`;
          for (const s of opts.series) {
            html += `<div class="t-row"><span style="color:${s.color}">●</span><span>${esc(s.name)}</span><b>${fmtMoney(s.values[idx], opts.cur)}</b></div>`;
          }
          for (const m of (opts.markers || []).filter(m => m.idx === idx)) html += `<div class="t-row">${m.emoji || "📌"} ${esc(m.label)}</div>`;
          return html;
        }, X);
      });
    }
  });
}

/* Barres revenus/dépenses : { labels, pos:[], neg:[], net:[], cur } */
function chartBars(opts) {
  const H = opts.height || 240;
  return chartBox(H, (W) => {
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const plot = { left: 52, top: 12, w: W - 52 - 12, h: H - 12 - 30 };
    const max = Math.max(1, ...opts.pos, ...opts.neg) * 1.06;
    const ticks = niceTicks(0, max, 4);
    const topV = ticks[ticks.length - 1];
    const Y = v => plot.top + (1 - v / topV) * plot.h;
    for (const t of ticks) {
      svg.append(svgEl("line", { x1: plot.left, x2: plot.left + plot.w, y1: Y(t), y2: Y(t), stroke: "var(--chart-grid)" }));
      const lbl = svgEl("text", { x: plot.left - 7, y: Y(t) + 3.5, "text-anchor": "end", "font-size": 10.5, fill: "var(--tx3)" });
      lbl.textContent = fmtAxis(t, opts.cur);
      svg.append(lbl);
    }
    const n = opts.labels.length;
    const slot = plot.w / n;
    const bw = Math.min(16, slot * 0.32);
    const stepX = Math.max(1, Math.ceil(n / (W / 78)));
    opts.labels.forEach((l, i) => {
      const cx = plot.left + slot * (i + 0.5);
      svg.append(svgEl("rect", { x: cx - bw - 1, y: Y(opts.pos[i]), width: bw, height: Math.max(0, Y(0) - Y(opts.pos[i])), rx: 3, fill: "var(--accent)" }));
      svg.append(svgEl("rect", { x: cx + 1, y: Y(opts.neg[i]), width: bw, height: Math.max(0, Y(0) - Y(opts.neg[i])), rx: 3, fill: "#f43f5e", opacity: 0.85 }));
      if (i % stepX === 0 || i === n - 1) {
        const t = svgEl("text", { x: cx, y: H - 9, "text-anchor": "middle", "font-size": 10.5, fill: "var(--tx3)" });
        t.textContent = fmtYmShort(l);
        svg.append(t);
      }
    });
    requestAnimationFrame(() => {
      const boxEl = svg.parentElement;
      if (!boxEl) return;
      attachTip(boxEl, svg, plot, n, idx => {
        const net = opts.pos[idx] - opts.neg[idx];
        return `<div class="t-title">${esc(fmtYm(opts.labels[idx]))}</div>
          <div class="t-row"><span style="color:var(--accent)">●</span><span>Revenus</span><b>${fmtMoney(opts.pos[idx], opts.cur)}</b></div>
          <div class="t-row"><span style="color:#f43f5e">●</span><span>Dépenses</span><b>${fmtMoney(opts.neg[idx], opts.cur)}</b></div>
          <div class="t-row"><span></span><span>Reste</span><b>${fmtMoney(net, opts.cur, { sign: true })}</b></div>`;
      }, i => plot.left + slot * (i + 0.5));
    });
    return svg;
  });
}

/* Donut : { parts:[{label,emoji,color,value}], cur, centerLabel } */
function chartDonut(opts) {
  const H = opts.height || 210;
  return chartBox(H, (W) => {
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8, r = R * 0.64;
    const total = opts.parts.reduce((s, p) => s + p.value, 0) || 1;
    let a0 = -Math.PI / 2;
    const tip = el("div", { class: "chart-tip", style: "opacity:0" });
    for (const p of opts.parts) {
      const frac = p.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const mid = (a0 + a1) / 2;
      const d = frac >= 0.9999
        ? `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.01},${cy - R} M${cx},${cy - r} A${r},${r} 0 1 0 ${cx - 0.01},${cy - r}`
        : `M${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} L${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} A${r},${r} 0 ${large} 0 ${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} Z`;
      const path = svgEl("path", { d, fill: p.color, stroke: "var(--panel)", "stroke-width": 1.5, style: "cursor:pointer" });
      const showTip = () => {
        tip.innerHTML = `<div class="t-title">${p.emoji || ""} ${esc(p.label)}</div><div class="t-row"><span>${fmtPct(frac)}</span><b>${fmtMoney(p.value, opts.cur)}</b></div>`;
        tip.style.opacity = 1;
        tip.style.left = cx + (R * 0.86) * Math.cos(mid) + "px";
        tip.style.top = cy + (R * 0.86) * Math.sin(mid) + "px";
      };
      path.addEventListener("mouseenter", showTip);
      path.addEventListener("click", showTip); // mobile : tap sur une part
      path.addEventListener("mouseleave", () => tip.style.opacity = 0);
      svg.append(path);
      a0 = a1;
    }
    const t1 = svgEl("text", { x: cx, y: cy - 4, "text-anchor": "middle", "font-size": 16, "font-weight": 750, fill: "var(--tx)" });
    t1.textContent = fmtMoney(total, opts.cur, { dec: 0 });
    const t2 = svgEl("text", { x: cx, y: cy + 14, "text-anchor": "middle", "font-size": 10.5, fill: "var(--tx2)" });
    t2.textContent = opts.centerLabel || "par mois";
    svg.append(t1, t2);
    requestAnimationFrame(() => { if (svg.parentElement) svg.parentElement.append(tip); });
    return svg;
  });
}
