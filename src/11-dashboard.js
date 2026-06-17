"use strict";
/* ============ vue : accueil (une info maîtresse, puis des cartes calmes) ============ */

function viewDashboard(root) {
  const b = curBudget();
  const ymNow = ymOf(todayStr());
  const proj = project(b, { months: Math.max(13, State.settings.horizonMonths) });
  const m0 = proj[0];
  const real = realMonthByCat(b, ymNow);
  const reste = remainingPlanned(b, ymNow);
  const sts = Insights.safeToSpend(b);
  const cur = b.currency;
  const endOfMonth = m0.balance;
  const monthName = MOIS[+ymNow.slice(5, 7) - 1];

  // ---------- HÉROS : reste à vivre ce mois-ci ----------
  const heroVal = sts.dispo;
  const heroCls = heroVal < 0 ? "neg" : "pos";
  const hero = el("div", { class: "hero" },
    el("div", { class: "h-label" }, "Reste à vivre ce mois-ci"),
    el("div", { class: "h-value " + heroCls }, ...moneyHero(heroVal, cur)),
    el("div", { class: "h-sub" }, sts.daysLeft > 0
      ? `${fmtMoney(sts.perDay, cur)} par jour sur ${sts.daysLeft} jour${sts.daysLeft > 1 ? "s" : ""} restant${sts.daysLeft > 1 ? "s" : ""}`
      : "dernier jour du mois"),
    el("div", { class: "h-spark" }, sparkline(proj.slice(0, 13).map(r => r.balance), heroVal < 0)),
    el("div", { class: "h-foot" }, `Solde prévu fin ${monthName} : `,
      el("b", { class: endOfMonth < 0 ? "neg" : "pos" }, fmtMoney(endOfMonth, cur, { sign: true })),
      el("span", { class: "spacer", style: "flex:1" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("projection") }, "Projection →"))
  );

  // ---------- une seule analyse à la fois (la plus prioritaire) ----------
  const alerts = computeAlerts(b);
  const insights = (typeof Insights !== "undefined") ? Insights.compute(b) : [];
  const danger = alerts.find(a => a.type === "danger");
  let analysisCard = null;
  if (danger) analysisCard = alertNode(danger);
  else if (insights.length) analysisCard = insightNode(insights[0]);
  else if (alerts.length) analysisCard = alertNode(alerts[0]);

  // ---------- dépensé ce mois ----------
  const spent = real.expense, planned = m0.expense;
  const pct = planned > 0 ? spent / planned : 0;
  const over = planned > 0 && spent > planned;
  const depCard = el("div", { class: "home-card" },
    el("div", { class: "hc-head" }, el("h3", {}, "Dépensé ce mois"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("tracking") }, "Détail")),
    el("div", { class: "hc-pad home-prog" },
      el("div", { class: "hp-top" },
        el("b", { class: "mono", style: "font-size:16px" }, fmtMoney(spent, cur)),
        el("span", { class: "v" }, planned > 0 ? `sur ${fmtMoney(planned, cur)} prévus · ${Math.round(pct * 100)} %` : "aucun budget prévu")),
      el("div", { class: "pbar" + (over ? " over" : "") }, el("i", { style: `width:${Math.min(100, pct * 100)}%` })))
  );

  // ---------- à venir (14 jours) ----------
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
  const upCard = el("div", { class: "home-card" },
    el("div", { class: "hc-head" }, el("h3", {}, "À venir"), el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("calendar") }, "Calendrier")),
    upcoming.length
      ? el("div", { class: "row-list", style: "padding-bottom:6px" }, upcoming.slice(0, 4).map(u => upRow(b, u, cur)))
      : emptyState("📭", "Rien à l'horizon", "Aucune échéance sur les 14 prochains jours.")
  );

  // ---------- objectifs (compact, si présents) ----------
  let goalCard = null;
  if (b.goals && b.goals.length) {
    goalCard = el("div", { class: "home-card" },
      el("div", { class: "hc-head" }, el("h3", {}, "Objectifs"), el("span", { class: "spacer" }),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => go("goals") }, "Gérer")),
      el("div", { class: "hc-pad", style: "display:flex; flex-direction:column; gap:14px" },
        b.goals.slice(0, 3).map(g => {
          const current = +g.current || 0;
          const p = g.target ? clamp(current / g.target, 0, 1) : 0;
          const done = g.target > 0 && current >= g.target;
          return el("div", {},
            el("div", { class: "flex small mb8" }, el("span", {}, `${g.emoji || "🎯"} ${g.name}`), el("span", { class: "spacer" }),
              el("b", { class: "mono" }, fmtMoney(current, cur, { dec: 0 }) + " / " + fmtMoney(g.target, cur, { dec: 0 }))),
            el("div", { class: "pbar" }, el("i", { style: `width:${p * 100}%; background:${g.color || "var(--accent)"}` })),
            el("div", { class: "xs muted", style: "margin-top:5px" },
              done ? "Objectif atteint" : `Reste ${fmtMoney(Math.max(0, (g.target || 0) - current), cur, { dec: 0 })}`));
        }))
    );
  }

  let aiCard = null;
  if (typeof Intel !== "undefined" && Intel.aiReady()) {
    const aiInput = el("input", { type: "number", placeholder: "Montant €", class: "input", style: "width:100px; flex-shrink:0" });
    const aiDesc = el("input", { type: "text", placeholder: "Description (optionnel)", class: "input", style: "flex:1; min-width:0" });
    const aiResult = el("div", { class: "xs muted", style: "padding-top:8px; white-space:pre-wrap" });
    let aiSubmit;
    aiSubmit = el("button", { class: "btn btn-sm btn-p", onclick: async () => {
      const amt = parseFloat(aiInput.value);
      if (!amt || amt <= 0) return;
      aiSubmit.disabled = true;
      aiResult.textContent = "Analyse en cours…";
      try {
        const txt = await Intel.aiCanAfford(b, amt, aiDesc.value.trim(), proj, sts);
        aiResult.textContent = txt;
      } catch (e) {
        aiResult.textContent = "Erreur IA : " + (e.message || e);
      }
      aiSubmit.disabled = false;
    }}, "Analyser");
    aiCard = el("div", { class: "home-card" },
      el("div", { class: "hc-head" },
        el("h3", {}, "Puis-je me permettre… ?"),
        el("span", { class: "a-ico", html: ico("spark", 17) })),
      el("div", { class: "hc-pad" },
        el("div", { class: "flex", style: "gap:8px; flex-wrap:wrap" }, aiInput, aiDesc, aiSubmit),
        aiResult));
  }

  const stack = el("div", { class: "home-stack" }, hero, analysisCard, depCard, upCard, goalCard, aiCard);
  root.append(el("div", { class: "content-inner" }, stack));

  // ---- helpers ----
  function moneyHero(v, cur) {
    const s = fmtMoney(v, cur);
    const mt = s.match(/^([\s\d., \-+]+)(.*)$/);
    if (!mt || !mt[2]) return [s];
    return [mt[1].trim(), el("span", { class: "cur" }, " " + mt[2].trim())];
  }
  function sparkline(vals, neg) {
    const n = vals.length;
    if (n < 2) return el("div");
    const W = 320, H = 46, pad = 4;
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const x = i => (i / (n - 1) * W).toFixed(1);
    const y = v => (H - pad - (v - min) / span * (H - pad * 2)).toFixed(1);
    const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const col = neg ? "var(--danger)" : "var(--accent)";
    const area = `0,${H} ${pts} ${W},${H}`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true">`
      + `<polygon points="${area}" fill="${col}" opacity="0.10"/>`
      + `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
      + `<circle cx="${x(n - 1)}" cy="${y(vals[n - 1])}" r="3.2" fill="${col}"/></svg>`;
    return el("div", { class: "spark", html: svg });
  }
  function upRow(b, u, cur) {
    const income = u.item.kind === "income";
    return el("div", { class: "item-row", style: "cursor:default" },
      el("div", { class: "i-emoji", style: "font-size:12px; font-weight:700; flex-direction:column; line-height:1.1; display:flex; align-items:center; justify-content:center" },
        el("span", {}, String(+u.date.slice(8))), el("span", { class: "xs muted" }, MOIS[+u.date.slice(5, 7) - 1].slice(0, 4) + ".")),
      el("div", { class: "i-main" },
        el("div", { class: "i-name" }, u.item.name || "(sans nom)"),
        el("div", { class: "i-sub" }, u.item._debt ? "mensualité de crédit" : catLabel(b, u.item.categoryId))),
      el("div", { class: "i-amt " + (income ? "pos" : "") }, fmtMoney(income ? u.amount : -u.amount, cur, { sign: true })));
  }
  function alertNode(a) {
    return el("div", { class: "home-card" }, el("div", { class: "hc-pad" },
      el("div", { class: "alert a-" + (a.type === "danger" ? "danger" : a.type === "warn" ? "warn" : "info") },
        el("span", { class: "a-ico", html: ico(a.icon, 17) }), el("span", {}, a.text))));
  }
  function insightNode(it) {
    const toneCls = { danger: "danger", warn: "warn", good: "ok", info: "info", opp: "info" };
    return el("div", { class: "home-card" }, el("div", { class: "hc-pad insight" },
      el("div", { class: "alert a-" + (toneCls[it.tone] || "info"), style: "flex:1; min-width:0" },
        el("span", { class: "a-ico", html: ico(it.icon, 17) }), el("span", {}, it.text)),
      el("div", { class: "insight-act" },
        it.action ? el("button", { class: "btn btn-sm btn-p", onclick: () => { const r = it.action.run(); if (typeof r === "string") toast("✅ " + r); } }, it.action.label) : null,
        el("button", { class: "btn btn-sm btn-ghost btn-ico", title: "Ignorer", html: ico("x", 15), onclick: () => { Intel.dismiss(it.id); persist(); renderApp(); } }))));
  }
}
