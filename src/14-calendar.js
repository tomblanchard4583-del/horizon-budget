"use strict";
/* ============ vue : calendrier budgétaire ============
 * Quatre vues complémentaires partageant le même moteur de solde :
 *   Mois    — grille classique avec solde projeté & flux du jour
 *   Semaine — colonnes détaillées jour par jour, idéal pour les échéances proches
 *   Agenda  — flux à venir, en liste chronologique, sur un horizon réglable
 *   Année   — 12 mini-mois en carte de chaleur + barres revenus/dépenses
 * Le solde affiché est « projeté en fin de journée » : réel dans le passé
 * (issu des transactions saisies), planifié dans le présent et le futur.
 */

let _calYm = null;          // mois affiché (vue Mois)
let _calView = "month";     // month | week | agenda | year
let _calWeekStart = null;   // lundi de la semaine affichée (vue Semaine)
let _calFilter = "all";     // all | income | expense
let _calShowReal = true;    // superposer les transactions réelles
let _calAgendaDays = 60;    // horizon de la vue Agenda (jours)
let _calYear = null;        // année affichée (vue Année)

/* ---- helpers de dates au jour (les utilitaires globaux travaillent au mois) ---- */
const calAddDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const calDow = s => (toDate(s).getDay() + 6) % 7;        // lundi = 0 … dimanche = 6
const calIsWeekend = s => calDow(s) >= 5;
const calMondayOf = s => calAddDays(s, -calDow(s));
const _DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* Le flux passe-t-il le filtre de type courant ? */
const calPassesItem = it => _calFilter === "all" || it.kind === _calFilter;

/* Collecte { date: {planned:[{item,amount}], real:[tx]} } sur l'intervalle [from, to]. */
function calCollect(b, from, to) {
  const map = {};
  let ym = ymOf(from);
  const ymEnd = ymOf(to);
  while (ym <= ymEnd) {
    const flows = dayFlows(b, ym);
    for (const [date, list] of Object.entries(flows)) {
      if (date < from || date > to) continue;
      (map[date] = map[date] || { planned: [], real: [] }).planned.push(...list);
    }
    ym = addMonths(ym, 1);
  }
  for (const t of State.transactions) {
    if (t.budgetId !== b.id || t.date < from || t.date > to) continue;
    (map[t.date] = map[t.date] || { planned: [], real: [] }).real.push(t);
  }
  return map;
}

/* Net d'un jour : réel dans le passé, planifié dès le mois en cours. */
function calDayNet(date, cell) {
  const limit = ymOf(todayStr()) + "-01";
  if (date < limit) return cell.real.reduce((s, t) => s + (t.kind === "income" ? +t.amount : -t.amount), 0);
  return cell.planned.reduce((s, f) => s + (f.item.kind === "income" ? f.amount : -f.amount), 0);
}

/* Solde projeté en fin de la journée `date` (réel passé, planifié sinon). */
function calBalanceAt(b, date) {
  const ymNow = ymOf(todayStr());
  if (date < ymNow + "-01") {
    let bal = +b.initialBalance || 0;
    for (const t of State.transactions) {
      if (t.budgetId !== b.id || t.date < b.initialDate || t.date > date) continue;
      bal += t.kind === "income" ? +t.amount : -t.amount;
    }
    return bal;
  }
  let bal = balanceAtMonthStart(b, ymNow);
  let ym = ymNow;
  while (ym <= ymOf(date)) {
    const flows = dayFlows(b, ym);
    for (const [d, list] of Object.entries(flows)) {
      if (d < ymNow + "-01" || d > date) continue;
      list.forEach(f => bal += f.item.kind === "income" ? f.amount : -f.amount);
    }
    ym = addMonths(ym, 1);
  }
  return bal;
}

/* Liste d'affichage unifiée d'un jour (planifié + réel filtrés). */
function calDayEvents(b, cell) {
  const out = [];
  for (const f of cell.planned) {
    if (!calPassesItem(f.item)) continue;
    out.push({ kind: f.item.kind, amount: f.amount, real: false, debt: !!f.item._debt, item: f.item,
      name: f.item.name || (f.item._debt ? "Crédit" : "(sans nom)") });
  }
  if (_calShowReal) for (const t of cell.real) {
    if (_calFilter !== "all" && t.kind !== _calFilter) continue;
    out.push({ kind: t.kind, amount: +t.amount, real: true, tx: t,
      name: t.label || catLabel(b, t.categoryId) });
  }
  return out;
}

/* ============ point d'entrée ============ */
function viewCalendar(root) {
  const b = curBudget();
  const ymNow = ymOf(todayStr());
  if (!_calYm) _calYm = ymNow;
  if (!_calWeekStart) _calWeekStart = calMondayOf(todayStr());
  if (!_calYear) _calYear = +ymNow.slice(0, 4);

  const inner = el("div", { class: "content-inner" });
  inner.append(calToolbar(b));

  if (_calView === "month") calRenderMonth(b, inner);
  else if (_calView === "week") calRenderWeek(b, inner);
  else if (_calView === "agenda") calRenderAgenda(b, inner);
  else calRenderYear(b, inner);

  inner.append(calLegend());
  root.append(inner);
}

/* ---- barre d'outils : vues + filtres ---- */
function calToolbar(b) {
  const seg = segControl([
    { value: "month", label: "Mois" },
    { value: "week", label: "Semaine" },
    { value: "agenda", label: "Agenda" },
    { value: "year", label: "Année" },
  ], _calView, v => { _calView = v; renderApp(); });

  const filterChip = (val, label) => el("button", {
    class: "chip-leg" + (_calFilter === val ? "" : " off"),
    onclick: () => { _calFilter = val; renderApp(); },
  }, label);

  const realChip = el("button", {
    class: "chip-leg" + (_calShowReal ? "" : " off"),
    title: "Superposer les transactions déjà saisies",
    onclick: () => { _calShowReal = !_calShowReal; renderApp(); },
  }, el("span", { class: "cat-dot", style: "background:var(--violet); border-radius:50%" }), "Réel");

  return el("div", { class: "cal-toolbar" },
    seg,
    el("span", { class: "spacer" }),
    el("div", { class: "flex", style: "gap:6px; flex-wrap:wrap" },
      filterChip("all", "Tout"),
      filterChip("income", "Entrées"),
      filterChip("expense", "Sorties"),
      realChip));
}

/* ---- légende des couleurs ---- */
function calLegend() {
  const tag = (cls, txt) => el("span", { class: "cal-leg-item" }, el("i", { class: cls }), txt);
  return el("div", { class: "cal-leg" },
    tag("d-in", "Entrée"),
    tag("d-out", "Sortie"),
    tag("d-real", "Transaction réelle"),
    tag("d-neg", "Solde sous zéro"),
    tag("d-today", "Aujourd'hui"));
}

/* ---- en-tête de navigation commun (précédent / titre / suivant / aujourd'hui) ---- */
function calNav(opts) {
  return el("div", { class: "cal-nav" },
    el("button", { class: "btn btn-ico", html: ico("chevL", 18), onclick: opts.onPrev, title: "Précédent" }),
    el("h3", { class: "cal-nav-title" }, opts.title),
    el("button", { class: "btn btn-ico", html: ico("chevR", 18), onclick: opts.onNext, title: "Suivant" }),
    !opts.todayActive ? el("button", { class: "btn btn-sm btn-ghost", onclick: opts.onToday }, opts.todayLabel || "Aujourd'hui") : null,
    el("span", { class: "spacer" }),
    opts.extra || null);
}

/* ---- bandeau de statistiques compact ---- */
function calStat(label, value, sub, tone) {
  return el("div", { class: "card kpi cal-stat" },
    el("div", { class: "k-label" }, label),
    el("div", { class: "k-value " + (tone || "") }, value),
    el("div", { class: "k-sub" }, sub || ""));
}

/* ============ VUE MOIS ============ */
function calRenderMonth(b, inner) {
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  const ym = _calYm;
  const isPast = ym < ymNow;
  const dim = daysInMonth(ym);
  const from = ym + "-01", to = ym + "-" + String(dim).padStart(2, "0");
  const data = calCollect(b, from, to);

  const startBal = calBalanceAt(b, calAddDays(from, -1));
  const rows = [];
  let run = startBal, totIn = 0, totOut = 0, lowest = { run: Infinity, date: null };
  let maxFlow = 0;
  for (let d = 1; d <= dim; d++) {
    const date = ym + "-" + String(d).padStart(2, "0");
    const cell = data[date] || { planned: [], real: [] };
    const src = isPast ? cell.real.map(t => ({ kind: t.kind, amount: +t.amount })) : cell.planned.map(f => ({ kind: f.item.kind, amount: f.amount }));
    let dIn = 0, dOut = 0;
    src.forEach(x => x.kind === "income" ? dIn += x.amount : dOut += x.amount);
    totIn += dIn; totOut += dOut;
    run += dIn - dOut;
    if (run < lowest.run) lowest = { run, date };
    maxFlow = Math.max(maxFlow, dIn + dOut);
    rows.push({ date, d, cell, dIn, dOut, run });
  }
  const negDays = rows.filter(r => r.run < 0).length;
  const endBal = rows.length ? rows[rows.length - 1].run : startBal;

  // navigation + raccourci « aller à »
  const jump = el("input", { class: "input cal-jump", type: "month", value: ym, title: "Aller à un mois",
    onchange: e => { if (e.target.value) { _calYm = e.target.value; renderApp(); } } });
  inner.append(calNav({
    title: fmtYm(ym),
    onPrev: () => { _calYm = addMonths(ym, -1); renderApp(); },
    onNext: () => { _calYm = addMonths(ym, 1); renderApp(); },
    onToday: () => { _calYm = ymNow; renderApp(); },
    todayActive: ym === ymNow,
    extra: jump,
  }));

  // statistiques du mois
  const lbl = isPast ? "réel" : "prévu";
  inner.append(el("div", { class: "grid cal-stats" },
    calStat(`Entrées (${lbl})`, fmtMoney(totIn, cur, { dec: 0 }), `${MOIS[+ym.slice(5, 7) - 1]}`, "pos"),
    calStat(`Sorties (${lbl})`, fmtMoney(totOut, cur, { dec: 0 }), `${rows.reduce((s, r) => s + r.cell.planned.length, 0)} échéances planifiées`),
    calStat("Solde net du mois", fmtMoney(totIn - totOut, cur, { dec: 0, sign: true }), totIn - totOut >= 0 ? "le mois rapporte" : "le mois coûte", totIn - totOut < 0 ? "neg" : "pos"),
    calStat("Solde fin de mois", fmtMoney(endBal, cur, { dec: 0 }), isPast ? "solde réel reconstitué" : "projeté", endBal < 0 ? "neg" : "pos"),
    calStat("Jour le plus bas", lowest.date ? fmtMoney(lowest.run, cur, { dec: 0 }) : "—",
      lowest.date ? `le ${+lowest.date.slice(8)} ${MOIS[+ym.slice(5, 7) - 1].slice(0, 4)}.` + (negDays ? ` · ${negDays} j négatif${negDays > 1 ? "s" : ""}` : "") : "",
      lowest.run < 0 ? "neg" : "")));

  // grille
  const grid = el("div", { class: "cal-grid mt12" });
  _DOW.forEach((d, i) => grid.append(el("div", { class: "cal-dow" + (i >= 5 ? " we" : "") }, d)));
  const startDow = calDow(from);
  for (let i = 0; i < startDow; i++) grid.append(el("div", { class: "cal-cell out", style: "visibility:hidden" }));

  for (const r of rows) {
    const isToday = r.date === todayStr();
    const evts = calDayEvents(b, r.cell);
    const inW = maxFlow ? (r.dIn / maxFlow) * 100 : 0;
    const outW = maxFlow ? (r.dOut / maxFlow) * 100 : 0;

    const cell = el("div", {
      class: "cal-cell" + (isToday ? " today" : "") + (calIsWeekend(r.date) ? " we" : "") + (r.run < 0 ? " neg-day" : ""),
      onclick: () => openDayDetail(b, r.date),
    },
      el("div", { class: "c-top" },
        el("div", { class: "c-num" }, String(r.d)),
        evts.length > 3 ? el("span", { class: "c-count" }, "×" + evts.length) : null),
      (r.dIn || r.dOut) ? el("div", { class: "c-bar" },
        el("i", { class: "in", style: "width:" + inW + "%" }),
        el("i", { class: "out", style: "width:" + outW + "%" })) : null,
      el("div", { class: "c-dots" }, evts.slice(0, 8).map(e => el("i", { class: (e.kind === "income" ? "in" : "out") + (e.real ? " real" : "") }))),
      ...evts.slice(0, 3).map(e => el("div", { class: "c-evt " + (e.kind === "income" ? "in" : "exp") + (e.real ? " real" : "") },
        `${e.kind === "income" ? "+" : "−"}${fmtMoney(e.amount, cur, { dec: 0 })} ${e.name}`)),
      evts.length > 3 ? el("div", { class: "c-evt more" }, `+${evts.length - 3} autre${evts.length - 3 > 1 ? "s" : ""}…`) : null,
      el("div", { class: "c-bal " + (r.run < 0 ? "neg" : "muted") }, fmtMoney(r.run, cur, { dec: 0 })));
    grid.append(cell);
  }
  inner.append(grid);

  inner.append(el("div", { class: "small muted mt12" },
    isPast
      ? "Mois passé : soldes et totaux reconstitués à partir des transactions réellement saisies."
      : "Le montant en bas de chaque case est le solde projeté en fin de journée (échéances planifiées). Les cases rouges signalent un passage sous zéro — décalez une échéance pour l'éviter."));
}

/* ============ VUE SEMAINE ============ */
function calRenderWeek(b, inner) {
  const cur = b.currency;
  const start = _calWeekStart;
  const end = calAddDays(start, 6);
  const data = calCollect(b, start, end);
  const thisMonday = calMondayOf(todayStr());

  const title = ymOf(start) === ymOf(end)
    ? `${+start.slice(8)} – ${+end.slice(8)} ${MOIS[+start.slice(5, 7) - 1]} ${start.slice(0, 4)}`
    : `${fmtDateShort(start)} – ${fmtDateShort(end)} ${end.slice(0, 4)}`;
  inner.append(calNav({
    title,
    onPrev: () => { _calWeekStart = calAddDays(start, -7); renderApp(); },
    onNext: () => { _calWeekStart = calAddDays(start, 7); renderApp(); },
    onToday: () => { _calWeekStart = thisMonday; renderApp(); },
    todayActive: start === thisMonday,
    todayLabel: "Cette semaine",
  }));

  let run = calBalanceAt(b, calAddDays(start, -1));
  let wIn = 0, wOut = 0;
  const cols = el("div", { class: "cal-week mt12" });
  for (let i = 0; i < 7; i++) {
    const date = calAddDays(start, i);
    const cell = data[date] || { planned: [], real: [] };
    const evts = calDayEvents(b, cell);
    let dIn = 0, dOut = 0;
    evts.forEach(e => e.kind === "income" ? dIn += e.amount : dOut += e.amount);
    wIn += dIn; wOut += dOut;
    run += calDayNet(date, cell);
    const isToday = date === todayStr();

    const col = el("div", { class: "cal-wk-day" + (isToday ? " today" : "") + (calIsWeekend(date) ? " we" : "") + (run < 0 ? " neg" : ""), onclick: () => openDayDetail(b, date) },
      el("div", { class: "wk-head" },
        el("span", { class: "wk-dow" }, _DOW[i]),
        el("span", { class: "wk-num" }, String(+date.slice(8)))),
      el("div", { class: "wk-body" },
        evts.length
          ? evts.map(e => el("div", { class: "wk-evt" },
            el("span", { class: "wk-dot " + (e.kind === "income" ? "in" : "out") + (e.real ? " real" : "") }),
            el("span", { class: "wk-name" }, e.name),
            el("b", { class: "mono " + (e.kind === "income" ? "pos" : "") }, fmtMoney(e.kind === "income" ? e.amount : -e.amount, cur, { dec: 0, sign: true }))))
          : el("div", { class: "wk-empty" }, "—")),
      el("div", { class: "wk-bal " + (run < 0 ? "neg" : "muted") }, fmtMoney(run, cur, { dec: 0 })));
    cols.append(col);
  }
  inner.append(cols);
  inner.append(el("div", { class: "flex small muted mt12", style: "gap:16px; flex-wrap:wrap" },
    el("span", {}, "Entrées de la semaine : ", el("b", { class: "pos mono" }, fmtMoney(wIn, cur, { dec: 0 }))),
    el("span", {}, "Sorties : ", el("b", { class: "mono" }, fmtMoney(wOut, cur, { dec: 0 }))),
    el("span", {}, "Net : ", el("b", { class: "mono " + (wIn - wOut < 0 ? "neg" : "pos") }, fmtMoney(wIn - wOut, cur, { dec: 0, sign: true })))));
}

/* ============ VUE AGENDA ============ */
function calRenderAgenda(b, inner) {
  const cur = b.currency;
  const today = todayStr();
  const end = calAddDays(today, _calAgendaDays);
  const data = calCollect(b, today, end);

  const horizonSel = selectInput([
    { value: "30", label: "30 jours" },
    { value: "60", label: "60 jours" },
    { value: "90", label: "90 jours" },
    { value: "180", label: "6 mois" },
  ], String(_calAgendaDays), { class: "input cal-jump", style: "width:auto" });
  horizonSel.addEventListener("change", () => { _calAgendaDays = +horizonSel.value; renderApp(); });

  inner.append(el("div", { class: "cal-nav" },
    el("h3", { class: "cal-nav-title", style: "min-width:0" }, "À venir"),
    el("span", { class: "spacer" }),
    el("label", { class: "small muted", style: "display:flex; align-items:center; gap:8px" }, "Horizon", horizonSel)));

  let run = calBalanceAt(b, calAddDays(today, -1));
  const dates = Object.keys(data).filter(d => calDayEvents(b, data[d]).length).sort();
  // pré-calcule le solde courant en parcourant tous les jours (même sans flux)
  const balByDate = {};
  let r = run;
  for (let i = 0; i <= _calAgendaDays; i++) {
    const d = calAddDays(today, i);
    r += calDayNet(d, data[d] || { planned: [], real: [] });
    balByDate[d] = r;
  }

  if (!dates.length) {
    inner.append(emptyState("📭", "Rien à l'horizon", `Aucune échéance planifiée sur les ${_calAgendaDays} prochains jours.`));
    return;
  }

  let total = 0;
  const list = el("div", { class: "cal-agenda mt12" });
  for (const date of dates) {
    const evts = calDayEvents(b, data[date]);
    const dayNet = evts.reduce((s, e) => s + (e.kind === "income" ? e.amount : -e.amount), 0);
    total += dayNet;
    const bal = balByDate[date];
    const diff = Math.round((toDate(date) - toDate(today)) / 86400000);
    const rel = diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : `dans ${diff} j`;

    list.append(el("div", { class: "ag-day" + (bal < 0 ? " neg" : "") },
      el("div", { class: "ag-date", onclick: () => openDayDetail(b, date) },
        el("span", { class: "ag-d" }, String(+date.slice(8))),
        el("span", { class: "ag-m" }, MOIS[+date.slice(5, 7) - 1].slice(0, 4) + "."),
        el("span", { class: "ag-rel" }, rel)),
      el("div", { class: "ag-evts" },
        evts.map(e => el("div", { class: "ag-evt", onclick: () => calOpenEvent(b, e, date) },
          el("span", { class: "wk-dot " + (e.kind === "income" ? "in" : "out") + (e.real ? " real" : "") }),
          el("span", { class: "ag-name" }, e.name),
          e.debt ? el("span", { class: "badge b-mut", style: "margin-left:6px" }, "crédit") : (e.real ? el("span", { class: "badge b-info", style: "margin-left:6px" }, "réel") : null),
          el("b", { class: "mono " + (e.kind === "income" ? "pos" : ""), style: "margin-left:auto" }, fmtMoney(e.kind === "income" ? e.amount : -e.amount, cur, { dec: 0, sign: true }))))),
      el("div", { class: "ag-bal" },
        el("span", { class: "xs muted" }, "solde projeté"),
        el("b", { class: "mono " + (bal < 0 ? "neg" : "") }, fmtMoney(bal, cur, { dec: 0 })))));
  }
  inner.append(list);
  inner.append(el("div", { class: "small muted mt12" },
    `Solde net cumulé sur l'horizon : `, el("b", { class: "mono " + (total < 0 ? "neg" : "pos") }, fmtMoney(total, cur, { dec: 0, sign: true })),
    ` · solde projeté au ${fmtDate(end)} : `, el("b", { class: "mono " + (balByDate[end] < 0 ? "neg" : "") }, fmtMoney(balByDate[end], cur, { dec: 0 }))));
}

/* ============ VUE ANNÉE ============ */
function calRenderYear(b, inner) {
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  const year = _calYear;
  const thisYear = +ymNow.slice(0, 4);

  inner.append(calNav({
    title: String(year),
    onPrev: () => { _calYear = year - 1; renderApp(); },
    onNext: () => { _calYear = year + 1; renderApp(); },
    onToday: () => { _calYear = thisYear; renderApp(); },
    todayActive: year === thisYear,
    todayLabel: "Cette année",
  }));

  const months = [];
  let yIn = 0, yOut = 0;
  for (let mo = 1; mo <= 12; mo++) {
    const ym = year + "-" + String(mo).padStart(2, "0");
    const isPast = ym < ymNow;
    const flows = dayFlows(b, ym);
    const dim = daysInMonth(ym);
    const dayNet = {};
    let mIn = 0, mOut = 0;
    for (const [date, list] of Object.entries(flows)) {
      list.forEach(f => { if (f.item.kind === "income") mIn += f.amount; else mOut += f.amount; });
    }
    if (isPast) { // remplace par le réel
      mIn = 0; mOut = 0;
      const r = realMonthByCat(b, ym); mIn = r.income; mOut = r.expense;
    }
    // net par jour pour la carte de chaleur
    for (let d = 1; d <= dim; d++) {
      const date = ym + "-" + String(d).padStart(2, "0");
      const cell = { planned: flows[date] || [], real: State.transactions.filter(t => t.budgetId === b.id && t.date === date) };
      dayNet[d] = calDayNet(date, cell);
    }
    yIn += mIn; yOut += mOut;
    months.push({ ym, mo, isPast, mIn, mOut, net: mIn - mOut, dayNet, dim });
  }
  const maxAbs = Math.max(1, ...months.flatMap(m => Object.values(m.dayNet).map(Math.abs)));

  inner.append(el("div", { class: "grid cal-stats mt12" },
    calStat("Entrées de l'année", fmtMoney(yIn, cur, { dec: 0 }), `${year}`, "pos"),
    calStat("Sorties de l'année", fmtMoney(yOut, cur, { dec: 0 }), "réel + planifié"),
    calStat("Solde net annuel", fmtMoney(yIn - yOut, cur, { dec: 0, sign: true }), yIn - yOut >= 0 ? "capacité d'épargne" : "déficit", yIn - yOut < 0 ? "neg" : "pos")));

  const gridY = el("div", { class: "cal-year mt12" });
  for (const m of months) {
    const isCur = m.ym === ymNow;
    const startDow = calDow(m.ym + "-01");
    const mini = el("div", { class: "ym-grid" });
    for (let i = 0; i < startDow; i++) mini.append(el("i", { class: "ym-pad" }));
    for (let d = 1; d <= m.dim; d++) {
      const net = m.dayNet[d] || 0;
      const date = m.ym + "-" + String(d).padStart(2, "0");
      const intensity = Math.min(1, Math.abs(net) / maxAbs);
      const op = net === 0 ? 0 : 0.18 + intensity * 0.72;
      const color = net > 0 ? "var(--accent)" : "var(--danger)";
      mini.append(el("i", {
        class: "ym-cell" + (date === todayStr() ? " today" : ""),
        style: net === 0 ? "" : `background:${color}; opacity:${op.toFixed(2)}`,
        title: `${d} ${MOIS[m.mo - 1].slice(0, 4)}. · ${fmtMoney(net, cur, { dec: 0, sign: true })}`,
      }));
    }
    gridY.append(el("div", { class: "ym-card" + (isCur ? " cur" : ""), onclick: () => { _calYm = m.ym; _calView = "month"; renderApp(); } },
      el("div", { class: "ym-head" },
        el("span", { class: "ym-name" }, MOIS_C[m.mo - 1]),
        el("b", { class: "mono " + (m.net < 0 ? "neg" : m.net > 0 ? "pos" : "muted") }, fmtMoney(m.net, cur, { dec: 0, sign: true }))),
      mini,
      el("div", { class: "ym-foot xs muted" }, m.isPast ? "réel" : isCur ? "en cours" : "prévu")));
  }
  inner.append(gridY);

  // barres revenus / dépenses des 12 mois
  inner.append(el("div", { class: "card mt12" },
    el("div", { class: "card-head" }, el("h3", {}, "Revenus & dépenses mois par mois")),
    el("div", { class: "card-pad" }, chartBars({
      labels: months.map(m => m.ym),
      pos: months.map(m => m.mIn),
      neg: months.map(m => m.mOut),
      cur, height: 230,
    }))));
}

/* ---- ouvrir l'élément cliqué dans l'agenda (poste planifié ou transaction) ---- */
function calOpenEvent(b, e, date) {
  if (e.real && e.tx) { openTxEditor(b, e.tx); return; }
  if (e.debt) { go("debts"); return; }
  if (e.item && e.item.id) {
    const it = b.items.find(x => x.id === e.item.id);
    if (it) { openItemEditor(b, it, false); return; }
  }
  openDayDetail(b, date);
}

/* ============ détail d'un jour ============ */
function openDayDetail(b, date) {
  const cur = b.currency;
  const dim = daysInMonth(ymOf(date));
  const dayList = (dayFlows(b, ymOf(date))[date] || []);
  const txs = State.transactions.filter(t => t.budgetId === b.id && t.date === date);
  const startBal = calBalanceAt(b, calAddDays(date, -1));
  const endBal = calBalanceAt(b, date);
  const dowName = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][toDate(date).getDay()];

  const m = modal({
    title: fmtDate(date),
    body: el("div", {},
      el("div", { class: "small muted", style: "margin:-4px 0 12px" }, dowName.charAt(0).toUpperCase() + dowName.slice(1)),

      // bandeau solde du jour
      el("div", { class: "day-bal" + (endBal < 0 ? " neg" : "") },
        el("div", {}, el("div", { class: "xs muted" }, "Solde début de journée"), el("b", { class: "mono" }, fmtMoney(startBal, cur, { dec: 0 }))),
        el("span", { class: "ico", html: ico("chevR", 16), style: "opacity:.5" }),
        el("div", { style: "text-align:right" }, el("div", { class: "xs muted" }, "Projeté fin de journée"), el("b", { class: "mono " + (endBal < 0 ? "neg" : "pos") }, fmtMoney(endBal, cur, { dec: 0 })))),
      endBal < 0 ? el("div", { class: "alert a-danger mt12", style: "padding:9px 12px" }, el("span", { class: "a-ico", html: ico("alert", 15) }),
        el("span", {}, "Solde négatif ce jour-là. Décalez une dépense ou avancez une rentrée pour repasser au-dessus de zéro.")) : null,

      // échéances planifiées
      el("div", { class: "day-sec" }, "Échéances planifiées"),
      dayList.length ? el("div", { class: "row-list day-list" }, dayList.map(f => {
        const editable = f.item.id && !f.item._debt;
        return el("div", { class: "flex day-row" + (editable || f.item._debt ? " click" : ""), onclick: editable ? () => { m.close(); openItemEditor(b, b.items.find(x => x.id === f.item.id), false); } : (f.item._debt ? () => { m.close(); go("debts"); } : null) },
          el("span", { class: "wk-dot " + (f.item.kind === "income" ? "in" : "out") }),
          el("span", {}, f.item.name || (f.item._debt ? "Crédit" : "(sans nom)"),
            f.item._debt ? el("span", { class: "badge b-mut", style: "margin-left:8px" }, "crédit") : (f.item.categoryId ? el("span", { class: "xs muted", style: "margin-left:8px" }, catLabel(b, f.item.categoryId)) : null)),
          el("span", { class: "spacer" }),
          el("b", { class: "mono " + (f.item.kind === "income" ? "pos" : "") }, fmtMoney(f.item.kind === "income" ? f.amount : -f.amount, cur, { sign: true })),
          editable ? el("span", { class: "ico day-edit", html: ico("chevR", 14) }) : null);
      })) : el("p", { class: "small muted" }, "Aucune échéance planifiée ce jour."),

      // transactions réelles
      el("div", { class: "day-sec mt16" }, "Transactions réelles"),
      txs.length ? el("div", { class: "row-list day-list" }, txs.map(t =>
        el("div", { class: "flex day-row click", onclick: () => { m.close(); openTxEditor(b, t); } },
          el("span", { class: "wk-dot real " + (t.kind === "income" ? "in" : "out") }),
          el("span", {}, t.label || catLabel(b, t.categoryId)),
          el("span", { class: "spacer" }),
          el("b", { class: "mono " + (t.kind === "income" ? "pos" : "") }, fmtMoney(t.kind === "income" ? +t.amount : -t.amount, cur, { sign: true })),
          el("span", { class: "ico day-edit", html: ico("edit", 13) })))) : el("p", { class: "small muted" }, "Aucune transaction saisie ce jour.")),
    foot: [
      el("div", { class: "flex", style: "gap:6px; flex-wrap:wrap" },
        el("button", { class: "btn btn-sm", html: ico("plus", 14) + "<span>Transaction</span>", onclick: () => { m.close(); openTxEditor(b, null, date); } }),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { m.close(); calAddPlanned(b, "expense", date); } }, "📉 Dépense prévue"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { m.close(); calAddPlanned(b, "income", date); } }, "📈 Revenu prévu")),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p", onclick: () => m.close() }, "Fermer"),
    ],
  });
}

/* Crée un poste planifié pré-rempli sur une date donnée. */
function calAddPlanned(b, kind, date) {
  const it = newItem(kind);
  it.startDate = date;
  it.day = clamp(+date.slice(8), 1, 28);
  openItemEditor(b, it, true);
}
