"use strict";
/* ============ onboarding : premier lancement ============ */

function showOnboarding() {
  const data = { firstName: "", situation: "salarie", currency: "EUR", balance: "", cycleDay: 1 };
  let step = 0;
  const root = el("div", { class: "onb" });
  document.body.append(root);

  const steps = [stepWelcome, stepSituation, stepParams, stepDone];

  function render() {
    root.innerHTML = "";
    const card = el("div", { class: "onb-card" });
    card.append(
      el("div", { class: "onb-logo", html: I.logo + "<span>Horizon Budget</span>" }),
      el("div", { class: "onb-steps" }, steps.map((_, i) => el("i", { class: i <= step ? "on" : "" })))
    );
    steps[step](card);
    root.append(card);
  }

  function navBtns(card, canNext, nextLabel) {
    card.append(el("div", { class: "flex mt28" },
      step > 0 ? el("button", { class: "btn", onclick: () => { step--; render(); } }, "← Retour") : el("span"),
      el("span", { class: "spacer" }),
      el("button", {
        class: "btn btn-p", style: "padding:10px 22px",
        onclick: () => {
          if (canNext && !canNext()) return;
          if (step < steps.length - 1) { step++; render(); } else finish();
        }
      }, nextLabel || "Continuer →")
    ));
  }

  function stepWelcome(card) {
    card.append(
      el("h2", {}, "Bienvenue 👋"),
      el("p", { class: "onb-sub" }, "Horizon Budget vous aide à planifier vos finances, projeter votre avenir et suivre vos dépenses — quelle que soit votre situation. Toutes vos données restent sur cet appareil."),
      fField("Votre prénom (facultatif)", el("input", {
        class: "input", placeholder: "ex. Tom", value: data.firstName,
        oninput: e => data.firstName = e.target.value.trim()
      }))
    );
    navBtns(card);
  }

  function stepSituation(card) {
    card.append(
      el("h2", {}, "Quelle est votre situation ?"),
      el("p", { class: "onb-sub" }, "On préremplit votre budget avec des postes typiques — tout reste modifiable, et vous pourrez prévoir les changements futurs (fin d'études, nouvel emploi…)."),
      el("div", { class: "choice-grid" }, SITUATIONS.map(s => el("button", {
        class: "choice" + (data.situation === s.id ? " on" : ""),
        onclick: e => { data.situation = s.id; render(); }
      },
        el("span", { class: "ch-emoji" }, s.emoji),
        el("span", {}, el("div", { class: "ch-t" }, s.t), el("div", { class: "ch-d" }, s.d))
      )))
    );
    navBtns(card);
  }

  function stepParams(card) {
    const balInp = moneyInput({ value: data.balance, placeholder: "ex. 1 250", oninput: e => data.balance = e.target.value });
    card.append(
      el("h2", {}, "Derniers réglages"),
      el("p", { class: "onb-sub" }, "Trois informations pour démarrer les projections."),
      el("div", { class: "form-grid" },
        fField("Devise", selectInput(CURRENCIES.map(c => ({ value: c[0], label: `${c[1]} — ${c[2]}` })), data.currency, { onchange: e => data.currency = e.target.value })),
        fField("Solde actuel de votre compte", balInp),
        fField("Début de votre mois budgétaire", selectInput(
          [{ value: 1, label: "Le 1er du mois (classique)" }].concat([5, 10, 15, 20, 25, 27, 28].map(d => ({ value: d, label: `Le ${d} (jour de paie)` }))),
          data.cycleDay, { onchange: e => data.cycleDay = +e.target.value })),
        fField("Inflation estimée (pour les projections)", (() => {
          const w = moneyInput({ value: State.settings.inflation, cur: "%/an", oninput: e => State.settings.inflation = parseAmount(e.target.value) });
          return w;
        })())
      )
    );
    navBtns(card);
  }

  function stepDone(card) {
    const sit = SITUATIONS.find(s => s.id === data.situation);
    card.append(
      el("h2", {}, "Tout est prêt " + (data.firstName ? data.firstName + " " : "") + "✨"),
      el("p", { class: "onb-sub" }, `Votre budget « ${sit.t} » va être créé avec des postes typiques et des montants indicatifs. Première étape : ajustez chaque montant à votre réalité.`),
      el("div", { class: "card card-pad", style: "font-size:13.5px; line-height:1.8" },
        el("div", {}, "✅ Modifiez ou supprimez les postes proposés"),
        el("div", {}, "📅 Planifiez les changements futurs (nouvel emploi, déménagement…)"),
        el("div", {}, "📈 Projetez votre solde sur des mois ou des années"),
        el("div", {}, "🎯 Fixez des objectifs d'épargne et suivez vos dépenses réelles"),
        el("div", {}, "🔒 Vos données restent sur votre appareil — pensez à exporter une sauvegarde")
      )
    );
    navBtns(card, null, "Créer mon budget 🚀");
  }

  function finish() {
    State.settings.firstName = data.firstName;
    const sit = SITUATIONS.find(s => s.id === data.situation);
    const b = newBudget("Budget " + (data.firstName || "principal"), {
      situation: data.situation,
      currency: data.currency,
      cycleDay: data.cycleDay,
      initialBalance: parseAmount(data.balance),
      emoji: sit.emoji === "📄" ? "💼" : sit.emoji,
    });
    applyTemplate(b, data.situation);
    State.budgets.push(b);
    State.activeBudgetId = b.id;
    State.onboarded = true;
    persist();
    root.remove();
    renderApp();
    Juice.welcome();
    if (TEMPLATE_ITEMS[data.situation] && TEMPLATE_ITEMS[data.situation].length) {
      setTimeout(() => toast("💡 Montants indicatifs préremplis : ajustez-les dans l'onglet Budget"), 600);
    }
  }

  render();
}
