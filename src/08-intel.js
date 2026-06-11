"use strict";
/* ============ moteur d'apprentissage : catégorisation, récurrences, ventilation, IA ============ */

const Intel = (() => {

  /* ---------- clé marchand : normalise un libellé bancaire ---------- */
  const NOISE_WORDS = /\b(CB|CARTE|PAIEMENT|ACHAT|PRLV|PRELEVEMENT|VIR|VIREMENT|SEPA|INST|INSTANTANE|ECH|ECHEANCE|EMIS|RECU|FACTURE|MENSUALITE|ABONNEMENT|WEB|INTERNET|FR|EUR?)\b/g;

  function isCashWithdrawal(label) {
    return /retrait|\bdab\b|distributeur|\batm\b|withdrawal/i.test(label || "");
  }

  function merchantKey(label) {
    if (!label) return "";
    if (isCashWithdrawal(label)) return "RETRAIT";
    let s = String(label).toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[̀-ͯ]/g, "")
      .replace(/\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?/g, " ")
      .replace(NOISE_WORDS, " ")
      .replace(/\bX{2,}\d*\b/g, " ")
      .replace(/\d{4,}/g, " ")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ").trim();
    return s.split(" ").slice(0, 3).join(" ");
  }

  const ruleKey = (b, label) => {
    const k = merchantKey(label);
    return k ? b.id + "|" + k : null;
  };
  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, z) => a - z);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  /* ---------- suggestion de catégorie : règles apprises puis mots-clés ---------- */
  function suggest(b, label, kind) {
    const rk = ruleKey(b, label);
    if (rk) {
      const r = State.intel.rules[rk];
      if (r && r.kind === kind && r.categoryId && catById(b, r.categoryId)) {
        return { categoryId: r.categoryId, source: "appris", auto: r.confirms >= 2, usual: median(r.amounts || []) };
      }
    }
    for (const [re, catName] of AUTO_CAT_KEYWORDS) {
      if (re.test(label || "")) {
        const c = b.categories.find(c => c.name === catName && c.kind === kind);
        if (c) return { categoryId: c.id, source: "mots-clés", auto: false, usual: 0 };
      }
    }
    return null;
  }

  /* ---------- apprentissage : chaque transaction confirmée nourrit les règles ---------- */
  function learn(b, tx) {
    if (tx.splits && tx.splits.length) {
      recordSplit(b, tx.label, tx.splits, +tx.amount);
      tx.splits.forEach(s => bumpCat(b, s.categoryId));
      return;
    }
    if (!tx.categoryId || !catById(b, tx.categoryId)) return;
    const rk = ruleKey(b, tx.label);
    if (!rk) return;
    const r = State.intel.rules[rk] || (State.intel.rules[rk] = { kind: tx.kind, categoryId: null, confirms: 0, amounts: [], days: [], itemId: null });
    r.kind = tx.kind;
    if (r.categoryId === tx.categoryId) r.confirms++;
    else { r.categoryId = tx.categoryId; r.confirms = 1; }
    r.amounts = (r.amounts || []).concat(+tx.amount).slice(-8);
    r.days = (r.days || []).concat(+tx.date.slice(8)).slice(-8);
    r.lastDate = tx.date;
    bumpCat(b, tx.categoryId);
  }

  /* ---------- usage des catégories (tri des menus déroulants) ---------- */
  function bumpCat(b, catId) {
    if (!catId) return;
    const k = b.id + "|" + catId;
    State.intel.catUsage[k] = (State.intel.catUsage[k] || 0) + 1;
  }
  function topCats(b, kind, n) {
    return Object.entries(State.intel.catUsage)
      .filter(([k]) => k.startsWith(b.id + "|"))
      .map(([k, count]) => ({ cat: catById(b, k.slice(b.id.length + 1)), count }))
      .filter(x => x.cat && x.cat.kind === kind && x.count >= 2)
      .sort((a, z) => z.count - a.count)
      .slice(0, n || 5).map(x => x.cat);
  }

  /* ---------- mémoire de ventilation (méthode des enveloppes) ---------- */
  function recordSplit(b, label, splits, total) {
    const rk = ruleKey(b, label);
    if (!rk || !total) return;
    State.intel.splitMemory[rk] = splits
      .filter(s => s.categoryId && +s.amount > 0)
      .map(s => ({ categoryId: s.categoryId, share: +s.amount / total }));
  }
  function splitFor(b, label, amount) {
    const rk = ruleKey(b, label);
    const mem = rk && State.intel.splitMemory[rk];
    if (!mem || !mem.length || !amount) return null;
    const valid = mem.filter(m => catById(b, m.categoryId));
    if (!valid.length) return null;
    const out = valid.map(m => ({ categoryId: m.categoryId, amount: round2(amount * m.share) }));
    const diff = round2(amount - out.reduce((s, o) => s + o.amount, 0));
    out[out.length - 1].amount = round2(out[out.length - 1].amount + diff);
    return out;
  }

  /* ---------- détection de récurrences sur l'historique réel ---------- */
  const FREQ_WINDOWS = [
    ["weekly", 5.5, 8.5], ["biweekly", 12, 16], ["monthly", 26, 35], ["bimonthly", 55, 70],
    ["quarterly", 80, 100], ["semiannual", 165, 200], ["annual", 330, 400],
  ];
  const dayDiff = (d1, d2) => Math.round((toDate(d2) - toDate(d1)) / 86400000);

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  }

  function detectRecurring(b) {
    const groups = {};
    for (const t of State.transactions) {
      if (t.budgetId !== b.id) continue;
      const k = merchantKey(t.label);
      if (!k || k === "RETRAIT") continue;
      (groups[k] = groups[k] || []).push(t);
    }
    const out = [];
    for (const [k, txs] of Object.entries(groups)) {
      if (txs.length < 3) continue;
      txs.sort((a, z) => a.date.localeCompare(z.date));
      const intervals = txs.slice(1).map((t, i) => dayDiff(txs[i].date, t.date)).filter(d => d > 0);
      if (intervals.length < 2) continue;
      const medInt = median(intervals);
      const fw = FREQ_WINDOWS.find(([, lo, hi]) => medInt >= lo && medInt <= hi);
      if (!fw) continue;
      const freq = fw[0];
      if (!intervals.every(d => d >= fw[1] * 0.6 && d <= fw[2] * 1.4)) continue;

      const amounts = txs.map(t => +t.amount);
      const medAmt = median(amounts);
      if (medAmt < 1) continue;
      const spread = (Math.max(...amounts) - Math.min(...amounts)) / medAmt;
      const medDay = Math.round(median(txs.map(t => +t.date.slice(8))));
      const kind = txs.filter(t => t.kind === "income").length > txs.length / 2 ? "income" : "expense";
      const catCounts = {};
      txs.forEach(t => { if (t.categoryId) catCounts[t.categoryId] = (catCounts[t.categoryId] || 0) + 1; });
      const catId = Object.keys(catCounts).sort((a, z) => catCounts[z] - catCounts[a])[0] || null;
      const rule = State.intel.rules[b.id + "|" + k];

      const item = b.items.find(it => it.kind === kind && !it.endDate && (
        (rule && rule.itemId === it.id) ||
        (catId && it.categoryId === catId && it.freq === freq && Math.abs(monthAvg(it) - monthAvg({ amount: medAmt, freq })) / Math.max(1, monthAvg(it)) < 0.5)
      ));

      const name = titleCase(k);
      if (!item) {
        out.push({
          id: `new|${b.id}|${k}`, type: "new", key: k, kind, freq, catId,
          amount: round2(medAmt), day: medDay, variable: spread > 0.25,
          min: round2(Math.min(...amounts)), max: round2(Math.max(...amounts)),
          firstDate: txs[0].date, count: txs.length,
          text: `« ${name} » revient ${txs.length} fois, ${FREQS[freq].label.toLowerCase()}, ≈ ${fmtMoney(medAmt, b.currency, { dec: 0 })} autour du ${medDay} → en faire un poste du budget ?`,
          apply() {
            const it = newItem(kind);
            it.name = name;
            it.categoryId = catId;
            it.amount = round2(medAmt);
            it.freq = freq; it.day = medDay;
            it.variable = spread > 0.25;
            if (it.variable) { it.min = round2(Math.min(...amounts)); it.max = round2(Math.max(...amounts)); }
            it.startDate = ymOf(txs[0].date) + "-01";
            b.items.push(it);
            if (rule) rule.itemId = it.id;
            const rk2 = b.id + "|" + k;
            (State.intel.rules[rk2] = State.intel.rules[rk2] || { kind, categoryId: catId, confirms: 0, amounts: [], days: [] }).itemId = it.id;
            return `Poste « ${name} » créé`;
          }
        });
      } else {
        const recent = amounts.slice(-2);
        const newAmt = round2(median(recent));
        if (recent.length === 2 && recent.every(a => Math.abs(a - item.amount) > Math.max(2, item.amount * 0.05))
          && Math.sign(recent[0] - item.amount) === Math.sign(recent[1] - item.amount) && !item.variable) {
          out.push({
            id: `amt|${b.id}|${k}|${Math.round(newAmt)}`, type: "amount", key: k,
            text: `« ${item.name} » : les derniers prélèvements sont à ${fmtMoney(newAmt, b.currency, { dec: 0 })} alors que le poste prévoit ${fmtMoney(item.amount, b.currency, { dec: 0 })} → mettre à jour ?`,
            apply() { item.amount = newAmt; return `Montant de « ${item.name} » mis à jour`; }
          });
        }
        if (FREQ_MONTHS[freq] && Math.abs(medDay - item.day) >= 4) {
          out.push({
            id: `day|${b.id}|${k}|${medDay}`, type: "day", key: k,
            text: `« ${item.name} » : les opérations tombent autour du ${medDay} alors que le poste est calé sur le ${item.day} → ajuster la date ?`,
            apply() { item.day = medDay; return `Jour de « ${item.name} » ajusté au ${medDay}`; }
          });
        }
      }
    }
    return out.filter(s => !State.intel.dismissed[s.id]);
  }
  const monthAvg = it => (+it.amount || 0) * (FREQS[it.freq] ? FREQS[it.freq].perYear : 12) / 12;

  function dismiss(id) { State.intel.dismissed[id] = Date.now(); }

  /* ---------- mémoire des formats CSV (mapping de colonnes par banque) ---------- */
  const csvFingerprint = header => header.map(h => String(h).toLowerCase().trim()).join("|").slice(0, 300);
  function rememberCsvMap(header, map) { State.intel.csvMaps[csvFingerprint(header)] = map; }
  function knownCsvMap(header) {
    const m = State.intel.csvMaps[csvFingerprint(header)];
    if (!m) return null;
    const max = header.length;
    const ok = i => i === -1 || (i >= 0 && i < max);
    return (ok(m.iDate) && ok(m.iLabel) && ok(m.iAmt) && ok(m.iDebit) && ok(m.iCredit) && m.iDate >= 0) ? m : null;
  }

  /* ---------- connecteur IA (clé stockée localement, jamais synchronisée) ---------- */
  const aiReady = () => !!(State.ai && State.ai.provider && State.ai.key);

  async function callClaude(prompt) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": State.ai.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("Claude " + res.status);
    const data = await res.json();
    return (data.content.find(c => c.type === "text") || {}).text || "";
  }

  async function callGemini(prompt) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": State.ai.key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
    });
    if (!res.ok) throw new Error("Gemini " + res.status);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const callAI = prompt => State.ai.provider === "gemini" ? callGemini(prompt) : callClaude(prompt);

  async function aiTest() {
    const txt = await callAI("Réponds uniquement le mot : OK");
    if (!/ok/i.test(txt)) throw new Error("réponse inattendue");
    return true;
  }

  /* Catégorise en lot des libellés inconnus. entries = [{label, kind}] → Map label→categoryId */
  async function aiCategorize(b, entries) {
    const catNames = kind => b.categories.filter(c => c.kind === kind && c.parentId).map(c => c.name);
    const list = entries.map((e, i) => `${i + 1}. [${e.kind === "income" ? "revenu" : "dépense"}] ${e.label}`).join("\n");
    const prompt = `Tu catégorises des libellés d'opérations bancaires françaises.
Catégories de dépenses autorisées : ${catNames("expense").join(" ; ")}.
Catégories de revenus autorisées : ${catNames("income").join(" ; ")}.
Libellés :
${list}
Réponds UNIQUEMENT un tableau JSON, sans autre texte : [{"i":1,"cat":"<nom exact de la liste, ou null si incertain>"}, ...]`;
    const txt = await callAI(prompt);
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("réponse illisible");
    const arr = JSON.parse(m[0]);
    const out = new Map();
    for (const r of arr) {
      const e = entries[(+r.i) - 1];
      if (!e || !r.cat) continue;
      const c = findCatByName(b, r.cat, e.kind);
      if (c) out.set(e.label, c.id);
    }
    return out;
  }

  return {
    merchantKey, isCashWithdrawal, suggest, learn, bumpCat, topCats,
    recordSplit, splitFor, detectRecurring, dismiss,
    rememberCsvMap, knownCsvMap,
    aiReady, aiTest, aiCategorize,
  };
})();
