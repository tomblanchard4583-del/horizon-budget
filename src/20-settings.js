"use strict";
/* ============ vue : réglages, sauvegarde, aide ============ */

let _persoOpen = {};

/* Une ligne réglable : nom + (réordonner) + visibilité. */
function persoRow(scope, allIds, id, orderable) {
  const hidden = Custom.isHidden(scope, id);
  const o = Custom.order(scope, allIds), i = o.indexOf(id);
  const locked = scope === "nav" && (id === "settings" || id === "dashboard");
  return el("div", { class: "perso-row" + (hidden ? " off" : "") },
    orderable ? el("span", { class: "pr-grip", html: ico("menu", 15) }) : null,
    el("span", { class: "pr-name" }, Custom.label(scope, id)),
    orderable ? el("button", { class: "pr-btn", title: "Monter", disabled: i <= 0, html: ico("chevU", 16), onclick: () => { Custom.move(scope, allIds, id, -1); Custom.save(); } }) : null,
    orderable ? el("button", { class: "pr-btn", title: "Descendre", disabled: i >= o.length - 1, html: ico("chevD", 16), onclick: () => { Custom.move(scope, allIds, id, 1); Custom.save(); } }) : null,
    el("label", { class: "switch", style: "margin-left:4px", title: hidden ? "Afficher" : "Masquer" },
      el("input", { type: "checkbox", checked: !hidden, disabled: locked, onchange: e => { Custom.setHidden(scope, id, !e.target.checked); Custom.save(); } }),
      el("span", { class: "tr" })));
}

function persoList(scope, ids, orderable) {
  return el("div", { class: "perso-list" }, Custom.order(scope, ids).map(id => persoRow(scope, ids, id, orderable)));
}

function persoDetails(key, summary, resetFn, ...body) {
  const d = el("details", { class: "card", style: "padding:0", open: !!_persoOpen[key] },
    el("summary", { class: "tbl-summary" }, el("span", { html: ico("eye", 15) }), el("span", {}, summary), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: e => { e.preventDefault(); e.stopPropagation(); resetFn(); Custom.save(); } }, "Réinitialiser")),
    el("div", { style: "padding:4px 14px 14px; display:flex; flex-direction:column; gap:12px" }, ...body));
  d.addEventListener("toggle", () => { _persoOpen[key] = d.open; });
  return d;
}

function buildPersonaCard() {
  const c = Custom.get();

  // apparence
  const swatches = el("div", { class: "swatch-row" },
    el("button", { class: "swatch auto" + (c.accent ? "" : " on"), title: "Couleur par défaut", onclick: () => { c.accent = null; Custom.save(); } }, "Déf."),
    Custom.ACCENTS.map(([hex, name]) => el("button", {
      class: "swatch" + (c.accent === hex ? " on" : ""), title: name, style: "background:" + hex,
      onclick: () => { c.accent = hex; Custom.save(); }
    })));
  const densitySeg = segControl([{ value: "comfortable", label: "Confort" }, { value: "compact", label: "Compact" }],
    c.density, v => { c.density = v; Custom.save(); });

  // bouton d'ajout rapide
  const byId = {}; Custom.quick().forEach(q => byId[q.id] = q);
  const fabActionRows = el("div", { class: "perso-list" }, Custom.quick().map(q => {
    const on = c.fab.actions.includes(q.id);
    const fi = c.fab.actions.indexOf(q.id);
    return el("div", { class: "perso-row" + (on ? "" : " off") },
      el("span", { class: "pr-name" }, `${q.emoji} ${q.label}`),
      el("button", { class: "pr-btn", title: "Monter", disabled: !on || fi <= 0, html: ico("chevU", 16), onclick: () => { c.fab.actions.splice(fi - 1, 0, c.fab.actions.splice(fi, 1)[0]); Custom.save(); } }),
      el("button", { class: "pr-btn", title: "Descendre", disabled: !on || fi >= c.fab.actions.length - 1, html: ico("chevD", 16), onclick: () => { c.fab.actions.splice(fi + 1, 0, c.fab.actions.splice(fi, 1)[0]); Custom.save(); } }),
      el("label", { class: "switch", style: "margin-left:4px" },
        el("input", { type: "checkbox", checked: on, onchange: e => { if (e.target.checked) c.fab.actions.push(q.id); else c.fab.actions = c.fab.actions.filter(x => x !== q.id); Custom.save(); } }),
        el("span", { class: "tr" })));
  }));
  const fabBox = persoDetails("fab", "Bouton d'ajout rapide", () => Custom.resetFab(),
    el("div", { class: "form-grid" },
      fField("Afficher le bouton", el("label", { class: "switch", style: "margin-top:8px" },
        el("input", { type: "checkbox", checked: c.fab.enabled, onchange: e => { c.fab.enabled = e.target.checked; Custom.save(); } }), el("span", { class: "tr" }))),
      fField("Position", el("div", {}, segControl([{ value: "br", label: "↘ Bas droite" }, { value: "bl", label: "↙ Bas gauche" }], c.fab.pos, v => { c.fab.pos = v; Custom.save(); })))),
    el("div", {}, el("div", { class: "xs muted mb8" }, "Actions proposées (ordre & présence)"), fabActionRows));

  // navigation
  const navMobile = Custom.mobileNav();
  const mobileChips = el("div", { class: "flex", style: "flex-wrap:wrap; gap:6px" },
    Custom.navMain().concat(Custom.navFoot().filter(k => k !== "settings")).map(k => {
      const on = navMobile.includes(k);
      return el("button", {
        class: "pc-chip" + (on ? " on" : ""), disabled: !on && navMobile.length >= 4,
        onclick: () => { Custom.toggleMobile(k); Custom.save(); }
      }, VIEWS[k] ? VIEWS[k].label.split(" ")[0] : k);
    }));
  const navBox = persoDetails("nav", "Navigation (sections de l'app)", () => Custom.resetNav(),
    el("div", { class: "xs muted" }, "Masquez les pages dont vous n'avez pas besoin et réordonnez-les. « Tableau de bord » et « Réglages » restent toujours accessibles."),
    persoList("nav", Custom.MAIN, true),
    el("div", { class: "xs muted", style: "margin-top:4px" }, "Pied de menu"),
    persoList("nav", Custom.FOOT, false),
    el("div", {}, el("div", { class: "xs muted mb8", style: "margin-top:4px" }, `Barre mobile — 4 raccourcis max (${navMobile.length}/4)`), mobileChips));

  // contenu des pages
  const dashBox = persoDetails("dashboard", "Tableau de bord", () => Custom.resetPage("dashboard"),
    el("div", {}, el("div", { class: "xs muted mb8" }, "Cartes"), persoList("dash.sec", Custom.catalogIds("dash.sec"), true)),
    el("div", {}, el("div", { class: "xs muted mb8" }, "Indicateurs clés"), persoList("dash.kpi", Custom.catalogIds("dash.kpi"), true)),
    el("div", { class: "form-grid" },
      fField("Graphique de projection", el("div", {}, segControl([{ value: "line", label: "Courbe" }, { value: "bars", label: "Barres" }], c.dash.chart.projection, v => { c.dash.chart.projection = v; Custom.save(); }))),
      fField("Répartition des dépenses", el("div", {}, segControl([{ value: "donut", label: "Anneau" }, { value: "bars", label: "Barres" }], c.dash.chart.breakdown, v => { c.dash.chart.breakdown = v; Custom.save(); })))));
  const pageBoxes = [["budget", "Budget"], ["projection", "Projections"], ["tracking", "Suivi réel"], ["goals", "Objectifs"], ["debts", "Crédits & dettes"], ["events", "Événements de vie"]]
    .map(([k, lbl]) => persoDetails("page." + k, lbl, () => Custom.resetPage(k), persoList("page." + k, Custom.catalogIds("page." + k), true)));

  return el("div", { class: "card card-pad" },
    el("div", { class: "flex mb12" }, el("h3", {}, "🎨 Personnalisation"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => confirmDialog({ title: "Tout réinitialiser ?", body: "Disposition, sections masquées, couleurs et bouton d'ajout reviendront aux valeurs par défaut. Vos données ne sont pas touchées.", okLabel: "Réinitialiser", onOk: () => { Custom.resetAll(); Custom.save(); toast("↩️ Personnalisation réinitialisée"); } }) }, "Tout réinitialiser")),
    el("p", { class: "small muted mb12" }, "Rendez l'application vôtre : masquez ce qui ne vous sert pas, réorganisez, choisissez vos graphiques et couleurs. Pour tout déplacer en direct, lancez le mode personnalisation et parcourez l'app — glissez les éléments, ✕ pour masquer."),
    el("div", { class: "flex", style: "flex-wrap:wrap; gap:8px" },
      el("button", { class: "btn btn-p", html: ico("edit", 16) + "<span>Personnaliser l'affichage (glisser-déposer)</span>", onclick: () => Custom.enterEdit() }),
      el("button", { class: "btn", html: ico("list", 15) + "<span>Gérer les catégories</span>", onclick: () => curBudget() && openCategoryManager(curBudget()) })),
    el("div", { class: "form-grid", style: "margin-top:14px" },
      fField("Couleur d'accent", swatches),
      fField("Densité de l'interface", el("div", {}, densitySeg))),
    el("div", { style: "display:flex; flex-direction:column; gap:8px; margin-top:14px" },
      navBox, fabBox, dashBox, ...pageBoxes));
}

function viewSettings(root) {
  const s = State.settings;

  const themeSeg = segControl([
    { value: "light", label: "☀️ Clair" },
    { value: "dark", label: "🌙 Sombre" },
    { value: "auto", label: "Auto" },
  ], s.theme, v => { s.theme = v; applyTheme(); persist(); });

  const inflI = moneyInput({
    value: s.inflation, cur: "%/an",
    oninput: debounce(e => { s.inflation = parseAmount(e.target.value); persist(); }, 400)
  });
  const nameI = el("input", {
    class: "input", value: s.firstName || "",
    oninput: debounce(e => { s.firstName = e.target.value.trim(); persist(); }, 400)
  });

  const importInp = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  importInp.addEventListener("change", () => importInp.files[0] && importJSON(importInp.files[0], () => renderApp()));

  const generalCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "⚙️ Général"),
    el("div", { class: "form-grid" },
      fField("Thème", el("div", {}, themeSeg)),
      fField("Prénom", nameI),
      fField("Inflation par défaut (projections)", inflI),
      fField("Budget actif", el("div", { class: "small", style: "padding-top:10px" }, curBudget() ? `${curBudget().emoji} ${curBudget().name}` : "—")),
      fField("Animations d'interface", el("label", { class: "switch", style: "margin-top:8px" },
        el("input", { type: "checkbox", checked: s.juice !== false, onchange: e => { s.juice = e.target.checked; persist(); } }),
        el("span", { class: "tr" })))),
    el("p", { class: "xs muted mt12" }, "L'inflation s'applique aux postes réglés sur « suit l'inflation » et permet de tester des scénarios macro-économiques. Les animations d'interface (transitions, graphiques) respectent aussi le réglage « réduire les animations » de votre système.")
  );

  const aiKeyI = el("input", {
    class: "input", type: "password", value: State.ai.key || "", placeholder: "Clé API",
    oninput: debounce(e => { State.ai.key = e.target.value.trim(); persist(); }, 400)
  });
  const aiSeg = segControl([
    { value: "", label: "Désactivé" }, { value: "claude", label: "Claude" }, { value: "gemini", label: "Gemini" },
  ], State.ai.provider || "", v => { State.ai.provider = v; persist(); });
  const aiCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "🤖 Assistance IA (optionnel)"),
    el("p", { class: "small muted mb12" }, "À l'import d'un relevé, les libellés que l'app ne connaît pas encore peuvent être soumis à une IA qui propose une catégorie. Seuls ces libellés sont envoyés — jamais vos montants, soldes ni historique. Coût : une fraction de centime par import, sur votre propre clé. Sans clé, l'apprentissage local fait le travail au fil de vos imports."),
    el("div", { class: "form-grid" },
      fField("Fournisseur", el("div", {}, aiSeg)),
      fField("Clé API (stockée sur cet appareil uniquement)", aiKeyI)),
    el("div", { class: "flex mt12" },
      el("button", {
        class: "btn btn-sm", onclick: async ev => {
          const btn = ev.target.closest("button");
          if (!Intel.aiReady()) { toast("⚠️ Choisissez un fournisseur et saisissez une clé"); return; }
          btn.disabled = true; btn.textContent = "Test en cours…";
          try { await Intel.aiTest(); toast("✅ Connexion IA fonctionnelle"); }
          catch (e) { toast("❌ Échec du test : " + e.message); }
          btn.disabled = false; btn.textContent = "Tester la connexion";
        }
      }, "Tester la connexion")),
    el("p", { class: "xs muted mt12" }, "Obtenir une clé : Claude → console.anthropic.com (API keys) · Gemini → aistudio.google.com (Get API key). La clé n'est jamais synchronisée entre appareils.")
  );

  const syncCard = el("div", { class: "card card-pad" },
    el("div", { class: "flex mb12" }, el("h3", {}, "☁️ Synchronisation multi-appareils"),
      el("span", { class: "spacer" }),
      State.sync.enabled ? el("span", { class: "badge b-pos" }, "active · " + syncStatusText()) : el("span", { class: "badge b-mut" }, "inactive")),
    State.sync.enabled
      ? el("p", { class: "small muted mb12" }, `Salon « ${State.sync.room} » : chaque modification est chiffrée puis envoyée automatiquement ; vos autres appareils se mettent à jour en quelques secondes.`)
      : el("p", { class: "small muted mb12" }, "Reliez Mac, iPhone, Android — et la famille : modifications synchronisées en quasi temps réel, chiffrées de bout en bout, via une base gratuite qui vous appartient (~5 min de configuration, guide pas-à-pas intégré). Même code de salon = budget commun ; codes différents = données séparées."),
    el("div", { class: "flex", style: "flex-wrap:wrap; gap:8px" },
      el("button", { class: "btn " + (State.sync.enabled ? "" : "btn-p"), onclick: () => openSyncSetup() }, State.sync.enabled ? "⚙️ Gérer la synchro" : "☁️ Activer la synchro"),
      State.sync.enabled ? el("button", { class: "btn", onclick: () => { Sync.pushNow(); toast("🔄 Synchronisation lancée"); } }, "🔄 Synchroniser maintenant") : null)
  );

  const dataCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "💾 Sauvegarde & export"),
    el("p", { class: "small muted mb12" }, "Vos données vivent sur cet appareil" + (State.sync.enabled ? " et se synchronisent, chiffrées, via votre salon" : "") + ". Une sauvegarde JSON de temps en temps reste la ceinture de sécurité : elle permet de tout restaurer, n'importe où."),
    el("div", { class: "flex", style: "flex-wrap:wrap; gap:8px" },
      el("button", { class: "btn btn-p", html: ico("down", 16) + "<span>Tout sauvegarder (JSON)</span>", onclick: () => exportJSON(false) }),
      el("button", { class: "btn", html: ico("down", 16) + "<span>Exporter le budget actif</span>", onclick: () => exportJSON(true) }),
      el("button", { class: "btn", html: ico("up", 16) + "<span>Importer un fichier</span>", onclick: () => importInp.click() }),
      el("button", { class: "btn", html: ico("down", 16) + "<span>Transactions en CSV</span>", onclick: exportTransactionsCSV }),
      importInp)
  );

  const online = location.protocol === "https:";
  const appUrl = location.origin + location.pathname;
  const installCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "📲 Installer & partager l'application"),
    el("div", { class: "small", style: "line-height:1.9" },
      online ? el("div", {}, el("b", {}, "Adresse de l'application : "),
        el("code", { style: "word-break:break-all" }, appUrl), " ",
        el("button", { class: "btn btn-sm btn-ghost", style: "vertical-align:middle", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(appUrl).then(() => toast("🔗 Lien copié")); } }, "Copier le lien")) : null,
      el("div", {}, el("b", {}, "iPhone / iPad : "), online ? "dans Safari : Partager → « Sur l'écran d'accueil ». L'app s'installe comme une vraie application, utilisable hors-ligne." : "ouvrez le fichier dans Safari, puis Partager → « Sur l'écran d'accueil »."),
      el("div", {}, el("b", {}, "Android : "), online ? "dans Chrome : menu ⋮ → « Installer l'application »." : "ouvrez-le dans Chrome, menu ⋮ → « Ajouter à l'écran d'accueil »."),
      online ? el("div", {}, el("b", {}, "Mises à jour : "), "automatiques — chaque nouvelle version est récupérée à l'ouverture suivante.") : null,
      el("div", {}, el("b", {}, "Partager : "), online ? "envoyez le lien ci-dessus. Chacun démarre avec ses propres données (rejoignez le même salon de synchro pour un budget commun)." : el("span", {}, "envoyez le fichier ", el("code", {}, "horizon-budget.html"), " (mail, AirDrop, clé USB…) — il contient toute l'application."))
    )
  );

  const dangerCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "🧨 Zone sensible"),
    el("div", { class: "flex", style: "flex-wrap:wrap; gap:8px" },
      el("button", {
        class: "btn", onclick: () => {
          State.onboarded = false;
          persist();
          location.reload();
        }
      }, "Relancer l'assistant de démarrage"),
      el("button", {
        class: "btn btn-danger", html: ico("trash", 15) + "<span>Tout effacer</span>", onclick: () => confirmDialog({
          title: "Effacer toutes les données ?",
          body: "Tous les budgets, transactions et réglages seront définitivement supprimés de cet appareil. Exportez une sauvegarde avant si nécessaire.",
          okLabel: "Tout effacer", danger: true,
          onOk: () => { window._wipe = true; localStorage.removeItem(STORE_KEY); location.reload(); }
        })
      })),
  );

  const aboutCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "ℹ️ À propos"),
    el("div", { class: "small muted", style: "line-height:1.8" },
      el("div", {}, el("b", { style: "color:var(--tx)" }, "Horizon Budget"), " — planification, projection et suivi de budget."),
      el("div", {}, "Fonctionne 100 % hors-ligne · aucune donnée transmise (hors synchro chiffrée, si vous l'activez) · sans compte ni pub."),
      el("div", {}, "Les projections sont des estimations basées sur vos hypothèses : elles ne constituent pas un conseil financier."))
  );

  root.append(el("div", { class: "content-inner grid", style: "gap:16px" },
    generalCard, buildPersonaCard(), aiCard, syncCard, dataCard, installCard, dangerCard, aboutCard));
}
