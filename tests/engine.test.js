"use strict";
/* Tests du moteur de projection (src/04-engine.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { api, resetState, makeBudget, makeItem } = require("./harness.js");

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `attendu ≈ ${b}, obtenu ${a}`);

/* ---------- balanceAtMonthStart ---------- */
test("balanceAtMonthStart : solde initial + transactions antérieures du bon budget", () => {
  resetState();
  api.State.transactions = [
    { budgetId: "b1", date: "2026-01-15", kind: "income", amount: 500 },
    { budgetId: "b1", date: "2026-02-10", kind: "expense", amount: 200 },
    { budgetId: "autre", date: "2026-01-01", kind: "income", amount: 9999 }, // ignoré
  ];
  const b = makeBudget({ initialBalance: 100, initialDate: "2026-01-01" });
  assert.equal(api.balanceAtMonthStart(b, "2026-02"), 600);     // 100 + 500
  assert.equal(api.balanceAtMonthStart(b, "2026-03"), 400);     // 100 + 500 - 200
});
test("balanceAtMonthStart : ignore les transactions antérieures à initialDate", () => {
  resetState();
  api.State.transactions = [{ budgetId: "b1", date: "2025-12-01", kind: "income", amount: 1000 }];
  const b = makeBudget({ initialBalance: 50, initialDate: "2026-01-01" });
  assert.equal(api.balanceAtMonthStart(b, "2026-02"), 50);
});

/* ---------- project : budget simple ---------- */
test("project : budget simple sur 12 mois (revenu 3000, dépense 2000)", () => {
  resetState();
  const b = makeBudget({
    initialBalance: 1000,
    items: [
      makeItem({ id: "inc", kind: "income", amount: 3000, freq: "monthly", startDate: "2026-01-01" }),
      makeItem({ id: "exp", kind: "expense", amount: 2000, freq: "monthly", startDate: "2026-01-01" }),
    ],
  });
  api.State.budgets = [b]; api.State.activeBudgetId = "b1";
  const p = api.project(b, { months: 12, from: "2026-01" });
  assert.equal(p.length, 12);
  assert.equal(p[0].income, 3000);
  assert.equal(p[0].expense, 2000);
  assert.equal(p[0].net, 1000);
  assert.equal(p[0].balance, 2000);           // 1000 + 1000
  assert.equal(p[11].balance, 13000);         // 1000 + 12×1000
});

/* ---------- project : comptes épargne (intérêts composés + plafond) ---------- */
test("project : intérêts mensuels et plafond du compte épargne", () => {
  resetState();
  const b = makeBudget({ accounts: [{ id: "a1", balance: 10000, rate: 12, ceiling: 10100 }] });
  api.State.budgets = [b]; api.State.activeBudgetId = "b1";
  const p = api.project(b, { months: 3, from: "2026-01" });
  close(p[0].savingsTotal, 10100, 1e-4);   // 10000 × (1 + 12%/12) = 10100, sous plafond
  close(p[1].savingsTotal, 10100, 1e-4);   // plafonné
});

/* ---------- project : patrimoine net ---------- */
test("project : patrimoine net = solde + épargne + objectifs − dettes", () => {
  resetState();
  const b = makeBudget({
    initialBalance: 5000,
    accounts: [{ id: "a1", balance: 2000, rate: 0 }],
    goals: [{ id: "g1", current: 1000, target: 5000 }],
    debts: [{ id: "d1", principal: 3000, rate: 0, payment: 100, startDate: "2026-01-01" }],
  });
  api.State.budgets = [b]; api.State.activeBudgetId = "b1";
  const p = api.project(b, { months: 1, from: "2026-01" });
  const m = p[0];
  // dette : mensualité 100 → solde fin de mois 2900 ; dépense inclut la mensualité
  close(m.debtPayment, 100);
  close(m.debtBalance, 2900);
  // solde = 5000 - 100 (mensualité dette) = 4900 ; épargne 2000 ; objectifs 1000
  close(m.netWorth, m.balance + m.savingsTotal + m.goalsTotal - m.debtBalance);
  close(m.netWorth, 4900 + 2000 + 1000 - 2900);
});

/* ---------- project : versement vers objectif ---------- */
test("project : poste 'savingTo' alimente le solde de l'objectif", () => {
  resetState();
  const b = makeBudget({
    goals: [{ id: "g1", current: 0, target: 1200 }],
    items: [makeItem({ id: "ep", kind: "expense", amount: 100, freq: "monthly", startDate: "2026-01-01", savingTo: "g1" })],
  });
  api.State.budgets = [b]; api.State.activeBudgetId = "b1";
  const p = api.project(b, { months: 3, from: "2026-01" });
  assert.equal(p[0].saving, 100);
  assert.equal(p[0].goalBal.g1, 100);
  assert.equal(p[2].goalBal.g1, 300);
});

/* ---------- project : scénarios via State.settings ---------- */
test("project : scénario optimiste/pessimiste change la dépense variable", () => {
  resetState();
  const b = makeBudget({
    items: [makeItem({ id: "v", kind: "expense", variable: true, min: 80, max: 120, freq: "monthly", startDate: "2026-01-01" })],
  });
  api.State.budgets = [b]; api.State.activeBudgetId = "b1";
  assert.equal(api.project(b, { months: 1, from: "2026-01", scenarioMode: "expected" })[0].expense, 100);
  assert.equal(api.project(b, { months: 1, from: "2026-01", scenarioMode: "optimistic" })[0].expense, 80);
  assert.equal(api.project(b, { months: 1, from: "2026-01", scenarioMode: "pessimistic" })[0].expense, 120);
});

/* ---------- realMonthByCat ---------- */
test("realMonthByCat : agrège revenus/dépenses du mois, gère les ventilations", () => {
  resetState();
  const b = makeBudget();
  api.State.transactions = [
    { budgetId: "b1", date: "2026-01-05", kind: "expense", amount: 100, categoryId: null },
    { budgetId: "b1", date: "2026-01-06", kind: "income", amount: 300, categoryId: null },
    { budgetId: "b1", date: "2026-01-07", kind: "expense", amount: 50, splits: [{ categoryId: null, amount: 30 }, { categoryId: null, amount: 20 }] },
    { budgetId: "b1", date: "2026-02-01", kind: "expense", amount: 999, categoryId: null }, // autre mois
  ];
  const r = api.realMonthByCat(b, "2026-01");
  assert.equal(r.expense, 150);  // 100 + (30+20)
  assert.equal(r.income, 300);
});
