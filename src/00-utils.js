"use strict";
/* ============ utilitaires ============ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    // titre sur bouton sans aria-label : en faire un aria-label (WCAG 1.4.4)
    if (tag === "button" && attrs.title && !attrs["aria-label"]) attrs["aria-label"] = attrs.title;
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "style") node.style.cssText = v;
      else if (k in node && k !== "list" && typeof v !== "string") node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat(9)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

/* ---- dates : on travaille en "YYYY-MM-DD" et en index de mois ---- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const ymOf = d => d.slice(0, 7);
const toDate = s => new Date(s + (s.length === 7 ? "-01" : "") + "T12:00:00");
const monthIndex = s => { const d = toDate(s); return d.getFullYear() * 12 + d.getMonth(); };
const ymFromIndex = i => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const daysInMonth = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const addMonths = (ym, n) => ymFromIndex(monthIndex(ym) + n);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_C = MOIS.map(m => m[0].toUpperCase() + m.slice(1));
const JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const fmtYm = ym => `${MOIS_C[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const fmtYmShort = ym => `${MOIS[+ym.slice(5, 7) - 1].slice(0, 4)}. ${ym.slice(2, 4)}`;
const fmtDate = s => { const d = toDate(s); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDateShort = s => { const d = toDate(s); return `${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4)}.`; };
function yearsBetween(d1, d2) { return (toDate(d2) - toDate(d1)) / (365.25 * 24 * 3600 * 1000); }

/* ---- monnaie ---- */
const CURRENCIES = [
  ["EUR", "€", "Euro"], ["USD", "$", "Dollar américain"], ["GBP", "£", "Livre sterling"],
  ["CHF", "CHF", "Franc suisse"], ["CAD", "$ CA", "Dollar canadien"], ["MAD", "DH", "Dirham marocain"],
  ["XOF", "FCFA", "Franc CFA (UEMOA)"], ["XAF", "FCFA", "Franc CFA (CEMAC)"], ["DZD", "DA", "Dinar algérien"],
  ["TND", "DT", "Dinar tunisien"], ["JPY", "¥", "Yen"], ["AUD", "$ AU", "Dollar australien"],
  ["SEK", "kr", "Couronne suédoise"], ["NOK", "kr", "Couronne norvégienne"], ["BRL", "R$", "Réal brésilien"],
];
const _fmtCache = {};
function moneyFmt(cur, dec) {
  const key = cur + ":" + dec;
  if (!_fmtCache[key]) {
    try {
      _fmtCache[key] = new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec });
    } catch (e) {
      _fmtCache[key] = { format: v => v.toFixed(dec) + " " + cur };
    }
  }
  return _fmtCache[key];
}
function fmtMoney(v, cur, opts) {
  cur = cur || (typeof curBudget === "function" && curBudget() ? curBudget().currency : "EUR");
  const dec = (opts && opts.dec != null) ? opts.dec : (Math.abs(v) >= 10000 ? 0 : 2);
  let out = moneyFmt(cur, Math.abs(v) % 1 < 0.005 ? 0 : dec).format(v);
  if (opts && opts.sign && v > 0) out = "+" + out;
  return out;
}
const fmtPct = v => (v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + " %";

function parseAmount(s) {
  if (typeof s === "number") return s;
  s = String(s || "").replace(/\s/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type || "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---- icônes SVG (trait fin, style feather) ---- */
const I = (() => {
  const w = (p, vb) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  return {
    home: w('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>'),
    list: w('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.3" fill="currentColor"/><circle cx="3.5" cy="12" r="1.3" fill="currentColor"/><circle cx="3.5" cy="18" r="1.3" fill="currentColor"/>'),
    trend: w('<path d="M3 17l6-7 4 4 8-9"/><path d="M15 5h6v6"/>'),
    cal: w('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    receipt: w('<path d="M5 3h14v18l-2.4-1.6L14 21l-2-1.5L10 21l-2.6-1.6L5 21z"/><path d="M9 8h6M9 12h6"/>'),
    target: w('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
    card: w('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h4"/>'),
    zap: w('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    layers: w('<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
    gear: w('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    x: w('<path d="M18 6 6 18M6 6l12 12"/>'),
    edit: w('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
    trash: w('<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>'),
    chevL: w('<path d="m15 18-6-6 6-6"/>'),
    chevR: w('<path d="m9 18 6-6-6-6"/>'),
    chevD: w('<path d="m6 9 6 6 6-6"/>'),
    chevU: w('<path d="m6 15 6-6 6 6"/>'),
    down: w('<path d="M12 3v13M6 11l6 6 6-6"/><path d="M4 21h16"/>'),
    up: w('<path d="M12 21V8M6 13l6-6 6 6"/><path d="M4 3h16"/>'),
    alert: w('<path d="M12 3 1.5 21h21z"/><path d="M12 10v5"/><circle cx="12" cy="18" r="1" fill="currentColor"/>'),
    check: w('<path d="M20 6 9 17l-5-5"/>'),
    info: w('<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/>'),
    copy: w('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    archive: w('<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v11h16V9M10 13h4"/>'),
    sync: w('<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4"/><path d="M21 3v4h-4M3 21v-4h4"/>'),
    cloud: w('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 9.2 4 4 0 0 0 6.5 19z"/><path d="M12 12v5M9.5 14.5 12 12l2.5 2.5"/>'),
    book: w('<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M6 21h13"/>'),
    link: w('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'),
    rocket: w('<path d="M5 16c-1.5 1.5-2 5-2 5s3.5-.5 5-2a2.8 2.8 0 0 0-3-3z"/><path d="M9 14c6-6 8-9 11-11-2 3-5 5-11 11M14 9l2 2"/><path d="M9 14l1 4 4-2"/>'),
    phone: w('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    play: w('<path d="M7 4v16l13-8z"/>'),
    key: w('<circle cx="8" cy="8" r="4.5"/><path d="M11 11l9 9M17 17l2-2M14 14l2-2"/>'),
    users: w('<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6"/>'),
    search: w('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    wallet: w('<path d="M21 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16V7"/><circle cx="17" cy="14" r="1.2" fill="currentColor"/>'),
    pig: w('<path d="M19 9.5c.8 0 2-.5 2-2M5.7 8A6.5 6.5 0 0 1 11 5.5h2A6.5 6.5 0 0 1 19.5 12v1.6a3 3 0 0 1-1.5 2.6V19h-3l-.5-1.5h-4L10 19H7v-2.8A6.5 6.5 0 0 1 4.5 11H3V8h2.7z"/><circle cx="15.5" cy="10" r="1" fill="currentColor"/>'),
    sun: w('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>'),
    moon: w('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'),
    print: w('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M6 14h12v7H6z"/>'),
    flag: w('<path d="M4 22V3"/><path d="M4 4h14l-3 4.5L18 13H4"/>'),
    spark: w('<path d="M12 2l2 6.5L21 11l-6.5 2L12 20l-2.5-7L3 11l6.5-2.5z"/>'),
    menu: w('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    more: w('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
    eye: w('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    swap: w('<path d="M7 16V4M3.5 7.5 7 4l3.5 3.5"/><path d="M17 8v12M13.5 16.5 17 20l3.5-3.5"/>'),
    sync: w('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/>'),
    cloud: w('<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6.5 6.5 0 0 1 20 11.5a4 4 0 0 1-2.5 7.5z"/>'),
    rocket: w('<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 13 4.5 11.5s1-3 3-5C11 3 16 2.5 19 3c.5 3-.5 8-3.5 11.5-2 2-5 3-5 3z"/><circle cx="14" cy="9" r="1.6"/>'),
    logo: `<svg viewBox="0 0 64 64" width="26" height="26"><circle cx="32" cy="32" r="30" fill="#10b981" opacity=".15"/><circle cx="32" cy="32" r="30" fill="none" stroke="#10b981" stroke-width="3"/><path d="M14 42 L26 28 L34 35 L50 18" stroke="#10b981" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="18" r="5" fill="#10b981"/></svg>`,
  };
})();
const ico = (name, size) => `<span class="ico" style="width:${size || 18}px;height:${size || 18}px;display:inline-grid;place-items:center">${I[name] || ""}</span>`;
