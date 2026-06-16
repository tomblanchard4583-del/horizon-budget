"use strict";
/* ============ vue : événements de vie (changements de situation) ============ */

const EVENT_PRESETS = [
  { emoji: "🎓", name: "Fin d'études / premier emploi" },
  { emoji: "💼", name: "Nouvel emploi / augmentation" },
  { emoji: "🏠", name: "Déménagement" },
  { emoji: "🔑", name: "Achat immobilier" },
  { emoji: "💍", name: "Mariage / PACS" },
  { emoji: "👶", name: "Naissance" },
  { emoji: "🚗", name: "Achat de véhicule" },
  { emoji: "🧳", name: "Année à l'étranger / césure" },
  { emoji: "📉", name: "Perte d'emploi / chômage" },
  { emoji: "🌅", name: "Départ à la retraite" },
];

function viewEvents(root) {
  const b = curBudget();
  const now = todayStr();
  const events = [...b.events].sort((a, z) => a.date.localeCompare(z.date));

  const intro = el("div", { class: "alert a-info" },
    el("span", { class: "a-ico", html: ico("info", 17) }),
    el("span", {}, "Un événement de vie regroupe les changements financiers d'une même date : nouveaux revenus, charges qui s'arrêtent, montants qui évoluent. Ils apparaissent sur les projections (📌) et structurent vos budgets spéculatifs — par exemple « premier emploi en septembre 2027, salaire estimé 2 200 € »."));

  const list = events.length ? el("div", { class: "card card-pad" },
    el("div", { class: "tl" }, events.map(e => {
      const linked = b.items.filter(i => i.eventId === e.id);
      const stops = b.items.filter(i => i.endDate && i._stopEvent === e.id);
      return el("div", { class: "tl-item" + (e.date < now ? " past" : "") },
        el("div", { class: "flex" },
          el("b", {}, `${e.emoji || "📌"} ${e.name}`),
          el("span", { class: "badge " + (e.date < now ? "b-mut" : "b-info") }, fmtDate(e.date)),
          el("span", { class: "spacer" }),
          el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 15), onclick: () => openEventEditor(b, e) })),
        e.notes ? el("div", { class: "small muted" }, e.notes) : null,
        linked.length ? el("div", { class: "small mt8", style: "color:var(--tx2); line-height:1.8" },
          linked.map(i => el("div", {}, `${i.kind === "income" ? "💶" : "🧾"} ${i.name} — ${fmtMoney(i.amount, b.currency)} ${freqSuffix[i.freq] || ""}`)))
          : el("div", { class: "xs muted mt8" }, "Aucun poste lié pour l'instant — modifiez l'événement pour en ajouter.")
      );
    }))
  ) : el("div", { class: "card" }, emptyState("🧭", "Aucun événement planifié",
    "Anticipez les grands changements : fin d'études, nouvel emploi, déménagement, naissance, retraite… et observez leur impact sur vos projections.",
    el("button", { class: "btn btn-p btn-sm", onclick: () => openEventEditor(b, null) }, "Planifier un événement")));

  const listSec = el("div", {},
    el("div", { class: "flex mb12" },
      el("h3", {}, "🧭 Ligne de vie"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-p btn-sm", html: ico("plus", 14) + "<span>Événement</span>", onclick: () => openEventEditor(b, null) })),
    list);
  const inner = el("div", { class: "content-inner grid", style: "gap:16px" });
  Custom.renderInto(inner, "page.events", [{ id: "intro", node: intro }, { id: "list", node: listSec }], { axis: "y" });
  root.append(inner);
}

function openEventEditor(b, ev) {
  const isNew = !ev;
  const e = ev ? { ...ev } : { id: uid(), name: "", emoji: "📌", date: addMonths(ymOf(todayStr()), 6) + "-01", notes: "" };

  const presetRow = isNew ? el("div", { class: "scroll-x mb12" }, EVENT_PRESETS.map(p =>
    el("button", {
      class: "btn btn-sm", style: "flex:none", onclick: () => {
        nameI.value = p.name; emojiI.value = p.emoji;
      }
    }, `${p.emoji} ${p.name}`))) : null;

  const nameI = el("input", { class: "input", value: e.name, placeholder: "ex. Premier emploi" });
  const emojiI = el("input", { class: "input", value: e.emoji, style: "max-width:90px; text-align:center; font-size:18px" });
  const dateI = el("input", { class: "input", type: "date", value: e.date });
  const notesI = el("textarea", { class: "input", value: e.notes, placeholder: "ex. CDI prévu après le master, salaire estimé 2 200 € net" });

  const linkedBox = el("div", {});
  function renderLinked() {
    linkedBox.innerHTML = "";
    if (isNew) {
      linkedBox.append(el("p", { class: "xs muted" }, "Enregistrez d'abord l'événement, puis liez-lui des changements de budget."));
      return;
    }
    const linked = b.items.filter(i => i.eventId === e.id);
    linked.forEach(i => linkedBox.append(el("div", { class: "flex small", style: "padding:5px 0; border-bottom:1px dashed var(--line)" },
      el("span", {}, `${i.kind === "income" ? "💶" : "🧾"} ${i.name}`),
      el("span", { class: "muted" }, fmtMoney(i.amount, b.currency) + " " + (freqSuffix[i.freq] || "")),
      el("span", { class: "spacer" }),
      el("button", { class: "btn btn-ghost btn-ico", html: ico("edit", 13), onclick: () => { m.close(); openItemEditor(b, i, false, () => openEventEditor(b, e)); } }))));
    linkedBox.append(el("div", { class: "flex mt8", style: "flex-wrap:wrap; gap:8px" },
      el("button", {
        class: "btn btn-sm", onclick: () => {
          const it = newItem("income");
          it.startDate = dateI.value || e.date; it.eventId = e.id;
          m.close(); openItemEditor(b, it, true, () => openEventEditor(b, e));
        }
      }, "+ Revenu à partir de cette date"),
      el("button", {
        class: "btn btn-sm", onclick: () => {
          const it = newItem("expense");
          it.startDate = dateI.value || e.date; it.eventId = e.id;
          m.close(); openItemEditor(b, it, true, () => openEventEditor(b, e));
        }
      }, "+ Dépense à partir de cette date"),
      el("button", { class: "btn btn-sm", onclick: () => pickItemToStop() }, "⏹ Arrêter un poste existant"),
      el("button", { class: "btn btn-sm", onclick: () => pickItemToChange() }, "✏️ Changer un montant")));
  }

  function pickItemToStop() {
    const candidates = b.items.filter(i => !i.endDate || i.endDate >= e.date);
    if (!candidates.length) { toast("Aucun poste actif à arrêter"); return; }
    const sel = selectInput(candidates.map(i => ({ value: i.id, label: `${i.kind === "income" ? "💶" : "🧾"} ${i.name} (${fmtMoney(i.amount, b.currency)})` })), candidates[0].id);
    const mm = modal({
      title: "Arrêter un poste à cette date",
      body: el("div", { class: "form-grid" }, fField("Poste qui prend fin la veille de l'événement", sel, { full: true })),
      foot: [el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => mm.close() }, "Annuler"),
        el("button", {
          class: "btn btn-p", onclick: () => {
            const it = b.items.find(i => i.id === sel.value);
            const d = toDate(dateI.value || e.date); d.setDate(d.getDate() - 1);
            it.endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            it._stopEvent = e.id;
            persist(); mm.close(); renderLinked();
            toast(`⏹ « ${it.name} » s'arrêtera le ${fmtDate(it.endDate)}`);
          }
        }, "Confirmer")]
    });
  }

  function pickItemToChange() {
    const candidates = b.items.filter(i => FREQ_MONTHS[i.freq] || i.freq === "weekly" || i.freq === "biweekly" || i.freq === "daily");
    if (!candidates.length) { toast("Aucun poste récurrent à modifier"); return; }
    const sel = selectInput(candidates.map(i => ({ value: i.id, label: `${i.kind === "income" ? "💶" : "🧾"} ${i.name} (${fmtMoney(i.amount, b.currency)})` })), candidates[0].id);
    const amtI = moneyInput({ value: "", placeholder: "nouveau montant" });
    const mm = modal({
      title: "Changer un montant à partir de cette date",
      body: el("div", { class: "form-grid" },
        fField("Poste concerné", sel, { full: true }),
        fField("Nouveau montant à partir de " + fmtDate(dateI.value || e.date), amtI, { full: true })),
      foot: [el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => mm.close() }, "Annuler"),
        el("button", {
          class: "btn btn-p", onclick: () => {
            const it = b.items.find(i => i.id === sel.value);
            const v = numVal(amtI);
            if (!v) return;
            it.steps = it.steps || [];
            it.steps.push({ date: ymOf(dateI.value || e.date), type: "set", value: v });
            persist(); mm.close(); renderLinked();
            toast(`📈 « ${it.name} » passera à ${fmtMoney(v, b.currency)} en ${fmtYm(ymOf(dateI.value || e.date))}`);
          }
        }, "Confirmer")]
    });
  }

  const m = modal({
    title: isNew ? "Nouvel événement de vie" : e.name,
    lg: true,
    body: el("div", {},
      presetRow,
      el("div", { class: "form-grid" },
        fField("Nom", nameI, { full: true }),
        fField("Emoji", emojiI), fField("Date", dateI),
        fField("Notes", notesI, { full: true })),
      el("div", { class: "small mt16 mb8", style: "font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--tx2)" }, "Changements liés"),
      linkedBox),
    foot: [
      !isNew ? el("button", {
        class: "btn btn-danger", html: ico("trash", 15), onclick: () => {
          confirmDialog({
            title: `Supprimer « ${e.name} » ?`,
            body: "Les postes liés à cet événement seront conservés (ils gardent leurs dates). Seul le marqueur d'événement disparaît.",
            okLabel: "Supprimer", danger: true,
            onOk: () => {
              b.events = b.events.filter(x => x.id !== e.id);
              b.items.forEach(i => { if (i.eventId === e.id) i.eventId = null; });
              persist(); m.close(); renderApp();
            }
          });
        }
      }) : el("span"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Fermer"),
      el("button", {
        class: "btn btn-p", onclick: () => {
          e.name = nameI.value.trim() || "Événement";
          e.emoji = emojiI.value.trim() || "📌";
          e.date = dateI.value || todayStr();
          e.notes = notesI.value;
          if (isNew) { b.events.push(e); persist(); m.close(); openEventEditor(b, b.events.find(x => x.id === e.id)); toast("✅ Événement créé — liez-lui maintenant des changements"); }
          else { Object.assign(b.events.find(x => x.id === e.id), e); persist(); m.close(); renderApp(); }
        }
      }, isNew ? "Créer l'événement" : "Enregistrer")]
  });
  renderLinked();
  if (isNew) nameI.focus();
}
