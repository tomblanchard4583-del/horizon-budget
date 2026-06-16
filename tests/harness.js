"use strict";
/*
 * Harnais de test — charge les modules globaux de l'app dans un contexte isolé.
 *
 * Les modules src/NN-*.js n'ont aucun `export` (tout est global, concaténé par
 * build.py dans un seul <script>). Pour les tester sans toucher au code de prod,
 * on concatène les fichiers nécessaires et on les évalue dans un contexte `vm`
 * neuf, puis on récupère les fonctions via un pied de page d'export.
 *
 * Aucune dépendance : Node natif uniquement (`node --test`).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");

// Ordre = ordre de chargement de l'app (cf. build.py). On ne prend que les
// modules dont dépend le moteur financier — pas d'UI, pas de DOM.
const MODULES = ["00-utils.js", "01-data.js", "02-store.js", "03-recur.js", "04-engine.js"];

// Fonctions/objets exposés aux tests.
const EXPORTS = [
  // utils dates
  "todayStr", "ymOf", "toDate", "monthIndex", "ymFromIndex", "daysInMonth", "addMonths",
  "yearsBetween", "clamp", "round2",
  // récurrence / évolution
  "itemBaseAmount", "amountAt", "itemCoversMonth", "occurrenceDatesInMonth",
  "monthlyAmount", "monthlyEquivalent",
  // crédits
  "loanPayment", "loanMonths", "amortize", "debtMonthly", "debtPayoffYm",
  // projection
  "balanceAtMonthStart", "project", "plannedMonth", "realMonthByCat",
  // store
  "State", "newBudget", "newItem", "buildDefaultCategories", "catTop", "catById",
];

function load() {
  const code = MODULES
    .map(f => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(SRC, f), "utf8"))
    .join("\n\n");
  const footer = `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + footer, sandbox, { filename: "horizon-app-bundle.js" });
  return sandbox.__api;
}

const api = load();

/* Remet l'état global à zéro entre les tests qui touchent à State. */
function resetState() {
  api.State.transactions = [];
  api.State.budgets = [];
  api.State.activeBudgetId = null;
  api.State.settings = {
    theme: "auto", inflation: 2.0, horizonMonths: 24,
    scenarioMode: "expected", firstName: "", juice: true,
  };
}

/* Budget minimal pour les tests : pas de catégories (catTop -> null -> clé "_"). */
function makeBudget(over) {
  return Object.assign({
    id: "b1", name: "Test", currency: "EUR", situation: "salarie",
    initialBalance: 0, initialDate: "2000-01-01",
    categories: [], items: [], debts: [], goals: [], accounts: [], events: [],
  }, over || {});
}

/* Poste minimal (revenu/dépense planifié). */
function makeItem(over) {
  return Object.assign({
    id: "i1", kind: "expense", name: "", categoryId: null,
    amount: 0, variable: false, min: null, max: null,
    freq: "monthly", day: 1, startDate: "2026-01-01", endDate: null,
    growth: 0, steps: [], savingTo: null,
  }, over || {});
}

module.exports = { api, resetState, makeBudget, makeItem };
