"use strict";
/* ============ vue : multi-budgets, scénarios & comparaison ============ */

let _compareIds = [];

function viewBudgets(root) {
  const ymNow = ymOf(todayStr());
  const active = State.budgets.filter(b => !b.archived);
  const archived = State.budgets.filter(b => b.archived);

  const cards = active.map(b => {
    const m0 = plannedMonth(b, ymNow);
    const isCur = b.id === State.activeBudgetId;
    const parent = b.scenarioOf ? budgetById(b.scenarioOf) : null;
    return el("div", { class: "card card-pad", style: isCur ? "border-color:var(--accent); border-width:1.5px" : "" },
      el("div", { class: "flex mb8" },
        el("span", { style: "font-size:24px" }, b.emoji),
        el("div", { style: "flex:1; min-width:0" },
          el("h3", { style: "font-size:15.5px" }, b.name, " ", parent ? el("span", { class: "tag-scen" }, "scénario") : null),
          el("div", { class: "xs muted" },
            (SITUATIONS.find(s => s.id === b.situation) || {}).t || "",
            parent ? ` · variante de « ${parent.name} »` : "",
            ` · ${b.currency}`)),
        isCur ? el("span", { class: "badge b-pos" }, "actif") : null),
      el("div", { class: "small", style: "line-height:1.8" },
        el("div", { class: "flex" }, el("span", { class: "muted" }, "Revenus / mois"), el("span", { class: "spacer" }), el("b", { class: "mono pos" }, fmtMoney(m0.income, b.currency, { dec: 0 }))),
        el("div", { class: "flex" }, el("span", { class: "muted" }, "Dépenses / mois"), el("span", { class: "spacer" }), el("b", { class: "mono" }, fmtMoney(m0.expense, b.currency, { dec: 0 }))),
        el("div", { class: "flex" }, el("span", { class: "muted" }, "Capacité d'épargne"), el("span", { class: "spacer" }), el("b", { class: "mono " + (m0.net >= 0 ? "pos" : "neg") }, fmtMoney(m0.net, b.currency, { dec: 0, sign: true })))),
      el("div", { class: "flex mt12", style: "flex-wrap:wrap; gap:6px" },
        !isCur ? el("button", { class: "btn btn-sm btn-p", onclick: () => { State.activeBudgetId = b.id; persist(); go("dashboard"); } }, "Ouvrir") : null,
        el("button", { class: "btn btn-sm", title: "Dupliquer", onclick: () => duplicateBudget(b, false) }, "⧉ Dupliquer"),
        el("button", { class: "btn btn-sm", title: "Créer une variante pour tester des hypothèses", onclick: () => duplicateBudget(b, true) }, "🧪 Scénario"),
        el("button", {
          class: "btn btn-sm btn-ghost", html: ico("more", 16), onclick: ev => {
            ev.stopPropagation();
            budgetMenu(b);
          }
        }))
    );
  });

  const compareCard = active.length >= 2 ? buildCompare(active) : null;

  root.append(el("div", { class: "content-inner" },
    el("div", { class: "flex mb12" },
      el("h3", {}, "📂 Mes budgets"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p btn-sm", html: ico("plus", 14) + "<span>Nouveau budget</span>", onclick: () => openBudgetCreator() })),
    el("div", { class: "grid g3" }, cards),
    compareCard ? el("div", { class: "mt28" }, compareCard) : null,
    archived.length ? el("div", { class: "mt28" },
      el("h3", { class: "mb12" }, "🗄️ Budgets archivés"),
      el("div", { class: "card" }, archived.map(b => el("div", { class: "item-row", style: "cursor:default" },
        el("div", { class: "i-emoji" }, b.emoji),
        el("div", { class: "i-main" }, el("div", { class: "i-name" }, b.name)),
        el("button", { class: "btn btn-sm", onclick: () => { b.archived = false; persist(); renderApp(); } }, "Restaurer"),
        el("button", {
          class: "btn btn-sm btn-danger", onclick: () => confirmDialog({
            title: `Supprimer définitivement « ${b.name} » ?`,
            body: "Le budget et ses transactions seront définitivement effacés. Pensez à l'exporter avant si besoin.",
            okLabel: "Supprimer", danger: true,
            onOk: () => {
              State.budgets = State.budgets.filter(x => x.id !== b.id);
              State.transactions = State.transactions.filter(t => t.budgetId !== b.id);
              persist(); renderApp();
            }
          })
        }, "Supprimer"))))) : null
  ));

  function budgetMenu(b) {
    const m = modal({
      title: b.emoji + " " + b.name,
      body: el("div", { style: "display:flex; flex-direction:column; gap:8px; padding:4px 0 8px" },
        el("button", { class: "btn", style: "justify-content:flex-start", onclick: () => { m.close(); openBudgetSettings(b); } }, "⚙️ Renommer / paramètres"),
        el("button", { class: "btn", style: "justify-content:flex-start", onclick: () => { State.activeBudgetId = b.id; persist(); m.close(); exportJSON(true); } }, "📤 Exporter ce budget (fichier de partage)"),
        State.budgets.filter(x => !x.archived).length > 1 ? el("button", { class: "btn", style: "justify-content:flex-start", onclick: () => { b.archived = true; if (State.activeBudgetId === b.id) State.activeBudgetId = State.budgets.find(x => !x.archived).id; persist(); m.close(); renderApp(); } }, "🗄️ Archiver") : null,
      )
    });
  }
}

function duplicateBudget(src, asScenario) {
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = asScenario ? src.name + " — scénario" : src.name + " (copie)";
  copy.scenarioOf = asScenario ? src.id : null;
  copy.archived = false;
  copy.createdAt = todayStr();
  // nouveaux identifiants internes (catégories conservées par mapping)
  const idMap = {};
  copy.categories.forEach(c => { const n = uid(); idMap[c.id] = n; c.id = n; });
  copy.categories.forEach(c => { if (c.parentId) c.parentId = idMap[c.parentId]; });
  const subMap = {};
  [...copy.goals, ...copy.accounts, ...copy.events].forEach(x => { const n = uid(); subMap[x.id] = n; x.id = n; });
  copy.debts.forEach(d => { d.id = uid(); d.categoryId = idMap[d.categoryId] || null; });
  copy.items.forEach(it => {
    it.id = uid();
    it.categoryId = idMap[it.categoryId] || null;
    it.savingTo = subMap[it.savingTo] || null;
    it.eventId = subMap[it.eventId] || null;
  });
  State.budgets.push(copy);
  if (asScenario) {
    State.activeBudgetId = copy.id;
    persist(); renderApp();
    toast("🧪 Scénario créé — modifiez librement, l'original est intact");
  } else {
    persist(); renderApp();
    toast("⧉ Budget dupliqué");
  }
}

function openBudgetCreator() {
  let situation = "salarie";
  const nameI = el("input", { class: "input", placeholder: "ex. Budget perso, Couple, Projet maison…" });
  const emojiI = selectInput(BUDGET_EMOJIS.map(e => ({ value: e, label: e })), "💼", { style: "max-width:80px" });
  const curI = selectInput(CURRENCIES.map(c => ({ value: c[0], label: `${c[1]} — ${c[2]}` })), "EUR");
  const balI = moneyInput({ value: "", placeholder: "0" });
  const sitBox = el("div", { class: "choice-grid mt8" });
  const renderSits = () => {
    sitBox.innerHTML = "";
    SITUATIONS.forEach(s => sitBox.append(el("button", {
      class: "choice" + (situation === s.id ? " on" : ""), style: "padding:9px 11px",
      onclick: () => { situation = s.id; renderSits(); }
    }, el("span", { class: "ch-emoji", style: "font-size:19px" }, s.emoji), el("span", {}, el("div", { class: "ch-t", style: "font-size:13px" }, s.t)))));
  };
  renderSits();
  const m = modal({
    title: "Nouveau budget",
    lg: true,
    body: el("div", {},
      el("div", { class: "form-grid" },
        fField("Nom du budget", nameI, { full: true }),
        fField("Emoji", emojiI), fField("Devise", curI),
        fField("Solde de départ", balI)),
      el("div", { class: "small mt12 mb8", style: "font-weight:650; color:var(--tx2)" }, "Modèle de départ"),
      sitBox),
    foot: [el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          const sit = SITUATIONS.find(s => s.id === situation);
          const b = newBudget(nameI.value.trim() || "Nouveau budget", {
            situation, currency: curI.value, initialBalance: numVal(balI),
            emoji: emojiI.value, color: BUDGET_COLORS[State.budgets.length % BUDGET_COLORS.length],
          });
          applyTemplate(b, situation);
          State.budgets.push(b);
          State.activeBudgetId = b.id;
          persist(); m.close(); go("budget");
          toast(`✅ Budget « ${b.name} » créé`);
        }
      }, "Créer")]
  });
  nameI.focus();
}

function openBudgetSettings(b) {
  const nameI = el("input", { class: "input", value: b.name });
  const emojiI = el("input", { class: "input", value: b.emoji, style: "max-width:90px; text-align:center; font-size:18px" });
  const curI = selectInput(CURRENCIES.map(c => ({ value: c[0], label: `${c[1]} — ${c[2]}` })), b.currency);
  const balI = moneyInput({ value: b.initialBalance });
  const balDateI = el("input", { class: "input", type: "date", value: b.initialDate });
  const cycleI = selectInput([{ value: 1, label: "Le 1er du mois" }].concat([5, 10, 15, 20, 25, 27, 28].map(d => ({ value: d, label: `Le ${d}` }))), b.cycleDay);
  const notesI = el("textarea", { class: "input", value: b.notes || "" });
  const m = modal({
    title: "Paramètres du budget",
    body: el("div", { class: "form-grid" },
      fField("Nom", nameI, { full: true }),
      fField("Emoji", emojiI), fField("Devise", curI),
      fField("Solde de référence", balI), fField("À la date du", balDateI),
      fField("Début du mois budgétaire", cycleI, { full: true }),
      fField("Notes", notesI, { full: true })),
    foot: [el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          b.name = nameI.value.trim() || b.name;
          b.emoji = emojiI.value.trim() || b.emoji;
          b.currency = curI.value;
          b.initialBalance = numVal(balI);
          b.initialDate = balDateI.value || b.initialDate;
          b.cycleDay = +cycleI.value;
          b.notes = notesI.value;
          persist(); m.close(); renderApp();
        }
      }, "Enregistrer")]
  });
}

function buildCompare(budgets) {
  if (_compareIds.length !== 2 || !_compareIds.every(id => budgets.some(b => b.id === id))) {
    _compareIds = [budgets[0].id, budgets[1].id];
  }
  const horizon = Math.min(State.settings.horizonMonths || 24, 120);
  const selA = selectInput(budgets.map(b => ({ value: b.id, label: `${b.emoji} ${b.name}` })), _compareIds[0], { style: "max-width:230px", onchange: e => { _compareIds[0] = e.target.value; renderApp(); } });
  const selB = selectInput(budgets.map(b => ({ value: b.id, label: `${b.emoji} ${b.name}` })), _compareIds[1], { style: "max-width:230px", onchange: e => { _compareIds[1] = e.target.value; renderApp(); } });
  const A = budgetById(_compareIds[0]), B = budgetById(_compareIds[1]);
  const pA = project(A, { months: horizon });
  const pB = project(B, { months: horizon });
  const sameCur = A.currency === B.currency;

  const rows = [
    ["Revenus / mois (moyenne)", avg(pA, "income"), avg(pB, "income")],
    ["Dépenses / mois (moyenne)", avg(pA, "expense"), avg(pB, "expense")],
    ["Capacité d'épargne / mois", avg(pA, "net"), avg(pB, "net")],
    [`Solde dans ${Math.round(horizon / 12 * 10) / 10} an(s)`, pA[pA.length - 1].balance, pB[pB.length - 1].balance],
    ["Patrimoine net à terme", pA[pA.length - 1].netWorth, pB[pB.length - 1].netWorth],
  ];

  return el("div", { class: "card" },
    el("div", { class: "card-head", style: "flex-wrap:wrap" }, el("h3", {}, "⚖️ Comparer deux budgets"), el("span", { class: "spacer" }), selA, el("span", { class: "muted small" }, "vs"), selB),
    sameCur ? el("div", { class: "card-pad" },
      chartLine({
        labels: pA.map(r => r.ym),
        series: [
          { name: A.emoji + " " + A.name, color: "#10b981", values: pA.map(r => r.balance), fill: true },
          { name: B.emoji + " " + B.name, color: "#8b5cf6", values: pB.map(r => r.balance) },
        ],
        cur: A.currency, height: 240,
      }),
      el("div", { class: "tbl-wrap mt12" }, el("table", { class: "tbl" },
        el("thead", {}, el("tr", {}, el("th", {}, ""), el("th", {}, A.emoji + " " + A.name), el("th", {}, B.emoji + " " + B.name), el("th", {}, "Écart"))),
        el("tbody", {}, rows.map(([label, a, bv]) => el("tr", {},
          el("td", {}, label),
          el("td", {}, fmtMoney(a, A.currency, { dec: 0 })),
          el("td", {}, fmtMoney(bv, B.currency, { dec: 0 })),
          el("td", { class: bv - a >= 0 ? "pos" : "neg" }, el("b", {}, fmtMoney(bv - a, A.currency, { dec: 0, sign: true }))))))))
    ) : el("div", { class: "card-pad" }, el("div", { class: "alert a-warn" }, "⚠️ Devises différentes : la comparaison chiffrée n'est pas pertinente.")));

  function avg(p, k) { return p.reduce((s, r) => s + r[k], 0) / p.length; }
}
