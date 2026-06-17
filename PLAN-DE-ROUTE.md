# Plan de route — Horizon Budget

> Fichier **vivant et auto-suivi**. Refondu le 2026-06-17 à partir de l'[audit produit/UX/engagement](AUDIT-2026-PRODUIT-UX.md) (croisement code réel × rapport marché juin 2026) et du reliquat de l'audit technique du 2026-06-16.
> Source de vérité unique pour l'état d'avancement entre les sessions Claude Code. Couvre les **deux axes** : fiabilité (confiance = robustesse) et produit/rétention.

---

## 🧭 PROTOCOLE (lire en premier, à chaque session)

Quand l'utilisateur dit « réfère-toi au plan de route et travaille en autonomie » :

1. **Lire** la section [⏯️ REPRENDRE ICI](#️-reprendre-ici) → l'unique source de vérité sur l'avancement.
2. **Lire** la [📋 Fiche contexte](#-fiche-contexte-projet) pour ne PAS re-explorer le repo (build, vérif, contraintes, fichiers clés).
3. Prendre la **prochaine tâche non terminée** dans l'ordre de priorité. Ne pas sauter une priorité sans raison explicite.
4. **Implémenter** en respectant les critères d'acceptation et les [⚖️ Règles de travail](#️-règles-de-travail-autonome).
5. **Vérifier** (syntaxe + build + comportement, voir fiche contexte). Une tâche n'est « terminée » que si la vérif passe.
6. **Mettre à jour CE fichier** avant de rendre la main : cocher la tâche, réécrire [⏯️ REPRENDRE ICI](#️-reprendre-ici), ajouter une ligne au [📓 Journal](#-journal-des-sessions).
7. Tâche partielle : statut `🚧 EN COURS`, noter dans REPRENDRE ICI **exactement** ce qui reste et où.

**Règle d'or :** la prochaine session doit pouvoir reprendre sans poser de question.

---

## ⏯️ REPRENDRE ICI

**État global :** 🟧 En cours — fondations techniques posées (P0 ✅), PR-1 (bilan mensuel) ✅, **PR-2 (notifications) ❌ ABANDONNÉ**. Sprint 2 fiabilité : T1-1 ✅, T1-2 ✅, T1-3 ✅. Sprint 2 terminé. Sprint 3 en cours : T2-1 ✅.

**Prochaine action :** Tâche **PR-3 — Verrou applicatif (biométrie / code)** (Sprint 3).

**Contexte pour démarrer :** T2-1 livré — `uid()` utilise `crypto.randomUUID()` (fallback `getRandomValues` 8 octets hex) dans `src/00-utils.js:5`. Prochaine (ordre sprint 3) : PR-3 verrou biométrie (M), PR-4 enveloppes (M), T2-2 PBKDF2 (M), T2-3 XSS audit (M). Voir section [Sprint 3](#-sprint-3--confiance--enveloppes).

**En suspens :** décisions stratégiques **PR-X (agrégation DSP2)** — ne rien coder sans arbitrage Tom (casse potentiellement le local-first).

---

## 📋 Fiche contexte projet

PWA budget, **100 % vanilla JS, zéro dépendance**, UI française, données en localStorage (`horizon-budget-v1`). Sérieuse, pas un jeu. Refonte « façon Bankin » livrée le 2026-06-16 (4 onglets + ⊕, accueil héros « reste à vivre »).

### Build & vérification
```bash
# Construire (concatène src/NN-*.js + styles.css → dist/ et docs/)
python3 build.py

# Vérifier la syntaxe JS de TOUS les modules d'un coup
cat src/[0-9][0-9]-*.js > /tmp/hb-all.js && node --check /tmp/hb-all.js

# Lancer la suite de tests du moteur financier (Node natif, zéro dépendance)
npm test          # = node --test tests/*.test.js   (37 tests verts au 2026-06-16)

# Vérif locale : .claude/launch.json lance `python3 -m http.server 8742`
#  → ouvrir /dist/horizon-budget.html
#  (onglet d'arrière-plan : rAF suspendu, graphiques semblent vides → un screenshot force le rendu)
```
**Ne PAS lancer `./deploy.sh`** (commit + push + GitHub Pages) sauf demande explicite.

### Architecture (l'essentiel)
- `build.py` assemble les `src/NN-*.js` dans l'ordre numérique = ordre de chargement (pas de modules ES, tout est global).
- Tout re-rend via `renderApp()` (`src/99-app.js`). `persist()` débounce 250 ms. Handler `beforeunload` re-sauvegarde State.
- Fichiers clés par sujet :
  - état/persistance : `src/02-store.js` · moteur projection : `src/04-engine.js` · récurrence + amortissement : `src/03-recur.js`
  - utilitaires (dates, monnaie, `el()`, `uid()`, `esc()`) : `src/00-utils.js` · graphiques SVG maison : `src/05-charts.js`
  - intelligence (catégorisation, récurrences, IA opt.) : `src/08-intel.js` · insights factuels : `src/09-insights.js`
  - accueil/héros : `src/11-dashboard.js` · suivi/transactions/import CSV : `src/15-tracking.js`
  - sync E2E Supabase (CRDT) : `src/30-sync.js` · coquille/navigation : `src/99-app.js` · onboarding : `src/10-onboarding.js`
  - template HTML (head, meta, PWA) : `src/template.html` · PWA déployée : `docs/` (`sw.js`, `manifest.webmanifest`)

### ⛔ Contraintes non négociables
- **Aucune dépendance npm** au runtime. Outils de dev : Node natif uniquement (`node --test`).
- **Pas de gamification** : ni streaks, ni confettis, ni toasts ludiques, ni cheerleading. Accompagnement **factuel chiffré** uniquement. Les leviers « jeu » du rapport sont traduits en équivalents sobres (bilan factuel).
- **Aucune notification ni rappel** (décision Tom, 2026-06-17) : ni notification système, ni push, ni Periodic Background Sync, ni e-mail, ni rappel incitant à revenir dans l'app. L'app ne sollicite jamais l'utilisateur ; elle n'apporte de la valeur que lorsqu'il l'ouvre de lui-même. Ne pas reproposer de « triggers de retour » (cf. PR-2 abandonné).
- **Vie privée d'abord** : rien ne sort de l'appareil sans action explicite. Sync chiffrée E2E ; le serveur ne voit qu'un blob. Clé IA locale, jamais synchronisée.
- **Mono-fichier** : app finale = un seul HTML autonome. Pas de CSP (script inline) → l'échappement (`esc()`) est l'unique défense XSS.
- Respecter le style existant (français, vanilla, `el()` pour le DOM, pas de framework). Ne pas re-densifier l'UI (acquis de la refonte).

---

## ⚖️ Règles de travail autonome

1. **Petits commits logiques** : une tâche = un commit. Message français, format conventionnel, finir par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commiter **seulement si autorisé** ; sinon laisser dans le working tree et le signaler.
2. **Toujours rebuild + vérif** avant de marquer fait. Vérif échoue → tâche reste `🚧 EN COURS`.
3. **Ne pas élargir le périmètre** d'une tâche. Découverte hors-sujet → [🧊 Backlog découvertes](#-backlog-découvertes).
4. **Préserver les données utilisateur** : toute migration de stockage rétrocompatible (lire l'ancien format).
5. **Doute sur un arbitrage produit** (ex. DSP2, mode couple) → ne pas décider seul, laisser en attente et le noter.
6. Mettre à jour ce fichier **en dernier**, juste avant de rendre la main.

---

## 🗺️ Backlog priorisé

Légende statut : `⬜ À FAIRE` · `🚧 EN COURS` · `✅ FAIT` · `⏸️ EN ATTENTE (décision utilisateur)`. Effort : S / M / L.

> Principe d'ordonnancement : la **confiance** du rapport repose d'abord sur la **robustesse** (axe T) ; la **rétention** repose sur la **boucle d'habitude** (axe PR). On entrelace : un gros levier produit (PR-1, PR-2) puis on solde la dette technique qui le sous-tend.

---

### 🔴 SPRINT 1 — Combler la boucle d'habitude (rétention)

#### PR-1 — Bilan mensuel factuel (« Month in Review ») `✅ FAIT` · M
- Récapitulatif déclenché au début du mois (et rejouable à la demande depuis Suivi) : dépensé vs prévu, top 3 catégories, plus grosse variation vs moyenne 3 mois, épargne dégagée, évolution du solde, **une phrase de cap** (objectif le plus proche, sinon projection 12 mois).
- **100 % factuel** : aucun « bravo », aucun confetti, ton des `Insights` actuels.
- Réutilise `realMonthByCat`, `plannedMonth`, `project`, `goalEta`. **Aucun nouveau moteur financier.**
- **Pourquoi :** le « moment waouh » récurrent (#5 du rapport) — rendez-vous sobre qui ramène l'utilisateur. Manquant auparavant.
- **Livré :** nouveau module `src/21-review.js` (`MonthReview {compute, open, maybeShow}`). Bouton « Bilan du mois » dans l'en-tête du Suivi (`15-tracking.js`, ouvre le bilan du mois affiché). Déclenchement **manuel uniquement** (auto-trigger `maybeShow` supprimé de `99-app.js` — décision Tom 2026-06-17 : l'app ne sollicite jamais l'utilisateur).
- **Vérif :** `node --check` OK, `python3 build.py` OK (26 modules), `npm test` OK. Vérif navigateur : compute correct (dépensé 1150/800, mover Alimentation +475 %, solde 600→1450), modale rend proprement en sombre/mobile, auto-trigger n'ouvre qu'une fois, zéro erreur console.

#### PR-2 — Triggers de retour (notifications factuelles, opt-in) `❌ ABANDONNÉ` · décision Tom
- **Décision produit définitive (2026-06-17, Tom) : aucune notification, aucun rappel, rien qui incite à revenir dans l'app.** Contrainte ajoutée aux [⛔ Contraintes non négociables](#-contraintes-non-négociables).
- Tâche développée puis **intégralement revertée** le même jour. Supprimé : `src/22-notify.js`, handlers `periodicsync`/`notificationclick` + cache notif (`assets/sw.js`), carte « 🔔 Rappels » (`20-settings.js`), défaut `settings.notif` (`02-store.js`), amorçage (`99-app.js`). Build revenu au hash `e88308deead1` (identique à pré-PR-2).
- **Ne pas reproposer de notifications/rappels/triggers de retour.** Le levier « rétention par Trigger » du rapport marché est écarté pour ce produit ; la rétention passe uniquement par la valeur consultée quand l'utilisateur ouvre l'app de lui-même.

---

### 🟠 SPRINT 2 — Fiabilité (dette technique = socle de confiance)

#### T1-1 — Stockage IndexedDB (fallback localStorage) `✅ FAIT` · M
- Migrer la persistance de `localStorage` vers IndexedDB (quota ~5-10 Mo → plafond réel avec des années de CSV).
- Rétrocompat : au 1er lancement, lire l'ancienne clé `horizon-budget-v1` et migrer. Gestion de quota réelle (pas juste un toast, `02-store.js:83`).
- **Critère :** données existantes migrées sans perte ; `persist()`/`loadState()` async-safe ; `beforeunload` cohérent.
- **Livré :** IDB helpers `_idbOpen/Read/Write` dans `02-store.js`. `loadState()` → `loadStateAsync()` (Promise). Migration automatique depuis `localStorage` au 1er lancement (puis suppression de l'ancienne clé). `persist()` écrit en IDB async avec fallback localStorage. `persistSync()` (appel `beforeunload`) toujours synchrone vers localStorage comme copie d'urgence. `99-app.js` init wrappé dans `.then()`. Quota réel IDB.
- **Vérif :** `node --check` OK, `python3 build.py` OK (26 modules), `npm test` 37 verts. Navigateur : IDB contient l'état correct après reload, app rend sans erreur.

#### T1-2 — Mémoïsation de `project()` `✅ FAIT` · S/M
- Cache par cycle de rendu : `project(b, opts)` appelé plusieurs fois par render (dashboard + `computeAlerts` + `Insights.compute` + `safeToSpend`). Invalider à chaque `persist()`/mutation (clé = `budgetId` + hash opts + compteur de version d'état).
- **Critère :** résultats identiques, appels réduits (compteur temporaire), aucun cache périmé après édition.

#### T1-3 — Sync : version logique + fusion fine des réglages `✅ FAIT` · M
- Remplacer `_rev = Date.now()` (`30-sync.js:56`) par un **compteur de Lamport** par appareil (immunisé à la dérive d'horloge). Fusionner `settings` **champ par champ** (aujourd'hui last-writer-wins sur l'objet entier, `30-sync.js:91`).
- **Critère :** test CRDT (2 répliques, champs différents → fusion garde les deux ; horloges désync → pas de perte systématique).

---

### 🟡 SPRINT 3 — Confiance & enveloppes

#### PR-3 — Verrou applicatif (biométrie / code) `⬜ À FAIRE` · M
- Verrouillage optionnel à l'ouverture : WebAuthn (Face ID/Touch ID) ou code local, délai de verrouillage configurable. Données financières aujourd'hui visibles sans barrière.
- Local uniquement, cohérent local-first. **Critère :** verrouillage après inactivité, déverrouillage biométrie/code, désactivable.

#### PR-4 — Renforcer le côté enveloppe (gap plan↔banque) `⬜ À FAIRE` · M
- Exposer un **« reste par enveloppe/catégorie »** en cours de mois (`plannedMonth` − `realMonthByCat`) + avertissement **avant** dépassement, pas seulement après.
- **Pourquoi :** se rapprocher de la vraie méthode enveloppe (forces #1 et #8 du rapport) sans casser l'hybride.
- **Critère :** par catégorie, reste affiché et alerte au franchissement d'un seuil paramétrable.

#### T2-1 — `uid()` cryptographique `✅ FAIT` · S
- Remplacer `Math.random().toString(36)…` (`00-utils.js:5`) par `crypto.randomUUID()` (fallback `getRandomValues` 8 octets hex si `randomUUID` indisponible). Anciens ids restent valides.
- **Pourquoi :** en fusion CRDT, une collision d'id corrompt le merge.
- **Livré :** `src/00-utils.js:5` — `uid()` rewritten. Vérif : `node --check` OK, `build.py` OK (26 modules), `npm test` 47 verts.

#### T2-2 — Durcissement crypto sync `⬜ À FAIRE` · M
- PBKDF2 150 000 → **600 000** itérations (`30-sync.js:135`, OWASP 2026). Migration : champ de version dans le payload chiffré pour déchiffrer l'ancien et ré-chiffrer au nouveau format. Documenter dans l'UI que **le code de salon EST la clé**.
- **Critère :** ancien salon toujours lisible (migration), nouveau salon en 600k, pas de blocage UI.

#### T2-3 — Passe XSS systématique `⬜ À FAIRE` · M
- Auditer chaque `html:`/`innerHTML` recevant du texte utilisateur (libellés, noms de postes/budgets/objectifs/catégories, notes) → confirmer `esc()` ou textNode.
- **Pourquoi :** mono-fichier inline, pas de CSP, l'échappement est l'unique défense.
- **Critère :** un libellé `<img src=x onerror=alert(1)>` s'affiche littéralement partout (liste, tooltips, modales, exports).

---

### 🟢 SPRINT 4 — Différenciation

#### PR-5 — Mode couple natif `⬜ À FAIRE` · L
- Au-dessus du salon de sync existant : marquage d'opérations *à moi / à toi / commun*, vues filtrées, répartition (3 totaux).
- **Pourquoi :** marché mal servi hors Monarch (#7). **Critère :** dans un budget partagé, ventiler par personne et voir les trois totaux.

#### PR-6 — Usage agentique élargi de l'IA `⬜ À FAIRE` · M
- L'IA opt-in ne sert qu'à l'import. L'étendre (toujours opt-in, clé locale) : résumer le bilan mensuel en langage naturel, répondre à « puis-je me permettre X ? » via `project`.
- **Garde-fou :** rien ne sort sans action explicite ; n'envoyer que l'agrégat nécessaire, jamais l'historique brut.

---

### ⏸️ Décisions stratégiques (hors sprint — arbitrage Tom requis)

#### PR-X — Agrégation bancaire DSP2 `⏸️ EN ATTENTE`
- LE différenciateur FR (Bankin'/Linxo/YNAB-Plaid) — mais casse potentiellement le local-first.
- Options : (a) rester pur local-first, assumer le CSV comme parti-pris vie privée (à valoriser en communication) ; (b) agrégation **optionnelle** via proxy minimal (GoCardless/Nordigen, Powens, Bridge) — les API DSP2 interdisent l'appel direct navigateur (CORS), donc un backend léger devient nécessaire.
- **Ne rien implémenter avant arbitrage explicite. Ne pas faire à moitié.**

---

## 🧊 Backlog découvertes

- `beforeunload` (`99-app.js:189`) réécrit tout State de façon synchrone à chaque fermeture → peut écraser une écriture sync concurrente + ralentit la fermeture (lié à T1-1/T1-3).
- Pas de conversion de devises : un budget est mono-devise, revenus multi-devises non gérés.
- Glassmorphism 2.0 quasi absent (3 `backdrop-filter`) — non prioritaire, l'UI est déjà conforme 2026.

---

## ✅ Déjà livré (historique)

- **2026-06-16** — Refonte « grande simplification » façon Bankin (commit 39233f2) : 4 onglets + ⊕, accueil héros, hubs Suivi/Avenir, perso = contenu pas layout.
- **2026-06-16** — **Harnais de tests** du moteur financier (commit 69c2203) : `tests/harness.js` (chargeur `vm` isolé), `recur.test.js`, `engine.test.js`. 37 tests verts, cas d'or amortissement (100 000 € / 6 % / 360 mois). Code de prod non modifié.
- **2026-06-16** — **Accessibilité de base** (commit 9b7b619) : pinch-zoom débloqué, `el()` auto `title`→`aria-label`, toasts `aria-live=polite`, modales focus trap + `role=dialog` + `aria-modal`, 21 boutons labellisés.

---

## 📓 Journal des sessions

> Une ligne par session. Format : `AAAA-MM-JJ — tâche — fait — fichiers — vérif — en suspens`.

- **2026-06-16** — Audit technique initial → plan de route (fiabilité). P0-1 (tests) et P0-2 (a11y) livrés.
- **2026-06-17** — **Audit produit/UX/engagement** (croisement code × rapport marché). Livré : [AUDIT-2026-PRODUIT-UX.md](AUDIT-2026-PRODUIT-UX.md). Plan de route **refondu** : fusion axe produit (PR-1→6, PR-X) + reliquat technique (T1-1→3, T2-1→3), P0 passé en historique. Prochaine : **PR-1**.
- **2026-06-17** — **PR-2 développé puis ❌ ABANDONNÉ le même jour.** Triggers de retour (notifications factuelles) implémentés (`src/22-notify.js`, handlers SW `periodicsync`/`notificationclick`, carte Réglages, défaut `settings.notif`, amorçage). **Décision Tom : aucune notification ni rappel, jamais.** Revert intégral : fichiers supprimés/restaurés, build revenu au hash `e88308deead1`, `npm test` 37 verts, working tree propre (seul `PLAN-DE-ROUTE.md` modifié). Contrainte « aucune notification ni rappel » ajoutée aux non-négociables. Prochaine : **T1-1 (IndexedDB)**.
- **2026-06-17** — **PR-1 ✅ LIVRÉ** Bilan mensuel factuel + **auto-trigger supprimé**. Fichiers : `src/21-review.js` (nouveau, 240 lignes), `src/99-app.js` (auto-trigger `maybeShow` supprimé — manuel seulement), `src/15-tracking.js` (bouton « Bilan du mois »), `PLAN-DE-ROUTE.md`, `AUDIT-2026-PRODUIT-UX.md`. Vérif : `node --check` + `build.py` + `npm test` (37 verts) OK, navigateur : aucune modale auto à l'ouverture, bouton Suivi fonctionnel. **Commit 656d1c7** initial + commit suivant suppression auto-trigger.
- **2026-06-17** — **T1-1 ✅ LIVRÉ** Stockage IndexedDB (fallback localStorage). Fichiers : `src/02-store.js` (helpers IDB, `loadStateAsync()`, `persistSync()`, migration auto), `src/99-app.js` (init `.then()`, `beforeunload` → `persistSync()`), `dist/`, `docs/`, `PLAN-DE-ROUTE.md`. Vérif : `node --check` + `build.py` OK (26 modules) + `npm test` 37 verts. Navigateur : IDB contient état, app rend sans erreur. Prochaine : **T1-2**.
- **2026-06-17** — **T1-2 ✅ LIVRÉ** Mémoïsation de `project()`. Fichiers : `src/04-engine.js` (`_projectCache` WeakMap, clé interne `_stateVersion|months|from|mode|inflation|startBalance`), `src/02-store.js` (`_stateVersion` + incrément dans `persist()`), `dist/`, `docs/`, `PLAN-DE-ROUTE.md`. Vérif : `node --check` + `build.py` OK (26 modules) + `npm test` 37 verts. Prochaine : **T1-3**.
- **2026-06-17** — **T2-1 ✅ LIVRÉ** `uid()` cryptographique. Fichier : `src/00-utils.js` (`crypto.randomUUID()` + fallback `getRandomValues`). Vérif : `node --check` + `build.py` OK + `npm test` 47 verts. Prochaine : **PR-3**.
- **2026-06-17** — **T1-3 ✅ LIVRÉ** Sync : Lamport + fusion settings champ par champ. Fichiers : `src/30-sync.js` (`STABLE_SKIP`, `DEVICE_LOCAL_SETTINGS`, `_prevSettingsSnap`, `stampChanges` Lamport+`_ts`, `_maxRevInDoc`, `mergeSettings`, `mergeArr` rétrocompat `_ts||_rev`, `applyDoc` simplifié+Lamport, Lamport update dans `pushNow`+`poll`), `src/02-store.js` (`State.sync.lamport`), `tests/sync.test.js` (10 tests CRDT), `dist/`, `docs/`, `PLAN-DE-ROUTE.md`. Vérif : `node --check` + `build.py` OK + `npm test` 47 verts. Prochaine : **T2-1**.
