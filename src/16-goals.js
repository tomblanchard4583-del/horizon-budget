"use strict";
/* ============ vue : objectifs d'épargne & comptes rémunérés ============ */

function viewGoals(root) {
  const b = curBudget();
  const cur = b.currency;

  const goalCards = b.goals.map(g => {
    const pct = g.target ? clamp((+g.current || 0) / g.target, 0, 1) : 0;
    const req = goalRequiredMonthly(g);
    const eta = goalEta(b, g);
    const linked = b.items.filter(i => i.savingTo === g.id);
    const monthly = linked.reduce((s, i) => s + monthlyEquivalent(i), 0);
    return el("div", { class: "card card-pad" },
      el("div", { class: "flex mb8" },
        el("span", { style: "font-size:24px" }, g.emoji || "🎯"),
        el("div", { style: "flex:1; min-width:0" },
          el("h3", { style: "font-size:15.5px" }, g.name),
          el("div", { class: "xs muted" }, g.targetDate ? "objectif pour " + fmtDate(g.targetDate) : "sans date limite")),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 15), onclick: () => openGoalEditor(b, g) })),
      el("div", { class: "flex small mb8" },
        el("b", { class: "mono", style: "font-size:17px" }, fmtMoney(+g.current || 0, cur, { dec: 0 })),
        el("span", { class: "muted" }, "sur " + fmtMoney(g.target, cur, { dec: 0 })),
        el("span", { class: "spacer" }),
        el("b", {}, Math.round(pct * 100) + " %")),
      el("div", { class: "pbar", style: "height:11px" }, el("i", { style: `width:${pct * 100}%; background:${g.color || "var(--accent)"}` })),
      el("div", { class: "small muted mt12", style: "line-height:1.7" },
        monthly > 0 ? el("div", {}, `💸 Versements liés : ${fmtMoney(monthly, cur)} /mois`) : el("div", {}, "💸 Aucun versement automatique lié"),
        req != null ? el("div", {}, `📐 Nécessaire pour tenir la date : ${fmtMoney(req, cur)} /mois`) : null,
        eta ? el("div", {}, `🏁 Au rythme actuel, objectif atteint vers ${fmtYm(eta)}`) : null),
      el("div", { class: "flex mt12" },
        el("button", { class: "btn btn-sm", onclick: () => addContribution(b, g) }, "+ Versement ponctuel"),
        !monthly ? el("button", {
          class: "btn btn-sm btn-ghost", onclick: () => {
            const it = newItem("expense");
            it.name = "Épargne — " + g.name;
            it.savingTo = g.id;
            it.amount = req ? Math.ceil(req / 5) * 5 : 50;
            const cat = findCatByName(b, "Épargne projet", "expense");
            it.categoryId = cat ? cat.id : null;
            openItemEditor(b, it, true);
          }
        }, "Planifier un versement mensuel") : null)
    );
  });

  const accCards = b.accounts.map(a => {
    const proj1 = projAccount(a, 12), proj5 = projAccount(a, 60);
    const linked = b.items.filter(i => i.savingTo === a.id).reduce((s, i) => s + monthlyEquivalent(i), 0);
    return el("div", { class: "card card-pad" },
      el("div", { class: "flex mb8" },
        el("span", { style: "font-size:22px" }, "🏦"),
        el("div", { style: "flex:1" }, el("h3", { style: "font-size:15.5px" }, a.name),
          el("div", { class: "xs muted" }, `${a.rate || 0} % /an` + (a.ceiling ? ` · plafond ${fmtMoney(a.ceiling, cur, { dec: 0 })}` : ""))),
        el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 15), onclick: () => openAccountEditor(b, a) })),
      el("div", { class: "mono", style: "font-size:21px; font-weight:750" }, fmtMoney(+a.balance || 0, cur)),
      el("div", { class: "small muted mt8", style: "line-height:1.7" },
        linked ? el("div", {}, `💸 Versements liés : ${fmtMoney(linked, cur)} /mois`) : null,
        el("div", {}, `📈 Dans 1 an : ≈ ${fmtMoney(proj1, cur, { dec: 0 })} · dans 5 ans : ≈ ${fmtMoney(proj5, cur, { dec: 0 })}`))
    );
    function projAccount(a, months) {
      let bal = +a.balance || 0;
      const r = ((+a.rate || 0) / 100) / 12;
      const monthly = b.items.filter(i => i.savingTo === a.id && !i.endDate).reduce((s, i) => s + monthlyEquivalent(i), 0);
      for (let i = 0; i < months; i++) { bal += monthly; bal *= 1 + r; if (a.ceiling && bal > +a.ceiling) bal = +a.ceiling; }
      return bal;
    }
  });

  root.append(el("div", { class: "content-inner" },
    el("div", { class: "flex mb12" },
      el("h3", {}, "🎯 Objectifs d'épargne"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p btn-sm", html: ico("plus", 14) + "<span>Objectif</span>", onclick: () => openGoalEditor(b, null) })),
    goalCards.length ? el("div", { class: "grid g3" }, goalCards)
      : el("div", { class: "card" }, emptyState("🎯", "Aucun objectif", "Fonds d'urgence, vacances, permis, apport immobilier… définissez un montant cible et, si vous voulez, une date limite. L'app calcule combien mettre de côté chaque mois.",
        el("button", { class: "btn btn-p btn-sm", onclick: () => openGoalEditor(b, null) }, "Créer un objectif"))),
    el("div", { class: "flex mb12 mt28" },
      el("h3", {}, "🏦 Comptes épargne rémunérés"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-sm", html: ico("plus", 14) + "<span>Compte</span>", onclick: () => openAccountEditor(b, null) })),
    accCards.length ? el("div", { class: "grid g3" }, accCards)
      : el("div", { class: "card" }, emptyState("🏦", "Aucun compte épargne", "Livret A, LEP, LDDS, assurance-vie… ajoutez vos comptes avec leur taux : les intérêts composés sont intégrés aux projections de patrimoine.",
        el("button", { class: "btn btn-sm", onclick: () => openAccountEditor(b, null) }, "Ajouter un compte")))
  ));
}

function addContribution(b, g) {
  const inp = moneyInput({ value: "", placeholder: "ex. 100" });
  const m = modal({
    title: "Versement vers « " + g.name + " »",
    body: el("div", { class: "form-grid" }, fField("Montant du versement", inp, { full: true })),
    foot: [el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: e => {
          const v = numVal(inp);
          if (!v) return;
          const before = +g.current || 0;
          g.current = before + v;
          const done = g.target > 0 && before < g.target && g.current >= g.target;
          persist();
          if (!done) { Juice.pop(e); Juice.buzz(12); }
          m.close(); renderApp();
          if (done) Juice.goalReached(g);
          else toast(`✅ ${fmtMoney(v, b.currency)} ajoutés à « ${g.name} »`);
        }
      }, "Ajouter")]
  });
  inp.input.focus();
}

function openGoalEditor(b, goal) {
  const isNew = !goal;
  const g = goal ? { ...goal } : { id: uid(), name: "", emoji: "🎯", color: "#10b981", target: "", current: 0, targetDate: null };
  const nameI = el("input", { class: "input", value: g.name, placeholder: "ex. Fonds d'urgence, Voyage au Japon…" });
  const emojiI = el("input", { class: "input", value: g.emoji, style: "max-width:90px; text-align:center; font-size:18px" });
  const targetI = moneyInput({ value: g.target || "" });
  const currentI = moneyInput({ value: g.current || "" });
  const dateI = el("input", { class: "input", type: "date", value: g.targetDate || "" });
  const colorI = el("input", { class: "input", type: "color", value: g.color, style: "padding:4px; height:40px" });
  const m = modal({
    title: isNew ? "Nouvel objectif" : g.name,
    body: el("div", { class: "form-grid" },
      fField("Nom", nameI, { full: true }),
      fField("Emoji", emojiI), fField("Couleur", colorI),
      fField("Montant cible", targetI), fField("Déjà épargné", currentI),
      fField("Date limite (facultatif)", dateI, { full: true })),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15), onclick: () => {
          confirmDialog({
            title: `Supprimer « ${g.name} » ?`, body: "Les versements planifiés liés à cet objectif seront conservés comme dépenses classiques.", okLabel: "Supprimer", danger: true,
            onOk: () => {
              b.goals = b.goals.filter(x => x.id !== g.id);
              b.items.forEach(i => { if (i.savingTo === g.id) i.savingTo = null; });
              persist(); m.close(); renderApp();
            }
          });
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          const old = isNew ? null : b.goals.find(x => x.id === g.id);
          const wasDone = old && +old.target > 0 && (+old.current || 0) >= +old.target;
          g.name = nameI.value.trim() || "Objectif";
          g.emoji = emojiI.value.trim() || "🎯";
          g.color = colorI.value;
          g.target = numVal(targetI);
          g.current = numVal(currentI);
          g.targetDate = dateI.value || null;
          if (isNew) b.goals.push(g);
          else Object.assign(b.goals.find(x => x.id === g.id), g);
          persist(); m.close(); renderApp();
          if (g.target > 0 && g.current >= g.target && !wasDone) Juice.goalReached(g);
        }
      }, isNew ? "Créer" : "Enregistrer")]
  });
  nameI.focus();
}

function openAccountEditor(b, acc) {
  const isNew = !acc;
  const a = acc ? { ...acc } : { id: uid(), name: "", balance: "", rate: 3, ceiling: "" };
  const nameI = el("input", { class: "input", value: a.name, placeholder: "ex. Livret A, LEP, Assurance-vie…" });
  const balI = moneyInput({ value: a.balance || "" });
  const rateI = moneyInput({ value: a.rate ?? "", cur: "%/an" });
  const ceilI = moneyInput({ value: a.ceiling || "", placeholder: "aucun" });
  const m = modal({
    title: isNew ? "Nouveau compte épargne" : a.name,
    body: el("div", { class: "form-grid" },
      fField("Nom du compte", nameI, { full: true }),
      fField("Solde actuel", balI), fField("Taux d'intérêt", rateI),
      fField("Plafond (facultatif)", ceilI, { full: true })),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15), onclick: () => {
          b.accounts = b.accounts.filter(x => x.id !== a.id);
          b.items.forEach(i => { if (i.savingTo === a.id) i.savingTo = null; });
          persist(); m.close(); renderApp();
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          a.name = nameI.value.trim() || "Compte épargne";
          a.balance = numVal(balI); a.rate = numVal(rateI); a.ceiling = numVal(ceilI) || null;
          if (isNew) b.accounts.push(a);
          else Object.assign(b.accounts.find(x => x.id === a.id), a);
          persist(); m.close(); renderApp();
        }
      }, isNew ? "Ajouter" : "Enregistrer")]
  });
  nameI.focus();
}
