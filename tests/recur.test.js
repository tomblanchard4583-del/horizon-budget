"use strict";
/* Tests du moteur de récurrence & d'amortissement (src/03-recur.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { api, makeItem } = require("./harness.js");

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `attendu ≈ ${b}, obtenu ${a}`);
// occurrenceDatesInMonth renvoie un tableau créé dans le contexte vm (autre realm) :
// on le ramène dans le realm courant pour que deepEqual compare structure et non prototype.
const occ = (it, ym) => [...api.occurrenceDatesInMonth(it, ym)];

/* ---------- itemBaseAmount ---------- */
test("itemBaseAmount : montant fixe", () => {
  assert.equal(api.itemBaseAmount(makeItem({ amount: 250 })), 250);
});
test("itemBaseAmount : variable sans montant → moyenne min/max", () => {
  assert.equal(api.itemBaseAmount(makeItem({ variable: true, min: 80, max: 120 })), 100);
});
test("itemBaseAmount : variable avec montant saisi → ce montant", () => {
  assert.equal(api.itemBaseAmount(makeItem({ variable: true, amount: 200, min: 80, max: 120 })), 200);
});

/* ---------- occurrenceDatesInMonth : frontières ---------- */
test("mensuel jour 31 sur février court → ramené au dernier jour (28)", () => {
  const it = makeItem({ freq: "monthly", day: 31, startDate: "2026-01-01" });
  assert.deepEqual(occ(it, "2026-02"), ["2026-02-28"]);
});
test("mensuel jour 31 sur février bissextile → 29", () => {
  const it = makeItem({ freq: "monthly", day: 31, startDate: "2024-01-01" });
  assert.deepEqual(occ(it, "2024-02"), ["2024-02-29"]);
});
test("once : occurrence unique uniquement le mois de la date", () => {
  const it = makeItem({ freq: "once", startDate: "2026-03-15" });
  assert.deepEqual(occ(it, "2026-03"), ["2026-03-15"]);
  assert.deepEqual(occ(it, "2026-04"), []);
});
test("hebdomadaire : toutes les occurrences du mois (janv. 2026, départ jeudi)", () => {
  const it = makeItem({ freq: "weekly", startDate: "2026-01-01" });
  assert.deepEqual(occ(it, "2026-01"),
    ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29"]);
});
test("quinzaine : pas de 14 jours, traverse correctement le mois", () => {
  const it = makeItem({ freq: "biweekly", startDate: "2026-01-01" });
  assert.deepEqual(occ(it, "2026-01"),
    ["2026-01-01", "2026-01-15", "2026-01-29"]);
});
test("annuel : ne se déclenche que le mois d'ancrage (mod 12)", () => {
  const it = makeItem({ freq: "annual", day: 10, startDate: "2026-01-01" });
  assert.deepEqual(occ(it, "2026-01"), ["2026-01-10"]);
  assert.deepEqual(occ(it, "2026-02"), []);
  assert.deepEqual(occ(it, "2027-01"), ["2027-01-10"]);
});
test("trimestriel : tous les 3 mois à partir de l'ancrage", () => {
  const it = makeItem({ freq: "quarterly", day: 1, startDate: "2026-01-01" });
  assert.deepEqual(occ(it, "2026-04"), ["2026-04-01"]);
  assert.deepEqual(occ(it, "2026-05"), []);
});
test("début en cours de mois après le jour prévu → 1ʳᵉ occurrence à la date de début", () => {
  const it = makeItem({ freq: "monthly", day: 5, startDate: "2026-03-20" });
  assert.deepEqual(occ(it, "2026-03"), ["2026-03-20"]);
  // le mois suivant revient au jour prévu
  assert.deepEqual(occ(it, "2026-04"), ["2026-04-05"]);
});
test("hors période : endDate antérieure → aucune occurrence", () => {
  const it = makeItem({ freq: "monthly", day: 1, startDate: "2026-01-01", endDate: "2026-03-31" });
  assert.deepEqual(occ(it, "2026-04"), []);
});

/* ---------- monthlyAmount ---------- */
test("monthlyAmount : n occurrences × montant (hebdo janv. = 5×100)", () => {
  const it = makeItem({ freq: "weekly", amount: 100, startDate: "2026-01-01" });
  assert.equal(api.monthlyAmount(it, "2026-01"), 500);
});
test("monthlyAmount : 0 si poste inactif ce mois", () => {
  const it = makeItem({ freq: "annual", amount: 1200, day: 10, startDate: "2026-01-01" });
  assert.equal(api.monthlyAmount(it, "2026-02"), 0);
});

/* ---------- amountAt : paliers, croissance, inflation, scénarios ---------- */
test("amountAt : palier set remplace le montant à partir de la date", () => {
  const it = makeItem({ amount: 100, startDate: "2026-01-01", steps: [{ date: "2026-03", type: "set", value: 200 }] });
  assert.equal(api.amountAt(it, "2026-02"), 100);
  assert.equal(api.amountAt(it, "2026-06"), 200);
});
test("amountAt : palier pct applique un pourcentage", () => {
  const it = makeItem({ amount: 100, startDate: "2026-01-01", steps: [{ date: "2026-03", type: "pct", value: 10 }] });
  close(api.amountAt(it, "2026-06"), 110);
});
test("amountAt : croissance annuelle composée (3 %/an, +1 an)", () => {
  const it = makeItem({ amount: 100, growth: 3, startDate: "2026-01-01" });
  close(api.amountAt(it, "2027-06"), 103);
});
test("amountAt : croissance = inflation (défaut 2 %, ou param)", () => {
  const it = makeItem({ amount: 100, growth: "inf", startDate: "2026-01-01" });
  close(api.amountAt(it, "2027-06", null, 2), 102);
  close(api.amountAt(it, "2027-06", null, 5), 105);
});
test("amountAt : scénario sur dépense variable (min=optimiste, max=pessimiste)", () => {
  const v = makeItem({ kind: "expense", variable: true, min: 80, max: 120, startDate: "2026-01-01" });
  assert.equal(api.amountAt(v, "2026-06", "expected"), 100);
  assert.equal(api.amountAt(v, "2026-06", "optimistic"), 80);
  assert.equal(api.amountAt(v, "2026-06", "pessimistic"), 120);
});
test("amountAt : scénario sur revenu variable (max=optimiste, min=pessimiste)", () => {
  const v = makeItem({ kind: "income", variable: true, min: 80, max: 120, startDate: "2026-01-01" });
  assert.equal(api.amountAt(v, "2026-06", "optimistic"), 120);
  assert.equal(api.amountAt(v, "2026-06", "pessimistic"), 80);
});

/* ---------- crédits : loanPayment / loanMonths ---------- */
test("loanPayment : taux 0 % → principal / mois", () => {
  assert.equal(api.loanPayment(1200, 0, 12), 100);
});
test("loanPayment : cas d'or 100 000 € à 6 % sur 360 mois ≈ 599,55 €", () => {
  close(api.loanPayment(100000, 6, 360), 599.55, 0.01);
});
test("loanMonths : mensualité ≤ intérêts → Infinity", () => {
  assert.equal(api.loanMonths(100000, 6, 400), Infinity);
});
test("loanMonths : cohérent avec loanPayment (≈360)", () => {
  const pay = api.loanPayment(100000, 6, 360);
  assert.equal(api.loanMonths(100000, 6, pay), 360);
});

/* ---------- amortize : cas d'or vérifié au tableur ---------- */
test("amortize : taux 0 % → mensualités constantes, durée = principal/mensualité", () => {
  const rows = api.amortize({ principal: 1200, rate: 0, payment: 100, startDate: "2026-01-01" });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].ym, "2026-01");
  assert.equal(rows[11].ym, "2026-12");
  assert.equal(rows[0].interest, 0);
  assert.equal(rows[0].principal, 100);
  close(rows[11].balance, 0);
});
test("amortize : CAS D'OR — 100 000 € à 6 %, 1ʳᵉ ligne = tableur de référence", () => {
  // Tableur : intérêt mois 1 = 100000 × 0,5 % = 500,00 ; principal = 99,55 ; reste = 99 900,45
  const pay = api.loanPayment(100000, 6, 360);
  const rows = api.amortize({ principal: 100000, rate: 6, payment: pay, startDate: "2026-01-01" });
  assert.equal(rows.length, 360);
  close(rows[0].interest, 500, 0.01);
  close(rows[0].principal, 99.55, 0.01);
  close(rows[0].balance, 99900.45, 0.01);
  close(rows[rows.length - 1].balance, 0, 0.005);
  const sumP = rows.reduce((s, r) => s + r.principal, 0);
  close(sumP, 100000, 0.01);
});
test("amortize : mensualité trop faible (< intérêts) → tableau vidé", () => {
  const rows = api.amortize({ principal: 100000, rate: 6, payment: 400, startDate: "2026-01-01" });
  assert.equal(rows.length, 0);
});
test("amortize : remboursement anticipé (extra) raccourcit la durée", () => {
  const pay = api.loanPayment(100000, 6, 360);
  const base = api.amortize({ principal: 100000, rate: 6, payment: pay, startDate: "2026-01-01" });
  const fast = api.amortize({ principal: 100000, rate: 6, payment: pay, extra: 500, startDate: "2026-01-01" });
  assert.ok(fast.length < base.length, "extra doit réduire le nombre de mois");
  close(fast[fast.length - 1].balance, 0, 0.005);
});
test("debtPayoffYm : dernier mois du tableau", () => {
  assert.equal(api.debtPayoffYm({ principal: 1200, rate: 0, payment: 100, startDate: "2026-01-01" }), "2026-12");
});
