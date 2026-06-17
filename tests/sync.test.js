"use strict";
/* Tests CRDT de la couche sync (src/30-sync.js) — mergeDoc + mergeSettings. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* Charge 30-sync.js avec les stubs minimaux pour tester les fonctions pures de fusion.
 * On n'a besoin d'aucun DOM ni State : mergeDoc/mergeSettings n'y accèdent pas à l'appel. */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../src/30-sync.js"), "utf8"),
  sandbox, { filename: "30-sync.js" }
);
const { mergeDoc } = sandbox.window.Sync;

/* -------- helpers -------- */
function doc(settings, budgets, transactions, graveyard) {
  return { settings: settings || {}, budgets: budgets || [], transactions: transactions || [], graveyard: graveyard || {} };
}
function rec(id, rev, extra) { return Object.assign({ id, _rev: rev }, extra || {}); }

/* ---------- mergeDoc : records ---------- */
test("mergeDoc : record distant plus récent gagne (_rev plus élevé)", () => {
  const item = { id: "b1", _rev: 5, name: "Loyer" };
  const L = doc({}, [{ id: "b1", _rev: 3, name: "Loyer", categories: [], items: [rec("i1", 3, { name: "Vieux" })], debts: [], goals: [], accounts: [], events: [] }]);
  const R = doc({}, [{ id: "b1", _rev: 5, name: "Loyer", categories: [], items: [rec("i1", 7, { name: "Nouveau" })], debts: [], goals: [], accounts: [], events: [] }]);
  const merged = mergeDoc(L, R);
  assert.equal(merged.budgets[0].items[0].name, "Nouveau"); // R gagne (rev 7 > 3)
});

test("mergeDoc : record local plus récent gagne", () => {
  const L = doc({}, [{ id: "b1", _rev: 10, name: "B", categories: [], items: [rec("i1", 10, { name: "Local" })], debts: [], goals: [], accounts: [], events: [] }]);
  const R = doc({}, [{ id: "b1", _rev: 5,  name: "B", categories: [], items: [rec("i1", 2,  { name: "Distant" })], debts: [], goals: [], accounts: [], events: [] }]);
  const merged = mergeDoc(L, R);
  assert.equal(merged.budgets[0].items[0].name, "Local"); // L gagne (rev 10 > 2)
});

test("mergeDoc : records sans conflit — les deux conservés (catégories différentes)", () => {
  const shared = { id: "b1", _rev: 1, name: "B", categories: [], debts: [], goals: [], accounts: [], events: [] };
  const L = doc({}, [{ ...shared, items: [rec("i1", 3, { name: "A" })] }]);
  const R = doc({}, [{ ...shared, items: [rec("i2", 4, { name: "B" })] }]);
  const merged = mergeDoc(L, R);
  assert.equal(merged.budgets[0].items.length, 2); // les deux items conservés
});

test("mergeDoc : tombstone supprime un record si _ts/_rev antérieur", () => {
  const base = { id: "b1", _rev: 1, name: "B", categories: [], debts: [], goals: [], accounts: [], events: [] };
  // item i1 supprimé à t=100 dans L, présent à _ts=50 dans R
  const L = doc({}, [{ ...base, items: [] }], [], { "items:i1": 100 });
  const R = doc({}, [{ ...base, items: [Object.assign(rec("i1", 2), { _ts: 50 })] }]);
  const merged = mergeDoc(L, R);
  assert.equal(merged.budgets[0].items.length, 0); // supprimé car graveyard(100) >= _ts(50)
});

test("mergeDoc : record re-créé après suppression survit (graveyard < _ts)", () => {
  const base = { id: "b1", _rev: 1, name: "B", categories: [], debts: [], goals: [], accounts: [], events: [] };
  // i1 supprimé à t=50, puis re-créé à _ts=200
  const L = doc({}, [{ ...base, items: [Object.assign(rec("i1", 10), { _ts: 200 })] }], [], { "items:i1": 50 });
  const R = doc({}, [{ ...base, items: [] }]);
  const merged = mergeDoc(L, R);
  assert.equal(merged.budgets[0].items.length, 1); // re-créé survit (200 > 50)
});

/* ---------- mergeDoc : settings champ par champ ---------- */
test("mergeDoc : deux appareils éditent des champs différents — les deux conservés", () => {
  // L change inflation (revs.inflation=5), R change horizonMonths (revs.horizonMonths=8)
  const L_set = { inflation: 3.0, horizonMonths: 24, scenarioMode: "expected", _rev: 5, _revs: { inflation: 5 } };
  const R_set = { inflation: 2.0, horizonMonths: 36, scenarioMode: "expected", _rev: 8, _revs: { horizonMonths: 8 } };
  const merged = mergeDoc(doc(L_set), doc(R_set));
  assert.equal(merged.settings.inflation, 3.0);      // L gagne (revs.inflation 5 > 0)
  assert.equal(merged.settings.horizonMonths, 36);   // R gagne (revs.horizonMonths 8 > 0)
});

test("mergeDoc : settings — champ avec _revs plus élevé gagne en cas de conflit direct", () => {
  const L_set = { scenarioMode: "expected",   _rev: 3, _revs: { scenarioMode: 3 } };
  const R_set = { scenarioMode: "optimistic", _rev: 9, _revs: { scenarioMode: 9 } };
  const merged = mergeDoc(doc(L_set), doc(R_set));
  assert.equal(merged.settings.scenarioMode, "optimistic"); // R gagne (revs 9 > 3)
});

test("mergeDoc : settings — champ sans _revs de part et d'autre prend la valeur locale", () => {
  // Cas vieux format : aucun _revs, on replie sur la valeur locale (L)
  const L_set = { inflation: 3.0, _rev: 5 };
  const R_set = { inflation: 2.0, _rev: 8 };
  const merged = mergeDoc(doc(L_set), doc(R_set));
  // _revs manquants → les deux côtés ont rev=0 → ex-æquo → L (ordre de if) gagne
  assert.equal(merged.settings.inflation, 3.0);
});

test("mergeDoc : graveyard fusionné — max des deux côtés", () => {
  const L = doc({}, [], [], { "items:x": 100, "items:y": 50 });
  const R = doc({}, [], [], { "items:x": 80,  "items:z": 200 });
  const merged = mergeDoc(L, R);
  assert.equal(merged.graveyard["items:x"], 100); // max(100, 80)
  assert.equal(merged.graveyard["items:y"], 50);
  assert.equal(merged.graveyard["items:z"], 200);
});

test("mergeDoc : horloge décalée — Lamport garantit qu'un record récent ne perd pas", () => {
  // Appareil A (horloge correcte) : _rev=1000 (Lamport élevé après avoir vu les données B)
  // Appareil B (horloge décalée, Lamport bas) : _rev=50 → A doit gagner
  const base = { id: "b1", _rev: 1, name: "B", categories: [], debts: [], goals: [], accounts: [], events: [] };
  const A = doc({}, [{ ...base, items: [rec("i1", 1000, { name: "Correct" })] }]);
  const B = doc({}, [{ ...base, items: [rec("i1", 50,   { name: "Décalé"  })] }]);
  const merged = mergeDoc(A, B);
  assert.equal(merged.budgets[0].items[0].name, "Correct"); // Lamport 1000 > 50
});
