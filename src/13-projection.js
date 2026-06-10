"use strict";
/* ============ vue : projections ============ */

let _projHorizon = null;
let _projTableAll = false;

function viewProjection(root) {
  const b = curBudget();
  const cur = b.currency;
  if (_projHorizon == null) _projHorizon = State.settings.horizonMonths || 24;

  const horizons = [
    { value: 6, label: "6 mois" }, { value: 12, label: "1 an" }, { value: 24, label: "2 ans" },
    { value: 60, label: "5 ans" }, { value: 120, label: "10 ans" }, { value: 240, label: "20 ans" }, { value: 360, label: "30 ans" },
  ];
  const scenarios = [
    { value: "expected", label: "Attendu" },
    { value: "optimistic", label: "Optimiste" },
    { value: "pessimistic", label: "Pessimiste" },
  ];

  const proj = project(b, { months: _projHorizon, scenarioMode: State.settings.scenarioMode });
  const last = proj[proj.length - 1];
  const firstNeg = proj.find(r => r.balance < 0);
  const totSaved = proj.reduce((s, r) => s + r.saving, 0);
  const avgNet = proj.reduce((s, r) => s + r.net, 0) / proj.length;

  const controls = el("div", { class: "flex", style: "flex-wrap:wrap; gap:10px" },
    segControl(horizons, _projHorizon, v => { _projHorizon = v; State.settings.horizonMonths = v; persist(); renderApp(); }, true),
    el("span", { class: "spacer" }),
    el("div", { class: "flex", style: "gap:6px" },
      el("span", { class: "small muted" }, "Scénario"),
      segControl(scenarios, State.settings.scenarioMode, v => { State.settings.scenarioMode = v; persist(); renderApp(); }, true)),
  );

  const hasVariable = b.items.some(i => i.variable);
  const scenarioNote = State.settings.scenarioMode !== "expected"
    ? el("div", { class: "alert " + (State.settings.scenarioMode === "optimistic" ? "a-ok" : "a-warn") },
      el("span", { class: "a-ico", html: ico("info", 16) }),
      el("span", {}, State.settings.scenarioMode === "optimistic"
        ? "Scénario optimiste : les postes variables utilisent leur fourchette haute (revenus) ou basse (dépenses)."
        : "Scénario pessimiste : revenus variables au minimum, dépenses variables au maximum.",
        hasVariable ? "" : " Aucun poste variable défini : identique au scénario attendu."))
    : null;

  const kpis = el("div", { class: "grid g4" },
    kpiCard("Solde dans " + horizonLabel(_projHorizon), fmtMoney(last.balance, cur), `${fmtYm(last.ym)}`, last.balance < 0 ? "neg" : "pos"),
    kpiCard("Patrimoine net à terme", fmtMoney(last.netWorth, cur), "solde + épargne − dettes", last.netWorth < 0 ? "neg" : ""),
    kpiCard("Capacité mensuelle moyenne", fmtMoney(avgNet, cur, { sign: true }), "revenus − dépenses, en moyenne", avgNet < 0 ? "neg" : "pos"),
    firstNeg
      ? kpiCard("⚠️ Premier mois dans le rouge", fmtYm(firstNeg.ym), fmtMoney(firstNeg.balance, cur), "neg")
      : kpiCard("Épargne versée sur la période", fmtMoney(totSaved, cur), "vers objectifs & comptes", "pos")
  );

  const markers = proj.flatMap((r, i) => r.events.map(e => ({ idx: i, label: e.name, emoji: e.emoji })));
  const chartCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Solde & patrimoine projetés"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", html: ico("print", 15) + "<span>Imprimer / PDF</span>", onclick: () => window.print() }),
      el("button", { class: "btn btn-sm btn-ghost", html: ico("down", 15) + "<span>CSV</span>", onclick: () => exportProjectionCSV(proj) })),
    el("div", { class: "legend" },
      el("span", { class: "lg" }, el("span", { class: "cat-dot", style: "background:#10b981" }), "Solde courant"),
      el("span", { class: "lg" }, el("span", { class: "cat-dot", style: "background:#8b5cf6" }), "Patrimoine net (épargne et dettes comprises)"),
      markers.length ? el("span", { class: "lg" }, "📌 événements de vie") : null),
    el("div", { class: "card-pad" }, chartLine({
      labels: proj.map(r => r.ym),
      series: [
        { name: "Solde", color: "#10b981", values: proj.map(r => r.balance), fill: true },
        { name: "Patrimoine net", color: "#8b5cf6", values: proj.map(r => r.netWorth), dash: true },
      ],
      markers, cur, height: 290,
    }))
  );

  const barsCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Revenus vs dépenses par mois")),
    el("div", { class: "card-pad" }, chartBars({
      labels: proj.map(r => r.ym),
      pos: proj.map(r => r.income),
      neg: proj.map(r => r.expense),
      cur, height: 220,
    }))
  );

  // tableau détaillé
  const shown = _projTableAll ? proj : proj.slice(0, 24);
  const tbl = el("table", { class: "tbl" },
    el("thead", {}, el("tr", {},
      el("th", {}, "Mois"), el("th", {}, "Revenus"), el("th", {}, "Dépenses"),
      el("th", {}, "Reste"), el("th", {}, "Solde cumulé"), el("th", {}, "Patrimoine net"))),
    el("tbody", {}, shown.map(r => el("tr", { class: r.events.length ? "tr-event" : "" },
      el("td", {}, fmtYm(r.ym) + (r.events.length ? " " + r.events.map(e => `${e.emoji || "📌"} ${e.name}`).join(", ") : "")),
      el("td", { class: "pos" }, fmtMoney(r.income, cur, { dec: 0 })),
      el("td", {}, fmtMoney(r.expense, cur, { dec: 0 })),
      el("td", { class: r.net < 0 ? "neg" : "pos" }, fmtMoney(r.net, cur, { dec: 0, sign: true })),
      el("td", { class: r.balance < 0 ? "neg" : "" }, el("b", {}, fmtMoney(r.balance, cur, { dec: 0 }))),
      el("td", { class: r.netWorth < 0 ? "neg" : "" }, fmtMoney(r.netWorth, cur, { dec: 0 }))
    ))));
  const tableCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Détail mois par mois")),
    el("div", { class: "tbl-wrap", style: "padding:8px 8px 4px" }, tbl),
    proj.length > 24 ? el("div", { style: "padding:8px 16px 14px; text-align:center" },
      el("button", { class: "btn btn-sm", onclick: () => { _projTableAll = !_projTableAll; renderApp(); } },
        _projTableAll ? "Réduire" : `Afficher les ${proj.length} mois`)) : null
  );

  root.append(el("div", { class: "content-inner grid", style: "gap:16px" },
    controls, scenarioNote, kpis, chartCard, barsCard, tableCard));

  function kpiCard(label, value, sub, tone) {
    return el("div", { class: "card kpi" },
      el("div", { class: "k-label" }, label),
      el("div", { class: "k-value " + (tone || "") }, value),
      el("div", { class: "k-sub" }, sub));
  }
  function horizonLabel(m) { return m < 12 ? m + " mois" : (m / 12) + " an" + (m >= 24 ? "s" : ""); }
}
