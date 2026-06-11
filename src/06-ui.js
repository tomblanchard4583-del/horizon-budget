"use strict";
/* ============ composants UI : modales, toasts, champs ============ */

function toast(msg, opts) {
  opts = opts || {};
  let wrap = $(".toasts");
  if (!wrap) { wrap = el("div", { class: "toasts" }); document.body.append(wrap); }
  const t = el("div", { class: "toast" }, el("span", {}, msg));
  if (opts.action) {
    t.append(el("button", { onclick: () => { opts.onAction && opts.onAction(); t.remove(); } }, opts.action));
  }
  wrap.append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 350); }, opts.ms || 3200);
}

let _openModals = [];
function modal(opts) {
  const veil = el("div", { class: "modal-veil" });
  const head = el("div", { class: "modal-head" },
    el("h3", {}, opts.title || ""),
    el("button", { class: "btn btn-ghost btn-ico", html: ico("x", 19), onclick: close })
  );
  const body = el("div", { class: "modal-body" });
  if (opts.body) body.append(...[].concat(opts.body));
  const m = el("div", { class: "modal" + (opts.lg ? " modal-lg" : "") }, head, body);
  if (opts.foot) m.append(el("div", { class: "modal-foot" }, ...[].concat(opts.foot)));
  veil.append(m);
  veil.addEventListener("mousedown", e => { if (e.target === veil) close(); });
  document.body.append(veil);
  _openModals.push(close);
  function close() {
    veil.remove();
    _openModals = _openModals.filter(c => c !== close);
    opts.onClose && opts.onClose();
  }
  return { close, body, root: m };
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && _openModals.length) _openModals[_openModals.length - 1]();
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
   Les catégories les plus utilisées remontent dans un groupe « Fréquentes ». */
function catSelect(budget, kind, value, attrs) {
  const roots = budget.categories.filter(c => c.kind === kind && !c.parentId);
  const s = el("select", { class: "input", ...attrs });
  s.append(el("option", { value: "" }, "— Sans catégorie —"));
  const freq = (typeof Intel !== "undefined") ? Intel.topCats(budget, kind, 5) : [];
  if (freq.length) {
    const g = el("optgroup", { label: "★ Fréquentes" });
    freq.forEach(c => {
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
