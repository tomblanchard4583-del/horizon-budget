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
    el("button", { class: "btn btn-ico", html: ico("chevL", 18), onclick: () => { _trackYm = addMonths(ym, -1); renderApp(); } }),
    el("h3", { style: "min-width:170px; text-align:center" }, fmtYm(ym)),
    el("button", { class: "btn btn-ico", html: ico("chevR", 18), onclick: () => { _trackYm = addMonths(ym, 1); renderApp(); } }),
    el("span", { class: "spacer" }),
    el("button", { class: "btn btn-sm", html: ico("up", 15) + "<span>Importer CSV</span>", onclick: () => openCsvImport(b) }),
    el("button", { class: "btn btn-sm", html: ico("down", 15) + "<span>Exporter</span>", onclick: exportTransactionsCSV }),
    el("button", { class: "btn btn-p btn-sm", html: ico("plus", 15) + "<span>Transaction</span>", onclick: () => openTxEditor(b, null, ym === ymNow ? todayStr() : ym + "-01") })
  );

  const kpis = el("div", { class: "grid g3 mt16" },
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
          el("div", { class: "i-sub" }, fmtDate(t.date) + " · " + catLabel(b, t.categoryId))),
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

  root.append(el("div", { class: "content-inner" }, head, kpis,
    el("div", { class: "grid g2 mt16", style: "align-items:start" }, compareCard, listCard)));

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
  let catSel = catSelect(b, kind, t.categoryId);
  const catWrap = el("div", {}, catSel);
  const seg = segControl([{ value: "expense", label: "Dépense" }, { value: "income", label: "Revenu" }], kind, v => {
    kind = v;
    const ns = catSelect(b, kind, null);
    catWrap.innerHTML = ""; catWrap.append(ns); catSel = ns;
  });

  const m = modal({
    title: isNew ? "Nouvelle transaction" : "Modifier la transaction",
    body: el("div", {},
      el("div", { class: "flex mb12" }, seg),
      el("div", { class: "form-grid" },
        fField("Montant", amountInp),
        fField("Date", dateInp),
        fField("Libellé", labelInp, { full: true }),
        fField("Catégorie", catWrap, { full: true }))),
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
          t.categoryId = catSel.value || null;
          if (isNew) State.transactions.push(t);
          else Object.assign(State.transactions.find(x => x.id === t.id), t);
          persist(); m.close(); renderApp();
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
      showMapping(rows);
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
        el("button", { class: "btn btn-p", onclick: () => preview(rows, +dateSel.value, +labelSel.value, +amtSel.value, +debitSel.value, +creditSel.value) }, "Analyser →"))
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

  function autoCat(label, kind) {
    for (const [re, catName] of AUTO_CAT_KEYWORDS) {
      if (re.test(label)) {
        const c = b.categories.find(c => c.name === catName && (c.kind === kind));
        if (c) return c.id;
      }
    }
    return null;
  }

  function preview(rows, iDate, iLabel, iAmt, iDebit, iCredit) {
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
      const label = iLabel >= 0 ? r[iLabel] : "";
      const kind = amount >= 0 ? "income" : "expense";
      parsed.push({ sel: true, date, label, amount: Math.abs(amount), kind, categoryId: autoCat(label, kind) });
    }
    if (!parsed.length) { toast("❌ Aucune ligne exploitable (vérifiez les colonnes)"); return; }
    const dup = new Set(State.transactions.filter(t => t.budgetId === b.id).map(t => `${t.date}|${t.amount}|${(t.label || "").slice(0, 18)}`));
    parsed.forEach(p => { if (dup.has(`${p.date}|${p.amount}|${(p.label || "").slice(0, 18)}`)) p.sel = false; });

    m.body.innerHTML = "";
    const list = el("div", { style: "max-height:46vh; overflow-y:auto" });
    parsed.forEach(p => {
      const chk = el("input", { type: "checkbox", checked: p.sel, onchange: e => p.sel = e.target.checked });
      const cs = catSelect(b, p.kind, p.categoryId, { style: "max-width:200px; min-height:34px; padding:5px 28px 5px 9px; font-size:12.5px" });
      cs.addEventListener("change", () => p.categoryId = cs.value || null);
      list.append(el("div", { class: "flex small", style: "padding:6px 0; border-bottom:1px solid var(--line); gap:8px" },
        chk,
        el("span", { class: "mono xs muted nowrap" }, p.date),
        el("span", { style: "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" }, p.label || "—"),
        el("b", { class: "mono nowrap " + (p.kind === "income" ? "pos" : "") }, fmtMoney(p.kind === "income" ? p.amount : -p.amount, b.currency, { sign: true })),
        cs));
    });
    const dupCount = parsed.filter(p => !p.sel).length;
    m.body.append(
      el("p", { class: "small muted mb8" }, `${parsed.length} transactions détectées, catégorisées automatiquement quand c'est possible.` + (dupCount ? ` ${dupCount} doublon(s) probable(s) décoché(s).` : "")),
      list,
      el("div", { class: "flex mt16" }, el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
        el("button", {
          class: "btn btn-p", onclick: () => {
            const toAdd = parsed.filter(p => p.sel);
            toAdd.forEach(p => State.transactions.push({ id: uid(), budgetId: b.id, date: p.date, kind: p.kind, amount: p.amount, categoryId: p.categoryId, label: p.label, notes: "" }));
            persist(); m.close(); renderApp();
            toast(`✅ ${toAdd.length} transactions importées`);
          }
        }, "Importer la sélection"))
    );
  }
}
