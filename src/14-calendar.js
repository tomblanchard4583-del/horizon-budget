"use strict";
/* ============ vue : calendrier budgétaire ============ */

let _calYm = null;

function viewCalendar(root) {
  const b = curBudget();
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  if (!_calYm) _calYm = ymNow;
  const ym = _calYm;

  const flows = dayFlows(b, ym);
  const dim = daysInMonth(ym);
  const first = toDate(ym + "-01");
  const startDow = (first.getDay() + 6) % 7; // lundi = 0

  // solde de départ du mois affiché
  let balance = null;
  if (ym >= ymNow) {
    const offset = monthIndex(ym) - monthIndex(ymNow);
    if (offset === 0) balance = balanceAtMonthStart(b, ymNow);
    else {
      const proj = project(b, { months: offset });
      balance = proj[proj.length - 1].balance;
    }
  }

  let totIn = 0, totOut = 0;
  Object.values(flows).flat().forEach(f => f.item.kind === "income" ? totIn += f.amount : totOut += f.amount);

  const head = el("div", { class: "flex", style: "flex-wrap:wrap; gap:10px" },
    el("button", { class: "btn btn-ico", html: ico("chevL", 18), onclick: () => { _calYm = addMonths(ym, -1); renderApp(); } }),
    el("h3", { style: "min-width:170px; text-align:center" }, fmtYm(ym)),
    el("button", { class: "btn btn-ico", html: ico("chevR", 18), onclick: () => { _calYm = addMonths(ym, 1); renderApp(); } }),
    ym !== ymNow ? el("button", { class: "btn btn-sm btn-ghost", onclick: () => { _calYm = ymNow; renderApp(); } }, "Aujourd'hui") : null,
    el("span", { class: "spacer" }),
    el("div", { class: "flex", style: "gap:14px" },
      el("span", { class: "small" }, el("b", { class: "pos mono" }, fmtMoney(totIn, cur, { dec: 0 })), el("span", { class: "muted" }, " entrées")),
      el("span", { class: "small" }, el("b", { class: "mono" }, fmtMoney(totOut, cur, { dec: 0 })), el("span", { class: "muted" }, " sorties")))
  );

  const grid = el("div", { class: "cal-grid mt12" });
  ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].forEach(d => grid.append(el("div", { class: "cal-dow" }, d)));
  for (let i = 0; i < startDow; i++) grid.append(el("div", { class: "cal-cell out", style: "visibility:hidden" }));

  let run = balance;
  for (let d = 1; d <= dim; d++) {
    const date = ym + "-" + String(d).padStart(2, "0");
    const dayList = flows[date] || [];
    let dayNet = 0;
    dayList.forEach(f => dayNet += f.item.kind === "income" ? f.amount : -f.amount);
    if (run != null) run += dayNet;
    const isToday = date === todayStr();
    const cell = el("div", {
      class: "cal-cell" + (isToday ? " today" : "") + (run != null && run < 0 ? " neg-day" : ""),
      onclick: () => openDayDetail(b, date, dayList)
    },
      el("div", { class: "c-num" }, String(d)),
      el("div", { class: "c-dots" }, dayList.slice(0, 6).map(f => el("i", { style: "background:" + (f.item.kind === "income" ? "var(--accent)" : "var(--tx3)") }))),
      ...dayList.slice(0, 2).map(f => el("div", { class: "c-evt " + (f.item.kind === "income" ? "in" : "exp") },
        `${f.item.kind === "income" ? "+" : "−"}${fmtMoney(f.amount, cur, { dec: 0 })} ${f.item.name}`)),
      dayList.length > 2 ? el("div", { class: "c-evt exp" }, `+${dayList.length - 2} autres…`) : null,
      run != null ? el("div", { class: "c-bal " + (run < 0 ? "neg" : "muted") }, fmtMoney(run, cur, { dec: 0 })) : null
    );
    grid.append(cell);
  }

  const note = balance == null
    ? el("div", { class: "alert a-info mt12" }, el("span", { class: "a-ico", html: ico("info", 16) }),
      el("span", {}, "Mois passé : les échéances planifiées sont affichées, sans solde quotidien."))
    : el("div", { class: "small muted mt12" }, "Le montant en bas de chaque case est le solde projeté en fin de journée. Les cases rouges signalent un passage sous zéro : décalez une échéance pour l'éviter.");

  root.append(el("div", { class: "content-inner" }, head, grid, note));
}

function openDayDetail(b, date, dayList) {
  const cur = b.currency;
  const txs = State.transactions.filter(t => t.budgetId === b.id && t.date === date);
  const m = modal({
    title: fmtDate(date),
    body: el("div", {},
      el("div", { class: "small muted mb8", style: "font-weight:650; text-transform:uppercase; letter-spacing:.04em" }, "Échéances planifiées"),
      dayList.length ? el("div", {}, dayList.map(f => el("div", { class: "flex", style: "padding:6px 0; border-bottom:1px solid var(--line)" },
        el("span", {}, f.item.name || "(sans nom)"),
        el("span", { class: "spacer" }),
        el("b", { class: "mono " + (f.item.kind === "income" ? "pos" : "") }, fmtMoney(f.item.kind === "income" ? f.amount : -f.amount, cur, { sign: true }))
      ))) : el("p", { class: "small muted" }, "Aucune échéance planifiée ce jour."),
      el("div", { class: "small muted mb8 mt16", style: "font-weight:650; text-transform:uppercase; letter-spacing:.04em" }, "Transactions réelles"),
      txs.length ? el("div", {}, txs.map(t => el("div", { class: "flex", style: "padding:6px 0; border-bottom:1px solid var(--line)" },
        el("span", {}, t.label || catLabel(b, t.categoryId)),
        el("span", { class: "spacer" }),
        el("b", { class: "mono " + (t.kind === "income" ? "pos" : "") }, fmtMoney(t.kind === "income" ? +t.amount : -t.amount, cur, { sign: true }))
      ))) : el("p", { class: "small muted" }, "Aucune transaction saisie ce jour."),
    ),
    foot: [
      el("button", {
        class: "btn", html: ico("plus", 15) + "<span>Transaction</span>",
        onclick: () => { m.close(); openTxEditor(b, null, date); }
      }),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p", onclick: () => m.close() }, "Fermer"),
    ]
  });
}
