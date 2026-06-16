"use strict";
/* ============ vue : suivi réel (transactions, prévu vs réel, import CSV) ============ */

let _trackYm = null;
let _trackSearch = "";

function viewTracking(root) {
  const b = curBudget();
  const cur = b.currency;
  const ymNow = ymOf(todayStr());
  if (!_trackYm) _trackYm = ymNow;
  const ym = _trackYm;

  const real = realMonthByCat(b, ym);
  const planned = plannedMonth(b, ym);
  const remaining = planned.expense - real.expense;

  const head = el("div", { class: "flex", style: "flex-wrap:wrap; gap:10px" },
    el("button", { class: "btn btn-ico", title: "Mois précédent", html: ico("chevL", 18), onclick: () => { _trackYm = addMonths(ym, -1); renderApp(); } }),
    el("h3", { style: "min-width:170px; text-align:center" }, fmtYm(ym)),
    el("button", { class: "btn btn-ico", title: "Mois suivant", html: ico("chevR", 18), onclick: () => { _trackYm = addMonths(ym, 1); renderApp(); } }),
    el("span", { class: "spacer" }),
    el("button", { class: "btn btn-sm", html: ico("up", 15) + "<span>Importer CSV</span>", onclick: () => openCsvImport(b) }),
    el("button", { class: "btn btn-sm", html: ico("down", 15) + "<span>Exporter</span>", onclick: exportTransactionsCSV }),
    el("button", { class: "btn btn-p btn-sm", html: ico("plus", 15) + "<span>Transaction</span>", onclick: () => openTxEditor(b, null, ym === ymNow ? todayStr() : ym + "-01") })
  );

  const kpis = el("div", { class: "grid g3" },
    kpiBox("Dépensé ce mois", fmtMoney(real.expense, cur), planned.expense ? `sur ${fmtMoney(planned.expense, cur)} prévus` : "rien de prévu", real.expense > planned.expense && planned.expense > 0 ? "neg" : ""),
    kpiBox("Reste à dépenser", fmtMoney(Math.max(0, remaining), cur), remaining < 0 ? `dépassement de ${fmtMoney(-remaining, cur)}` : "avant d'atteindre le budget prévu", remaining < 0 ? "neg" : "pos"),
    kpiBox("Revenus encaissés", fmtMoney(real.income, cur), planned.income ? `sur ${fmtMoney(planned.income, cur)} prévus` : "", "pos")
  );

  // prévu vs réel par catégorie
  const catIds = new Set([...Object.keys(planned.byCat), ...Object.keys(real.byCat)]);
  const rows = [...catIds].map(id => {
    const c = catById(b, id);
    return { id, cat: c, plan: planned.byCat[id] || 0, spent: real.byCat[id] || 0 };
  }).filter(r => r.plan > 0.005 || r.spent > 0.005).sort((a, z) => z.plan + z.spent - a.plan - a.spent);

  const compareCard = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("h3", {}, "Prévu vs réel par catégorie")),
    rows.length ? el("div", { class: "card-pad", style: "display:flex; flex-direction:column; gap:13px" },
      rows.map(r => {
        const pct = r.plan > 0 ? r.spent / r.plan : (r.spent > 0 ? 2 : 0);
        return el("div", {},
          el("div", { class: "flex small", style: "margin-bottom:5px" },
            el("span", {}, `${r.cat ? r.cat.emoji + " " + r.cat.name : "💳 Crédits & sans catégorie"}`),
            el("span", { class: "spacer" }),
            el("span", { class: "mono " + (pct > 1.001 ? "neg" : "muted") },
              `${fmtMoney(r.spent, cur, { dec: 0 })} / ${fmtMoney(r.plan, cur, { dec: 0 })}`)),
          el("div", { class: "pbar" + (pct > 1.001 ? " over" : "") },
            el("i", { style: `width:${clamp(pct, 0, 1) * 100}%; background:${pct > 1.001 ? "" : (r.cat ? r.cat.color : "var(--accent)")}` }))
        );
      })
    ) : emptyState("📊", "Rien à comparer", "Ajoutez des transactions ou planifiez des postes pour voir la comparaison.")
  );

  // liste des transactions — recherche : seule la liste se reconstruit (le champ garde le focus)
  const txCount = el("h3", {});
  const txList = el("div", {});
  function buildTxList() {
    const txs = State.transactions
      .filter(t => t.budgetId === b.id && ymOf(t.date) === ym)
      .filter(t => !_trackSearch || (t.label || "").toLowerCase().includes(_trackSearch) || catLabel(b, t.categoryId).toLowerCase().includes(_trackSearch))
      .sort((a, z) => z.date.localeCompare(a.date));
    txCount.textContent = `Transactions (${txs.length})`;
    txList.innerHTML = "";
    txList.append(txs.length ? el("div", { class: "row-list", style: "padding:6px 0 8px" }, txs.map(t => {
      const c = catById(b, t.categoryId);
      return el("div", { class: "item-row", onclick: () => openTxEditor(b, t) },
        el("div", { class: "i-emoji" }, c ? c.emoji : (t.kind === "income" ? "💶" : "🧾")),
        el("div", { class: "i-main" },
          el("div", { class: "i-name" }, t.label || catLabel(b, t.categoryId)),
          el("div", { class: "i-sub" }, fmtDate(t.date) + " · " + ((t.splits && t.splits.length)
            ? t.splits.map(s => `${catLabel(b, s.categoryId)} ${fmtMoney(s.amount, cur, { dec: 0 })}`).join(" + ")
            : catLabel(b, t.categoryId)))),
        el("div", { class: "i-amt " + (t.kind === "income" ? "pos" : "") },
          fmtMoney(t.kind === "income" ? +t.amount : -t.amount, cur, { sign: true }))
      );
    })) : emptyState("🧾", _trackSearch ? "Aucun résultat" : "Aucune transaction ce mois-ci",
      _trackSearch ? "Aucune transaction ne correspond à cette recherche sur ce mois." : "Saisissez vos dépenses au fil de l'eau ou importez un relevé bancaire CSV pour comparer le réel au prévu.",
      _trackSearch ? null : el("button", { class: "btn btn-p btn-sm", onclick: () => openTxEditor(b, null) }, "Première transaction")));
  }
  buildTxList();

  const search = el("div", { class: "searchbar" },
    el("span", { html: ico("search", 15) }),
    el("input", {
      class: "input", placeholder: "Rechercher…", value: _trackSearch,
      oninput: debounce(e => { _trackSearch = e.target.value.toLowerCase(); buildTxList(); }, 200)
    }));

  const listCard = el("div", { class: "card", style: "overflow:hidden" },
    el("div", { class: "card-head" }, txCount, el("span", { class: "spacer" }), search),
    txList
  );

  // suggestions issues de l'historique : récurrences, dérives de montant ou de date
  const suggestions = Intel.detectRecurring(b);
  const suggCard = suggestions.length ? el("div", { class: "card" },
    el("div", { class: "card-head" },
      el("h3", {}, "Régularités détectées"),
      el("span", { class: "spacer" }),
      el("span", { class: "xs muted" }, "d'après vos transactions")),
    el("div", { class: "card-pad", style: "display:flex; flex-direction:column; gap:12px" },
      suggestions.slice(0, 4).map(sg => el("div", { class: "flex", style: "gap:10px; flex-wrap:wrap" },
        el("div", { class: "small", style: "flex:1; min-width:220px; line-height:1.55" }, sg.text),
        el("div", { class: "flex", style: "gap:6px" },
          el("button", {
            class: "btn btn-sm btn-p", onclick: () => {
              const msg = sg.apply();
              Intel.dismiss(sg.id);
              persist(); renderApp();
              toast("✅ " + msg);
            }
          }, "Appliquer"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: () => { Intel.dismiss(sg.id); persist(); renderApp(); } }, "Ignorer"))
      )))
  ) : null;

  const grid = el("div", { class: "dash-grid" });
  Custom.renderInto(grid, "page.tracking", [
    { id: "head", node: head, span: 12 }, { id: "kpis", node: kpis, span: 12 }, { id: "sugg", node: suggCard, span: 12 },
    { id: "compare", node: compareCard, span: 6 }, { id: "list", node: listCard, span: 6 },
  ], { axis: "grid" });
  root.append(el("div", { class: "content-inner" }, grid));

  function kpiBox(label, value, sub, tone) {
    return el("div", { class: "card kpi" },
      el("div", { class: "k-label" }, label),
      el("div", { class: "k-value " + (tone || "") }, value),
      el("div", { class: "k-sub" }, sub));
  }
}

/* ---------- éditeur de transaction ---------- */
function openTxEditor(b, tx, defaultDate) {
  const isNew = !tx;
  const t = tx ? { ...tx } : { id: uid(), budgetId: b.id, date: defaultDate || todayStr(), kind: "expense", amount: "", categoryId: null, label: "", notes: "" };
  let kind = t.kind;

  const amountInp = moneyInput({ value: t.amount || "", autofocus: true });
  const labelInp = el("input", { class: "input", value: t.label, placeholder: "ex. Courses Carrefour" });
  const dateInp = el("input", { class: "input", type: "date", value: t.date });
  let catTouched = !!t.categoryId;
  const hint = el("div", { class: "xs predict-hint" });
  let catSel = catSelect(b, kind, t.categoryId, {}, { label: t.label });
  const catWrap = el("div", {}, catSel);
  const bindCat = () => catSel.addEventListener("change", () => catTouched = true);
  bindCat();
  let splits = (t.splits || []).map(s => ({ ...s }));
  const catZone = el("div", { class: "field full" });

  // prédiction live : en tapant le libellé, la catégorie et le montant habituel se proposent
  function predict() {
    const label = labelInp.value.trim();
    const s = label ? Intel.suggest(b, label, kind) : null;
    if (!s || !s.categoryId) { hint.textContent = ""; return; }
    if (!catTouched && !splits.length) catSel.value = s.categoryId;
    const usual = s.usual > 0 ? ` · ~${fmtMoney(s.usual, b.currency, { dec: 0 })} d'habitude` : "";
    hint.textContent = `✨ ${s.source === "appris" ? "Appris" : "Suggéré"} : ${catLabel(b, s.categoryId)}${usual}`;
    if (s.usual > 0 && !numVal(amountInp)) amountInp.input.placeholder = String(round2(s.usual)).replace(".", ",");
  }
  labelInp.addEventListener("input", debounce(predict, 250));
  predict();

  function renderCatZone() {
    catZone.innerHTML = "";
    if (!splits.length) {
      catZone.append(el("label", {}, "Catégorie"), catWrap,
        el("button", {
          class: "btn btn-sm btn-ghost", style: "margin-top:8px",
          onclick: () => {
            const total = Math.abs(numVal(amountInp)) || 0;
            splits = Intel.splitFor(b, labelInp.value, total) || [{ categoryId: catSel.value || null, amount: total }];
            renderCatZone();
          }
        }, "÷ Ventiler en plusieurs catégories"));
      return;
    }
    catZone.append(el("label", {}, "Ventilation par catégorie"));
    const rest = el("span", { class: "xs muted" });
    const refreshRest = () => {
      const total = Math.abs(numVal(amountInp)) || 0;
      const d = round2(total - splits.reduce((s, x) => s + (+x.amount || 0), 0));
      rest.textContent = d ? `Reste à répartir : ${fmtMoney(d, b.currency)}` : "Ventilation complète ✓";
      rest.className = "xs " + (d ? "neg" : "pos");
    };
    const list = el("div", { style: "display:flex; flex-direction:column; gap:8px" });
    splits.forEach((sp, i) => {
      const amtI = moneyInput({ value: sp.amount || "", oninput: e => { sp.amount = parseAmount(e.target.value); refreshRest(); } });
      const cs = catSelect(b, kind, sp.categoryId, { style: "flex:1; min-width:0" });
      cs.addEventListener("change", () => sp.categoryId = cs.value || null);
      list.append(el("div", { class: "flex", style: "gap:8px" },
        el("div", { style: "width:130px; flex:none" }, amtI), cs,
        el("button", { class: "btn btn-ico btn-ghost", title: "Supprimer", html: ico("x", 15), onclick: () => { splits.splice(i, 1); renderCatZone(); } })));
    });
    catZone.append(list,
      el("div", { class: "flex", style: "gap:8px; margin-top:8px; flex-wrap:wrap" },
        el("button", { class: "btn btn-sm", onclick: () => { splits.push({ categoryId: null, amount: 0 }); renderCatZone(); } }, "+ Ligne"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => { splits = []; renderCatZone(); } }, "Annuler la ventilation"),
        el("span", { class: "spacer" }), rest));
    refreshRest();
  }
  renderCatZone();

  const seg = segControl([{ value: "expense", label: "Dépense" }, { value: "income", label: "Revenu" }], kind, v => {
    kind = v;
    const ns = catSelect(b, kind, null, {}, { label: labelInp.value });
    catWrap.innerHTML = ""; catWrap.append(ns); catSel = ns;
    catTouched = false; bindCat();
    splits = [];                        // les catégories de l'autre type ne s'appliquent plus
    renderCatZone();
    predict();
  });

  const m = modal({
    title: isNew ? "Nouvelle transaction" : "Modifier la transaction",
    body: el("div", {},
      el("div", { class: "flex mb12" }, seg),
      el("div", { class: "form-grid" },
        fField("Montant", amountInp),
        fField("Date", dateInp),
        fField("Libellé", el("div", {}, labelInp, hint), { full: true }),
        catZone)),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15),
        onclick: () => {
          const snap = [...State.transactions];
          State.transactions = State.transactions.filter(x => x.id !== t.id);
          persist(); m.close(); renderApp();
          offerUndo("Transaction supprimée", () => { State.transactions = snap; persist(); renderApp(); });
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          t.kind = kind;
          t.amount = Math.abs(numVal(amountInp));
          if (!t.amount) { toast("⚠️ Montant manquant"); return; }
          t.date = dateInp.value || todayStr();
          t.label = labelInp.value.trim();
          if (splits.length) {
            const clean = splits.filter(s => +s.amount > 0).map(s => ({ categoryId: s.categoryId || null, amount: round2(+s.amount) }));
            const sum = round2(clean.reduce((s, x) => s + x.amount, 0));
            if (Math.abs(sum - t.amount) > 0.011) { toast(`⚠️ Ventilation : ${fmtMoney(sum, b.currency)} répartis sur ${fmtMoney(t.amount, b.currency)}`); return; }
            t.splits = clean;
            t.categoryId = null;
          } else {
            t.splits = undefined;
            t.categoryId = catSel.value || null;
          }
          if (isNew) State.transactions.push(t);
          else Object.assign(State.transactions.find(x => x.id === t.id), t);
          Intel.learn(b, t);            // mémorise marchand → catégorie (et les ventilations)
          persist();
          if (isNew) { Juice.buzz(10); toast("Transaction ajoutée", { ms: 1600 }); }
          m.close(); renderApp();
        }
      }, isNew ? "Ajouter" : "Enregistrer"),
    ]
  });
}

/* ---------- import CSV bancaire ---------- */
function openCsvImport(b) {
  const drop = el("div", { class: "dropzone" }, "Cliquez ou déposez un fichier CSV de votre banque", el("div", { class: "xs muted mt8" }, "Formats acceptés : colonnes date / libellé / montant (ou débit + crédit), séparateur , ou ;"));
  const fileInp = el("input", { type: "file", accept: ".csv,text/csv", style: "display:none" });
  drop.addEventListener("click", () => fileInp.click());
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) parse(e.dataTransfer.files[0]); });
  fileInp.addEventListener("change", () => fileInp.files[0] && parse(fileInp.files[0]));

  const m = modal({ title: "Importer un relevé bancaire", lg: true, body: el("div", {}, drop, fileInp) });

  function parse(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result).replace(/^﻿/, "");
      const sep = (text.split("\n")[0].match(/;/g) || []).length >= (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const rows = lines.map(l => splitCsvLine(l, sep));
      if (rows.length < 2) { toast("❌ Fichier vide ou illisible"); return; }
      const known = Intel.knownCsvMap(rows[0]);
      if (known) preview(rows, known, true);   // format déjà rencontré : colonnes appliquées directement
      else showMapping(rows);
    };
    reader.readAsText(file, "utf-8");
  }

  function splitCsvLine(line, sep) {
    const out = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === sep && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function guessCol(header, patterns) {
    return header.findIndex(h => patterns.some(p => h.toLowerCase().includes(p)));
  }

  function showMapping(rows) {
    const header = rows[0];
    const colOpts = header.map((h, i) => ({ value: i, label: h || `Colonne ${i + 1}` }));
    const none = { value: -1, label: "—" };
    let iDate = guessCol(header, ["date"]);
    let iLabel = guessCol(header, ["libell", "label", "description", "designation", "détail", "detail"]);
    let iAmt = guessCol(header, ["montant", "amount", "valeur"]);
    let iDebit = guessCol(header, ["debit", "débit"]);
    let iCredit = guessCol(header, ["credit", "crédit"]);
    const dateSel = selectInput(colOpts, iDate >= 0 ? iDate : 0);
    const labelSel = selectInput([none, ...colOpts], iLabel >= 0 ? iLabel : -1);
    const amtSel = selectInput([none, ...colOpts], iAmt >= 0 ? iAmt : -1);
    const debitSel = selectInput([none, ...colOpts], iDebit >= 0 ? iDebit : -1);
    const creditSel = selectInput([none, ...colOpts], iCredit >= 0 ? iCredit : -1);

    m.body.innerHTML = "";
    m.body.append(
      el("p", { class: "small muted mb12" }, `${rows.length - 1} lignes détectées. Indiquez quelle colonne contient quoi :`),
      el("div", { class: "form-grid" },
        fField("Date", dateSel), fField("Libellé", labelSel),
        fField("Montant (signé ±)", amtSel),
        el("div", { class: "field" }, el("label", {}, "— ou bien —"), el("div", { class: "xs muted", style: "padding-top:10px" }, "colonnes séparées :")),
        fField("Débit", debitSel), fField("Crédit", creditSel)),
      el("div", { class: "flex mt16" }, el("span", { class: "spacer" }),
        el("button", {
          class: "btn btn-p", onclick: () => {
            const map = { iDate: +dateSel.value, iLabel: +labelSel.value, iAmt: +amtSel.value, iDebit: +debitSel.value, iCredit: +creditSel.value };
            Intel.rememberCsvMap(rows[0], map);   // la prochaine fois, cette étape sera sautée
            persist();
            preview(rows, map, false);
          }
        }, "Analyser →"))
    );
  }

  function parseDate(s) {
    s = s.trim();
    let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mt) return `${mt[1]}-${mt[2]}-${mt[3]}`;
    mt = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (mt) return `${mt[3]}-${mt[2].padStart(2, "0")}-${mt[1].padStart(2, "0")}`;
    mt = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/);
    if (mt) return `20${mt[3]}-${mt[2].padStart(2, "0")}-${mt[1].padStart(2, "0")}`;
    return null;
  }

  function preview(rows, map, autoMapped) {
    const { iDate, iLabel, iAmt, iDebit, iCredit } = map;
    const cur = b.currency;
    const parsed = [];
    for (const r of rows.slice(1)) {
      const date = parseDate(r[iDate] || "");
      if (!date) continue;
      let amount = 0;
      if (iAmt >= 0) amount = parseAmount(r[iAmt]);
      else {
        const d = iDebit >= 0 ? Math.abs(parseAmount(r[iDebit])) : 0;
        const c = iCredit >= 0 ? Math.abs(parseAmount(r[iCredit])) : 0;
        amount = c - d;
      }
      if (!amount) continue;
      const label = iLabel >= 0 ? (r[iLabel] || "") : "";
      const kind = amount >= 0 ? "income" : "expense";
      parsed.push({ sel: true, date, label, amount: Math.abs(amount), kind, categoryId: null, tier: "new", note: "", splits: null });
    }
    if (!parsed.length) { toast("❌ Aucune ligne exploitable (vérifiez les colonnes)"); return; }

    /* classement par confiance : auto (marchand confirmé) > suggéré > à vérifier ; retraits & doublons à part */
    const dup = new Set(State.transactions.filter(t => t.budgetId === b.id).map(t => `${t.date}|${t.amount}|${(t.label || "").slice(0, 18)}`));
    for (const p of parsed) {
      if (dup.has(`${p.date}|${p.amount}|${(p.label || "").slice(0, 18)}`)) { p.tier = "dup"; p.sel = false; p.note = "déjà présente dans le suivi"; continue; }
      if (p.kind === "expense" && Intel.isCashWithdrawal(p.label)) {
        p.tier = "split";
        p.splits = Intel.splitFor(b, p.label, p.amount);
        p.note = p.splits ? "ventilation proposée d'après vos retraits passés" : "retrait d'espèces — vous pouvez le ventiler par enveloppe";
        continue;
      }
      const s = Intel.suggest(b, p.label, p.kind);
      if (s) {
        p.categoryId = s.categoryId;
        if (s.usual && Math.abs(p.amount - s.usual) > Math.max(15, s.usual * 0.4)) {
          p.tier = "review"; p.note = `montant inhabituel — d'habitude ≈ ${fmtMoney(s.usual, cur, { dec: 0 })}`;
        } else if (s.auto) { p.tier = "auto"; p.note = ""; }
        else { p.tier = "sugg"; p.note = s.source === "appris" ? "appris de vos choix passés" : "reconnu par mots-clés"; }
      } else { p.note = "libellé inconnu"; }
    }

    function row(p) {
      const chk = el("input", { type: "checkbox", checked: p.sel, onchange: e => p.sel = e.target.checked });
      const line = el("div", { style: "border-bottom:1px solid var(--line); padding:7px 0" });
      const main = el("div", { class: "flex small", style: "gap:8px" },
        chk,
        el("span", { class: "mono xs muted nowrap" }, p.date),
        el("span", { style: "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" }, p.label || "—"),
        el("b", { class: "mono nowrap " + (p.kind === "income" ? "pos" : "") }, fmtMoney(p.kind === "income" ? p.amount : -p.amount, cur, { sign: true })));
      line.append(main);
      if (p.tier === "split") {
        const zone = el("div", { style: "margin:6px 0 2px 26px" });
        const renderZone = () => {
          zone.innerHTML = "";
          if (p.splits && p.splits.length) {
            zone.append(
              el("span", { class: "xs muted" }, p.splits.map(s => `${catLabel(b, s.categoryId)} ${fmtMoney(s.amount, cur, { dec: 0 })}`).join(" + ") + "  "),
              el("button", { class: "btn btn-sm btn-ghost", onclick: editSplits }, "Modifier"));
          } else {
            zone.append(el("button", { class: "btn btn-sm", onclick: () => { p.splits = [{ categoryId: null, amount: p.amount }]; editSplits(); } }, "÷ Ventiler"));
          }
        };
        const editSplits = () => {
          zone.innerHTML = "";
          if (!p.splits || !p.splits.length) p.splits = [{ categoryId: null, amount: p.amount }];
          const rest = el("span", { class: "xs muted" });
          const refresh = () => {
            const d = round2(p.amount - p.splits.reduce((s, x) => s + (+x.amount || 0), 0));
            rest.textContent = d ? `reste ${fmtMoney(d, cur)}` : "✓ complet";
            rest.className = "xs " + (d ? "neg" : "pos");
          };
          const lst = el("div", { style: "display:flex; flex-direction:column; gap:6px" });
          p.splits.forEach((sp, i) => {
            const amtI = moneyInput({ value: sp.amount || "", oninput: e => { sp.amount = parseAmount(e.target.value); refresh(); } });
            const cs2 = catSelect(b, "expense", sp.categoryId, { style: "flex:1; min-width:0; min-height:32px; padding:4px 28px 4px 9px; font-size:12.5px" });
            cs2.addEventListener("change", () => sp.categoryId = cs2.value || null);
            lst.append(el("div", { class: "flex", style: "gap:6px" },
              el("div", { style: "width:110px; flex:none" }, amtI), cs2,
              el("button", { class: "btn btn-ico btn-ghost", title: "Supprimer", html: ico("x", 14), onclick: () => { p.splits.splice(i, 1); editSplits(); } })));
          });
          zone.append(lst, el("div", { class: "flex", style: "gap:6px; margin-top:6px" },
            el("button", { class: "btn btn-sm", onclick: () => { p.splits.push({ categoryId: null, amount: 0 }); editSplits(); } }, "+ Ligne"),
            el("button", { class: "btn btn-sm btn-ghost", onclick: () => { p.splits = null; renderZone(); } }, "Sans ventilation"),
            el("span", { class: "spacer" }), rest));
          refresh();
        };
        renderZone();
        line.append(zone);
      } else {
        const cs = catSelect(b, p.kind, p.categoryId, { style: "max-width:210px; min-height:32px; padding:4px 28px 4px 9px; font-size:12.5px" });
        cs.addEventListener("change", () => { p.categoryId = cs.value || null; });
        p._sel = cs;
        main.append(cs);
      }
      if (p.note) line.append(el("div", { class: "xs", style: "margin-left:26px; margin-top:3px; color:" + (p.tier === "review" ? "#f59e0b" : "var(--mut, #93a1ba)") }, p.note));
      return line;
    }

    function section(title, items, collapsed) {
      if (!items.length) return null;
      const body = el("div", {}, items.map(row));
      if (collapsed) return el("details", { style: "margin-bottom:6px" },
        el("summary", { class: "small muted", style: "cursor:pointer; padding:6px 0" }, `${title} (${items.length})`), body);
      return el("div", { style: "margin-bottom:6px" },
        el("div", { class: "small", style: "font-weight:600; padding:8px 0 2px" }, `${title} (${items.length})`), body);
    }

    const byTier = t => parsed.filter(p => p.tier === t);
    const toCheck = parsed.filter(p => p.tier === "review" || p.tier === "new");
    const months = [...new Set(parsed.map(p => ymOf(p.date)))].sort();
    const span = months.length > 1 ? `de ${fmtYm(months[0])} à ${fmtYm(months[months.length - 1])}` : fmtYm(months[0]);

    const aiLine = el("div", { class: "xs muted", style: "margin:2px 0 8px" });
    async function runAI() {
      if (!Intel.aiReady()) return;
      const unknowns = parsed.filter(p => p.tier === "new" && p.label);
      const uniq = [...new Map(unknowns.map(p => [p.label + "|" + p.kind, { label: p.label, kind: p.kind }])).values()];
      if (!uniq.length) return;
      aiLine.textContent = `🤖 IA : analyse de ${uniq.length} libellé(s) inconnu(s)…`;
      try {
        const res = await Intel.aiCategorize(b, uniq);
        let n = 0;
        for (const p of unknowns) {
          const cid = res.get(p.label);
          if (cid && !p.categoryId) { p.categoryId = cid; if (p._sel) p._sel.value = cid; n++; }
        }
        aiLine.textContent = n ? `🤖 IA : ${n} ligne(s) catégorisée(s) — un coup d'œil suffit avant d'importer.` : "🤖 IA consultée : aucune catégorie sûre, à compléter à la main.";
      } catch (e) {
        aiLine.textContent = `🤖 IA indisponible (${e.message}) — catégorisation locale uniquement.`;
      }
    }

    m.body.innerHTML = "";
    const list = el("div", { style: "max-height:48vh; overflow-y:auto" },
      section("⚠ À vérifier", toCheck, false),
      section("💶 Retraits d'espèces", byTier("split"), false),
      section("Catégories proposées", byTier("sugg"), false),
      section("Reconnues automatiquement", byTier("auto"), true),
      section("Doublons probables — décochés", byTier("dup"), true));
    m.body.append(
      el("p", { class: "small muted mb8" },
        `${parsed.length} lignes, ${span}. ` +
        `${byTier("auto").length} reconnues automatiquement, ${byTier("sugg").length} proposées, ${toCheck.length} à vérifier` +
        (byTier("dup").length ? `, ${byTier("dup").length} doublon(s) écarté(s)` : "") + "."),
      autoMapped ? el("div", { class: "xs muted mb8" }, "Format de fichier reconnu — colonnes appliquées automatiquement. ",
        el("button", { class: "btn btn-sm btn-ghost", onclick: () => showMapping(rows) }, "Modifier les colonnes")) : null,
      aiLine, list,
      el("div", { class: "flex mt16" }, el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
        el("button", {
          class: "btn btn-p", onclick: () => {
            const toAdd = parsed.filter(p => p.sel);
            if (!toAdd.length) { toast("Aucune ligne sélectionnée"); return; }
            toAdd.forEach(p => {
              const raw = (p.splits || []).filter(s => +s.amount > 0).map(s => ({ categoryId: s.categoryId || null, amount: round2(+s.amount) }));
              const sum = round2(raw.reduce((s, x) => s + x.amount, 0));
              const splits = (raw.length > 1 && Math.abs(sum - p.amount) <= 0.011) ? raw : undefined;
              const tx = { id: uid(), budgetId: b.id, date: p.date, kind: p.kind, amount: p.amount, categoryId: splits ? null : p.categoryId, label: p.label, notes: "", splits };
              State.transactions.push(tx);
              Intel.learn(b, tx);   // chaque import affine les règles pour la prochaine fois
            });
            persist(); m.close(); renderApp();
            Juice.buzz(12);
            const auto = toAdd.filter(p => p.tier === "auto").length;
            toast(`✅ ${toAdd.length} transactions importées` + (auto ? ` dont ${auto} reconnues automatiquement` : ""));
            if (Intel.detectRecurring(b).length) setTimeout(() => toast("💡 Régularités détectées — suggestions affichées dans le Suivi réel", { ms: 5000 }), 700);
          }
        }, "Importer la sélection"))
    );
    runAI();
  }
}
