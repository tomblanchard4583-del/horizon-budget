"use strict";
/* ============ vue : dettes & crédits ============ */

function viewDebts(root) {
  const b = curBudget();
  const cur = b.currency;
  const ymNow = ymOf(todayStr());

  const totalRemaining = b.debts.reduce((s, d) => {
    const rows = amortize(d);
    const last = [...rows].reverse().find(r => r.ym <= ymNow);
    return s + (last ? last.balance : +d.principal || 0);
  }, 0);
  const totalMonthly = b.debts.reduce((s, d) => s + debtMonthly(d, ymNow), 0);

  const cards = b.debts.map(d => {
    const rows = amortize(d);
    const last = [...rows].reverse().find(r => r.ym <= ymNow);
    const remaining = last ? last.balance : +d.principal || 0;
    const payoff = debtPayoffYm(d);
    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const paidPct = d.principal > 0 ? clamp(1 - remaining / d.principal, 0, 1) : 0;
    const invalid = !rows.length && +d.principal > 0;
    return el("div", { class: "card card-pad" },
      el("div", { class: "flex mb8" },
        el("span", { style: "font-size:22px" }, d.emoji || "💳"),
        el("div", { style: "flex:1; min-width:0" },
          el("h3", { style: "font-size:15.5px" }, d.name),
          el("div", { class: "xs muted" }, `${fmtMoney(d.principal, cur, { dec: 0 })} à ${d.rate || 0} %`)),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 15), onclick: () => openDebtEditor(b, d) })),
      invalid
        ? el("div", { class: "alert a-danger small" }, "⚠️ Mensualité trop faible : elle ne couvre même pas les intérêts.")
        : el("div", {},
          el("div", { class: "flex small mb8" },
            el("span", { class: "muted" }, "Restant dû"),
            el("span", { class: "spacer" }),
            el("b", { class: "mono", style: "font-size:16px" }, fmtMoney(remaining, cur, { dec: 0 }))),
          el("div", { class: "pbar" }, el("i", { style: `width:${paidPct * 100}%` })),
          el("div", { class: "small muted mt12", style: "line-height:1.7" },
            el("div", {}, `💸 Mensualité : ${fmtMoney((+d.payment || 0) + (+d.extra || 0), cur)}` + (d.extra ? ` (dont ${fmtMoney(d.extra, cur)} de remboursement anticipé)` : "")),
            payoff ? el("div", {}, `🏁 Fin du crédit : ${fmtYm(payoff)}`) : null,
            el("div", {}, `📉 Coût total des intérêts : ${fmtMoney(totalInterest, cur, { dec: 0 })}`)),
          el("button", { class: "btn btn-sm mt12", onclick: () => showAmortTable(b, d) }, "Tableau d'amortissement"))
    );
  });

  const summarySec = el("div", { class: "grid g3" },
    el("div", { class: "card kpi" }, el("div", { class: "k-label" }, "Dette totale restante"), el("div", { class: "k-value" }, fmtMoney(totalRemaining, cur, { dec: 0 }))),
    el("div", { class: "card kpi" }, el("div", { class: "k-label" }, "Mensualités totales"), el("div", { class: "k-value" }, fmtMoney(totalMonthly, cur)), el("div", { class: "k-sub" }, "intégrées automatiquement aux projections")),
    el("div", { class: "card kpi" }, el("div", { class: "k-label" }, "Crédits en cours"), el("div", { class: "k-value" }, String(b.debts.length))));
  const listSec = el("div", {},
    el("div", { class: "flex mb12" },
      el("h3", {}, "💳 Crédits & dettes"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p btn-sm", html: ico("plus", 14) + "<span>Crédit / dette</span>", onclick: () => openDebtEditor(b, null) })),
    cards.length ? el("div", { class: "grid g3" }, cards)
      : el("div", { class: "card" }, emptyState("💳", "Aucun crédit",
        "Prêt immobilier, crédit auto, prêt étudiant, dette à un proche… L'app calcule la mensualité, la date de fin et le coût des intérêts, et intègre tout aux projections.",
        el("button", { class: "btn btn-p btn-sm", onclick: () => openDebtEditor(b, null) }, "Ajouter un crédit"))));
  const inner = el("div", { class: "content-inner grid", style: "gap:16px" });
  Custom.renderInto(inner, "page.debts", [{ id: "summary", node: summarySec }, { id: "list", node: listSec }], { axis: "y" });
  root.append(inner);
}

function openDebtEditor(b, debt) {
  const isNew = !debt;
  const d = debt ? { ...debt } : { id: uid(), name: "", emoji: "💳", principal: "", rate: "", payment: "", months: "", extra: 0, startDate: todayStr(), categoryId: null };
  let mode = d.months && !debt ? "months" : (d.payment ? "payment" : "months");

  const nameI = el("input", { class: "input", value: d.name, placeholder: "ex. Prêt immobilier, Crédit auto…" });
  const principalI = moneyInput({ value: d.principal || "", placeholder: "capital emprunté restant" });
  const rateI = moneyInput({ value: d.rate ?? "", cur: "%/an" });
  const startI = el("input", { class: "input", type: "date", value: d.startDate });
  const monthsI = el("input", { class: "input", type: "number", min: 1, max: 600, value: d.months || "", placeholder: "ex. 240" });
  const paymentI = moneyInput({ value: d.payment || "" });
  const extraI = moneyInput({ value: d.extra || "", placeholder: "0" });
  const catSel = catSelect(b, "expense", d.categoryId);
  const hint = el("div", { class: "alert a-info small full", style: "display:none" });

  const seg = segControl([
    { value: "months", label: "Je connais la durée" },
    { value: "payment", label: "Je connais la mensualité" },
  ], mode, v => { mode = v; updateUi(); }, true);
  const monthsField = fField("Durée (en mois)", monthsI);
  const paymentField = fField("Mensualité (hors anticipé)", paymentI);

  function updateUi() {
    monthsField.style.display = mode === "months" ? "" : "none";
    paymentField.style.display = mode === "payment" ? "" : "none";
    recalc();
  }
  function recalc() {
    const P = numVal(principalI), r = numVal(rateI);
    if (!P) { hint.style.display = "none"; return; }
    if (mode === "months" && +monthsI.value > 0) {
      const pay = loanPayment(P, r, +monthsI.value);
      hint.innerHTML = `Mensualité calculée : <b>${fmtMoney(pay, b.currency)}</b> — coût total des intérêts ≈ <b>${fmtMoney(pay * monthsI.value - P, b.currency, { dec: 0 })}</b>`;
      hint.style.display = "";
    } else if (mode === "payment" && numVal(paymentI) > 0) {
      const n = loanMonths(P, r, numVal(paymentI) + numVal(extraI));
      hint.innerHTML = n === Infinity
        ? `⚠️ Cette mensualité ne couvre pas les intérêts : la dette ne sera jamais remboursée.`
        : `Durée calculée : <b>${n} mois</b> (${(n / 12).toFixed(1)} ans) — fin ≈ <b>${fmtYm(addMonths(ymOf(startI.value || todayStr()), n))}</b>`;
      hint.style.display = "";
    } else hint.style.display = "none";
  }
  [principalI.input, rateI.input, monthsI, paymentI.input, extraI.input].forEach(i => i.addEventListener("input", recalc));
  startI.addEventListener("change", recalc);

  const m = modal({
    title: isNew ? "Nouveau crédit / dette" : d.name,
    lg: true,
    body: el("div", {},
      el("div", { class: "mb12" }, seg),
      el("div", { class: "form-grid" },
        fField("Nom", nameI, { full: true }),
        fField("Capital restant à rembourser", principalI),
        fField("Taux annuel (TAEG)", rateI),
        fField("Première mensualité le", startI),
        monthsField, paymentField,
        fField("Remboursement anticipé mensuel (facultatif)", extraI),
        fField("Catégorie de dépense", catSel, { full: true }),
        hint)),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15), onclick: () => {
          const snap = [...b.debts];
          b.debts = b.debts.filter(x => x.id !== d.id);
          persist(); m.close(); renderApp();
          offerUndo(`Crédit « ${d.name} » supprimé`, () => { b.debts = snap; persist(); renderApp(); });
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          d.name = nameI.value.trim() || "Crédit";
          d.principal = numVal(principalI);
          d.rate = numVal(rateI);
          d.startDate = startI.value || todayStr();
          d.extra = numVal(extraI);
          d.categoryId = catSel.value || null;
          if (mode === "months") {
            d.months = +monthsI.value || 12;
            d.payment = round2(loanPayment(d.principal, d.rate, d.months));
          } else {
            d.payment = numVal(paymentI);
            d.months = null;
          }
          if (!d.principal || !d.payment) { toast("⚠️ Capital et durée/mensualité requis"); return; }
          if (isNew) b.debts.push(d);
          else Object.assign(b.debts.find(x => x.id === d.id), d);
          persist(); m.close(); renderApp();
        }
      }, isNew ? "Ajouter" : "Enregistrer")]
  });
  nameI.focus();
  updateUi();
}

function showAmortTable(b, d) {
  const rows = amortize(d);
  const cur = b.currency;
  modal({
    title: "Amortissement — " + d.name,
    lg: true,
    body: el("div", { class: "tbl-wrap", style: "max-height:60vh; overflow-y:auto" },
      el("table", { class: "tbl" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Mois"), el("th", {}, "Mensualité"), el("th", {}, "Intérêts"), el("th", {}, "Capital"), el("th", {}, "Restant dû"))),
        el("tbody", {}, rows.map(r => el("tr", {},
          el("td", {}, fmtYm(r.ym)),
          el("td", {}, fmtMoney(r.payment, cur)),
          el("td", { class: "neg" }, fmtMoney(r.interest, cur)),
          el("td", { class: "pos" }, fmtMoney(r.principal, cur)),
          el("td", {}, el("b", {}, fmtMoney(r.balance, cur, { dec: 0 }))))))))
  });
}
