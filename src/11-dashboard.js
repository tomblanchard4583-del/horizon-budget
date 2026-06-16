"use strict";
/* ============ vue : tableau de bord ============ */

function viewDashboard(root) {
  const b = curBudget();
  const ymNow = ymOf(todayStr());
  const proj = project(b, { months: Math.max(13, State.settings.horizonMonths) });
  const m0 = proj[0];
  const real = realMonthByCat(b, ymNow);
  const balNow = balanceAtMonthStart(b, ymNow) + real.income - real.expense;
  const reste = remainingPlanned(b, ymNow);
  const disponible = balNow - reste.total;
  const alerts = computeAlerts(b);
  const insights = (typeof Insights !== "undefined") ? Insights.compute(b) : [];
  const sts = Insights.safeToSpend(b);
  const cur = b.currency;

  const plannedLeft = m0.income - m0.expense;
  const endOfMonth = m0.balance;
  const savingRate = m0.income > 0 ? (m0.income - m0.expense + m0.saving) / m0.income : 0;
  // KPIs
  const kpis = el("div", { class: "grid", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" },
    kpi("Argent réellement disponible", fmtMoney(disponible, cur),
      reste.total > 0.5 ? `solde ${fmtMoney(balNow, cur)} − ${fmtMoney(reste.total, cur)} déjà prévus, pas encore débités` : "rien de prévu n'est encore en attente de débit", disponible < 0 ? "neg" : "pos"),
    kpi("Solde réel aujourd'hui", fmtMoney(balNow, cur), `${State.transactions.filter(t => t.budgetId === b.id).length ? "solde initial + transactions saisies" : "solde initial du " + fmtDateShort(b.initialDate)}`),
    kpi("Solde prévu fin " + MOIS[+ymNow.slice(5, 7) - 1], fmtMoney(endOfMonth, cur), plannedLeft >= 0 ? `+${fmtMoney(plannedLeft, cur)} ce mois-ci` : `${fmtMoney(plannedLeft, cur)} ce mois-ci`, endOfMonth < 0 ? "neg" : "pos"),
    kpi("Taux d'épargne prévu", m0.income > 0 ? fmtPct(savingRate) : "—", m0.saving > 0 ? `dont ${fmtMoney(m0.saving, cur)} d'épargne versée` : "revenus − dépenses, en % des revenus", savingRate < 0 ? "neg" : ""),
    kpi("Dépenses réelles du mois", fmtMoney(real.expense, cur), m0.expense > 0 ? `sur ${fmtMoney(m0.expense, cur)} prévues (${Math.round(real.expense / m0.expense * 100)} %)` : "aucune dépense prévue", real.expense > m0.expense && m0.expense > 0 ? "neg" : ""),
    kpi("Reste à vivre par jour", fmtMoney(sts.perDay, cur), `${fmtMoney(sts.dispo, cur)} sur ${sts.daysLeft} jour${sts.daysLeft > 1 ? "s" : ""} restant${sts.daysLeft > 1 ? "s" : ""}`, sts.perDay < 0 ? "neg" : "pos")
  );

  // analyse intelligente : constats chiffrés, prédictifs & actionnables
  const toneCls = { danger: "danger", warn: "warn", good: "ok", info: "info", opp: "info" };
  const insightCard = insights.length ? el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "💡 Analyse intelligente"),
      el("span", { class: "spacer" }), el("span", { class: "xs muted" }, "d'après vos données")),
    el("div", { class: "card-pad", style: "display:flex; flex-direction:column; gap:10px" },
      insights.map(it => el("div", { class: "insight" },
        el("div", { class: "alert a-" + (toneCls[it.tone] || "info"), style: "flex:1; min-width:0" },
          el("span", { class: "a-ico", html: ico(it.icon, 17) }), el("span", {}, it.text)),
        el("div", { class: "insight-act" },
          it.action ? el("button", { class: "btn btn-sm btn-p", onclick: () => { const r = it.action.run(); if (typeof r === "string") toast("✅ " + r); } }, it.action.label) : null,
          el("button", { class: "btn btn-sm btn-ghost btn-ico", title: "Ignorer", html: ico("x", 15), onclick: () => { Intel.dismiss(it.id); persist(); renderApp(); } })))))
  ) : null;

  // dépenses prévues pas encore débitées (réservées, non comptées comme disponibles)
  const resteCard = reste.rows.length ? el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "🔒 Déjà prévu, pas encore débité"),
      el("span", { class: "spacer" }), el("span", { class: "small muted" }, `${fmtMoney(reste.total, cur)} réservés`)),
    el("div", { class: "card-pad", style: "display:flex; flex-direction:column; gap:8px" },
      reste.rows.slice(0, 8).map(r => el("div", { class: "flex small" },
        el("span", { class: "cat-dot", style: "background:" + (r.cat ? r.cat.color : "#dc2626") }),
        el("span", {}, r.cat ? `${r.cat.emoji} ${r.cat.name}` : "💳 Crédits & autres"),
        el("span", { class: "spacer" }),
        el("span", { class: "xs muted" }, `${fmtMoney(r.real, cur)} / ${fmtMoney(r.planned, cur)}`),
        el("b", { class: "mono" }, fmtMoney(r.remaining, cur))
      ))
    )
  ) : null;

  // alertes
  const alertBox = alerts.length ? el("div", { class: "grid", style: "gap:8px" },
    alerts.slice(0, 4).map(a => el("div", { class: "alert a-" + (a.type === "danger" ? "danger" : a.type === "warn" ? "warn" : "info") },
      el("span", { class: "a-ico", html: ico(a.icon, 17) }), el("span", {}, a.text)))
  ) : null;

  // graphique projection 12 mois
  const horizon = Math.min(proj.length, 13);
  const chartCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Projection du solde"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("projection") }, "Tout voir →")),
    el("div", { class: "card-pad" }, chartLine({
      labels: proj.slice(0, horizon).map(r => r.ym),
      series: [
        { name: "Solde", color: "#10b981", values: proj.slice(0, horizon).map(r => r.balance), fill: true },
        { name: "Patrimoine net", color: "#8b5cf6", values: proj.slice(0, horizon).map(r => r.netWorth), dash: true },
      ],
      markers: proj.slice(0, horizon).flatMap((r, i) => r.events.map(e => ({ idx: i, label: e.name, emoji: e.emoji }))),
      cur, height: 230,
    }))
  );

  // donut répartition du mois
  const parts = Object.entries(m0.byCat).map(([id, v]) => {
    const c = catById(b, id);
    return { label: c ? c.name : "Crédits & autres", emoji: c ? c.emoji : "💳", color: c ? c.color : "#dc2626", value: v };
  }).sort((a, z) => z.value - a.value);
  const donutCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Dépenses prévues du mois")),
    parts.length ? el("div", { class: "card-pad" },
      chartDonut({ parts, cur, height: 195, centerLabel: "ce mois-ci" }),
      el("div", { class: "mt12" }, parts.slice(0, 6).map(p => el("div", { class: "flex", style: "padding:3.5px 0; font-size:13px" },
        el("span", { class: "cat-dot", style: "background:" + p.color }),
        el("span", {}, `${p.emoji} ${p.label}`),
        el("span", { class: "spacer" }),
        el("b", { class: "mono" }, fmtMoney(p.value, cur))
      )))
    ) : emptyState("🌱", "Aucune dépense prévue", "Ajoutez vos charges dans l'onglet Budget.")
  );

  // prochaines échéances (14 jours)
  const upcoming = [];
  for (const ym of [ymNow, addMonths(ymNow, 1)]) {
    const flows = dayFlows(b, ym);
    for (const [date, list] of Object.entries(flows)) {
      const diff = (toDate(date) - toDate(todayStr())) / 86400000;
      if (diff < 0 || diff > 14) continue;
      list.forEach(f => upcoming.push({ date, ...f }));
    }
  }
  upcoming.sort((a, z) => a.date.localeCompare(z.date));
  const upCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Échéances des 14 prochains jours"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("calendar") }, "Calendrier →")),
    upcoming.length ? el("div", { class: "row-list", style: "padding-bottom:8px" }, upcoming.slice(0, 8).map(u =>
      el("div", { class: "item-row", style: "cursor:default" },
        el("div", { class: "i-emoji", style: "font-size:12px; font-weight:700; flex-direction:column; line-height:1.1; display:flex; align-items:center; justify-content:center" },
          el("span", {}, String(+u.date.slice(8))), el("span", { class: "xs muted" }, MOIS[+u.date.slice(5, 7) - 1].slice(0, 4) + ".")),
        el("div", { class: "i-main" },
          el("div", { class: "i-name" }, u.item.name || "(sans nom)"),
          el("div", { class: "i-sub" }, u.item._debt ? "mensualité de crédit" : catLabel(b, u.item.categoryId))),
        el("div", { class: "i-amt " + (u.item.kind === "income" ? "pos" : "") }, fmtMoney(u.item.kind === "income" ? u.amount : -u.amount, cur, { sign: true }))
      ))) : emptyState("📭", "Rien à signaler", "Aucune échéance planifiée sur les 14 prochains jours.")
  );

  // objectifs
  const goalCard = b.goals.length ? el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Objectifs d'épargne"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("goals") }, "Gérer →")),
    el("div", { class: "card-pad", style: "display:flex; flex-direction:column; gap:14px" },
      b.goals.slice(0, 4).map(g => {
        const current = +g.current || 0;
        const pct = g.target ? clamp(current / g.target, 0, 1) : 0;
        const done = g.target > 0 && current >= g.target;
        const eta = done ? null : goalEta(b, g);
        return el("div", {},
          el("div", { class: "flex small mb8" }, el("span", {}, `${g.emoji || "🎯"} ${g.name}`), el("span", { class: "spacer" }),
            el("b", { class: "mono" }, fmtMoney(current, cur, { dec: 0 }) + " / " + fmtMoney(g.target, cur, { dec: 0 }))),
          el("div", { class: "pbar" }, el("i", { style: `width:${pct * 100}%; background:${g.color || "var(--accent)"}` })),
          el("div", { class: "xs muted", style: "margin-top:5px" },
            done ? "Objectif atteint"
              : `Reste ${fmtMoney(Math.max(0, (g.target || 0) - current), cur, { dec: 0 })}` + (eta ? ` · atteint vers ${fmtYm(eta).toLowerCase()}` : ""))
        );
      })
    )
  ) : null;

  root.append(
    el("div", { class: "content-inner grid", style: "gap:16px" },
      kpis,
      insightCard,
      alertBox,
      resteCard,
      el("div", { class: "grid g23" }, chartCard, donutCard),
      el("div", { class: "grid g2" }, upCard, goalCard || el("div", { class: "card" },
        el("div", { class: "card-head" }, el("h3", {}, "Objectifs d'épargne")),
        emptyState("🎯", "Aucun objectif", "Vacances, permis, apport immobilier… fixez un cap et suivez votre progression.",
          el("button", { class: "btn btn-p btn-sm", onclick: () => go("goals") }, "Créer un objectif"))))
    )
  );

  function kpi(label, value, sub, tone) {
    return el("div", { class: "card kpi" },
      el("div", { class: "k-label" }, label),
      el("div", { class: "k-value " + (tone || "") }, value),
      el("div", { class: "k-sub" }, sub || "")
    );
  }
}
