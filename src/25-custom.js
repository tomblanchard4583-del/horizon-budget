"use strict";
/* ============ Custom : rendu en disposition fixe + actions d'ajout rapide ============
   La personnalisation de mise en page (glisser-déposer, masquage, densité, couleur,
   slots de nav…) a été retirée lors de la refonte « grande simplification » : la
   disposition est désormais soignée et identique pour tous. Ce module ne garde que
   - renderInto : rend une liste de blocs dans l'ordre fourni (pass-through) ;
   - quick      : les actions du bouton « + » (ajout rapide).
   La personnalisation du CONTENU (catégories de revenus/dépenses) vit dans le Budget
   et les Réglages, pas ici. ============ */
const Custom = (() => {
  const QUICK = [
    { id: "tx", emoji: "🧾", label: "Transaction réelle (dépense / revenu du jour)", run: (b, close) => { close(); openTxEditor(b, null); } },
    { id: "expense", emoji: "📉", label: "Dépense planifiée (récurrente ou ponctuelle)", run: (b, close) => { close(); openItemEditor(b, newItem("expense"), true); } },
    { id: "income", emoji: "📈", label: "Revenu planifié", run: (b, close) => { close(); openItemEditor(b, newItem("income"), true); } },
    { id: "goal", emoji: "🎯", label: "Objectif d'épargne", run: (b, close) => { close(); openGoalEditor(b, null); } },
    { id: "event", emoji: "🧭", label: "Événement de vie", run: (b, close) => { close(); openEventEditor(b, null); } },
  ];

  // Garantit l'existence de l'objet (compat : d'anciennes sauvegardes peuvent contenir
  // des champs de personnalisation désormais ignorés — on n'y touche pas).
  function ensure() { return State.settings.custom || (State.settings.custom = {}); }
  function apply() {} // plus de densité/couleur d'accent : disposition fixe

  /* Rend une liste de blocs { id, node, span? } dans l'ordre donné. */
  function renderInto(container, scope, items) {
    (items || []).forEach(it => {
      if (!it || !it.node) return;
      if (it.span) it.node.classList.add("dz-" + it.span);
      container.append(it.node);
    });
  }

  return { ensure, apply, renderInto, quick: () => QUICK, get: ensure };
})();
