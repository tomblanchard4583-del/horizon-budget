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

function go(key) {
  const r = ROUTE[key] || ROUTE.dashboard;
  _view = r[0];
  if (r[1]) _sub[_view] = r[1];
  if (HUBS[_view] && !_sub[_view]) _sub[_view] = HUBS[_view].def;
  renderApp();
  const c = $(".content");
  if (c) c.scrollTop = 0;
}

function applyTheme() {
  const t = State.settings.theme;
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0b1120" : "#13203f");
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => State.settings.theme === "auto" && applyTheme());

function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

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
  const sidebar = el("aside", { class: "sidebar" },
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
      el("h1", {}, v.label),
      el("div", { class: "sub" }, `${b.emoji} ${b.name}`,
        State.budgets.filter(x => !x.archived).length > 1 ? el("span", { class: "ico", html: I.chevD, style: "width:12px;height:12px;display:inline-grid;place-items:center;vertical-align:-1px;margin-left:3px;opacity:.6" }) : null,
        ` · ${v.sub()}`)),
    el("div", { class: "topbar-actions" }, Sync.chipEl(), gearBtn, themeBtn));

  const content = el("div", { class: "content" });
  const main = el("main", { class: "main" }, topbar, content);

  // ---- barre du bas (mobile) : 2 onglets · FAB central · 2 onglets ----
  const tabBtn = k => el("button", {
    class: "bn-tab" + (_view === k ? " active" : ""), onclick: () => go(k)
  }, el("span", { class: "ico", html: I[VIEWS[k].icon] }), VIEWS[k].label);
  const bottomnav = el("nav", { class: "bottomnav" },
    tabBtn("dashboard"), tabBtn("budget"),
    el("button", { class: "bn-fab", html: ico("plus", 26), title: "Ajout rapide", onclick: openQuickAdd }),
    tabBtn("suivi"), tabBtn("avenir"));

  app.append(sidebar, main, bottomnav);
  v.render(content);
  Juice.view(content);

  function navBtn(k, label, icon) {
    return el("button", { class: "nav-item" + (_view === k ? " active" : ""), title: label, onclick: () => go(k) },
      el("span", { class: "ico", html: I[icon] }), el("span", { class: "nav-label" }, label));
  }
}

/* Barre de sous-onglets d'un hub (Suivi / Avenir). */
function subTabBar(hub) {
  const cur = _sub[hub] || HUBS[hub].def;
  return el("div", { class: "subtabs" }, HUBS[hub].subs.map(s =>
    el("button", { class: "subtab" + (s.k === cur ? " on" : ""), onclick: () => { _sub[hub] = s.k; renderApp(); $(".content") && ($(".content").scrollTop = 0); } }, s.label)));
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
loadState();
Custom.ensure();
applyTheme();
Custom.apply();
Sync.init();
if (!State.onboarded || !State.budgets.length) showOnboarding();
else { renderApp(); MonthReview.maybeShow(curBudget()); }
window.addEventListener("beforeunload", () => {
  if (window._wipe) return; // effacement volontaire : ne pas re-sauvegarder
  clearTimeout(_saveTimer);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); } catch (e) {}
});
