"use strict";
/* ============ coquille applicative : navigation & rendu ============ */

/* Vues de contenu (toutes conservées : les hubs réutilisent leurs render). */
const VIEWS = {
  dashboard:  { label: "Accueil",    icon: "home",    sub: () => {
    const h = new Date().getHours();
    const salut = h < 5 ? "Bonsoir" : h < 18 ? "Bonjour" : "Bonsoir";
    return State.settings.firstName ? `${salut} ${State.settings.firstName}` : "Votre mois en un coup d'œil";
  }, render: viewDashboard },
  budget:     { label: "Budget",     icon: "list",    sub: () => "Revenus & dépenses planifiés", render: viewBudget },
  suivi:      { label: "Suivi",      icon: "receipt", sub: () => "Vos opérations, jour après jour", render: viewSuivi },
  avenir:     { label: "Avenir",     icon: "trend",   sub: () => "Projections, objectifs & projets", render: viewAvenir },
  settings:   { label: "Réglages",   icon: "gear",    sub: () => "Profil, données & partage", render: viewSettings },
  // sous-vues (atteintes via les hubs Suivi / Avenir ou les réglages)
  projection: { label: "Projections", icon: "trend",  sub: () => "Votre avenir, mois par mois", render: viewProjection },
  calendar:   { label: "Calendrier",  icon: "cal",    sub: () => "Échéances & solde au jour le jour", render: viewCalendar },
  tracking:   { label: "Opérations",  icon: "receipt",sub: () => "Transactions & prévu vs réel", render: viewTracking },
  goals:      { label: "Objectifs",   icon: "target", sub: () => "Épargne & projets", render: viewGoals },
  debts:      { label: "Crédits",     icon: "card",   sub: () => "Mensualités & amortissement", render: viewDebts },
  events:     { label: "Événements",  icon: "zap",    sub: () => "Changements de situation", render: viewEvents },
  budgets:    { label: "Mes budgets", icon: "layers", sub: () => "Multi-budgets & scénarios", render: viewBudgets },
  help:       { label: "Aide",        icon: "info",   sub: () => "Tutoriels & questions fréquentes", render: viewHelp },
};

/* Onglets principaux (barre du bas mobile + sidebar desktop). */
const TABS = [
  { k: "dashboard", label: "Accueil", icon: "home" },
  { k: "budget",    label: "Budget",  icon: "list" },
  { k: "suivi",     label: "Suivi",   icon: "receipt" },
  { k: "avenir",    label: "Avenir",  icon: "trend" },
];

/* Hubs à sous-onglets internes. */
const HUBS = {
  suivi:  { def: "tracking",   subs: [{ k: "tracking", label: "Opérations" }, { k: "calendar", label: "Calendrier" }] },
  avenir: { def: "projection", subs: [{ k: "projection", label: "Projection" }, { k: "goals", label: "Objectifs" }, { k: "debts", label: "Crédits" }, { k: "events", label: "Événements" }] },
};

/* Routage : n'importe quelle clé (héritée ou non) → onglet principal + sous-vue. */
const ROUTE = {
  home: ["dashboard"], dashboard: ["dashboard"],
  budget: ["budget"],
  suivi: ["suivi", null], tracking: ["suivi", "tracking"], calendar: ["suivi", "calendar"],
  avenir: ["avenir", null], projection: ["avenir", "projection"], goals: ["avenir", "goals"], debts: ["avenir", "debts"], events: ["avenir", "events"],
  budgets: ["budgets"], settings: ["settings"], help: ["help"],
};

let _view = "dashboard";
const _sub = { suivi: "tracking", avenir: "projection" };

/* Ordre des onglets : détermine le sens du slide (gauche/droite) entre vues. */
const NAV_ORDER = { dashboard: 0, budget: 1, suivi: 2, avenir: 3, budgets: 4, settings: 5, help: 6 };

function isMobile() { return window.matchMedia("(max-width: 880px)").matches; }

/* Enrobe une mutation du DOM dans une transition de vue directionnelle (no-op si non supporté / reduced-motion). */
function navAnimate(dir, fn) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { fn(); return; }
  document.documentElement.setAttribute("data-vtdir", dir);
  document.startViewTransition(fn);
}

/* Remonte en haut le conteneur scrollable actif (panneau du pager sur mobile, sinon .content). */
function scrollActiveToTop() {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sc = (isMobile() && Pager.has()) ? Pager.activePane() : $(".content");
  if (sc) sc.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
}

function go(key) {
  const r = ROUTE[key] || ROUTE.dashboard;
  const targetView = r[0];
  // Re-tap de l'onglet déjà actif → remonter en haut (réflexe iOS), pas de reconstruction.
  if (targetView === _view && !r[1]) { scrollActiveToTop(); return; }
  // Phase 2 : sur mobile, naviguer entre deux onglets = swipe animé (pas de reconstruction).
  if (isMobile() && Pager.has() && Pager.isTab(_view) && Pager.isTab(targetView) && !r[1]) {
    Pager.goToTab(targetView);
    return;
  }
  const from = NAV_ORDER[_view] ?? 0, to = NAV_ORDER[targetView] ?? 0;
  navAnimate(to < from ? "back" : "fwd", () => {
    _view = targetView;
    if (r[1]) _sub[_view] = r[1];
    if (HUBS[_view] && !_sub[_view]) _sub[_view] = HUBS[_view].def;
    renderApp();
    const c = $(".content");
    if (c) c.scrollTop = 0;
  });
}

/* Contenu de la barre du haut (titre + budget) — partagé entre renderApp et la synchro du pager. */
function topTitleInner(v, b) {
  return [
    el("h1", {}, v.label),
    el("div", { class: "sub" }, `${b.emoji} ${b.name}`,
      State.budgets.filter(x => !x.archived).length > 1
        ? el("span", { class: "ico", html: I.chevD, style: "width:12px;height:12px;display:inline-grid;place-items:center;vertical-align:-1px;margin-left:3px;opacity:.6" })
        : null,
      ` · ${v.sub()}`),
  ];
}

/* Met à jour la barre du haut + la barre du bas sans tout reconstruire (pendant/à la fin d'un swipe). */
function syncChrome() {
  const v = VIEWS[_view] || VIEWS.dashboard, b = curBudget();
  const t = $(".topbar-title"); if (t && b) t.replaceChildren(...topTitleInner(v, b));
  $$(".bottomnav .bn-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.k === _view));
  const meta = $('meta[name="theme-color"]'); // inchangé, conservé pour cohérence
}

/* ---- Pager mobile : les 4 onglets montés côte à côte, glissables au doigt ---- */
const Pager = (() => {
  const KEYS = TABS.map(t => t.k);
  const N = KEYS.length;
  let track = null, panes = [], rendered = [], idx = 0, frac = 0;
  let raf = null, vel = 0, dragging = false, axis = null, x0 = 0, y0 = 0, f0 = 0, lastX = 0, lastT = 0;
  let W = 0; // largeur d'une page, mesurée une fois (éviter de lire clientWidth à chaque frame)

  const paneW = () => W || (W = (track ? track.clientWidth : window.innerWidth) || 1);
  const measure = () => { W = (track ? track.clientWidth : window.innerWidth) || 1; };
  // Coupe le backdrop-filter (topbar/bottomnav) et les animations de fond pendant le geste :
  // re-flouter du contenu qui glisse à chaque frame est le 1er tueur de FPS sur mobile.
  const setSwiping = on => document.documentElement.toggleAttribute("data-swiping", on);

  function renderPane(i) {
    if (rendered[i] || !panes[i]) return;
    panes[i].innerHTML = "";
    VIEWS[KEYS[i]].render(panes[i]);
    Juice.view(panes[i]);
    rendered[i] = true;
  }
  const ensureNear = i => [i - 1, i, i + 1].forEach(j => { if (j >= 0 && j < N) renderPane(j); });

  function paint() {
    if (!track || !track.isConnected) return;
    track.style.transform = `translate3d(${-frac * paneW()}px,0,0)`; // un seul transform → composité, zéro repaint
  }

  function setActive(i) {
    i = Math.max(0, Math.min(N - 1, i));
    if (_view === KEYS[i]) return;
    _view = KEYS[i];
    syncChrome();
  }

  function spring() {
    const k = 240, d = 28, dt = 1 / 60;
    vel += (-k * (frac - idx) - d * vel) * dt;
    frac += vel * dt;
    paint(); setActive(Math.round(frac));
    if (Math.abs(vel) > 0.002 || Math.abs(frac - idx) > 0.002) raf = requestAnimationFrame(spring);
    else { frac = idx; paint(); setActive(idx); raf = null; setSwiping(false); }
  }

  function settle(target, v) {
    const t = Math.max(0, Math.min(N - 1, target));
    if (t !== idx) Juice.buzz(7);            // micro-retour haptique au changement d'onglet
    idx = t; if (v) vel = v;
    ensureNear(idx);
    if (t !== Math.round(frac)) setSwiping(true); // tab cliqué → coupe le flou pendant l'animation aussi
    if (!raf) raf = requestAnimationFrame(spring);
  }

  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true; axis = null; x0 = lastX = e.clientX; y0 = e.clientY; f0 = frac; lastT = performance.now();
    measure();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (axis === null) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis === "x") { track.setPointerCapture(e.pointerId); setSwiping(true); }
      else { dragging = false; return; }     // mouvement vertical → on laisse le scroll natif
    }
    let f = f0 - dx / paneW();
    if (f < 0) f *= 0.35; else if (f > N - 1) f = (N - 1) + (f - (N - 1)) * 0.35; // rubberband
    frac = f; paint(); setActive(Math.round(Math.max(0, Math.min(N - 1, frac))));
    lastX = e.clientX; lastT = performance.now();
    e.preventDefault();
  }
  function onUp(e) {
    if (!dragging) return; dragging = false;
    if (axis !== "x") return;
    const v = (e.clientX - lastX) / (performance.now() - lastT + 1) / paneW() * 16; // vélocité normalisée
    const moved = frac - f0;                                  // distance parcourue (fraction de page)
    const dir = (Math.abs(moved) > 0.2 || Math.abs(v) > 0.4)  // 20 % de glissement OU un flick suffit
      ? Math.sign(moved || -v) : 0;
    settle(Math.round(f0) + dir, -v);
  }

  function mount(content, activeKey) {
    idx = Math.max(0, KEYS.indexOf(activeKey)); frac = idx; rendered = new Array(N).fill(false);
    content.classList.add("content--pager");
    track = el("div", { class: "swipe-track" });
    panes = KEYS.map(() => el("section", { class: "swipe-pane" }));
    panes.forEach(p => track.appendChild(p));
    content.appendChild(track);
    measure(); ensureNear(idx); paint();
    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
  }

  function goToTab(k) {
    const i = KEYS.indexOf(k); if (i < 0) return false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    settle(i); return true;
  }

  window.addEventListener("resize", () => { measure(); paint(); });
  return { mount, goToTab, has: () => !!(track && track.isConnected), isTab: k => KEYS.includes(k), activePane: () => panes[idx] };
})();

function applyTheme() {
  const t = State.settings.theme;
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0b1120" : "#13203f");
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => State.settings.theme === "auto" && applyTheme());

function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

/* Re-render au franchissement de la bascule mobile/desktop (montage/démontage du pager). */
let _wasMobile = window.matchMedia("(max-width: 880px)").matches;
window.addEventListener("resize", () => {
  const m = window.matchMedia("(max-width: 880px)").matches;
  if (m !== _wasMobile) { _wasMobile = m; if (curBudget()) renderApp(); }
});

function renderApp() {
  const app = $("#app");
  if (!app) return;
  const b = curBudget();
  if (!b) { showOnboarding(); return; }
  const v = VIEWS[_view] || VIEWS.dashboard;
  app.innerHTML = "";

  // ---- barre latérale (desktop) ----
  const navBox = el("div", { class: "nav-main" }, TABS.map(t => navBtn(t.k, t.label, t.icon)));
  const footBox = el("div", { class: "nav-foot-list" },
    navBtn("settings", "Réglages", "gear"),
    navBtn("help", "Aide", "info"));
  const sidebar = el("aside", { class: "sidebar", "aria-label": "Navigation" },
    el("div", { class: "brand", html: I.logo + "<span>Horizon<br>Budget</span>" }),
    el("button", { class: "nav-add", onclick: openQuickAdd }, el("span", { class: "ico", html: I.plus }), "Ajouter"),
    navBox,
    el("div", { class: "nav-sep" }),
    footBox,
    el("div", { class: "nav-foot" },
      el("button", { class: "budget-pill", onclick: openBudgetSwitcher, title: "Changer de budget" },
        el("span", { class: "b-ico" }, b.emoji),
        el("span", { class: "b-name" }, b.name, b.scenarioOf ? " 🧪" : ""),
        el("span", { html: ico("swap", 15), style: "opacity:.6" }))));

  // ---- barre du haut ----
  const themeBtn = el("button", {
    class: "btn btn-ghost btn-ico", html: ico(isDark() ? "sun" : "moon", 18), title: "Basculer clair/sombre",
    onclick: () => { State.settings.theme = isDark() ? "light" : "dark"; applyTheme(); persist(); renderApp(); }
  });
  const gearBtn = el("button", { class: "btn btn-ghost btn-ico only-mobile", html: ico("gear", 18), title: "Réglages", onclick: () => go("settings") });
  const topbar = el("div", { class: "topbar" },
    el("button", { class: "topbar-title", onclick: openBudgetSwitcher, title: "Changer de budget" },
      ...topTitleInner(v, b)),
    el("div", { class: "topbar-actions" }, Sync.chipEl(), gearBtn, themeBtn));

  const content = el("div", { class: "content" });
  const main = el("main", { class: "main" }, topbar, content);

  // ---- barre du bas (mobile) : 2 onglets · FAB central · 2 onglets ----
  const tabBtn = k => el("button", {
    class: "bn-tab" + (_view === k ? " active" : ""), "data-k": k, "aria-current": _view === k ? "page" : null, onclick: () => go(k)
  }, el("span", { class: "ico", html: I[VIEWS[k].icon] }), VIEWS[k].label);
  const bottomnav = el("nav", { class: "bottomnav", "aria-label": "Navigation principale" },
    tabBtn("dashboard"), tabBtn("budget"),
    el("button", { class: "bn-fab", html: ico("plus", 26), title: "Ajout rapide", onclick: openQuickAdd }),
    tabBtn("suivi"), tabBtn("avenir"));

  app.append(sidebar, main, bottomnav);
  // Séparateur de barre du haut façon iOS : n'apparaît que quand le contenu glisse dessous.
  // Capture (3e arg true) : le scroll ne bouillonne pas, mais les panneaux du pager le déclenchent ainsi.
  content.addEventListener("scroll", e => {
    topbar.classList.toggle("scrolled", (e.target.scrollTop || 0) > 4);
  }, true);
  if (isMobile() && TABS.some(t => t.k === _view)) {
    Pager.mount(content, _view);          // swipe horizontal entre les 4 onglets
  } else {
    v.render(content);
    Juice.view(content);
  }

  function navBtn(k, label, icon) {
    return el("button", { class: "nav-item" + (_view === k ? " active" : ""), title: label, "aria-current": _view === k ? "page" : null, onclick: () => go(k) },
      el("span", { class: "ico", html: I[icon] }), el("span", { class: "nav-label" }, label));
  }
}

/* Barre de sous-onglets d'un hub (Suivi / Avenir). */
function subTabBar(hub) {
  const cur = _sub[hub] || HUBS[hub].def;
  return el("div", { class: "subtabs" }, HUBS[hub].subs.map(s =>
    el("button", { class: "subtab" + (s.k === cur ? " on" : ""), "aria-current": s.k === cur ? "page" : null, onclick: () => { _sub[hub] = s.k; renderApp(); $(".content") && ($(".content").scrollTop = 0); } }, s.label)));
}

function viewSuivi(root) {
  root.append(el("div", { class: "content-inner" }, subTabBar("suivi")));
  (VIEWS[_sub.suivi] || VIEWS.tracking).render(root);
}
function viewAvenir(root) {
  root.append(el("div", { class: "content-inner" }, subTabBar("avenir")));
  (VIEWS[_sub.avenir] || VIEWS.projection).render(root);
}

function openQuickAdd() {
  const b = curBudget();
  const m = modal({
    title: "Ajout rapide",
    body: el("div", { style: "display:flex; flex-direction:column; gap:8px; padding:4px 0 8px" },
      Custom.quick().map(q => el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => q.run(b, m.close) }, `${q.emoji} ${q.label}`)))
  });
}

function openBudgetSwitcher() {
  const active = State.budgets.filter(x => !x.archived);
  const m = modal({
    title: "Changer de budget",
    body: el("div", { style: "display:flex; flex-direction:column; gap:6px; padding:4px 0 8px" },
      active.map(x => el("button", {
        class: "btn", style: "justify-content:flex-start; padding:11px 13px" + (x.id === State.activeBudgetId ? "; border-color:var(--accent)" : ""),
        onclick: () => { State.activeBudgetId = x.id; persist(); m.close(); renderApp(); }
      }, `${x.emoji} ${x.name}`, x.scenarioOf ? el("span", { class: "tag-scen", style: "margin-left:8px" }, "scénario") : null,
        x.id === State.activeBudgetId ? el("span", { class: "badge b-pos", style: "margin-left:auto" }, "actif") : null)),
      el("button", { class: "btn btn-ghost", style: "justify-content:flex-start", onclick: () => { m.close(); go("budgets"); } }, "📂 Gérer mes budgets…"))
  });
}

/* ---- raccourcis clavier ---- */
document.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea") || _openModals.length) return;
  const map = { "1": "dashboard", "2": "budget", "3": "suivi", "4": "avenir", "5": "settings" };
  if (map[e.key]) go(map[e.key]);
  if (e.key === "n") { e.preventDefault(); openTxEditor(curBudget(), null); }
});

/* ---- démarrage ---- */
loadStateAsync().then(() => {
  Custom.ensure();
  applyTheme();
  Custom.apply();
  Sync.init();
  if (!State.onboarded || !State.budgets.length) showOnboarding();
  else { renderApp(); }
});
window.addEventListener("beforeunload", () => {
  if (window._wipe) return; // effacement volontaire : ne pas re-sauvegarder
  persistSync();
});
