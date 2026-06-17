"use strict";
/* ============ moteur de projection ============ */

/*
 * Cache de project() — WeakMap(budget obj → Map(versionKey → result)).
 * Clé externe = référence de l'objet budget (GC auto, pas de collision entre tests).
 * Clé interne inclut _stateVersion : persist() l'incrémente, rendant les résultats
 * périmés inaccessibles sans avoir à vider la Map manuellement.
 */
const _projectCache = new WeakMap();

/* Solde réel au début d'un mois : solde initial + transactions antérieures. */
function balanceAtMonthStart(budget, ym) {
  let bal = +budget.initialBalance || 0;
  const limit = ym + "-01";
  for (const t of State.transactions) {
    if (t.budgetId !== budget.id || t.date >= limit || t.date < budget.initialDate) continue;
    bal += t.kind === "income" ? +t.amount : -t.amount;
  }
  return bal;
}

/*
 * Projection mois par mois.
 * opts : { months, from (ym), scenarioMode, inflation, startBalance }
 * Retourne [{ ym, income, expense, saving, net, balance, netWorth, byCat, incomeByCat,
 *             debtPayment, debtBalance, savingsTotal, events }]
 */
function project(budget, opts) {
  opts = opts || {};
  const months = opts.months || State.settings.horizonMonths || 24;
  const from = opts.from || ymOf(todayStr());
  const mode = opts.scenarioMode || State.settings.scenarioMode || "expected";
  const inflation = opts.inflation ?? State.settings.inflation ?? 2;

  const _cacheKey = `${_stateVersion}|${months}|${from}|${mode}|${inflation}|${opts.startBalance ?? ""}`;
  let _budgetCache = _projectCache.get(budget);
  if (!_budgetCache) { _budgetCache = new Map(); _projectCache.set(budget, _budgetCache); }
  const _cached = _budgetCache.get(_cacheKey);
  if (_cached) return _cached;

  let balance = opts.startBalance ?? balanceAtMonthStart(budget, from);
  const accBal = {}; budget.accounts.forEach(a => accBal[a.id] = +a.balance || 0);
  const goalBal = {}; budget.goals.forEach(g => goalBal[g.id] = +g.current || 0);
  const debtRows = budget.debts.map(d => ({ d, rows: amortize(d) }));

  const out = [];
  for (let i = 0; i < months; i++) {
    const ym = addMonths(from, i);
    let income = 0, expense = 0, saving = 0;
    const byCat = {}, incomeByCat = {};

    for (const it of budget.items) {
      const amt = monthlyAmount(it, ym, mode, inflation);
      if (!amt) continue;
      if (it.kind === "income") {
        income += amt;
        const top = catTop(budget, it.categoryId);
        incomeByCat[top ? top.id : "_"] = (incomeByCat[top ? top.id : "_"] || 0) + amt;
      } else {
        expense += amt;
        const top = catTop(budget, it.categoryId);
        byCat[top ? top.id : "_"] = (byCat[top ? top.id : "_"] || 0) + amt;
        if (it.savingTo) {
          saving += amt;
          if (accBal[it.savingTo] != null) accBal[it.savingTo] += amt;
          if (goalBal[it.savingTo] != null) goalBal[it.savingTo] += amt;
        }
      }
    }

    // crédits : mensualités issues du tableau d'amortissement
    let debtPayment = 0, debtBalance = 0;
    for (const { d, rows } of debtRows) {
      const row = rows.find(r => r.ym === ym);
      if (row) {
        debtPayment += row.payment;
        const cat = d.categoryId ? catTop(budget, d.categoryId) : null;
        byCat[cat ? cat.id : "_debt"] = (byCat[cat ? cat.id : "_debt"] || 0) + row.payment;
      }
      const last = [...rows].reverse().find(r => r.ym <= ym);
      debtBalance += last ? last.balance : (rows.length && ym < rows[0].ym ? +d.principal : 0);
      if (!last && ym < (rows[0] ? rows[0].ym : "9999")) debtBalance += 0;
    }
    expense += debtPayment;

    // intérêts mensuels des comptes épargne
    let savingsTotal = 0;
    for (const a of budget.accounts) {
      const r = ((+a.rate || 0) / 100) / 12;
      accBal[a.id] *= 1 + r;
      if (a.ceiling && accBal[a.id] > +a.ceiling) accBal[a.id] = +a.ceiling;
      savingsTotal += accBal[a.id];
    }
    let goalsTotal = 0;
    for (const g of budget.goals) goalsTotal += goalBal[g.id];

    const net = income - expense;
    balance += net;
    out.push({
      ym, income, expense, saving, net, balance,
      debtPayment, debtBalance, savingsTotal, goalsTotal,
      netWorth: balance + savingsTotal + goalsTotal - debtBalance,
      byCat, incomeByCat,
      events: budget.events.filter(e => ymOf(e.date) === ym),
      goalBal: { ...goalBal },
    });
  }
  _budgetCache.set(_cacheKey, out);
  return out;
}

/* Résumé du mois courant planifié (pour le tableau de bord & le suivi). */
function plannedMonth(budget, ym) {
  const rows = project(budget, { months: 1, from: ym });
  return rows[0];
}

/* Flux planifiés jour par jour d'un mois (calendrier). */
function dayFlows(budget, ym) {
  const map = {};
  const mode = State.settings.scenarioMode, inf = State.settings.inflation;
  for (const it of budget.items) {
    for (const date of occurrenceDatesInMonth(it, ym)) {
      (map[date] = map[date] || []).push({ item: it, amount: amountAt(it, ym, mode, inf) });
    }
  }
  for (const d of budget.debts) {
    const row = amortize(d).find(r => r.ym === ym);
    if (row) {
      const day = clamp(+String(d.startDate || "01").slice(8) || 1, 1, daysInMonth(ym));
      const date = ym + "-" + String(day).padStart(2, "0");
      (map[date] = map[date] || []).push({ item: { kind: "expense", name: d.name, _debt: true }, amount: row.payment });
    }
  }
  return map;
}

/* Alertes intelligentes sur le budget courant. */
function computeAlerts(budget) {
  const alerts = [];
  const ymNow = ymOf(todayStr());
  const proj = project(budget, { months: Math.max(State.settings.horizonMonths, 12) });

  const firstNeg = proj.find(r => r.balance < 0);
  if (firstNeg) alerts.push({ type: "danger", icon: "alert", text: `Solde négatif prévu en ${fmtYm(firstNeg.ym)} (${fmtMoney(firstNeg.balance, budget.currency)}).` });

  const m0 = proj[0];
  if (m0 && m0.net < 0) alerts.push({ type: "warn", icon: "alert", text: `Ce mois-ci, vos dépenses prévues dépassent vos revenus de ${fmtMoney(-m0.net, budget.currency)}.` });

  // objectifs en retard
  for (const g of budget.goals) {
    if (!g.targetDate || !g.target) continue;
    const row = proj.find(r => r.ym === ymOf(g.targetDate));
    const projected = row ? row.goalBal[g.id] : null;
    if (projected != null && projected < g.target * 0.999) {
      alerts.push({ type: "warn", icon: "target", text: `Objectif « ${g.name} » : ${fmtMoney(projected, budget.currency)} prévus au ${fmtDate(g.targetDate)} sur ${fmtMoney(g.target, budget.currency)} visés.` });
    }
  }

  // dépassement réel du mois en cours
  const real = realMonthByCat(budget, ymNow);
  const planned = m0 ? m0.byCat : {};
  let overCount = 0;
  for (const [catId, spent] of Object.entries(real.byCat)) {
    const plan = planned[catId] || 0;
    if (plan > 0 && spent > plan * 1.05) overCount++;
  }
  if (overCount) alerts.push({ type: "warn", icon: "receipt", text: `${overCount} catégorie${overCount > 1 ? "s" : ""} dépasse${overCount > 1 ? "nt" : ""} déjà le budget prévu ce mois-ci.` });

  // fonds d'urgence
  const monthlyExp = m0 ? m0.expense : 0;
  const savings = (m0 ? m0.savingsTotal : 0) + (m0 ? m0.goalsTotal : 0);
  if (monthlyExp > 0 && savings < monthlyExp * 3 && budget.situation !== "etudiant") {
    alerts.push({ type: "info", icon: "pig", text: `Épargne de précaution : ${fmtMoney(savings, budget.currency)}, soit ${(savings / monthlyExp).toFixed(1)} mois de dépenses (3 mois minimum recommandés).` });
  }
  return alerts;
}

/* Réel : totaux du mois par catégorie racine. */
function realMonthByCat(budget, ym) {
  const byCat = {}, incomeByCat = {};
  let income = 0, expense = 0;
  for (const t of State.transactions) {
    if (t.budgetId !== budget.id || ymOf(t.date) !== ym) continue;
    // une transaction ventilée répartit son montant sur plusieurs catégories
    const parts = (t.splits && t.splits.length) ? t.splits : [{ categoryId: t.categoryId, amount: +t.amount }];
    for (const p of parts) {
      const top = catTop(budget, p.categoryId);
      const key = top ? top.id : "_";
      if (t.kind === "income") { income += +p.amount; incomeByCat[key] = (incomeByCat[key] || 0) + +p.amount; }
      else { expense += +p.amount; byCat[key] = (byCat[key] || 0) + +p.amount; }
    }
  }
  return { income, expense, byCat, incomeByCat };
}

/*
 * Dépenses planifiées du mois pas encore débitées (réel < prévu, par catégorie racine).
 * Sert à ne pas compter comme « disponible » l'argent déjà réservé pour des charges
 * connues (ex. courses, essence) mais qui n'ont pas encore été enregistrées.
 */
function remainingPlanned(budget, ym) {
  const planned = plannedMonth(budget, ym);
  const real = realMonthByCat(budget, ym);
  const rows = [];
  let total = 0;
  for (const [catId, p] of Object.entries(planned.byCat)) {
    const r = real.byCat[catId] || 0;
    const remaining = p - r;
    if (remaining > 0.5) {
      const cat = catId !== "_" && catId !== "_debt" ? catById(budget, catId) : null;
      rows.push({ catId, cat, planned: p, real: r, remaining });
      total += remaining;
    }
  }
  rows.sort((a, z) => z.remaining - a.remaining);
  return { total, rows };
}

/* Mensualité nécessaire pour atteindre un objectif à la date cible. */
function goalRequiredMonthly(goal) {
  if (!goal.target || !goal.targetDate) return null;
  const n = monthIndex(ymOf(goal.targetDate)) - monthIndex(ymOf(todayStr()));
  if (n <= 0) return null;
  return Math.max(0, (goal.target - (+goal.current || 0)) / n);
}
/* Date estimée d'atteinte d'un objectif au rythme actuel. */
function goalEta(budget, goal) {
  const monthly = budget.items.filter(i => i.savingTo === goal.id && !i.endDate)
    .reduce((s, i) => s + monthlyEquivalent(i), 0);
  if (monthly <= 0 || !goal.target) return null;
  const n = Math.ceil((goal.target - (+goal.current || 0)) / monthly);
  return n <= 0 ? ymOf(todayStr()) : addMonths(ymOf(todayStr()), n);
}
