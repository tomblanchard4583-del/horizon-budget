"use strict";
/* ============ état global & persistance ============ */
const STORE_KEY = "horizon-budget-v1";

const State = {
  version: 1,
  onboarded: false,
  settings: {
    theme: "auto",            // light | dark | auto
    inflation: 2.0,           // % annuel par défaut pour "suivre l'inflation"
    horizonMonths: 24,        // horizon de projection par défaut
    scenarioMode: "expected", // expected | optimistic | pessimistic
    firstName: "",
    juice: true,              // micro-animations & célébrations
  },
  activeBudgetId: null,
  budgets: [],
  transactions: [],           // suivi réel : {id,budgetId,date,kind,amount,categoryId,label,notes,splits?}
  intel: {                    // apprentissage local — propre à cet appareil, NON synchronisé
    rules: {},                // "budgetId|clé marchand" → {kind,categoryId,confirms,amounts,days,itemId}
    catUsage: {},             // "budgetId|categoryId" → nombre d'utilisations
    splitMemory: {},          // "budgetId|clé marchand" → [{categoryId, share}] (méthode des enveloppes)
    csvMaps: {},              // empreinte d'en-tête CSV → mapping de colonnes mémorisé
    dismissed: {},            // suggestions écartées
  },
  ai: { provider: "", key: "" },  // connecteur IA optionnel — clé locale, jamais synchronisée
  sync: {                     // synchronisation Supabase (auto-hébergée)
    enabled: false,
    url: "", anonKey: "", room: "",   // identifiants — propres à chaque appareil, NON synchronisés
    deviceId: null,
    deviceName: "",
    graveyard: {},            // tombstones { "type:id": rev } — SYNCHRONISÉ via le document
    lastRev: 0,               // dernière révision serveur vue par cet appareil
  },
};

function newBudget(name, opts) {
  opts = opts || {};
  return {
    id: uid(),
    name: name || "Mon budget",
    emoji: opts.emoji || "💼",
    color: opts.color || "#10b981",
    currency: opts.currency || "EUR",
    situation: opts.situation || "salarie",
    cycleDay: opts.cycleDay || 1,      // jour de début du mois budgétaire (ex : 25 = jour de paie)
    initialBalance: opts.initialBalance ?? 0,
    initialDate: opts.initialDate || todayStr(),
    archived: false,
    scenarioOf: opts.scenarioOf || null,   // id du budget parent si c'est une variante
    scenarioLabel: opts.scenarioLabel || null,
    createdAt: todayStr(),
    notes: "",
    categories: opts.categories || buildDefaultCategories(),
    items: [],        // postes de revenus / dépenses planifiés
    debts: [],        // crédits & dettes
    goals: [],        // objectifs d'épargne
    accounts: [],     // comptes d'épargne rémunérés
    events: [],       // événements de vie {id,name,emoji,date,notes}
  };
}

/* item = poste budgétaire planifié */
function newItem(kind) {
  return {
    id: uid(), kind, name: "", categoryId: null,
    amount: 0, variable: false, min: null, max: null,
    freq: "monthly", day: 1,                 // jour du mois (mensuel+) ou jour de semaine (hebdo)
    startDate: todayStr().slice(0, 8) + "01",
    endDate: null,
    growth: 0,                               // % par an ; "inf" = suivre l'inflation
    steps: [],                               // paliers [{date:"YYYY-MM", type:"set"|"pct", value}]
    eventId: null, notes: "", savingTo: null, // savingTo = id d'objectif ou de compte épargne
  };
}

let _saveTimer = null;
function persist() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); }
    catch (e) { toast("⚠️ Sauvegarde locale impossible (stockage plein ?)"); }
  }, 250);
  if (window.Sync && State.sync.enabled) Sync.schedulePush();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.version >= 1) {
      const sync = Object.assign({}, State.sync, data.sync || {});
      const settings = Object.assign({}, State.settings, data.settings || {});
      const intel = Object.assign({}, State.intel, data.intel || {});
      const ai = Object.assign({}, State.ai, data.ai || {});
      Object.assign(State, data);
      State.sync = sync;       // garantit les nouveaux champs même sur anciennes sauvegardes
      State.settings = settings;
      State.intel = intel;
      State.ai = ai;
      delete State.gami;       // reliquat d'une ancienne version
    }
  } catch (e) { console.warn("État illisible, démarrage à neuf", e); }
}

const curBudget = () => State.budgets.find(b => b.id === State.activeBudgetId) || State.budgets.find(b => !b.archived) || State.budgets[0] || null;
const budgetById = id => State.budgets.find(b => b.id === id);
const catById = (b, id) => b.categories.find(c => c.id === id);
function catLabel(b, id) {
  const c = catById(b, id);
  if (!c) return "Sans catégorie";
  const p = c.parentId ? catById(b, c.parentId) : null;
  return p ? `${p.name} · ${c.name}` : c.name;
}
function catTop(b, id) {
  const c = catById(b, id);
  if (!c) return null;
  return c.parentId ? catById(b, c.parentId) || c : c;
}
function findCatByName(b, name, kind) {
  return b.categories.find(c => c.kind === kind && c.name.toLowerCase() === name.toLowerCase());
}

function applyTemplate(budget, situationId) {
  (TEMPLATE_ITEMS[situationId] || []).forEach(([kind, name, catName, amount, freq, variable, day]) => {
    const it = newItem(kind);
    it.name = name;
    it.amount = amount;
    it.freq = freq || "monthly";
    it.variable = !!variable;
    it.day = day || 1;
    if (variable) { it.min = Math.round(amount * 0.7); it.max = Math.round(amount * 1.3); }
    const cat = findCatByName(budget, catName, kind);
    it.categoryId = cat ? cat.id : null;
    if (cat && cat.parentId === null) { /* garde la catégorie racine */ }
    budget.items.push(it);
  });
}

/* ---- corbeille / annulation ---- */
let _undoStack = [];
function pushUndo(label, snapshot) {
  _undoStack.push({ label, snapshot: JSON.stringify(snapshot) });
  if (_undoStack.length > 12) _undoStack.shift();
}
function offerUndo(label, restoreFn) {
  toast(label, { action: "Annuler", onAction: restoreFn, ms: 6000 });
}

/* ---- export / import ---- */
function exportJSON(budgetOnly) {
  const payload = budgetOnly
    ? { app: "horizon-budget", type: "budget", version: State.version, budget: curBudget(), transactions: State.transactions.filter(t => t.budgetId === curBudget().id) }
    : { app: "horizon-budget", type: "full", version: State.version, data: State };
  const name = budgetOnly ? `budget-${(curBudget().name || "export").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json` : `horizon-budget-sauvegarde-${todayStr()}.json`;
  downloadFile(name, JSON.stringify(payload, null, 2));
  toast("📦 Fichier exporté");
}

function importJSON(file, done) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.app !== "horizon-budget") throw new Error("format");
      if (data.type === "full") {
        confirmDialog({
          title: "Restaurer une sauvegarde complète ?",
          body: "Cette sauvegarde remplacera TOUTES les données actuelles (budgets, transactions, réglages). Cette action est irréversible.",
          okLabel: "Tout remplacer", danger: true,
          onOk: () => {
            Object.assign(State, data.data);
            persist(); done && done();
            toast("✅ Sauvegarde restaurée");
          }
        });
      } else if (data.type === "budget" && data.budget) {
        const b = data.budget;
        b.id = uid();
        b.name = b.name + " (importé)";
        const idMap = {};
        b.categories.forEach(c => { const n = uid(); idMap[c.id] = n; c.id = n; });
        b.categories.forEach(c => { if (c.parentId) c.parentId = idMap[c.parentId]; });
        b.items.forEach(it => { it.id = uid(); it.categoryId = idMap[it.categoryId] || null; });
        [...b.debts, ...b.goals, ...b.accounts, ...b.events].forEach(x => x.id = uid());
        State.budgets.push(b);
        (data.transactions || []).forEach(t => {
          State.transactions.push({ ...t, id: uid(), budgetId: b.id, categoryId: idMap[t.categoryId] || null });
        });
        State.activeBudgetId = b.id;
        persist(); done && done();
        toast(`✅ Budget « ${b.name} » importé`);
      } else throw new Error("type");
    } catch (e) {
      toast("❌ Fichier non reconnu — exportez depuis Horizon Budget");
    }
  };
  reader.readAsText(file);
}

function exportTransactionsCSV() {
  const b = curBudget();
  const rows = [["date", "type", "montant", "catégorie", "libellé", "notes"]];
  State.transactions.filter(t => t.budgetId === b.id)
    .sort((a, z) => a.date.localeCompare(z.date))
    .forEach(t => rows.push([t.date, t.kind === "income" ? "revenu" : "dépense", String(t.amount).replace(".", ","),
      (t.splits && t.splits.length) ? t.splits.map(s => `${catLabel(b, s.categoryId)} ${String(s.amount).replace(".", ",")}`).join(" + ") : catLabel(b, t.categoryId),
      t.label || "", t.notes || ""]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadFile(`transactions-${todayStr()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  toast("📦 CSV exporté");
}

function exportProjectionCSV(rows) {
  const b = curBudget();
  const head = ["mois", "revenus", "dépenses", "épargne versée", "solde du mois", "solde cumulé", "patrimoine net"];
  const lines = [head].concat(rows.map(r => [fmtYm(r.ym), r.income, r.expense, r.saving, r.net, r.balance, r.netWorth].map(v => typeof v === "number" ? String(round2(v)).replace(".", ",") : v)));
  const csv = lines.map(r => r.join(";")).join("\n");
  downloadFile(`projection-${(b.name || "budget").replace(/\s+/g, "-")}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  toast("📦 Projection exportée en CSV");
}
