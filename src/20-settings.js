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
      fField("Budget actif", el("div", { class: "small", style: "padding-top:10px" }, curBudget() ? `${curBudget().emoji} ${curBudget().name}` : "—"))),
    el("p", { class: "xs muted mt12" }, "L'inflation s'applique aux postes réglés sur « suit l'inflation » et permet de tester des scénarios macro-économiques.")
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
    el("h3", { class: "mb12" }, "💾 Sauvegarde & partage"),
    el("p", { class: "small muted mb12" }, "Vos données restent uniquement sur cet appareil (aucun serveur, aucun compte). Exportez régulièrement une sauvegarde, et utilisez-la pour transférer vos budgets sur un autre appareil."),
    el("div", { class: "flex", style: "flex-wrap:wrap; gap:8px" },
      el("button", { class: "btn btn-p", html: ico("down", 16) + "<span>Tout sauvegarder (JSON)</span>", onclick: () => exportJSON(false) }),
      el("button", { class: "btn", html: ico("down", 16) + "<span>Exporter le budget actif</span>", onclick: () => exportJSON(true) }),
      el("button", { class: "btn", html: ico("up", 16) + "<span>Importer un fichier</span>", onclick: () => importInp.click() }),
      el("button", { class: "btn", html: ico("down", 16) + "<span>Transactions en CSV</span>", onclick: exportTransactionsCSV }),
      importInp)
  );

  const installCard = el("div", { class: "card card-pad" },
    el("h3", { class: "mb12" }, "📲 Utiliser sur téléphone & partager"),
    el("div", { class: "small", style: "line-height:1.9" },
      el("div", {}, el("b", {}, "Partager l'application : "), "envoyez simplement le fichier ", el("code", {}, "horizon-budget.html"), " (mail, AirDrop, clé USB…). Il contient toute l'application."),
      el("div", {}, el("b", {}, "iPhone / iPad : "), "ouvrez le fichier dans Safari (ou hébergez-le en ligne), puis Partager → « Sur l'écran d'accueil »."),
      el("div", {}, el("b", {}, "Android : "), "ouvrez-le dans Chrome, menu ⋮ → « Ajouter à l'écran d'accueil »."),
      el("div", {}, el("b", {}, "Transférer vos données : "), "exportez la sauvegarde JSON ici, envoyez-la sur l'autre appareil, puis importez-la."),
      el("div", { class: "muted xs mt8" }, "Astuce : chaque appareil garde ses propres données. La sauvegarde JSON sert de synchronisation manuelle.")
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
      el("div", {}, "100 % hors-ligne · aucune donnée transmise · fichier unique HTML/JS."),
      el("div", {}, "Les projections sont des estimations basées sur vos hypothèses : elles ne constituent pas un conseil financier."))
  );

  root.append(el("div", { class: "content-inner grid", style: "gap:16px" },
    generalCard, syncCard, dataCard, installCard, dangerCard, aboutCard));
}
