"use strict";
/* ============ composants UI : modales, toasts, champs ============ */

function toast(msg, opts) {
  opts = opts || {};
  let wrap = $(".toasts");
  if (!wrap) { wrap = el("div", { class: "toasts", "aria-live": "polite", "aria-atomic": "true" }); document.body.append(wrap); }
  const t = el("div", { class: "toast" }, el("span", {}, msg));
  if (opts.action) {
    t.append(el("button", { onclick: () => { opts.onAction && opts.onAction(); t.remove(); } }, opts.action));
  }
  wrap.append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 350); }, opts.ms || 3200);
}

let _openModals = [];
let _focusedBefore = null;
function modal(opts) {
  const veil = el("div", { class: "modal-veil" });
  const head = el("div", { class: "modal-head" },
    el("h3", {}, opts.title || ""),
    el("button", { class: "btn btn-ghost btn-ico", title: "Fermer", html: ico("x", 19), onclick: close })
  );
  const body = el("div", { class: "modal-body" });
  if (opts.body) body.append(...[].concat(opts.body));
  const m = el("div", { class: "modal" + (opts.lg ? " modal-lg" : "") }, head, body);
  if (opts.foot) m.append(el("div", { class: "modal-foot" }, ...[].concat(opts.foot)));
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-modal", "true");
  if (opts.title) m.setAttribute("aria-label", opts.title);
  veil.append(m);
  veil.addEventListener("mousedown", e => { if (e.target === veil) close(); });
  document.body.append(veil);
  // piège de focus : sauvegarde l'élément focus avant, redirige dans la modale, restaure après fermeture
  _focusedBefore = document.activeElement;
  const focusables = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
  const inModal = m.querySelectorAll(focusables);
  const first = inModal[0], last = inModal[inModal.length - 1];
  const trapTab = e => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  m.addEventListener("keydown", trapTab);
  // Focus initial : le premier champ (ou action) utile — jamais le bouton ✕ de l'en-tête,
  // pour qu'on puisse saisir le montant/nom directement, comme dans un éditeur natif.
  const autoFocus =
    m.querySelector(".modal-body input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .modal-body select, .modal-body textarea")
    || m.querySelector(".modal-body button, .modal-foot button");
  (autoFocus || first || m).focus();

  // Glisser pour fermer (feuille mobile) : tire la feuille vers le bas, lâche au-delà du seuil pour fermer.
  // La poignée (en-tête) déclenche toujours ; ailleurs, seulement si le contenu est déjà en haut.
  if (window.matchMedia("(max-width: 620px)").matches) {
    head.style.touchAction = "none";
    let sy = 0, dy = 0, drag = false, fromHead = false;
    m.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      fromHead = head.contains(e.target);
      if (!fromHead && body.scrollTop > 0) return;
      drag = true; sy = e.clientY; dy = 0;
      m.style.transition = "none";
      try { m.setPointerCapture(e.pointerId); } catch (_) {}
    });
    m.addEventListener("pointermove", e => {
      if (!drag) return;
      dy = e.clientY - sy;
      if (!fromHead && dy < 0) { drag = false; m.style.transform = ""; return; } // remonte → rend le scroll natif
      m.style.transform = `translateY(${Math.max(0, dy < 0 ? dy * 0.25 : dy)}px)`;
      if (dy > 0) e.preventDefault();
    });
    const settle = () => {
      if (!drag) return; drag = false;
      m.style.transition = "transform .3s cubic-bezier(.22,1,.36,1)";
      if (dy > 110) { m.style.transform = "translateY(100%)"; setTimeout(close, 230); }
      else m.style.transform = "";
    };
    m.addEventListener("pointerup", settle);
    m.addEventListener("pointercancel", settle);
  }

  _openModals.push({ close, trapTab, m });
  function close() {
    m.removeEventListener("keydown", trapTab);
    veil.remove();
    _openModals = _openModals.filter(x => x.close !== close);
    if (_focusedBefore) _focusedBefore.focus();
    opts.onClose && opts.onClose();
  }
  return { close, body, root: m };
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && _openModals.length) _openModals[_openModals.length - 1].close();
});

function confirmDialog(opts) {
  const m = modal({
    title: opts.title || "Confirmer",
    body: el("p", { class: "muted", style: "padding:4px 0 8px" }, opts.body || ""),
    foot: [
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Annuler"),
      el("button", {
        class: "btn " + (opts.danger ? "btn-danger" : "btn-p"),
        onclick: () => { m.close(); opts.onOk && opts.onOk(); }
      }, opts.okLabel || "Confirmer"),
    ]
  });
  return m;
}

/* ---- champs de formulaire ---- */
const fField = (label, input, opts) => el("div", { class: "field" + ((opts && opts.full) ? " full" : "") }, el("label", {}, label), input);

function moneyInput(attrs) {
  const inp = el("input", { class: "input", type: "text", inputmode: "decimal", autocomplete: "off", ...attrs });
  const aff = el("div", { class: "input-aff" }, inp, el("span", { class: "aff" }, attrs.cur || "€"));
  aff.input = inp;
  return aff;
}
const numVal = wrapOrInput => parseAmount((wrapOrInput.input || wrapOrInput).value);

function selectInput(options, value, attrs) {
  const s = el("select", { class: "input", ...attrs });
  for (const o of options) {
    if (o.group) {
      const g = el("optgroup", { label: o.group });
      o.items.forEach(it => g.append(el("option", { value: it.value, selected: it.value === value }, it.label)));
      s.append(g);
    } else {
      s.append(el("option", { value: o.value, selected: o.value === value }, o.label));
    }
  }
  return s;
}

/* Sélecteur de catégorie groupé (avec sous-catégories indentées).
   Tri intelligent : la catégorie prédite pour le libellé saisi remonte tout en haut,
   suivie des catégories fréquentes (usage récent pondéré). ctx = { label } optionnel. */
function catSelect(budget, kind, value, attrs, ctx) {
  const roots = budget.categories.filter(c => c.kind === kind && !c.parentId);
  const s = el("select", { class: "input", ...attrs });
  s.append(el("option", { value: "" }, "— Sans catégorie —"));
  // prédiction selon le libellé en cours de saisie (règle apprise ou mots-clés)
  let predId = null;
  if (ctx && ctx.label && typeof Intel !== "undefined") {
    const pred = Intel.suggest(budget, ctx.label, kind);
    if (pred && pred.categoryId && catById(budget, pred.categoryId)) predId = pred.categoryId;
  }
  if (predId) {
    const c = catById(budget, predId), p = c.parentId ? catById(budget, c.parentId) : null;
    const g = el("optgroup", { label: "✨ Suggéré" });
    g.append(el("option", { value: c.id, selected: !value }, `${(p || c).emoji} ${p ? p.name + " · " : ""}${c.name}`));
    s.append(g);
  }
  const freq = (typeof Intel !== "undefined") ? Intel.topCats(budget, kind, 5) : [];
  if (freq.length) {
    const g = el("optgroup", { label: "★ Fréquentes" });
    freq.forEach(c => {
      if (c.id === predId) return;
      const p = c.parentId ? catById(budget, c.parentId) : null;
      g.append(el("option", { value: c.id }, `${(p || c).emoji} ${c.name}`));
    });
    s.append(g);
  }
  for (const r of roots) {
    const g = el("optgroup", { label: `${r.emoji} ${r.name}` });
    g.append(el("option", { value: r.id, selected: r.id === value }, `${r.name} (général)`));
    budget.categories.filter(c => c.parentId === r.id)
      .forEach(c => g.append(el("option", { value: c.id, selected: c.id === value }, c.name)));
    s.append(g);
  }
  return s;
}

/* Segments (onglets) */
function segControl(items, value, onChange, small) {
  const seg = el("div", { class: "seg" + (small ? " seg-sm" : "") });
  const render = () => {
    seg.innerHTML = "";
    items.forEach(it => seg.append(el("button", {
      class: it.value === value ? "on" : "",
      onclick: () => { value = it.value; render(); onChange(it.value); }
    }, it.label)));
  };
  render();
  seg.setValue = v => { value = v; render(); };
  return seg;
}

/* En-tête de page standard */
function pageHead(title, sub, ...actions) {
  return el("div", { class: "topbar" },
    el("button", { class: "btn btn-ghost btn-ico nav-burger", html: ico("menu", 20), style: "display:none", onclick: () => {} }),
    el("div", {}, el("h1", {}, title), sub ? el("div", { class: "sub" }, sub) : null),
    el("div", { class: "topbar-actions" }, ...actions)
  );
}

const emptyState = (emoji, title, text, action) => el("div", { class: "empty" },
  el("div", { class: "e-ico" }, emoji),
  el("h4", {}, title),
  el("p", {}, text),
  action || null
);
