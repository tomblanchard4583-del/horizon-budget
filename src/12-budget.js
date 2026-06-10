"use strict";
/* ============ vue : édition du budget (postes) ============ */

let _budgetTab = "expense";

function viewBudget(root) {
  const b = curBudget();
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  const m0 = plannedMonth(b, ymNow);

  const head = el("div", { class: "card card-pad flex", style: "flex-wrap:wrap; gap:14px" },
    sum("Revenus du mois", m0.income, "pos"),
    sum("Dépenses du mois", m0.expense, ""),
    sum("Reste prévu", m0.income - m0.expense, m0.income - m0.expense >= 0 ? "pos" : "neg"),
    el("span", { class: "spacer" }),
    el("button", { class: "btn btn-sm", onclick: () => openCategoryManager(b) }, "🗂️ Catégories"),
  );

  const seg = segControl([
    { value: "expense", label: "Dépenses" },
    { value: "income", label: "Revenus" },
  ], _budgetTab, v => { _budgetTab = v; rerender(); });

  const listCard = el("div", { class: "card", style: "overflow:hidden" });
  buildList();

  root.append(el("div", { class: "content-inner grid", style: "gap:16px" },
    head,
    el("div", { class: "flex" }, seg, el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p", html: ico("plus", 16) + "<span>Ajouter un poste</span>", onclick: () => openItemEditor(b, newItem(_budgetTab), true) })),
    listCard
  ));

  function sum(label, v, tone) {
    return el("div", {}, el("div", { class: "xs muted", style: "text-transform:uppercase; letter-spacing:.04em; font-weight:650" }, label),
      el("div", { class: "mono " + tone, style: "font-size:19px; font-weight:750" }, fmtMoney(v, cur)));
  }

  function buildList() {
    listCard.innerHTML = "";
    const kind = _budgetTab;
    const items = b.items.filter(i => i.kind === kind);
    const debts = kind === "expense" ? b.debts : [];
    if (!items.length && !debts.length) {
      listCard.append(emptyState(kind === "expense" ? "🧾" : "💶",
        kind === "expense" ? "Aucune dépense planifiée" : "Aucun revenu planifié",
        kind === "expense"
          ? "Loyer, courses, abonnements… ajoutez vos charges récurrentes ou ponctuelles."
          : "Salaire, bourse, aides, revenus variables… ajoutez tout ce qui rentre.",
        el("button", { class: "btn btn-p btn-sm", onclick: () => openItemEditor(b, newItem(kind), true) }, "Ajouter")));
      return;
    }
    // groupement par catégorie racine
    const groups = {};
    for (const it of items) {
      const top = catTop(b, it.categoryId);
      const key = top ? top.id : "_none";
      (groups[key] = groups[key] || { cat: top, items: [] }).items.push(it);
    }
    const sorted = Object.values(groups).map(g => {
      g.total = g.items.reduce((s, i) => s + monthlyAmount(i, ymNow, State.settings.scenarioMode, State.settings.inflation), 0);
      g.totalEq = g.items.reduce((s, i) => s + monthlyEquivalent(i), 0);
      return g;
    }).sort((a, z) => z.total - a.total);

    for (const g of sorted) {
      listCard.append(el("div", { class: "group-head" },
        el("span", {}, g.cat ? `${g.cat.emoji} ${g.cat.name}` : "📦 Sans catégorie"),
        el("span", { class: "g-total mono" }, fmtMoney(g.total, cur) + " /mois")
      ));
      g.items.sort((a, z) => monthlyEquivalent(z) - monthlyEquivalent(a) || z.amount - a.amount);
      for (const it of g.items) listCard.append(itemRow(b, it));
    }
    if (debts.length) {
      listCard.append(el("div", { class: "group-head" }, el("span", {}, "💳 Mensualités de crédits"),
        el("span", { class: "g-total mono" }, fmtMoney(debts.reduce((s, d) => s + debtMonthly(d, ymNow), 0), cur) + " /mois")));
      for (const d of debts) {
        const pay = debtMonthly(d, ymNow);
        const end = debtPayoffYm(d);
        listCard.append(el("div", { class: "item-row", onclick: () => go("debts") },
          el("div", { class: "i-emoji" }, "💳"),
          el("div", { class: "i-main" }, el("div", { class: "i-name" }, d.name),
            el("div", { class: "i-sub" }, end ? `crédit · se termine en ${fmtYm(end)}` : "crédit en cours")),
          el("div", { class: "i-amt" }, pay ? fmtMoney(-pay, cur) : "—", el("span", { class: "per" }, "/mois"))
        ));
      }
    }
  }

  function rerender() { buildList(); }
}

function itemRow(b, it) {
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  const now = todayStr();
  const badges = [];
  if (it.variable) badges.push(el("span", { class: "badge b-info" }, "variable"));
  if (it.steps && it.steps.length) badges.push(el("span", { class: "badge b-mut" }, "📈 paliers"));
  if (it.growth) badges.push(el("span", { class: "badge b-mut" }, it.growth === "inf" ? "suit l'inflation" : (it.growth > 0 ? "+" : "") + it.growth + " %/an"));
  if (it.startDate > now) badges.push(el("span", { class: "badge b-warn" }, "à venir"));
  if (it.endDate && it.endDate < now) badges.push(el("span", { class: "badge b-mut" }, "terminé"));
  if (it.savingTo) badges.push(el("span", { class: "badge b-pos" }, "→ épargne"));
  if (it.eventId) {
    const ev = b.events.find(e => e.id === it.eventId);
    if (ev) badges.push(el("span", { class: "badge b-mut" }, (ev.emoji || "📌") + " " + ev.name));
  }
  const cat = catById(b, it.categoryId);
  const eq = it.freq === "once" ? it.amount : monthlyEquivalent(it);
  return el("div", { class: "item-row", onclick: () => openItemEditor(b, it, false) },
    el("div", { class: "i-emoji" }, cat ? cat.emoji : (it.kind === "income" ? "💶" : "🧾")),
    el("div", { class: "i-main" },
      el("div", { class: "i-name" }, it.name || "(sans nom)", " ", ...badges),
      el("div", { class: "i-sub" }, freqLabel(it))),
    el("div", { class: "i-amt " + (it.kind === "income" ? "pos" : "") },
      fmtMoney(it.kind === "income" ? eq : -eq, cur, { sign: it.kind === "income" }),
      el("span", { class: "per" }, it.freq === "once" ? "une fois" : "/mois en moyenne"))
  );
}

/* ---------- éditeur de poste ---------- */
function openItemEditor(b, item, isNew, onSaved) {
  const it = JSON.parse(JSON.stringify(item));
  const cur = b.currency;
  const isIncome = it.kind === "income";

  const nameInp = el("input", { class: "input", value: it.name, placeholder: isIncome ? "ex. Salaire net, Bourse, APL…" : "ex. Loyer, Courses, Netflix…" });
  const amountInp = moneyInput({ value: it.amount || "", cur: "€" });
  const catSel = catSelect(b, it.kind, it.categoryId);
  const freqSel = selectInput(Object.entries(FREQS).map(([v, f]) => ({ value: v, label: f.label })), it.freq);
  const dayInp = selectInput(Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: "le " + (i + 1) })), clamp(it.day || 1, 1, 28));
  const startInp = el("input", { class: "input", type: "date", value: it.startDate || "" });
  const hasEnd = el("input", { type: "checkbox", checked: !!it.endDate });
  const endInp = el("input", { class: "input", type: "date", value: it.endDate || "", disabled: !it.endDate });
  hasEnd.addEventListener("change", () => { endInp.disabled = !hasEnd.checked; if (hasEnd.checked && !endInp.value) endInp.value = addMonths(ymOf(todayStr()), 12) + "-01"; });

  // variable (fourchette)
  const varChk = el("input", { type: "checkbox", checked: !!it.variable });
  const minInp = moneyInput({ value: it.min ?? "", placeholder: "min" });
  const maxInp = moneyInput({ value: it.max ?? "", placeholder: "max" });
  const varRow = el("div", { class: "form-grid full", style: it.variable ? "" : "display:none" },
    fField("Montant minimum (mois creux)", minInp), fField("Montant maximum (mois hauts)", maxInp));
  varChk.addEventListener("change", () => varRow.style.display = varChk.checked ? "" : "none");

  // croissance
  const growthSel = selectInput([
    { value: "0", label: "Montant stable" },
    { value: "inf", label: `Suit l'inflation (${State.settings.inflation} %/an)` },
    { value: "custom", label: "Évolution annuelle personnalisée (%)" },
  ], it.growth === "inf" ? "inf" : (it.growth ? "custom" : "0"));
  const growthInp = moneyInput({ value: it.growth && it.growth !== "inf" ? it.growth : "", cur: "%/an", placeholder: "ex. 2 ou -5" });
  const growthWrap = el("div", { style: (growthSel.value === "custom" ? "" : "display:none") }, fField("Variation par an", growthInp));
  growthSel.addEventListener("change", () => growthWrap.style.display = growthSel.value === "custom" ? "" : "none");

  // paliers programmés
  const stepsBox = el("div", {});
  const steps = (it.steps || []).map(s => ({ ...s }));
  function renderSteps() {
    stepsBox.innerHTML = "";
    steps.forEach((s, i) => {
      const dateI = el("input", { class: "input", type: "month", value: s.date || "", style: "max-width:150px", onchange: e => s.date = e.target.value });
      const typeI = selectInput([{ value: "set", label: "nouveau montant" }, { value: "pct", label: "variation en %" }], s.type || "set", { style: "max-width:170px", onchange: e => s.type = e.target.value });
      const valI = el("input", { class: "input", type: "text", inputmode: "decimal", value: s.value ?? "", placeholder: "valeur", style: "max-width:110px", oninput: e => s.value = parseAmount(e.target.value) });
      stepsBox.append(el("div", { class: "evo-row" }, dateI, typeI, valI,
        el("button", { class: "btn btn-ghost btn-ico", html: ico("trash", 15), onclick: () => { steps.splice(i, 1); renderSteps(); } })));
    });
    stepsBox.append(el("button", {
      class: "btn btn-sm btn-ghost mt8", html: ico("plus", 14) + "<span>Ajouter un palier (ex. augmentation prévue)</span>",
      onclick: () => { steps.push({ date: addMonths(ymOf(todayStr()), 6), type: "set", value: "" }); renderSteps(); }
    }));
  }
  renderSteps();

  // épargne liée (dépenses uniquement)
  const savingTargets = [...b.goals.map(g => ({ value: "g:" + g.id, label: `🎯 Objectif : ${g.name}` })), ...b.accounts.map(a => ({ value: "a:" + a.id, label: `🏦 Compte : ${a.name}` }))];
  const savingSel = selectInput([{ value: "", label: "Non — dépense classique" }, ...savingTargets.map(t => ({ value: t.value.slice(2), label: t.label }))], it.savingTo || "");
  const notesInp = el("textarea", { class: "input", value: it.notes || "", placeholder: "Notes libres…" });

  const monthFreq = () => !!FREQ_MONTHS[freqSel.value];
  const dayField = fField("Jour du mois", dayInp);
  const updateFreqUi = () => {
    dayField.style.display = monthFreq() ? "" : "none";
  };
  freqSel.addEventListener("change", updateFreqUi);
  updateFreqUi();

  const m = modal({
    title: isNew ? (isIncome ? "Nouveau revenu" : "Nouvelle dépense") : (it.name || "Modifier le poste"),
    lg: true,
    body: el("div", { class: "form-grid" },
      fField("Nom du poste", nameInp, { full: true }),
      fField("Montant" + (isIncome ? "" : " (par occurrence)"), amountInp),
      fField("Catégorie", catSel),
      fField("Fréquence", freqSel),
      dayField,
      fField(it.freq === "once" ? "Date" : "Commence le", startInp),
      el("div", { class: "field" },
        el("label", { class: "check", style: "margin-bottom:5px" }, hasEnd, "Se termine"),
        endInp),
      el("label", { class: "check full" }, varChk, isIncome ? "Revenu variable / irrégulier (fourchette min–max)" : "Dépense variable (fourchette min–max)"),
      varRow,
      el("div", { class: "full" }, el("details", { class: "adv", open: !!(it.growth || steps.length) },
        el("summary", {}, "Évolution dans le temps (augmentations, paliers…)"),
        el("div", { class: "form-grid mt8" },
          fField("Tendance long terme", growthSel), growthWrap),
        el("div", { class: "mt8" },
          el("div", { class: "small muted mb8" }, "Paliers : changements connus à l'avance (ex. loyer qui passe à 600 € en septembre, salaire +10 % en janvier)."),
          stepsBox)
      )),
      !isIncome && savingTargets.length ? fField("Compter comme de l'épargne vers…", savingSel, { full: true }) : null,
      fField("Notes", notesInp, { full: true })
    ),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15) + "<span>Supprimer</span>",
        onclick: () => {
          const snapshot = JSON.parse(JSON.stringify(b.items));
          b.items = b.items.filter(x => x.id !== item.id);
          persist(); m.close(); renderApp();
          offerUndo(`Poste « ${item.name} » supprimé`, () => { b.items = snapshot; persist(); renderApp(); });
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", { class: "btn btn-p", onclick: save }, isNew ? "Ajouter" : "Enregistrer"),
    ]
  });
  nameInp.focus();

  function save() {
    it.name = nameInp.value.trim() || (isIncome ? "Revenu" : "Dépense");
    it.amount = numVal(amountInp);
    it.categoryId = catSel.value || null;
    it.freq = freqSel.value;
    it.day = +dayInp.value || 1;
    it.startDate = startInp.value || todayStr();
    it.endDate = hasEnd.checked && endInp.value ? endInp.value : null;
    it.variable = varChk.checked;
    it.min = it.variable ? numVal(minInp) : null;
    it.max = it.variable ? numVal(maxInp) : null;
    it.growth = growthSel.value === "inf" ? "inf" : (growthSel.value === "custom" ? parseAmount(growthInp.input.value) : 0);
    it.steps = steps.filter(s => s.date && s.value !== "" && s.value != null);
    it.savingTo = (savingSel && savingSel.value) || null;
    it.notes = notesInp.value;
    if (isNew) b.items.push(it);
    else Object.assign(b.items.find(x => x.id === item.id), it);
    persist(); m.close(); renderApp();
    onSaved && onSaved(it);
  }
}

/* ---------- gestion des catégories ---------- */
function openCategoryManager(b) {
  let kind = "expense";
  const body = el("div", {});
  const m = modal({ title: "Catégories & sous-catégories", lg: true, body, onClose: () => renderApp() });

  function render() {
    body.innerHTML = "";
    body.append(
      el("div", { class: "flex mb12" },
        segControl([{ value: "expense", label: "Dépenses" }, { value: "income", label: "Revenus" }], kind, v => { kind = v; render(); }, true),
        el("span", { class: "spacer" }),
        el("button", { class: "btn btn-sm btn-p", html: ico("plus", 14) + "<span>Catégorie</span>", onclick: () => editCat(null, null) })
      )
    );
    const roots = b.categories.filter(c => c.kind === kind && !c.parentId);
    for (const r of roots) {
      const usedRoot = b.items.some(i => i.categoryId === r.id);
      body.append(el("div", { class: "flex", style: "padding:8px 2px 4px; border-top:1px solid var(--line)" },
        el("span", { style: "font-size:17px" }, r.emoji),
        el("b", {}, r.name),
        el("span", { class: "cat-dot", style: "background:" + r.color }),
        el("span", { class: "spacer" }),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("plus", 14), title: "Ajouter une sous-catégorie", onclick: () => editCat(null, r) }),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 14), onclick: () => editCat(r, null) }),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("trash", 14), onclick: () => removeCat(r) })
      ));
      for (const c of b.categories.filter(c => c.parentId === r.id)) {
        body.append(el("div", { class: "flex small", style: "padding:3px 2px 3px 30px; color:var(--tx2)" },
          el("span", {}, c.name),
          el("span", { class: "spacer" }),
          el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 13), onclick: () => editCat(c, r) }),
          el("button", { class: "btn btn-ghost btn-ico", html: ico("trash", 13), onclick: () => removeCat(c) })
        ));
      }
    }
  }

  function editCat(cat, parent) {
    const isNew = !cat;
    const c = cat || { id: uid(), kind, name: "", emoji: parent ? parent.emoji : "🏷️", color: parent ? parent.color : BUDGET_COLORS[Math.floor(Math.random() * BUDGET_COLORS.length)], parentId: parent ? parent.id : null };
    const nameI = el("input", { class: "input", value: c.name, placeholder: "Nom de la catégorie" });
    const emojiI = el("input", { class: "input", value: c.emoji, style: "max-width:90px; text-align:center; font-size:18px" });
    const colorI = el("input", { class: "input", type: "color", value: c.color, style: "max-width:90px; padding:4px; height:40px" });
    const mm = modal({
      title: isNew ? (parent ? `Sous-catégorie de ${parent.name}` : "Nouvelle catégorie") : "Modifier",
      body: el("div", { class: "form-grid" },
        fField("Nom", nameI, { full: true }),
        fField("Emoji", emojiI),
        !c.parentId ? fField("Couleur", colorI) : null),
      foot: [el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => mm.close() }, "Annuler"),
        el("button", {
          class: "btn btn-p", onclick: () => {
            c.name = nameI.value.trim() || "Catégorie";
            c.emoji = emojiI.value.trim() || "🏷️";
            c.color = colorI.value;
            if (isNew) b.categories.push(c);
            persist(); mm.close(); render();
          }
        }, isNew ? "Ajouter" : "Enregistrer")]
    });
    nameI.focus();
  }

  function removeCat(cat) {
    const children = b.categories.filter(c => c.parentId === cat.id);
    const ids = [cat.id, ...children.map(c => c.id)];
    const used = b.items.filter(i => ids.includes(i.categoryId)).length
      + State.transactions.filter(t => t.budgetId === b.id && ids.includes(t.categoryId)).length;
    confirmDialog({
      title: `Supprimer « ${cat.name} » ?`,
      body: used
        ? `${used} poste(s) ou transaction(s) utilisent cette catégorie${children.length ? " ou ses sous-catégories" : ""} : ils passeront en « Sans catégorie ».`
        : (children.length ? `Ses ${children.length} sous-catégories seront aussi supprimées.` : "Cette catégorie est vide."),
      okLabel: "Supprimer", danger: true,
      onOk: () => {
        b.categories = b.categories.filter(c => !ids.includes(c.id));
        b.items.forEach(i => { if (ids.includes(i.categoryId)) i.categoryId = null; });
        State.transactions.forEach(t => { if (t.budgetId === b.id && ids.includes(t.categoryId)) t.categoryId = null; });
        persist(); render();
      }
    });
  }

  render();
}
