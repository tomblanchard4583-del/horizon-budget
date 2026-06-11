"use strict";
/* ============ vue : réglages, sauvegarde, aide ============ */

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
      fField("Animations & célébrations", el("label", { class: "switch", style: "margin-top:8px" },
        el("input", { type: "checkbox", checked: s.juice !== false, onchange: e => { s.juice = e.target.checked; persist(); } }),
        el("span", { class: "tr" })))),
    el("p", { class: "xs muted mt12" }, "L'inflation s'applique aux postes réglés sur « suit l'inflation » et permet de tester des scénarios macro-économiques. Les animations (confettis, chiffres qui défilent, série 🔥) se désactivent ici — elles respectent aussi le réglage « réduire les animations » de votre système.")
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
    generalCard, syncCard, dataCard, installCard, dangerCard, aboutCard));
}
