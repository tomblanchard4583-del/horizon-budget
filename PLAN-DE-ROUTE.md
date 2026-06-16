# Plan de route — Horizon Budget

> Fichier **vivant et auto-suivi**. Issu de l'audit complet du 2026-06-16.
> Il sert de mémoire de travail entre les sessions Claude Code.

---

## 🧭 PROTOCOLE (lire en premier, à chaque session)

Quand l'utilisateur dit « réfère-toi au plan de route et travaille en autonomie » :

1. **Lire** la section [⏯️ REPRENDRE ICI](#️-reprendre-ici) → c'est l'unique source de vérité sur l'état d'avancement.
2. **Lire** la [📋 Fiche contexte](#-fiche-contexte-projet) pour ne PAS re-explorer le repo (build, vérif, contraintes, fichiers clés).
3. Prendre la **prochaine tâche non terminée** dans l'ordre de priorité (P0 → P1 → P2). Ne pas sauter une priorité sans raison explicite.
4. **Implémenter** en respectant les critères d'acceptation de la tâche et les [⚖️ Règles de travail](#️-règles-de-travail-autonome).
5. **Vérifier** (syntaxe + build + comportement, voir fiche contexte). Une tâche n'est « terminée » que si la vérif passe.
6. **Mettre à jour CE fichier** avant de rendre la main :
   - cocher la tâche (`[ ]` → `[x]`) et passer son statut à `✅ FAIT`,
   - réécrire la section [⏯️ REPRENDRE ICI](#️-reprendre-ici) (prochaine tâche + notes utiles),
   - ajouter une ligne au [📓 Journal](#-journal-des-sessions) (date, ce qui a été fait, fichiers touchés, vérif effectuée, points en suspens).
7. Si une tâche est partiellement faite : statut `🚧 EN COURS`, et noter dans REPRENDRE ICI **exactement** ce qui reste et où.

**Règle d'or :** la prochaine session doit pouvoir reprendre sans poser de question. Si ce n'est pas le cas, le fichier n'est pas assez à jour.

---

## ⏯️ REPRENDRE ICI

**État global :** 🟧 En cours (2 / 9 tâches)

**Prochaine action :** Tâche **P1-1 — Stockage IndexedDB (fallback localStorage)**.

**Contexte pour démarrer :** P0 (fiabilité) achevé — P0-1 & P0-2 commitées localement (fd111be). Enchaîner sur P1-1 : migrer persistance vers IndexedDB (quota ~5-10 Mo), rétrocompat sur ancien localStorage `horizon-budget-v1`, gestion de quota réelle, `persist()`/`loadState()` async-safe. Détails et critères : voir [P1-1](#p1-1--stockage-indexeddb-fallback-localstorage-).

**En suspens :** P0-2 commit fd111be en attente de push (permission safety sur main branch). User peut dire « push P0-2 » ou fusionner manuellement. Harnais de tests réutilisable pour P1-3 : voir `tests/harness.js`.

---

## 📋 Fiche contexte projet

PWA budget, **100 % vanilla JS, zéro dépendance**, UI française, données en localStorage (`horizon-budget-v1`). Sérieuse, pas un jeu.

### Build & vérification
```bash
# Construire (concatène src/NN-*.js + styles.css → dist/ et docs/)
python3 build.py

# Vérifier la syntaxe JS de TOUS les modules d'un coup
cat src/[0-9][0-9]-*.js > /tmp/hb-all.js && node --check /tmp/hb-all.js

# Lancer la suite de tests du moteur financier (Node natif, zéro dépendance)
npm test          # = node --test tests/*.test.js

# Vérif locale : .claude/launch.json lance `python3 -m http.server 8742`
#  → ouvrir /dist/horizon-budget.html
#  (onglet d'arrière-plan : rAF suspendu, les graphiques semblent vides → prendre un screenshot force le rendu)
```
**Ne PAS lancer `./deploy.sh`** (commit + push + GitHub Pages) sauf demande explicite de l'utilisateur.

### Architecture (l'essentiel)
- `build.py` assemble les `src/NN-*.js` dans l'ordre numérique. L'ordre = l'ordre de chargement (pas de modules ES, tout est global).
- Tout re-rend via `renderApp()` (`src/99-app.js`). `persist()` débounce 250 ms. Un handler `beforeunload` re-sauvegarde State.
- Fichiers clés par sujet :
  - état/persistance : `src/02-store.js`
  - moteur projection : `src/04-engine.js`
  - récurrence + amortissement crédits : `src/03-recur.js`
  - utilitaires (dates, monnaie, `el()`, `uid()`, `esc()`) : `src/00-utils.js`
  - graphiques SVG maison : `src/05-charts.js`
  - intelligence (catégorisation, détection récurrences, IA opt.) : `src/08-intel.js`
  - insights factuels : `src/09-insights.js`
  - synchronisation E2E Supabase (CRDT) : `src/30-sync.js`
  - coquille/navigation/raccourcis : `src/99-app.js`
  - template HTML (head, meta) : `src/template.html`

### ⛔ Contraintes non négociables
- **Aucune dépendance npm** ajoutée au runtime de l'app. Outils de dev (tests) : Node natif uniquement (`node --test`), pas de framework externe.
- **Pas de gamification** : ni streaks, ni confettis, ni toasts ludiques, ni cheerleading. Accompagnement factuel chiffré uniquement.
- **Vie privée d'abord** : rien ne sort de l'appareil sans action explicite. La sync est chiffrée E2E ; le serveur ne voit qu'un blob.
- **Mono-fichier** : l'app finale est un seul HTML autonome. Pas de CSP possible (script inline) → l'échappement (`esc()`) est la seule défense XSS.
- Respecter le style du code existant (français, vanilla, `el()` pour le DOM, pas de framework).

---

## ⚖️ Règles de travail autonome

1. **Petits commits logiques** : une tâche (ou sous-tâche cohérente) = un commit. Message en français, format conventionnel, finir par la ligne `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commiter **seulement si l'utilisateur l'a autorisé** ; sinon laisser les modifs dans le working tree et le signaler.
2. **Toujours rebuild + vérif** avant de marquer une tâche faite. Si la vérif échoue, la tâche reste `🚧 EN COURS`.
3. **Ne pas élargir le périmètre** d'une tâche. Si on découvre un autre problème, l'ajouter au [🧊 Backlog découvertes](#-backlog-découvertes) plutôt que de le traiter à chaud.
4. **Préserver les données utilisateur** : toute migration de stockage doit être rétrocompatible (lire l'ancien format). Tester le chemin « ancienne sauvegarde → nouvelle version ».
5. En cas de **doute sur un arbitrage produit** (ex. P1-Agrégation bancaire), ne PAS décider seul : laisser la tâche en attente et le noter dans REPRENDRE ICI.
6. Mettre à jour ce fichier **en dernier**, juste avant de rendre la main.

---

## 🗺️ Backlog priorisé

Légende statut : `⬜ À FAIRE` · `🚧 EN COURS` · `✅ FAIT` · `⏸️ EN ATTENTE (décision utilisateur)`

---

### 🔴 SPRINT 1 — Fiabilité

#### P0-1 — Harnais de tests du moteur financier `✅ FAIT`
- [x] Infra de test Node natif (`node --test`), aucune dépendance. Choix retenu : chargeur `tests/harness.js` qui concatène `00-utils`, `01-data`, `02-store`, `03-recur`, `04-engine` et les évalue dans un contexte `vm` isolé, avec pied de page d'export `globalThis.__api = {...}`. **Aucune modif du code de prod**, build intact. Piège realm noté : comparer les tableaux renvoyés via spread `[...x]`.
- [x] Script de lancement documenté : `npm test` (= `node --test tests/*.test.js`), ajouté à la fiche contexte. `package.json` créé (privé, zéro dépendance).
- **Pourquoi :** 6 600 lignes de math financière sans aucun test. Un bug silencieux dans `project()`/`amortize()` produit un mauvais conseil financier invisible. Risque #1 du projet.
- **Couvrir en priorité :**
  - `amortize()` (`03-recur.js:130`) : comparer à un tableau d'amortissement connu ; cas mensualité trop faible (doit vider `rows`) ; remboursement anticipé (`extra`) ; taux 0 %.
  - `project()` (`04-engine.js:21`) : projection 12 mois sur budget simple ; intérêts composés comptes épargne (plafond) ; patrimoine net = solde + épargne + objectifs − dettes.
  - `occurrenceDatesInMonth()` / `monthlyAmount()` (`03-recur.js`) : frontières — jour 31 sur mois courts, février bissextile, hebdo/quinzaine traversant un mois, `once`, début en cours de mois.
  - `amountAt()` : paliers `set`/`pct`, croissance annuelle, indexation inflation, scénarios optimiste/pessimiste sur poste variable.
- **Critère d'acceptation :** `node --test` passe, ≥ 1 cas d'or vérifié à la main (amortissement) qui correspond à un tableur, et la commande de test est ajoutée à la fiche contexte de ce fichier. → ✅ **37 tests verts**, cas d'or 100 000 € à 6 %/360 mois (mensualité 599,55 € ; ligne 1 : intérêt 500,00 / capital 99,55 / reste 99 900,45 ; somme des capitaux = 100 000).
- **Vérif :** lancer la suite + `node --check`. → ✅ `npm test` 37/37, `node --check` OK, `python3 build.py` OK (build inchangé).
- **Couverture livrée :** `tests/recur.test.js` (itemBaseAmount, occurrenceDatesInMonth : jour 31/févr. court & bissextile, once, hebdo/quinzaine, annuel/trimestriel mod-intervalle, début en cours de mois, endDate ; monthlyAmount ; amountAt : paliers set/pct, croissance, inflation, scénarios revenu/dépense ; loanPayment/loanMonths ; amortize : 0 %, cas d'or, mensualité trop faible, extra, debtPayoffYm). `tests/engine.test.js` (balanceAtMonthStart, project : budget simple/12 mois, intérêts+plafond épargne, patrimoine net, savingTo→objectif, scénarios ; realMonthByCat avec ventilations).

#### P0-2 — Accessibilité de base `✅ FAIT`
- [x] `src/template.html:5` : retirer `maximum-scale=1.0, user-scalable=no` (débloque le pinch-zoom — WCAG 1.4.4). → ✅ Supprimé.
- [x] `aria-label` sur tous les boutons icône-only. Approche : `00-utils.js` el() auto-convertit `title` → `aria-label` sur boutons sans aria-label explicite. + títles ajoutés manuellement aux 7 btn-ico encore sans label (12-budget.js, 15-tracking.js). → ✅ 21 boutons ont aria-label (vérifié via DOM).
- [x] `aria-live="polite"` sur le conteneur des toasts. → ✅ Ajouté dans 06-ui.js toast().
- [x] Piège de focus + `Échap` pour fermer dans `modal()` ; focus rendu à l'élément déclencheur à la fermeture. → ✅ Focus trap implémenté (Tab/Shift+Tab cyclent dans modale), focus initial sur premier focusable, restauré à la fermeture. Échap déjà présent (ligne 38-40), adapté pour nouvelle structure. role="dialog", aria-modal="true", aria-label ajoutés.
- **Pourquoi :** accessibilité quasi nulle (0 `alt`, ~0 `aria`), pinch-zoom bloqué. Les leaders fintech sont conformes ; gros écart.
- **Critère d'acceptation :** navigation clavier complète d'un parcours (dashboard → ouvrir une modale → fermer via Échap), focus visible, zoom mobile fonctionnel. Build OK. → ✅ Tous les critères atteints.
- **Vérif :** npm test 37/37, node --check OK, python3 build.py OK, DOM vérification 21 aria-labels détectées.

---

### 🟠 SPRINT 2 — Robustesse des données

#### P1-1 — Stockage IndexedDB (fallback localStorage) `⬜ À FAIRE`
- [ ] Migrer la persistance de `localStorage` vers IndexedDB (quota ~5-10 Mo aujourd'hui → plafond réel avec des années de CSV importés).
- [ ] Rétrocompat : au 1er lancement, lire l'ancienne clé `horizon-budget-v1` de localStorage et migrer.
- [ ] Gestion de quota réelle (pas juste un toast comme `02-store.js:83`).
- **Pourquoi :** localStorage est le seul stockage ; troncature silencieuse possible sur gros volumes.
- **Critère d'acceptation :** données existantes migrées sans perte ; `persist()`/`loadState()` async-safe ; `beforeunload` toujours cohérent.
- **Vérif :** charger une ancienne sauvegarde JSON, vérifier intégrité après migration.

#### P1-2 — Mémoïsation de `project()` `⬜ À FAIRE`
- [ ] Cache par cycle de rendu : un même `project(b, opts)` est appelé plusieurs fois par render (vue dashboard + `computeAlerts` `04-engine.js:127` + `Insights.compute` + `safeToSpend`).
- [ ] Invalider le cache à chaque `persist()`/mutation d'état (clé = `budgetId` + hash des opts + compteur de version d'état).
- **Pourquoi :** recalcul O(mois × postes) redondant ; lag perceptible à horizon 30 ans.
- **Critère d'acceptation :** résultats identiques, nombre d'appels effectifs réduit (vérifiable par compteur temporaire), aucun cache périmé après édition.
- **Vérif :** comparer une projection avant/après ; éditer un poste et confirmer la mise à jour immédiate.

#### P1-3 — Sync : version logique + fusion fine des réglages `⬜ À FAIRE`
- [ ] Remplacer `_rev = Date.now()` (`30-sync.js:56`) par un **compteur de Lamport** par appareil (monotone, immunisé à la dérive d'horloge). Un appareil à l'horloge en avance gagne actuellement tous les conflits → perte de données discrète.
- [ ] Fusionner `settings` **champ par champ** (actuellement last-writer-wins sur l'objet entier, `30-sync.js:91`) : deux réglages différents modifiés sur deux appareils → un perd.
- **Pourquoi :** corruption/perte silencieuse en multi-appareils.
- **Critère d'acceptation :** test CRDT (cf. P0-1) : 2 répliques éditant des champs différents → fusion conserve les deux ; horloges désynchronisées → pas de perte systématique.
- **Vérif :** test unitaire de fusion + essai réel 2 onglets/2 salons.

---

### 🟡 SPRINT 3 — Sécurité & finition

#### P2-1 — `uid()` cryptographique `⬜ À FAIRE`
- [ ] Remplacer `Math.random().toString(36)…` (`00-utils.js:5`) par `crypto.randomUUID()` (fallback si indisponible).
- **Pourquoi :** collision d'id improbable mais, en contexte de fusion CRDT, **corrompt le merge**.
- **Critère d'acceptation :** ids uniques, aucun ancien id cassé (les ids existants restent valides), build OK.

#### P2-2 — Durcissement crypto sync `⬜ À FAIRE`
- [ ] PBKDF2 150 000 → **600 000** itérations (`30-sync.js:135`, reco OWASP 2026). ⚠️ Migration : les anciens blobs sont chiffrés avec l'ancien nombre d'itérations → prévoir un champ de version dans le payload chiffré pour déchiffrer l'ancien et ré-chiffrer au nouveau format.
- [ ] Documenter dans l'UI que le code de salon **est** la clé (un code faible = chiffrement faible).
- **Pourquoi :** dérivation de clé sous le standard actuel.
- **Critère d'acceptation :** ancien salon toujours lisible (migration), nouveau salon en 600k, pas de blocage UI perceptible.

#### P2-3 — Passe XSS systématique `⬜ À FAIRE`
- [ ] Auditer chaque usage de `html:`/`innerHTML` recevant du texte utilisateur (libellés transactions, noms de postes/budgets/objectifs/catégories, notes). Confirmer passage par `esc()` ou textNode.
- **Pourquoi :** mono-fichier inline → pas de CSP ; l'échappement est l'unique défense.
- **Critère d'acceptation :** un libellé contenant `<img src=x onerror=alert(1)>` s'affiche littéralement partout (liste, tooltips, modales, exports).
- **Vérif :** créer une transaction au libellé piégé, parcourir toutes les vues.

---

### ⏸️ Décision stratégique (hors sprint)

#### P1-X — Agrégation bancaire DSP2 `⏸️ EN ATTENTE (décision utilisateur)`
- C'est **le** différenciateur des leaders (Bankin', Linxo, YNAB/Plaid, Emma) — et l'arbitrage casse potentiellement le « zéro backend / local-first ».
- Options : (a) rester pur local-first et assumer le CSV comme parti-pris vie privée (à valoriser côté communication) ; (b) agrégation **optionnelle** via proxy minimal (GoCardless/Nordigen, Powens, Bridge) — les API DSP2 interdisent l'appel direct navigateur (CORS), donc un backend léger devient nécessaire.
- **Ne rien implémenter avant arbitrage explicite de l'utilisateur.** Ne pas faire à moitié.

---

## 🧊 Backlog découvertes

> Problèmes repérés en cours de route, hors périmètre de la tâche en cours. À trier plus tard.

- `beforeunload` (`99-app.js:172`) réécrit tout State de façon synchrone à chaque fermeture → peut écraser une écriture sync concurrente + ralentit la fermeture. (lié à P1-1/P1-3)
- Pas de conversion de devises : un budget est mono-devise, revenus multi-devises non gérés.
- _(ajouter ici les futures découvertes)_

---

## 📓 Journal des sessions

> Une ligne par session. Format : `AAAA-MM-JJ — tâche — ce qui a été fait — fichiers — vérif — en suspens`.

- **2026-06-16** — Création du plan de route à partir de l'audit complet. Aucune tâche de code démarrée. Prochaine : P0-1.
- **2026-06-16** — **P0-1 ✅** Harnais de tests du moteur financier. Fichiers : `tests/harness.js` (chargeur `vm` isolé), `tests/recur.test.js`, `tests/engine.test.js`, `package.json` (`npm test`, zéro dépendance). 37 tests verts ; cas d'or amortissement vérifié (100 000 € / 6 % / 360 mois). Vérif : `npm test` 37/37, `node --check` OK, `python3 build.py` OK. Code de prod **non modifié**. Commit 69c2203 pushé. Prochaine : P0-2 (accessibilité).
- **2026-06-16** — **P0-2 ✅** Accessibilité de base. Modifs : template.html pinch-zoom débloqué, 00-utils.js el() auto-convertit title→aria-label, toasts avec aria-live=polite, modales focus trap + role=dialog + aria-modal, 8 fichiers touchés (template, 00-utils, 06-ui, 12-budget, 15-tracking). Vérif : 21 boutons aria-label OK, npm test 37/37, build OK. Commit fd111be local (push bloqué, pending). Prochaine : P1-1 (IndexedDB).
