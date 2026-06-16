"use strict";
/* ============ personnalisation : ce que l'on affiche, où, et comment ============
   Tout vit dans State.settings.custom (donc persisté + synchronisé).
   Modèle générique : deux dictionnaires order{scope:[ids]} et hidden{scope:[ids]}
   décrivent l'ordre et la visibilité de n'importe quel ensemble d'éléments.
   Un « scope » = "nav", "dash.sec", "dash.kpi", "page.budget"… ============ */
const Custom = (() => {
  const MAIN = ["dashboard", "budget", "projection", "calendar", "tracking", "goals", "debts", "events"];
  const FOOT = ["budgets", "help", "settings"];
  const PROTECTED_NAV = ["settings", "dashboard"];   // toujours accessibles
  const DEFAULT_MOBILE = ["dashboard", "budget", "projection", "tracking"];
  const ACCENTS = [
    ["#10b981", "Émeraude"], ["#3b82f6", "Bleu"], ["#8b5cf6", "Violet"], ["#ec4899", "Rose"],
    ["#f59e0b", "Ambre"], ["#06b6d4", "Cyan"], ["#ef4444", "Rouge"], ["#14b8a6", "Sarcelle"],
    ["#6366f1", "Indigo"], ["#84cc16", "Lime"], ["#0ea5e9", "Azur"], ["#f43f5e", "Corail"],
  ];
  const QUICK = [
    { id: "tx", emoji: "🧾", label: "Transaction réelle (dépense / revenu du jour)", run: (b, close) => { close(); openTxEditor(b, null); } },
    { id: "expense", emoji: "📉", label: "Dépense planifiée (récurrente ou ponctuelle)", run: (b, close) => { close(); openItemEditor(b, newItem("expense"), true); } },
    { id: "income", emoji: "📈", label: "Revenu planifié", run: (b, close) => { close(); openItemEditor(b, newItem("income"), true); } },
    { id: "goal", emoji: "🎯", label: "Objectif d'épargne", run: (b, close) => { close(); openGoalEditor(b, null); } },
    { id: "event", emoji: "🧭", label: "Événement de vie", run: (b, close) => { close(); openEventEditor(b, null); } },
  ];

  /* Catalogues : étiquettes lisibles pour chaque scope (utilisés par les réglages). */
  const CATALOG = {
    "dash.sec": [
      { id: "kpis", label: "Indicateurs clés" }, { id: "insight", label: "Analyse intelligente" },
      { id: "alerts", label: "Alertes" }, { id: "reste", label: "Déjà prévu, pas encore débité" },
      { id: "projection", label: "Projection du solde" }, { id: "breakdown", label: "Dépenses prévues du mois" },
      { id: "upcoming", label: "Échéances à 14 jours" }, { id: "goals", label: "Objectifs d'épargne" },
    ],
    "dash.kpi": [
      { id: "dispo", label: "Argent réellement disponible" }, { id: "soldeNow", label: "Solde réel aujourd'hui" },
      { id: "finMois", label: "Solde prévu fin de mois" }, { id: "epargne", label: "Taux d'épargne prévu" },
      { id: "depReelles", label: "Dépenses réelles du mois" }, { id: "resteJour", label: "Reste à vivre par jour" },
    ],
    "page.budget": [
      { id: "summary", label: "Résumé du mois" }, { id: "controls", label: "Onglet & bouton d'ajout" }, { id: "list", label: "Liste des postes" },
    ],
    "page.projection": [
      { id: "controls", label: "Contrôles (mode, hypothèse)" }, { id: "chart", label: "Graphique principal" },
      { id: "synth", label: "Synthèse" }, { id: "reperes", label: "Repères temporels" },
      { id: "chapters", label: "Chapitres de vie" }, { id: "flux", label: "Flux mensuels" }, { id: "table", label: "Détail mois par mois" },
    ],
    "page.tracking": [
      { id: "head", label: "En-tête & import" }, { id: "kpis", label: "Indicateurs" }, { id: "sugg", label: "Suggestions" },
      { id: "compare", label: "Prévu vs réel" }, { id: "list", label: "Transactions" },
    ],
    "page.goals": [
      { id: "goals", label: "Objectifs d'épargne" }, { id: "accounts", label: "Comptes épargne rémunérés" },
    ],
    "page.debts": [
      { id: "summary", label: "Synthèse (indicateurs)" }, { id: "list", label: "Liste des crédits" },
    ],
    "page.events": [
      { id: "intro", label: "Introduction" }, { id: "list", label: "Événements de vie" },
    ],
  };

  /* ---- couleurs ---- */
  const hx = c => { c = c.replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); };
  const clampB = v => Math.max(0, Math.min(255, Math.round(v)));
  const shade = (c, pct) => { const [r, g, b] = hx(c); const f = v => clampB(v + pct / 100 * 255); return "#" + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join(""); };
  const hexA = (c, a) => { const [r, g, b] = hx(c); return `rgba(${r},${g},${b},${a})`; };

  function defaults() {
    return {
      v: 1, accent: null, density: "comfortable",
      fab: { enabled: true, pos: "br", actions: QUICK.map(q => q.id) },
      nav: { mobile: DEFAULT_MOBILE.slice() },
      dash: { chart: { projection: "line", breakdown: "donut" } },
      order: {}, hidden: {},
    };
  }

  function ensure() {
    const d = defaults();
    const c = State.settings.custom = Object.assign(d, State.settings.custom || {});
    c.order = c.order || {}; c.hidden = c.hidden || {};
    c.fab = Object.assign({ enabled: true, pos: "br", actions: QUICK.map(q => q.id) }, c.fab || {});
    c.fab.actions = (c.fab.actions || []).filter(id => QUICK.some(q => q.id === id));
    if (!c.fab.actions.length) c.fab.actions = QUICK.map(q => q.id);
    if (c.fab.pos !== "bl") c.fab.pos = "br";
    c.nav = Object.assign({ mobile: DEFAULT_MOBILE.slice() }, c.nav || {});
    c.dash = Object.assign({ chart: {} }, c.dash || {});
    c.dash.chart = Object.assign({ projection: "line", breakdown: "donut" }, c.dash.chart || {});
    if (c.density !== "compact") c.density = "comfortable";
    return c;
  }

  /* ---- ordre & visibilité génériques ---- */
  function order(scope, allIds) {
    const saved = ensure().order[scope] || [];
    const seen = new Set(), out = [];
    saved.forEach(id => { if (allIds.includes(id) && !seen.has(id)) { out.push(id); seen.add(id); } });
    allIds.forEach(id => { if (!seen.has(id)) { out.push(id); seen.add(id); } });
    return out;
  }
  const setOrder = (scope, arr) => { ensure().order[scope] = arr.slice(); };
  const hiddenSet = scope => new Set(ensure().hidden[scope] || []);
  const isHidden = (scope, id) => hiddenSet(scope).has(id);
  function setHidden(scope, id, val) {
    if (scope === "nav" && PROTECTED_NAV.includes(id)) return;
    const c = ensure(), s = new Set(c.hidden[scope] || []);
    val ? s.add(id) : s.delete(id);
    c.hidden[scope] = [...s];
  }
  const toggleHidden = (scope, id) => setHidden(scope, id, !isHidden(scope, id));
  function move(scope, allIds, id, dir) {
    const o = order(scope, allIds), i = o.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(j, 0, o.splice(i, 1)[0]); setOrder(scope, o);
  }
  function resetScope(scope) { const c = ensure(); delete c.order[scope]; delete c.hidden[scope]; }
  function resetNav() { resetScope("nav"); ensure().nav.mobile = DEFAULT_MOBILE.slice(); }
  function resetFab() { ensure().fab = { enabled: true, pos: "br", actions: QUICK.map(q => q.id) }; }
  function resetPage(view) {
    if (view === "dashboard") { resetScope("dash.sec"); resetScope("dash.kpi"); ensure().dash.chart = { projection: "line", breakdown: "donut" }; }
    else resetScope("page." + view);
  }
  function resetAll() {
    State.settings.custom = defaults(); ensure();
  }

  function label(scope, id) {
    if (scope === "nav") return (typeof VIEWS !== "undefined" && VIEWS[id]) ? VIEWS[id].label : id;
    return ((CATALOG[scope] || []).find(x => x.id === id) || {}).label || id;
  }
  const catalogIds = scope => (CATALOG[scope] || []).map(x => x.id);

  /* ---- navigation ---- */
  const navMainAll = () => order("nav", MAIN);
  const navMain = () => navMainAll().filter(k => !isHidden("nav", k));
  const navFoot = () => FOOT.filter(k => !isHidden("nav", k));
  const navAll = () => navMainAll().concat(FOOT);
  function mobileNav() {
    const c = ensure();
    let m = (c.nav.mobile || []).filter(k => typeof VIEWS !== "undefined" && VIEWS[k] && !isHidden("nav", k));
    m = [...new Set(m)].slice(0, 4);
    if (!m.length) m = DEFAULT_MOBILE.filter(k => !isHidden("nav", k)).slice(0, 4);
    return m;
  }
  function toggleMobile(k) {
    const c = ensure(), m = c.nav.mobile.includes(k) ? c.nav.mobile.filter(x => x !== k) : [...c.nav.mobile, k];
    c.nav.mobile = m.slice(0, 4);
  }

  /* ---- apparence ---- */
  function apply() {
    const c = ensure(), root = document.documentElement;
    root.setAttribute("data-density", c.density === "compact" ? "compact" : "comfortable");
    if (c.accent) {
      root.style.setProperty("--accent", c.accent);
      root.style.setProperty("--accent-deep", shade(c.accent, -14));
      root.style.setProperty("--accent-soft", hexA(c.accent, 0.12));
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-deep");
      root.style.removeProperty("--accent-soft");
    }
  }

  /* save = persiste + applique + re-render en conservant le scroll */
  function save() {
    const c = $(".content"); const top = c ? c.scrollTop : 0;
    persist(); apply();
    if (typeof renderApp === "function") renderApp();
    const c2 = $(".content"); if (c2) c2.scrollTop = top;
  }

  /* ============ mode édition (glisser / masquer en parcourant l'app) ============ */
  let editing = false, _dragged = false;
  const isEditing = () => editing;
  function enterEdit() { editing = true; document.body.classList.add("cz-on"); banner(); save(); }
  function exitEdit() { editing = false; document.body.classList.remove("cz-on"); const b = $(".cz-banner"); if (b) b.remove(); save(); }
  function toggleEdit() { editing ? exitEdit() : enterEdit(); }
  function banner() {
    if ($(".cz-banner")) return;
    const bar = el("div", { class: "cz-banner" },
      el("span", { class: "cz-bdot" }, "✦"),
      el("span", { class: "cz-btxt" }, "Personnalisation — glissez pour réordonner, ✕ pour masquer. Parcourez l'app librement."),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm", onclick: () => { resetPage(typeof _view !== "undefined" ? _view : "dashboard"); save(); toast("↩️ Page réinitialisée"); } }, "Réinitialiser la page"),
      el("button", { class: "btn btn-sm btn-p", onclick: exitEdit }, "Terminé"));
    document.body.append(bar);
  }

  /* ---- décoration d'un élément en mode édition (croix + voile de glisse) ---- */
  function decorate(node, scope, id, onActivate) {
    node.dataset.czid = id;
    if (!editing) return node;
    node.classList.add("cz-item");
    const hid = isHidden(scope, id);
    if (hid) node.classList.add("cz-hidden");
    const protectedItem = scope === "nav" && PROTECTED_NAV.includes(id);
    const badges = el("div", { class: "cz-badges" });
    if (!protectedItem) {
      badges.append(el("button", {
        class: "cz-del" + (hid ? " cz-add" : ""), title: hid ? "Réafficher" : "Masquer",
        html: ico(hid ? "plus" : "x", 13),
        onpointerdown: e => e.stopPropagation(),
        onclick: e => { e.preventDefault(); e.stopPropagation(); toggleHidden(scope, id); save(); }
      }));
    }
    node.append(badges);
    const shield = el("div", { class: "cz-shield" });
    if (onActivate) shield.addEventListener("click", () => { if (!_dragged) onActivate(id); });
    node.append(shield);
    return node;
  }

  /* ---- rendu d'un ensemble : applique ordre + visibilité, décore si édition ---- */
  function renderInto(container, scope, items, opts) {
    opts = opts || {};
    const ids = items.map(i => i.id);
    const byId = {}; items.forEach(i => byId[i.id] = i);
    order(scope, ids).forEach(id => {
      const it = byId[id]; if (!it || !it.node) return;
      if (isHidden(scope, id) && !editing) return;
      if (it.span) it.node.classList.add("dz-" + it.span);
      decorate(it.node, scope, id, opts.onActivate);
      container.append(it.node);
    });
    if (editing) sortable(container, { axis: opts.axis || "y", onDrop: o => { setOrder(scope, o); save(); } });
  }

  /* ============ tri par glisser (souris + tactile, appui long) ============ */
  function sortable(container, opts) {
    const axis = opts.axis || "y";
    let dragEl = null, ph = null, ghost = null, ox = 0, oy = 0, sx = 0, sy = 0, active = false, timer = null;
    const items = () => [...container.children].filter(c => c.classList.contains("cz-item"));

    function afterEl(x, y) {
      const els = items().filter(it => it !== dragEl);
      if (axis === "y") return els.find(it => { const r = it.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
      let best = null, bd = Infinity, before = true;
      for (const it of els) {
        const r = it.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) { bd = d; best = it; before = (y < cy - r.height * 0.25) || (Math.abs(y - cy) <= r.height / 2 && x < cx); }
      }
      return best ? (before ? best : best.nextElementSibling) : null;
    }
    function begin() {
      if (active || !dragEl) return; active = true; _dragged = true;
      const r = dragEl.getBoundingClientRect();
      ox = sx - r.left; oy = sy - r.top;
      ghost = dragEl.cloneNode(true);
      ghost.classList.add("cz-ghost");
      ghost.style.width = r.width + "px"; ghost.style.height = r.height + "px";
      ghost.style.left = (sx - ox) + "px"; ghost.style.top = (sy - oy) + "px";
      document.body.append(ghost);
      ph = el("div", { class: "cz-ph" + (axis === "grid" ? " cz-ph-grid" : "") });
      ph.style.height = r.height + "px"; if (axis === "grid") ph.style.width = r.width + "px";
      dragEl.style.display = "none";
      container.insertBefore(ph, dragEl);
      if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    }
    function onMove(e) {
      if (!dragEl) return;
      if (!active) {
        const moved = Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy);
        if (e.pointerType !== "touch" && moved > 4) begin();
        else if (e.pointerType === "touch" && moved > 12) { clearTimeout(timer); cleanup(); return; }
        if (!active) return;
      }
      e.preventDefault();
      ghost.style.left = (e.clientX - ox) + "px"; ghost.style.top = (e.clientY - oy) + "px";
      const a = afterEl(e.clientX, e.clientY);
      a == null ? container.append(ph) : container.insertBefore(ph, a);
    }
    function onUp() {
      clearTimeout(timer);
      if (active) {
        container.insertBefore(dragEl, ph);
        dragEl.style.display = ""; ph.remove(); ghost.remove();
        const o = items().map(it => it.dataset.czid);
        setTimeout(() => { _dragged = false; }, 0);
        opts.onDrop && opts.onDrop(o);
      }
      cleanup();
    }
    function cleanup() {
      active = false; dragEl = null; ph = null; ghost = null; clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    container.addEventListener("pointerdown", e => {
      if (e.button != null && e.button !== 0) return;
      const it = e.target.closest(".cz-item");
      if (!it || it.parentElement !== container || e.target.closest(".cz-del")) return;
      dragEl = it; sx = e.clientX; sy = e.clientY;
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      if (e.pointerType === "touch") timer = setTimeout(begin, 220);
    });
  }

  return {
    MAIN, FOOT, ACCENTS, QUICK, CATALOG,
    ensure, apply, save,
    order, setOrder, hiddenSet, isHidden, setHidden, toggleHidden, move,
    resetScope, resetNav, resetFab, resetPage, resetAll, label, catalogIds,
    navMain, navMainAll, navFoot, navAll, mobileNav, toggleMobile,
    isEditing, enterEdit, exitEdit, toggleEdit, renderInto, deco: decorate,
    quick: () => QUICK, get: ensure,
  };
})();
