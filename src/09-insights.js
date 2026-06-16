"use strict";
/* ============ moteur d'analyse : insights factuels, prédictifs & contextuels ============
 * Produit des constats chiffrés, jamais d'encouragement. Chaque insight est rangé par
 * priorité et peut porter une action concrète. Alimente le tableau de bord et le suivi.
 */

const Insights = (() => {

  const DAY = 86400000;
  const shiftDay = (s, n) => new Date(toDate(s).getTime() + n * DAY).toISOString().slice(0, 10);
  const med = arr => {
    if (!arr || !arr.length) return 0;
    const s = [...arr].map(Number).sort((a, z) => a - z);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const txOf = b => State.transactions.filter(t => t.budgetId === b.id);

  /* priorité de tri : plus c'est haut, plus c'est urgent/actionnable */
  const RANK = { danger: 0, warn: 1, opp: 2, info: 3, good: 4 };

  /* ---------- 1. rythme de dépenses & prévision de fin de mois ---------- */
  function pace(b, ctx, out) {
    const { ymNow, dayN, dim, real, planned, reste } = ctx;
    if (planned.expense <= 0 || real.expense <= 0 || dayN < 4) return;
    // deux estimations : (réel + prévu non débité) et la simple extrapolation linéaire
    const reserveEst = real.expense + reste.total;
    const linearEst = dayN >= 7 ? real.expense / dayN * dim : 0;
    const forecast = Math.max(reserveEst, linearEst);
    const diff = forecast - planned.expense;
    const mois = MOIS[+ymNow.slice(5, 7) - 1];
    if (diff > Math.max(20, planned.expense * 0.06)) {
      out.push({
        id: "pace-over", tone: "warn", icon: "trend",
        text: `À ce rythme, environ ${fmtMoney(forecast, b.currency, { dec: 0 })} de dépenses d'ici la fin ${mois} — soit ${fmtMoney(diff, b.currency, { dec: 0 })} de plus que les ${fmtMoney(planned.expense, b.currency, { dec: 0 })} prévus.`,
      });
    } else if (forecast < planned.expense * 0.9 && dayN >= 12) {
      out.push({
        id: "pace-under", tone: "good", icon: "check",
        text: `Dépenses sous contrôle : ~${fmtMoney(forecast, b.currency, { dec: 0 })} attendus d'ici fin ${mois}, soit ${fmtMoney(planned.expense - forecast, b.currency, { dec: 0 })} sous le budget prévu.`,
      });
    }
  }

  /* ---------- 2. point bas de trésorerie (jour près) sur ~45 jours ---------- */
  function cashflowLow(b, ctx, out) {
    const { ymNow, balNow, planned } = ctx;
    const today = todayStr();
    const flowByDate = {};
    for (const ym of [ymNow, addMonths(ymNow, 1), addMonths(ymNow, 2)]) {
      const f = dayFlows(b, ym);
      for (const [d, list] of Object.entries(f)) {
        let net = 0;
        list.forEach(x => { net += x.item.kind === "income" ? x.amount : -x.amount; });
        flowByDate[d] = (flowByDate[d] || 0) + net;
      }
    }
    let run = balNow, minV = balNow, minD = today;
    for (let i = 1; i <= 45; i++) {
      const d = shiftDay(today, i);
      run += flowByDate[d] || 0;
      if (run < minV) { minV = run; minD = d; }
    }
    if (minV >= balNow - 0.5) return;                  // jamais sous le solde actuel : rien à signaler
    const oneWeek = planned.expense / 30 * 7;
    if (minV < 0) {
      out.push({
        id: "cash-neg", tone: "danger", icon: "alert",
        text: `Trésorerie : point bas le ${fmtDate(minD)} à environ ${fmtMoney(minV, b.currency, { dec: 0 })}. Une rentrée ou un report d'échéance sera nécessaire avant cette date.`,
      });
    } else if (minV < oneWeek && oneWeek > 0) {
      out.push({
        id: "cash-tight", tone: "warn", icon: "wallet",
        text: `Trésorerie tendue autour du ${fmtDate(minD)} : il ne resterait qu'environ ${fmtMoney(minV, b.currency, { dec: 0 })} sur le compte à ce moment-là.`,
      });
    }
  }

  /* ---------- 3. anomalie de montant sur un marchand connu (40 derniers jours) ---------- */
  function anomalies(b, ctx, out) {
    const since = shiftDay(todayStr(), -40);
    const seen = {};
    const hits = [];
    for (const t of txOf(b)) {
      if (t.kind !== "expense" || t.date < since || !t.label || t.splits) continue;
      const k = Intel.merchantKey(t.label);
      if (!k || k === "RETRAIT" || seen[k]) continue;
      const rule = State.intel.rules[b.id + "|" + k];
      if (!rule || !rule.amounts || rule.amounts.length < 4) continue;
      const m = med(rule.amounts);
      if (m < 8) continue;
      const amt = +t.amount;
      if (amt > m * 2.2 && amt - m > 25) {
        seen[k] = 1;
        hits.push({ t, m, amt, gap: amt - m, name: titleCase(k) });
      }
    }
    hits.sort((a, z) => z.gap - a.gap);
    hits.slice(0, 2).forEach(h => {
      out.push({
        id: "anom-" + h.t.id, tone: "warn", icon: "alert",
        text: `« ${h.name} » : ${fmtMoney(h.amt, b.currency, { dec: 0 })} le ${fmtDate(h.t.date)}, inhabituel (≈ ${fmtMoney(h.m, b.currency, { dec: 0 })} d'ordinaire).`,
        action: { label: "Voir", run: () => { go("tracking"); setTimeout(() => openTxEditor(b, h.t), 60); } },
      });
    });
  }

  /* ---------- 4. catégorie en forte variation vs moyenne des 3 mois pleins ---------- */
  function categoryMovers(b, ctx, out) {
    const { ymNow, dayN, dim, real } = ctx;
    if (dayN < 6) return;
    const past = [1, 2, 3].map(n => realMonthByCat(b, addMonths(ymNow, -n)).byCat);
    const movers = [];
    for (const [catId, spent] of Object.entries(real.byCat)) {
      if (catId === "_" || catId === "_debt") continue;
      const hist = past.map(p => p[catId] || 0);
      if (!hist.some(v => v > 0)) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / 3;
      if (avg < 15) continue;
      const proj = spent / dayN * dim;                 // extrapolation du mois en cours
      if (proj > avg * 1.3 && proj - avg > 30) {
        const c = catById(b, catId);
        movers.push({ catId, c, avg, proj, pct: (proj - avg) / avg });
      }
    }
    movers.sort((a, z) => (z.proj - z.avg) - (a.proj - a.avg));
    const top = movers[0];
    if (top) {
      out.push({
        id: "mover-" + top.catId, tone: "info", icon: "trend",
        text: `${top.c ? top.c.emoji + " " + top.c.name : "Catégorie"} : ~${fmtMoney(top.proj, b.currency, { dec: 0 })} ce mois-ci, soit +${Math.round(top.pct * 100)} % par rapport à votre moyenne des 3 mois (${fmtMoney(top.avg, b.currency, { dec: 0 })}).`,
      });
    }
  }

  /* ---------- 5. capacité d'épargne dégagée non affectée ---------- */
  function savingsCapacity(b, ctx, out) {
    const { planned } = ctx;
    const net = planned.income - planned.expense;
    if (net < 60) return;
    const unalloc = net - (planned.saving || 0);
    if (unalloc < 50 || unalloc < planned.income * 0.05) return;
    out.push({
      id: "save-cap", tone: "opp", icon: "pig",
      text: `Vous dégagez environ ${fmtMoney(net, b.currency, { dec: 0 })} par mois, dont ${fmtMoney(unalloc, b.currency, { dec: 0 })} non affectés à de l'épargne. Un virement automatique permettrait de les mettre de côté sans y penser.`,
      action: { label: "Programmer", run: () => go("goals") },
    });
  }

  /* ---------- 6. poste planifié jamais constaté dans le réel (2 mois) ---------- */
  function dormantItems(b, ctx, out) {
    const recent = txOf(b).filter(t => t.date >= shiftDay(todayStr(), -62));
    if (recent.length < 8) return;                     // pas assez de suivi réel pour conclure
    const usedCats = new Set();
    recent.forEach(t => {
      const parts = (t.splits && t.splits.length) ? t.splits : [{ categoryId: t.categoryId }];
      parts.forEach(p => { const top = catTop(b, p.categoryId); if (top) usedCats.add(top.id); });
    });
    for (const it of b.items) {
      if (it.kind !== "expense" || it.endDate || !FREQ_MONTHS[it.freq] || !(+it.amount > 0)) continue;
      if (monthIndex(ymOf(it.startDate)) > monthIndex(ymOf(todayStr())) - 2) continue;
      const top = catTop(b, it.categoryId);
      if (top && !usedCats.has(top.id)) {
        out.push({
          id: "dormant-" + it.id, tone: "info", icon: "info",
          text: `Poste « ${it.name} » (${fmtMoney(+it.amount, b.currency, { dec: 0 })}/mois) : aucune dépense constatée dans « ${top.name} » depuis 2 mois. Toujours d'actualité ?`,
          action: { label: "Vérifier", run: () => go("budget") },
        });
        break;                                          // un seul à la fois, pour ne pas noyer
      }
    }
  }

  /* ---------- 7. meilleure suggestion de récurrence (remontée depuis le suivi) ---------- */
  function recurringTop(b, ctx, out) {
    let list = [];
    try { list = Intel.detectRecurring(b); } catch (e) { return; }
    const sg = list.find(s => s.type === "new") || list[0];
    if (!sg) return;
    out.push({
      id: "rec-" + sg.id, tone: "opp", icon: "spark", text: sg.text,
      action: {
        label: sg.type === "new" ? "Créer le poste" : "Appliquer",
        run: () => { const msg = sg.apply(); Intel.dismiss(sg.id); persist(); renderApp(); toast("✅ " + msg); },
      },
    });
  }

  function titleCase(s) { return String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }

  /* ---------- assemblage ---------- */
  function compute(b) {
    if (!b) return [];
    const ymNow = ymOf(todayStr());
    const today = todayStr();
    const real = realMonthByCat(b, ymNow);
    const planned = plannedMonth(b, ymNow);
    const reste = remainingPlanned(b, ymNow);
    const balNow = balanceAtMonthStart(b, ymNow) + real.income - real.expense;
    const ctx = {
      ymNow, today, dayN: +today.slice(8), dim: daysInMonth(ymNow),
      real, planned, reste, balNow,
    };
    const out = [];
    cashflowLow(b, ctx, out);
    pace(b, ctx, out);
    anomalies(b, ctx, out);
    categoryMovers(b, ctx, out);
    recurringTop(b, ctx, out);
    savingsCapacity(b, ctx, out);
    dormantItems(b, ctx, out);

    const skip = State.intel.dismissed || {};
    return out
      .filter(i => !skip[i.id])
      .sort((a, z) => (RANK[a.tone] - RANK[z.tone]))
      .slice(0, 5);
  }

  /* reste-à-vivre par jour : disponible réparti sur les jours restants du mois */
  function safeToSpend(b) {
    const ymNow = ymOf(todayStr());
    const real = realMonthByCat(b, ymNow);
    const balNow = balanceAtMonthStart(b, ymNow) + real.income - real.expense;
    const reste = remainingPlanned(b, ymNow);
    const dispo = balNow - reste.total;
    const daysLeft = Math.max(1, daysInMonth(ymNow) - +todayStr().slice(8) + 1);
    return { dispo, perDay: dispo / daysLeft, daysLeft };
  }

  return { compute, safeToSpend, shiftDay };
})();
