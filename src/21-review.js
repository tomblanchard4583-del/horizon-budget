"use strict";
/* ============ bilan mensuel factuel (« Month in Review ») ============
 * Récapitulatif chiffré d'un mois écoulé : dépensé vs prévu, top catégories,
 * plus grosse variation, épargne dégagée, évolution du solde, une phrase de cap.
 * 100 % factuel — aucun encouragement, aucune célébration (cf. règle anti-gamification).
 * Réutilise les moteurs existants (realMonthByCat, plannedMonth, project) : pas de nouveau calcul financier.
 */

const MonthReview = (() => {

  /* ---------- calcul du bilan d'un mois ---------- */
  function compute(b, ym) {
    const cur = b.currency;
    const real = realMonthByCat(b, ym);
    const planned = plannedMonth(b, ym);

    // évolution du solde sur le mois (réel uniquement)
    const balStart = balanceAtMonthStart(b, ym);
    const balEnd = balanceAtMonthStart(b, addMonths(ym, 1));

    // top 3 catégories de dépense réelle
    const topCats = Object.entries(real.byCat)
      .map(([id, amount]) => ({ id, amount, cat: (id !== "_" && id !== "_debt") ? catById(b, id) : null }))
      .filter(x => x.amount > 0.5)
      .sort((a, z) => z.amount - a.amount)
      .slice(0, 3);

    // plus grosse variation vs la moyenne des 3 mois pleins précédents (mois écoulé → pas de proration)
    const past = [1, 2, 3].map(n => realMonthByCat(b, addMonths(ym, -n)).byCat);
    let mover = null;
    for (const [id, amount] of Object.entries(real.byCat)) {
      if (id === "_" || id === "_debt" || amount < 40) continue;
      const hist = past.map(p => p[id] || 0);
      if (!hist.some(v => v > 0)) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / 3;
      if (avg < 15) continue;
      const delta = amount - avg;
      if (Math.abs(delta) < 30) continue;
      if (!mover || Math.abs(delta) > Math.abs(mover.delta)) {
        mover = { cat: catById(b, id), amount, avg, delta, pct: delta / avg };
      }
    }

    return {
      ym, cur,
      expense: { real: real.expense, planned: planned.expense },
      income: { real: real.income, planned: planned.income },
      net: real.income - real.expense,
      saving: planned.saving || 0,
      balStart, balEnd,
      topCats, mover,
      cap: capSentence(b),
    };
  }

  /* ---------- une phrase de cap : objectif le plus proche, sinon projection 12 mois ---------- */
  function capSentence(b) {
    const cur = b.currency;
    const goals = (b.goals || []).filter(g => +g.target > 0);
    // objectif daté le plus proche en priorité, sinon n'importe quel objectif financé
    const dated = goals.filter(g => g.targetDate).sort((a, z) => a.targetDate.localeCompare(z.targetDate))[0];
    const g = dated || goals[0];
    if (g) {
      const eta = goalEta(b, g);
      if (eta) {
        let s = `Objectif « ${g.name} » : au rythme actuel, atteint vers ${fmtYm(eta)}.`;
        if (g.targetDate) {
          const diff = monthIndex(eta) - monthIndex(ymOf(g.targetDate));
          if (diff > 1) s += ` Soit ${diff} mois après la date visée (${fmtYm(ymOf(g.targetDate))}).`;
          else if (diff < -1) s += ` Soit ${-diff} mois avant la date visée.`;
          else s += ` Conforme à la date visée.`;
        }
        return { icon: "target", text: s };
      }
      const req = goalRequiredMonthly(g);
      if (req != null) return { icon: "target", text: `Objectif « ${g.name} » : il faudrait mettre ${fmtMoney(req, cur, { dec: 0 })} de côté chaque mois pour tenir la date visée.` };
    }
    // pas d'objectif : projection du solde à 12 mois
    try {
      const proj = project(b, { months: 13 });
      const r = proj[12];
      if (r) return { icon: "trend", text: `Au rythme actuel, solde projeté dans 12 mois : ${fmtMoney(r.balance, cur, { sign: true })}.` };
    } catch (e) {}
    return null;
  }

  function stat(label, value, sub, tone) {
    return el("div", { class: "card kpi", style: "padding:12px" },
      el("div", { class: "k-label" }, label),
      el("div", { class: "k-value " + (tone || ""), style: "font-size:1.125rem" }, value),
      el("div", { class: "k-sub" }, sub));
  }

  /* ---------- rendu : modale de bilan ---------- */
  function open(b, ym) {
    const d = compute(b, ym);
    const aiAvail = Intel.aiReady();
    let aiBox = aiAvail ? el("div", { style: "display:flex; flex-direction:column; gap:14px" }) : null;
    let aiBtn = null;
    if (aiAvail) {
      aiBtn = el("button", { class: "btn", onclick: async () => {
        aiBtn.disabled = true;
        aiBtn.textContent = "Analyse en cours…";
        try {
          const txt = await Intel.aiSummarizeReview(d);
          aiBox.innerHTML = "";
          aiBox.append(el("div", { class: "card card-pad" },
            el("div", { class: "alert a-info" },
              el("span", { class: "a-ico", html: ico("spark", 17) }),
              el("span", {}, txt))));
        } catch (e) {
          aiBox.textContent = "Erreur IA : " + (e.message || e);
        }
        aiBtn.textContent = "Résumé IA";
        aiBtn.disabled = false;
      }}, "Résumé IA");
    }
    const cur = d.cur;
    const expDiff = d.expense.real - d.expense.planned;
    const expPct = d.expense.planned > 0 ? d.expense.real / d.expense.planned : 0;

    const statRow = el("div", { class: "grid g3", style: "gap:10px" },
      stat("Revenus encaissés", fmtMoney(d.income.real, cur), d.income.planned > 0 ? `sur ${fmtMoney(d.income.planned, cur)} prévus` : "", "pos"),
      stat("Solde du mois", fmtMoney(d.net, cur, { sign: true }), d.net >= 0 ? "rentrées − dépenses" : "dépenses > rentrées", d.net >= 0 ? "pos" : "neg"),
      stat("Solde du compte", fmtMoney(d.balEnd, cur, { sign: true }), `${fmtMoney(d.balStart, cur, { dec: 0 })} → ${fmtMoney(d.balEnd, cur, { dec: 0 })}`, d.balEnd < 0 ? "neg" : ""));

    const expCard = el("div", { class: "card card-pad" },
      el("div", { class: "flex small", style: "margin-bottom:6px" },
        el("span", {}, "Dépensé"),
        el("span", { class: "spacer" }),
        el("b", { class: "mono" }, fmtMoney(d.expense.real, cur)),
        d.expense.planned > 0 ? el("span", { class: "muted", style: "margin-left:6px" }, `/ ${fmtMoney(d.expense.planned, cur)} prévus`) : null),
      d.expense.planned > 0 ? el("div", { class: "pbar" + (expDiff > 0 ? " over" : "") }, el("i", { style: `width:${Math.min(100, expPct * 100)}%` })) : null,
      d.expense.planned > 0 ? el("div", { class: "xs", style: "margin-top:6px" },
        expDiff > 0
          ? el("span", { class: "neg" }, `${fmtMoney(expDiff, cur, { dec: 0 })} de plus que prévu (${Math.round(expPct * 100)} % du budget).`)
          : el("span", { class: "pos" }, `${fmtMoney(-expDiff, cur, { dec: 0 })} sous le budget prévu.`)) : null);

    const topCard = d.topCats.length ? el("div", { class: "card card-pad" },
      el("h4", { class: "mb12" }, "Principaux postes de dépense"),
      el("div", { style: "display:flex; flex-direction:column; gap:10px" },
        d.topCats.map(t => {
          const share = d.expense.real > 0 ? t.amount / d.expense.real : 0;
          const top = t.cat ? catTop(b, t.cat.id) : null;
          return el("div", {},
            el("div", { class: "flex small", style: "margin-bottom:4px" },
              el("span", {}, top ? `${top.emoji} ${top.name}` : (t.id === "_debt" ? "💳 Crédits" : "🧾 Sans catégorie")),
              el("span", { class: "spacer" }),
              el("b", { class: "mono" }, fmtMoney(t.amount, cur, { dec: 0 })),
              el("span", { class: "xs muted", style: "margin-left:6px" }, `${Math.round(share * 100)} %`)),
            el("div", { class: "pbar" }, el("i", { style: `width:${share * 100}%; background:${top ? top.color : "var(--accent)"}` })));
        }))) : null;

    const moverCard = d.mover ? el("div", { class: "card card-pad" },
      el("div", { class: "alert a-info" },
        el("span", { class: "a-ico", html: ico("trend", 17) }),
        el("span", {}, `${d.mover.cat ? catTop(b, d.mover.cat.id).emoji + " " + catTop(b, d.mover.cat.id).name : "Une catégorie"} : ${fmtMoney(d.mover.amount, cur, { dec: 0 })} ce mois-ci, soit ${d.mover.delta > 0 ? "+" : "−"}${Math.abs(Math.round(d.mover.pct * 100))} % par rapport à votre moyenne des 3 mois (${fmtMoney(d.mover.avg, cur, { dec: 0 })}).`))) : null;

    const saveCard = (d.net > 0 || d.saving > 0) ? el("div", { class: "card card-pad" },
      el("div", { class: "alert a-ok" },
        el("span", { class: "a-ico", html: ico("pig", 17) }),
        el("span", {}, d.saving > 0
          ? `Épargne programmée ce mois : ${fmtMoney(d.saving, cur, { dec: 0 })}.` + (d.net > d.saving ? ` Solde du mois positif de ${fmtMoney(d.net, cur, { dec: 0 })} : ${fmtMoney(d.net - d.saving, cur, { dec: 0 })} non affectés.` : "")
          : `Solde du mois positif : ${fmtMoney(d.net, cur, { dec: 0 })} dégagés, qu'un virement automatique permettrait de mettre de côté.`))) : null;

    const capCard = d.cap ? el("div", { class: "card card-pad" },
      el("div", { class: "alert a-info" },
        el("span", { class: "a-ico", html: ico(d.cap.icon, 17) }),
        el("span", {}, d.cap.text))) : null;

    const empty = (d.income.real === 0 && d.expense.real === 0)
      ? emptyState("📭", "Aucune opération", "Aucune transaction enregistrée sur ce mois — rien à récapituler.")
      : null;

    const m = modal({
      title: "Bilan de " + fmtYm(ym),
      lg: true,
      body: empty || el("div", { style: "display:flex; flex-direction:column; gap:14px; padding:2px 0 6px" },
        statRow, expCard, topCard, moverCard, saveCard, capCard, aiBox),
      foot: [
        el("span", { class: "spacer" }),
        aiBtn,
        el("button", { class: "btn", onclick: () => { m.close(); go("tracking"); } }, "Voir les opérations"),
        el("button", { class: "btn btn-p", onclick: () => m.close() }, "Fermer"),
      ].filter(Boolean),
    });
    return m;
  }

  /* ---------- déclenchement automatique au début d'un nouveau mois ---------- */
  function maybeShow(b) {
    if (!b) return;
    const prev = addMonths(ymOf(todayStr()), -1);
    if (b.lastReviewYm === prev) return;                 // déjà présenté pour ce mois
    const real = realMonthByCat(b, prev);
    if (real.income === 0 && real.expense === 0) return; // rien à récapituler : ne pas marquer (peut arriver plus tard)
    b.lastReviewYm = prev;
    persist();
    setTimeout(() => open(b, prev), 650);
  }

  return { compute, open, maybeShow };
})();
