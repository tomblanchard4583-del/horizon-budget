"use strict";
/* ============ coquille applicative : navigation & rendu ============ */

const VIEWS = {
  dashboard:  { label: "Tableau de bord", icon: "home",    sub: () => "Vue d'ensemble de votre mois", render: viewDashboard },
  budget:     { label: "Budget",          icon: "list",    sub: () => "Revenus & dépenses planifiés", render: viewBudget },
  projection: { label: "Projections",     icon: "trend",   sub: () => "Votre avenir financier, mois par mois", render: viewProjection },
  calendar:   { label: "Calendrier",      icon: "cal",     sub: () => "Échéances & solde au jour le jour", render: viewCalendar },
  tracking:   { label: "Suivi réel",      icon: "receipt", sub: () => "Transactions & prévu vs réel", render: viewTracking },
  goals:      { label: "Objectifs",       icon: "target",  sub: () => "Épargne, projets & intérêts composés", render: viewGoals },
  debts:      { label: "Crédits & dettes",icon: "card",    sub: () => "Mensualités, amortissement, fin de crédit", render: viewDebts },
  events:     { label: "Événements de vie", icon: "zap",   sub: () => "Anticipez les changements de situation", render: viewEvents },
  budgets:    { label: "Mes budgets",     icon: "layers",  sub: () => "Multi-budgets, scénarios & comparaison", render: viewBudgets },
  settings:   { label: "Réglages",        icon: "gear",    sub: () => "Personnalisation, sauvegarde & partage", render: viewSettings },
  help:       { label: "Aide",            icon: "info",    sub: () => "Tutoriels & questions fréquentes", render: viewHelp },
};
const NAV_ORDER = ["dashboard", "budget", "projection", "calendar", "tracking", "goals", "debts", "events"];
const NAV_FOOT = ["budgets", "help", "settings"];
const MOBILE_NAV = ["dashboard", "budget", "projection", "tracking"];

let _view = "dashboard";

function go(view) {
  _view = VIEWS[view] ? view : "dashboard";
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

function renderApp() {
  const app = $("#app");
  if (!app) return;
  const b = curBudget();
  if (!b) { showOnboarding(); return; }
  const v = VIEWS[_view];
  app.innerHTML = "";

  // barre latérale (desktop)
  const sidebar = el("aside", { class: "sidebar" },
    el("div", { class: "brand", html: I.logo + "<span>Horizon<br>Budget</span>" }),
    NAV_ORDER.map(k => navBtn(k)),
    el("div", { class: "nav-sep" }),
    NAV_FOOT.map(k => navBtn(k)),
    el("div", { class: "nav-foot" },
      el("button", { class: "budget-pill", onclick: openBudgetSwitcher, title: "Changer de budget" },
        el("span", { class: "b-ico" }, b.emoji),
        el("span", { class: "b-name" }, b.name, b.scenarioOf ? " 🧪" : ""),
        el("span", { html: ico("swap", 15), style: "opacity:.6" })))
  );

  // barre du haut
  const themeBtn = el("button", {
    class: "btn btn-ghost btn-ico",
    html: ico(document.documentElement.getAttribute("data-theme") === "dark" ? "sun" : "moon", 18),
    title: "Basculer clair/sombre",
    onclick: () => {
      State.settings.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(); persist(); renderApp();
    }
  });
  const topbar = el("div", { class: "topbar" },
    el("div", {},
      el("h1", {}, v.label),
      el("div", { class: "sub" }, `${b.emoji} ${b.name} · ${v.sub()}`)),
    el("div", { class: "topbar-actions" },
      Sync.chipEl(),
      themeBtn));

  const content = el("div", { class: "content" });
  const main = el("main", { class: "main" }, topbar, content);

  // navigation mobile
  const bottomnav = el("nav", { class: "bottomnav" },
    MOBILE_NAV.map(k => el("button", {
      class: _view === k ? "active" : "",
      onclick: () => go(k)
    }, el("span", { class: "ico", html: I[VIEWS[k].icon] }), VIEWS[k].label.split(" ")[0])),
    el("button", {
      class: !MOBILE_NAV.includes(_view) ? "active" : "",
      onclick: openMobileMenu
    }, el("span", { class: "ico", html: I.menu }), "Plus"));

  // bouton d'action rapide
  const fab = el("button", { class: "fab", html: ico("plus", 24), title: "Ajout rapide", onclick: openQuickAdd });

  app.append(sidebar, main, bottomnav, fab);
  v.render(content);

  function navBtn(k) {
    return el("button", {
      class: "nav-item" + (_view === k ? " active" : ""),
      onclick: () => go(k)
    }, el("span", { class: "ico", html: I[VIEWS[k].icon] }), VIEWS[k].label);
  }
}

function openMobileMenu() {
  const m = modal({
    title: "Navigation",
    body: el("div", { style: "display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:4px 0 8px" },
      [...NAV_ORDER, ...NAV_FOOT].map(k => el("button", {
        class: "btn", style: "justify-content:flex-start; padding:12px 14px",
        onclick: () => { m.close(); go(k); }
      }, el("span", { class: "ico", html: I[VIEWS[k].icon], style: "width:18px;height:18px" }), VIEWS[k].label)))
  });
}

function openQuickAdd() {
  const b = curBudget();
  const m = modal({
    title: "Ajout rapide",
    body: el("div", { style: "display:flex; flex-direction:column; gap:8px; padding:4px 0 8px" },
      el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => { m.close(); openTxEditor(b, null); } }, "🧾 Transaction réelle (dépense / revenu du jour)"),
      el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => { m.close(); openItemEditor(b, newItem("expense"), true); } }, "📉 Dépense planifiée (récurrente ou ponctuelle)"),
      el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => { m.close(); openItemEditor(b, newItem("income"), true); } }, "📈 Revenu planifié"),
      el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => { m.close(); openGoalEditor(b, null); } }, "🎯 Objectif d'épargne"),
      el("button", { class: "btn", style: "justify-content:flex-start; padding:13px 14px", onclick: () => { m.close(); openEventEditor(b, null); } }, "🧭 Événement de vie"))
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
  const map = { "1": "dashboard", "2": "budget", "3": "projection", "4": "calendar", "5": "tracking", "6": "goals", "7": "debts", "8": "events" };
  if (map[e.key]) go(map[e.key]);
  if (e.key === "n") { e.preventDefault(); openTxEditor(curBudget(), null); }
});

/* ---- démarrage ---- */
loadState();
applyTheme();
Sync.init();
if (!State.onboarded || !State.budgets.length) showOnboarding();
else renderApp();
window.addEventListener("beforeunload", () => {
  if (window._wipe) return; // effacement volontaire : ne pas re-sauvegarder
  clearTimeout(_saveTimer);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); } catch (e) {}
});