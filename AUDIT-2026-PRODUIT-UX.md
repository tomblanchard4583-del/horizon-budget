# Audit produit / UX / engagement — Horizon Budget

> Réalisé le 2026-06-17. Croise l'état réel du code avec le rapport *« Apps de budget, design & engagement »* (juin 2026).
> Complète le [PLAN-DE-ROUTE.md](PLAN-DE-ROUTE.md) (axe fiabilité/technique) sur l'axe **produit / UX / rétention**.

---

## 0. Méthode

Lecture du code source (`src/00`→`99`), pas de la doc. Chaque constat ci-dessous est vérifié dans le code. La grille d'analyse est celle du rapport : positionnement marché, tendances UX 2026, mécaniques d'engagement des apps « rébarbatives », et les 10 implications actionnables.

Contrainte cadre rappelée : **pas de gamification** (décision Tom, voir mémoire). Toute reco ci-dessous respecte ça — les leviers « jeu » du rapport (streak, récompense variable, mascotte culpabilisante) sont volontairement **traduits en équivalents factuels** ou écartés.

---

## 1. Positionnement marché — où se situe Horizon

| Axe du rapport | Le marché | Horizon Budget | Verdict |
|---|---|---|---|
| Budget actif (enveloppes) vs tracking passif | 2 camps opposés | **Hybride** : budget planifié (postes, fréquences) **+** suivi réel (transactions, import CSV, prévu vs réel) + **ventilation par enveloppe** (`tx.splits`) | ✅ rare — tient les deux bouts |
| Gap plan ↔ banque | « l'app constate, n'empêche pas » | Constate (prévu vs réel) ; le héros **« reste à vivre / jour »** s'approche du réflexe enveloppe sans le fermer | 🟧 comme le marché — fermable côté enveloppe |
| Forward-looking (projection, FIRE) | **trou du marché** (#5) | **Projection 30 ans**, scénarios optimiste/pessimiste, événements de vie, amortissement crédits, patrimoine net | ✅ **différenciateur fort** |
| Clarté de l'état financier | levier rétention finance #2 | Héros unique + mini-courbe + solde fin de mois + insights factuels | ✅ |
| Agrégation bancaire DSP2 | LE différenciateur FR (Bankin'/Linxo) | Absente — import CSV manuel | ❌ (décision en attente, P1-X) |
| Vie privée / local-first | entre-deux mal servi | **100 % local**, sync E2E chiffrée, zéro compte/pub | ✅ **argument de positionnement** (façon Copilot « on est de ton côté », Plan&Multiply) |
| Mode couple | mal servi hors Monarch | Budget commun via **salon de sync partagé**, mais pas de vue *yours/mine/ours* | 🟧 partiel |

**Lecture :** Horizon occupe précisément deux trous cités par le rapport — **forward-looking** et **enveloppes + design FR + vie privée**. Ce sont des forces à *assumer et valoriser*, pas à diluer. Le manque dur est l'agrégation DSP2 (arbitrage stratégique, pas un simple dev).

---

## 2. Tendances UX/UI 2026 — conformité

| Tendance | État dans le code | Verdict |
|---|---|---|
| Minimalisme stratégique (charge cognitive) | Refonte « façon Bankin » : 4 onglets + ⊕, accueil héros, cartes calmes, une analyse à la fois | ✅ |
| Dark mode | `applyTheme()` light/dark/auto + `theme-color` adaptatif | ✅ |
| Micro-interactions | `Juice` : count-up `.k-value`, jauges animées, haptique légère, respect `prefers-reduced-motion` | ✅ (volontairement sobre) |
| Thumb zone / mobile | Barre du bas 2 onglets + FAB central + 2 onglets, cibles ≥44px | ✅ |
| Glassmorphism 2.0 | 3 usages `backdrop-filter` seulement | 🟢 optionnel, non prioritaire |
| Onboarding rapide | 4 étapes, préremplissage par situation | ✅ |
| Passwordless / biométrie | **Aucun verrou app** (ni Face ID, ni PIN, ni WebAuthn) | ❌ **trou confiance** |
| Personnalisation prédictive | `Insights.compute` : rythme dépenses, point bas trésorerie, anomalies marchand, catégories en dérive, capacité d'épargne, postes dormants | ✅ **fort** |
| Agentic UX (l'app agit pour toi) | IA opt-in **uniquement** sur la catégorisation d'import (Claude Haiku / Gemini), n'envoie que les libellés inconnus | 🟧 limité à un usage |
| Zero-UI / conversationnel | Absent | 🟢 non prioritaire |

**Lecture :** côté *visuel et structurel*, Horizon est à jour pour 2026. Les deux écarts réels sont **(a) le verrou applicatif** (sécurité = confiance = métrique business selon le rapport) et **(b) le potentiel agentique sous-exploité** (l'IA ne sert qu'à l'import).

---

## 3. Mécaniques d'engagement — la boucle d'habitude

Le rapport est explicite : les apps utilitaires gagnent par **friction minimale + automatisation + clarté + confiance**, et empruntent au jeu *juste assez*. Boucle Hooked : **Trigger → Action → Récompense → Investissement**.

| Maillon | État Horizon | Verdict |
|---|---|---|
| **Trigger** (déclencheur de retour) | **Aucun** — PWA installable/offline (`sw.js`, manifest) mais **zéro notification/push** | ❌ **maillon manquant n°1** |
| **Action** (faible friction, <30 s) | Ajout transaction avec **prédiction live** (catégorie + montant habituel) ; import CSV en lot | ✅ |
| **Récompense** | Pas de récompense variable (anti-gamif assumé) ; reconnaissance factuelle via insights | 🟧 par choix |
| **Investissement** | `Intel.learn` : chaque confirmation affine la catégorisation (auto après 2 confirmations), mémoire de ventilation, mapping CSV mémorisé par banque | ✅ **excellent loop d'investissement** |
| Automatisation transparente & ajustable | Auto-cat, détection de récurrences, suggestions toujours « Appliquer / Ignorer » | ✅ |
| Action quotidienne < 5 min | Catégorisation rapide + prédiction | ✅ |
| **Month/Week in Review** (le « moment waouh » #5) | **Absent** | ❌ **opportunité haute, compatible anti-gamif** |
| Streak doux + freeze | Retiré volontairement (anti-gamif) | ⛔ écarté — substitut factuel possible |
| Confiance / sécurité invisible | Local-first ✅, E2E ✅, transparence IA ✅ — **mais pas de verrou app** | 🟧 |
| Notifications adaptatives | Absentes | ❌ |

**Lecture :** la boucle d'habitude d'Horizon est **amputée du Trigger**. L'app est excellente quand on l'ouvre (action + investissement solides) mais **rien ne ramène l'utilisateur**. C'est, d'après le rapport, la cause n°1 d'abandon au premier mois. Deux leviers compatibles avec « pas de gamification » comblent l'essentiel : **le bilan récurrent** (récompense factuelle) et **les notifications factuelles** (trigger sobre, jamais culpabilisant).

---

## 4. Scorecard des 10 implications actionnables du rapport

1. Camp méthode + fermer le gap plan↔banque — 🟧 hybride, gap non fermé
2. Action quotidienne < 30 s — ✅
3. Streak doux + freeze obligatoire — ⛔ écarté (anti-gamif) → substitut factuel
4. Automatiser + transparent/ajustable — ✅ bien fait
5. **Month/Week in Review** — ❌ **manque** (priorité)
6. Dark mode + micro-interactions + cross-device — ✅ (dark ✅, micro ✅, sync E2E ✅)
7. **Mode couple natif** — 🟧 partiel (salon partagé, pas de vue yours/mine/ours)
8. France : enveloppes + DSP2 + design FR — 🟧 (design ✅, enveloppes partiel, DSP2 ❌)
9. **Notifications personnifiées/adaptatives** — ❌ aucune notif
10. **Confiance d'abord, sécurité invisible** — 🟧 (local-first ✅, verrou app ❌)

**Bilan : 4 ✅ · 4 🟧 · 2 ❌ · 1 ⛔ (par décision).**

---

## 5. Forces à conserver et à valoriser

- **Projection long terme** (30 ans, scénarios, événements) — différenciateur que peu d'apps offrent. À mettre en avant dans la communication et l'onboarding.
- **Insights factuels prédictifs** — déjà de la « personnalisation prédictive » sans gamification. C'est l'identité produit.
- **Local-first + E2E + zéro pub/compte** — argument de confiance directement aligné sur le positionnement gagnant du rapport (Copilot « on est de ton côté »).
- **Boucle d'investissement (apprentissage)** — la catégorisation qui s'améliore crée de la valeur de rétention propre.
- **Design 2026 conforme** — ne pas y retoucher pour la mode (glassmorphism, etc.).

---

## 6. Plan d'action priorisé (axe produit/UX)

> Légende : `⬜ À FAIRE` · `🚧` · `✅` · `⏸️ décision`. Effort : S/M/L. Tout respecte **pas de gamification**.

### 🔴 SPRINT P — Combler la boucle d'habitude (impact rétention max)

#### PR-1 — Bilan mensuel factuel (« Month in Review ») `⬜` · effort M
- Écran/modale récapitulatif déclenché en début de mois (et accessible à la demande) : total dépensé vs prévu, top 3 catégories, plus grosse variation, épargne dégagée, évolution du solde, **une phrase de cap** (ex. « à ce rythme, objectif X atteint vers … »).
- **100 % factuel** : aucun « bravo », aucun confetti. Ton des `Insights` actuels.
- Réutilise `realMonthByCat`, `Insights`, `project`. Pas de nouveau moteur.
- **Critère :** au 1er du mois budgétaire, un bilan du mois écoulé s'affiche une fois ; rejouable depuis Suivi.

#### PR-2 — Triggers de retour (notifications factuelles, opt-in) `⬜` · effort M/L
- Notifications **locales sobres**, jamais culpabilisantes : « 3 échéances cette semaine », « relevé du mois à importer », « point bas de trésorerie prévu le … ». Source = `Insights`/`computeAlerts` déjà existants.
- Opt-in explicite (réglage), Notification API + Periodic Background Sync où dispo ; fallback : rappel à l'ouverture.
- **Aucune notif « motivante »** (proscrit par la décision anti-gamif). Uniquement des faits actionnables.
- **Critère :** l'utilisateur active depuis Réglages, choisit la fréquence, reçoit une notif factuelle, peut tout couper.

### 🟠 SPRINT Q — Confiance & enveloppes

#### PR-3 — Verrou applicatif (biométrie / code) `⬜` · effort M
- Verrouillage optionnel à l'ouverture : WebAuthn (Face ID/Touch ID) ou code local, avec délai de verrouillage configurable. Données financières sensibles aujourd'hui visibles sans barrière.
- Local uniquement, cohérent avec local-first. **Critère :** app verrouillée après inactivité ; déverrouillage biométrie/code ; option désactivable.

#### PR-4 — Renforcer le côté enveloppe (fermer le gap plan↔banque) `⬜` · effort M
- Exposer un **« reste par enveloppe/catégorie »** en cours de mois (déjà calculable via `plannedMonth` − `realMonthByCat`) et un avertissement *avant* dépassement, pas seulement après.
- Le héros « reste à vivre » est l'amorce ; étendre au niveau catégorie = se rapprocher de la vraie méthode enveloppe (force du rapport #1, #8).

### 🟡 SPRINT R — Différenciation

#### PR-5 — Mode couple natif `⬜` · effort L
- Au-dessus du salon de sync existant : marquage d'opérations *à moi / à toi / commun*, vues filtrées, répartition. Marché mal servi hors Monarch (rapport #7).
- **Critère :** dans un budget partagé, ventiler les dépenses par personne et voir trois totaux.

#### PR-6 — Étendre l'usage agentique de l'IA `⬜` · effort M
- L'IA opt-in ne sert qu'à l'import. L'étendre (toujours opt-in, toujours local-key) à : résumer le bilan mensuel en langage naturel, répondre à « puis-je me permettre X ? » via `project`. **Garde-fou :** rien ne sort de l'appareil sans action explicite ; n'envoyer que l'agrégat nécessaire, jamais l'historique brut.

### ⏸️ Décision stratégique

#### PR-X — Agrégation bancaire DSP2 `⏸️`
- Identique à [PLAN-DE-ROUTE.md › P1-X](PLAN-DE-ROUTE.md). C'est LE différenciateur FR mais ça casse potentiellement le local-first (proxy backend nécessaire, CORS DSP2). **Ne rien faire sans arbitrage Tom.**

---

## 7. Articulation avec le plan technique existant

Le [PLAN-DE-ROUTE.md](PLAN-DE-ROUTE.md) (fiabilité) reste prioritaire : **la confiance dont parle le rapport repose d'abord sur la robustesse**. En particulier **P2-2 (durcissement crypto sync)** et **P2-3 (passe XSS)** sont des prérequis de l'argument « confiance d'abord » (#10). Ordre conseillé : finir P0/P1 technique → PR-1 et PR-2 (rétention) → PR-3 (confiance) → reste.

---

## 8. Ce qu'il ne faut PAS faire (gardes-fous)

- Pas de streak/badges/confettis/mascotte culpabilisante — décision tranchée, le rapport lui-même prévient que la finance ne doit pas devenir un jeu.
- Pas de notifications « motivantes » ou anxiogènes — uniquement des faits actionnables.
- Ne pas sacrifier le local-first pour rattraper l'agrégation sans arbitrage explicite.
- Ne pas re-densifier l'UI : la simplification de juin 2026 est un acquis aligné sur le minimalisme 2026.
