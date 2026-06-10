# Horizon Budget

Application complète de création, projection et suivi de budgets. **Un seul fichier HTML**, qui fonctionne hors-ligne sur Mac, iPhone, Android et tout appareil doté d'un navigateur.

## 🚀 Utiliser l'application

Le fichier à utiliser et à partager : **`dist/horizon-budget.html`**

- **Mac / PC** : double-cliquez sur le fichier (il s'ouvre dans le navigateur).
- **iPhone / iPad** : envoyez-vous le fichier (AirDrop, mail), ouvrez-le dans Safari. Pour une vraie icône d'app : hébergez-le en ligne (voir plus bas) puis Partager → « Sur l'écran d'accueil ».
- **Android** : ouvrez le fichier dans Chrome, menu ⋮ → « Ajouter à l'écran d'accueil ».
- **Partager** : envoyez simplement le fichier `horizon-budget.html`. Il contient toute l'application — aucune installation, aucun compte.

### Hébergement (facultatif, pour l'installer comme une app)
Déposez `dist/horizon-budget.html` sur n'importe quel hébergeur statique (Netlify Drop, GitHub Pages…) et ouvrez l'URL depuis le téléphone.

## 🔒 Données

- Par défaut : 100 % locales (localStorage du navigateur). Rien n'est envoyé sur internet.
- **Réglages → Sauvegarde** : export JSON complet (sauvegarde), export d'un budget seul (partage), export CSV des transactions.

## ☁️ Synchronisation automatique multi-appareils

Optionnelle, gratuite, chiffrée de bout en bout :

- **Backend qui vous appartient** : une table dans un projet Supabase gratuit (guide pas-à-pas intégré dans l'app : Réglages → Synchronisation, ou onglet Aide).
- **Chiffrement E2E** : les données sont chiffrées (AES-256-GCM, clé dérivée du code de salon via PBKDF2) *avant* d'être envoyées. Le serveur ne stocke qu'un blob illisible.
- **Quasi temps réel** : envoi ~1 s après chaque modification, interrogation toutes les 4 s quand l'app est visible.
- **Fusion par enregistrement** : deux personnes peuvent saisir en même temps sans s'écraser ; les suppressions sont propagées (tombstones).
- **Familial** : même « code de salon » sur les appareils du foyer = budgets communs. Codes différents = données séparées.
- **Hors-ligne** : l'app fonctionne sans réseau ; tout se synchronise au retour de la connexion.

⚠️ Le code de salon est aussi la clé de chiffrement : conservez-le précieusement. Niveau gratuit Supabase : le projet se met en pause après ~1 semaine sans requête (un clic « Restore » dans le tableau de bord Supabase le relance).

## ✨ Fonctionnalités

- **Onboarding par profil** : étudiant, salarié, indépendant, famille, retraité, en transition, ou budget vierge — avec postes types préremplis.
- **Budget planifié** : revenus & dépenses, catégories/sous-catégories 100 % personnalisables, toutes fréquences (jour, semaine, quinzaine, mois, 2 mois, trimestre, semestre, an, ponctuel), jour d'échéance, dates de début/fin.
- **Évolutions dans le temps** : paliers programmés (« le loyer passe à 600 € en septembre »), croissance annuelle ou indexation sur l'inflation, postes variables avec fourchette min–max.
- **Événements de vie** : fin d'études, premier emploi (avec salaire estimé), déménagement, naissance, retraite… regroupent des changements de postes et apparaissent sur les projections.
- **Projections** : de 6 mois à 30 ans, solde + patrimoine net (épargne, intérêts composés, dettes), scénarios attendu/optimiste/pessimiste, tableau mois par mois, export CSV, impression PDF.
- **Calendrier budgétaire** : échéances jour par jour, solde quotidien projeté, alerte passage sous zéro.
- **Suivi réel** : saisie de transactions, comparaison prévu vs réel par catégorie, reste à dépenser, **import CSV de relevés bancaires** avec catégorisation automatique et détection de doublons.
- **Objectifs d'épargne** : montant cible, date limite, mensualité nécessaire calculée, date d'atteinte estimée.
- **Comptes épargne rémunérés** : taux, plafond, intérêts composés intégrés au patrimoine.
- **Crédits & dettes** : mensualité ou durée calculée, tableau d'amortissement, coût total des intérêts, remboursement anticipé, fin de crédit automatique dans les projections.
- **Multi-budgets & scénarios** : budgets illimités (perso, couple, projet…), duplication, variantes « scénario », comparaison côte à côte avec graphique superposé.
- **Personnalisation** : 15 devises, thème clair/sombre/auto, inflation réglable, alertes intelligentes (découvert prévu, objectif en retard, fonds d'urgence).

## 🛠️ Développement

```
src/            sources modulaires (CSS + 19 modules JS, vanilla, zéro dépendance)
build.py        assemble le tout en dist/horizon-budget.html
```

Modifier un fichier de `src/`, puis :

```bash
python3 build.py
```

## ⚠️ Avertissement

Les projections sont des estimations fondées sur vos hypothèses ; elles ne constituent pas un conseil financier.
