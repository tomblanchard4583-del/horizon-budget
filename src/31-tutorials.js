"use strict";
/* ============ Aide & tutoriels + configuration de la synchronisation ============ */

const SQL_SNIPPET = `-- À coller dans Supabase → SQL Editor → Run
create table if not exists horizon_rooms (
  room       text primary key,
  doc        jsonb,
  rev        bigint default 0,
  updated_at timestamptz default now()
);
alter table horizon_rooms enable row level security;
drop policy if exists "horizon_access" on horizon_rooms;
create policy "horizon_access" on horizon_rooms
  for all to anon using (true) with check (true);`;

/* ---------------- configuration de la synchronisation ---------------- */
function genRoomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const grp = () => Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join("");
  return `${grp()}-${grp()}-${grp()}`;
}

function openSyncSetup() {
  const s = State.sync;
  const connected = s.enabled;
  const body = el("div", {});
  const m = modal({ title: "🔄 Synchronisation entre appareils", lg: true, body, onClose: () => renderApp() });

  const urlI = el("input", { class: "input", value: s.url, placeholder: "https://xxxx.supabase.co", autocomplete: "off", spellcheck: false });
  const keyI = el("input", { class: "input", value: s.anonKey, placeholder: "Clé publique « anon » (eyJ…)", autocomplete: "off", spellcheck: false });
  const roomI = el("input", { class: "input", value: s.room || "", placeholder: "ABCD-EFGH-JKLM", autocomplete: "off", spellcheck: false, style: "text-transform:uppercase; letter-spacing:.06em; font-family:var(--mono)" });
  const nameI = el("input", { class: "input", value: s.deviceName || "", placeholder: "ex. iPhone de Tom" });
  const statusLine = el("div", { class: "small muted mt8" });

  function setLine(txt, tone) { statusLine.textContent = txt; statusLine.className = "small mt8 " + (tone === "ok" ? "pos" : tone === "err" ? "neg" : "muted"); }

  const sqlBox = el("pre", { class: "code-block" }, SQL_SNIPPET);

  const guide = el("details", { class: "adv mt8", open: !connected },
    el("summary", {}, "📖 Première fois ? Créer la base gratuite en 4 étapes"),
    el("div", { class: "guide-steps mt8" },
      gstep(1, "Créer un projet Supabase gratuit",
        ["Allez sur ", aLink("supabase.com", "https://supabase.com"), " → « Start your project » → connexion avec GitHub ou e-mail.",
          " Cliquez « New project », donnez un nom (ex. « budget-famille »), choisissez un mot de passe, région Europe. Attendez ~1 minute la création."]),
      gstep(2, "Créer la table (copier-coller le script)",
        ["Dans le menu de gauche : ", el("b", {}, "SQL Editor"), " → « New query ». Collez le script ci-dessous puis cliquez ", el("b", {}, "Run"), " (ou Ctrl/Cmd+Entrée)."]),
      el("div", { style: "padding:0 0 4px 26px" }, sqlBox,
        el("button", { class: "btn btn-sm mt8", html: ico("copy", 14) + "<span>Copier le script SQL</span>", onclick: () => { copyText(SQL_SNIPPET); toast("📋 Script copié"); } })),
      gstep(3, "Récupérer l'URL et la clé",
        ["Menu ", el("b", {}, "Project Settings"), " (roue dentée) → ", el("b", {}, "API"), ". Copiez :",
          el("ul", { style: "margin:6px 0 0 16px; line-height:1.7" },
            el("li", {}, el("b", {}, "Project URL"), " → champ « URL Supabase » ci-dessous"),
            el("li", {}, el("b", {}, "Project API keys → anon public"), " → champ « Clé anon »"))]),
      gstep(4, "Choisir un code de salon & connecter",
        ["Le ", el("b", {}, "code de salon"), " est le mot de passe partagé de votre famille. Générez-en un, connectez-vous, puis saisissez ", el("b", {}, "le même code"), " (avec la même URL et la même clé) sur vos autres appareils. C'est tout : les budgets se synchronisent."])
    )
  );

  function rebuild() {
    body.innerHTML = "";
    if (connected) {
      body.append(el("div", { class: "alert a-ok mb16" }, el("span", { class: "a-ico", html: ico("check", 17) }),
        el("span", {}, el("b", {}, "Synchronisation active"), el("div", { class: "small" }, `Salon « ${s.room} » · statut : ${syncStatusText()}`))));
    }
    body.append(
      el("div", { class: "alert a-info mb16" }, el("span", { class: "a-ico", html: ico("info", 17) }),
        el("span", {}, "Vos données restent ", el("b", {}, "chez vous"), " : elles sont ", el("b", {}, "chiffrées de bout en bout"), " (AES-256, clé dérivée du code de salon) avant d'être envoyées vers votre propre base Supabase gratuite. Même Supabase ne peut pas les lire — seuls les appareils connaissant votre code de salon le peuvent.")),
      guide,
      el("div", { class: "form-grid mt16" },
        fField("URL Supabase", urlI, { full: true }),
        fField("Clé anon (publique)", keyI, { full: true }),
        el("div", { class: "field full" },
          el("label", {}, "Code de salon partagé"),
          el("div", { class: "flex", style: "gap:8px" }, roomI,
            el("button", { class: "btn btn-sm nowrap", onclick: () => { roomI.value = genRoomCode(); }, title: "Générer un nouveau code" }, "🎲 Générer"),
            el("button", { class: "btn btn-sm btn-ico", html: ico("copy", 14), title: "Copier", onclick: () => { copyText(roomI.value); toast("📋 Code copié"); } }))),
        fField("Nom de cet appareil (facultatif)", nameI, { full: true })),
      statusLine
    );
  }
  rebuild();

  m.root.querySelector(".modal-foot") || m.root.append(el("div", { class: "modal-foot" },
    connected ? el("button", { class: "btn btn-danger", onclick: doDisconnect }, "Se déconnecter") : el("span"),
    el("span", { class: "spacer" }),
    el("button", { class: "btn", onclick: doTest }, "Tester la connexion"),
    el("button", { class: "btn btn-p", onclick: doConnect }, connected ? "Mettre à jour" : "Connecter")
  ));

  async function doTest() {
    if (!urlI.value || !keyI.value) { setLine("Renseignez l'URL et la clé.", "err"); return; }
    setLine("Test en cours…");
    try { await Sync.probe({ url: urlI.value, anonKey: keyI.value }); setLine("✅ Connexion OK — base accessible.", "ok"); }
    catch (e) { setLine("❌ " + e.message, "err"); }
  }

  function doConnect() {
    if (!urlI.value || !keyI.value || !roomI.value.trim()) { setLine("URL, clé et code de salon sont requis.", "err"); return; }
    const opts = { url: urlI.value, anonKey: keyI.value, room: roomI.value.trim().toUpperCase() };
    State.sync.deviceName = nameI.value.trim();
    const haveLocal = State.budgets.length > 0;
    const proceed = strategy => finishConnect(Object.assign({ strategy }, opts));
    // si l'appareil a déjà des données, demander la stratégie (au cas où le salon existe déjà)
    if (haveLocal && !State.sync.enabled) {
      askStrategy(proceed);
    } else proceed("merge");
  }

  function askStrategy(cb) {
    const mm = modal({
      title: "Ce salon contient peut-être déjà des données",
      body: el("div", { style: "display:flex; flex-direction:column; gap:9px; padding:4px 0" },
        el("p", { class: "small muted" }, "Cet appareil contient déjà des budgets. Comment les combiner avec le salon partagé ?"),
        stratBtn("🔀 Fusionner", "Recommandé pour rejoindre une famille : garde tout, des deux côtés.", () => { mm.close(); cb("merge"); }),
        stratBtn("⬇️ Remplacer par le cloud", "Cet appareil rejoint un salon existant : écrase les données locales par celles du salon.", () => { mm.close(); cb("pullCloud"); }),
        stratBtn("⬆️ Écraser le cloud", "Premier appareil de la famille : impose les données de cet appareil au salon.", () => { mm.close(); cb("pushLocal"); }))
    });
    function stratBtn(t, d, fn) {
      return el("button", { class: "choice", style: "padding:11px 13px", onclick: fn },
        el("span", {}, el("div", { class: "ch-t" }, t), el("div", { class: "ch-d" }, d)));
    }
  }

  async function finishConnect(opts) {
    setLine("Connexion & synchronisation…");
    try {
      await Sync.connect(opts);
      toast("✅ Synchronisation activée");
      m.close(); renderApp();
    } catch (e) {
      setLine("❌ " + e.message, "err");
      State.sync.enabled = false;
    }
  }

  function doDisconnect() {
    confirmDialog({
      title: "Désactiver la synchronisation ?",
      body: "Les données restent sur cet appareil et dans le salon, mais cet appareil cesse de se synchroniser. Vous pourrez vous reconnecter plus tard avec le même code.",
      okLabel: "Désactiver",
      onOk: () => { Sync.disconnect(); m.close(); renderApp(); toast("Synchronisation désactivée"); }
    });
  }
}

function syncStatusText() {
  return ({ synced: "à jour ✓", syncing: "synchro en cours…", connecting: "connexion…", offline: "hors-ligne", error: "erreur" })[Sync.status] || "inactif";
}

function gstep(n, title, body) {
  return el("div", { class: "guide-step" },
    el("div", { class: "gs-num" }, String(n)),
    el("div", {}, el("div", { class: "gs-title" }, title), el("div", { class: "gs-body small" }, ...body)));
}
function aLink(txt, href) { return el("a", { href, target: "_blank", rel: "noopener", class: "ext-link" }, txt); }
function copyText(t) {
  if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  else fallbackCopy(t);
}
function fallbackCopy(t) {
  const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = t;
  document.body.append(ta); ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  ta.remove();
}

/* ---------------- vue Aide & tutoriels ---------------- */
let _helpSearch = "";

const HELP_SECTIONS = [
  {
    emoji: "🚀", title: "Démarrage rapide", tags: "debut commencer premiers pas",
    body: () => [
      p("Horizon Budget fonctionne en 3 temps : on <b>planifie</b> ses revenus et dépenses, on <b>projette</b> l'avenir, on <b>suit</b> le réel au fil de l'eau."),
      ul([
        "<b>1. Ajustez le budget</b> — onglet « Budget » : corrigez les montants préremplis, supprimez ce qui ne vous concerne pas, ajoutez vos postes.",
        "<b>2. Regardez les projections</b> — onglet « Projections » : votre solde sur 6 mois à 30 ans.",
        "<b>3. Suivez le réel</b> — onglet « Suivi réel » : saisissez vos dépenses ou importez un relevé bancaire.",
      ]),
      tip("Le bouton vert <b>+</b> en bas à droite permet d'ajouter rapidement n'importe quoi depuis n'importe quel écran."),
    ],
  },
  {
    emoji: "🔄", title: "Synchroniser entre tous mes appareils (famille)", tags: "synchro sync supabase cloud partage famille iphone android temps reel",
    body: () => [
      p("La synchronisation relie vos appareils (et ceux de votre famille) à <b>votre propre base de données gratuite</b>. Chacun voit les modifications des autres en quasi temps réel, et tout reste votre propriété."),
      ul([
        "<b>Automatique</b> : dès qu'une personne ajoute une dépense, elle apparaît sur les autres appareils en quelques secondes.",
        "<b>Gratuit</b> : la base Supabase gratuite suffit très largement (des milliers de budgets tiennent dans 500 Mo).",
        "<b>Privé</b> : seules les personnes ayant votre « code de salon » accèdent aux données. Activez la synchro avec le même code partout.",
        "<b>Hors-ligne</b> : sans réseau, l'app marche normalement ; les changements se synchronisent au retour de la connexion.",
      ]),
      btn("🔧 Configurer la synchronisation maintenant", () => openSyncSetup()),
      p("<b>Comment ça marche concrètement :</b>"),
      ol([
        "Sur le 1er appareil : ouvrez la configuration, créez la base Supabase (guide pas-à-pas intégré), générez un code de salon, connectez-vous.",
        "Sur chaque autre appareil : ouvrez la configuration, saisissez <b>la même URL, la même clé et le même code de salon</b>, choisissez « Remplacer par le cloud » pour récupérer les budgets existants.",
        "Terminé. Modifiez sur n'importe quel appareil, tout le monde est à jour.",
      ]),
      warn("Pour un budget familial commun : tout le monde utilise le <b>même code de salon</b> et édite le <b>même budget</b>. Pour des budgets séparés, utilisez des codes différents. Le code de salon est aussi la clé de chiffrement : notez-le précieusement, il est impossible de lire les données sans lui."),
    ],
  },
  {
    emoji: "📋", title: "Construire son budget (postes, catégories)", tags: "budget poste depense revenu categorie sous-categorie frequence",
    body: () => [
      p("Un <b>poste</b> est une ligne de revenu ou de dépense récurrente ou ponctuelle. Chaque poste a un montant, une catégorie, une fréquence et un jour d'échéance."),
      ul([
        "<b>Fréquences</b> : quotidienne, hebdomadaire, toutes les 2 semaines, mensuelle, bimestrielle, trimestrielle, semestrielle, annuelle, ou « une seule fois ».",
        "<b>Catégories & sous-catégories</b> : 24 catégories prêtes à l'emploi, entièrement modifiables. Bouton « 🗂️ Catégories » pour en créer, renommer, recolorer.",
        "<b>Date de début / fin</b> : un poste peut démarrer dans le futur ou s'arrêter à une date (ex. un abonnement résilié).",
      ]),
      tip("Activez « dépense variable » pour les postes irréguliers (courses, essence) : indiquez une fourchette min–max utilisée dans les scénarios."),
    ],
  },
  {
    emoji: "📈", title: "Postes qui évoluent dans le temps", tags: "augmentation palier croissance inflation evolution loyer salaire",
    body: () => [
      p("Dans l'éditeur d'un poste, dépliez « Évolution dans le temps » pour modéliser un montant qui change :"),
      ul([
        "<b>Tendance long terme</b> : montant stable, indexé sur l'inflation, ou variation annuelle personnalisée (ex. loyer +2 %/an).",
        "<b>Paliers</b> : changements connus à une date précise (ex. « le loyer passe à 600 € en septembre 2027 », « salaire +10 % en janvier »).",
      ]),
      tip("Les paliers sont parfaits pour les augmentations prévues, les baisses de charges, ou la fin d'une remise."),
    ],
  },
  {
    emoji: "🧭", title: "Anticiper les changements de vie", tags: "evenement futur emploi etudes demenagement retraite naissance speculatif projection",
    body: () => [
      p("L'onglet « Événements de vie » sert à projeter des situations futures : fin d'études, premier emploi, déménagement, naissance, retraite, perte d'emploi…"),
      ul([
        "Un événement regroupe plusieurs changements à une même date : nouveaux revenus, charges qui s'arrêtent, montants qui évoluent.",
        "Exemple étudiant : « Premier emploi en septembre 2027 » → ajoute un salaire estimé, arrête la bourse et l'aide des parents. La projection montre instantanément la nouvelle trajectoire.",
        "Les événements apparaissent en 📌 sur les courbes de projection.",
      ]),
      tip("Combinez avec les scénarios (voir plus bas) pour comparer « si je trouve un emploi à 2 000 € » vs « à 2 500 € »."),
    ],
  },
  {
    emoji: "🔮", title: "Projections & scénarios", tags: "projection futur horizon scenario optimiste pessimiste patrimoine",
    body: () => [
      p("Les projections calculent votre solde et votre patrimoine net mois par mois, jusqu'à 30 ans, en intégrant postes, paliers, crédits, épargne et intérêts composés."),
      ul([
        "<b>Horizons</b> : 6 mois à 30 ans, en un clic.",
        "<b>Scénarios</b> : « attendu », « optimiste » (revenus variables au max, dépenses au min) et « pessimiste » (l'inverse) — pour borner les incertitudes.",
        "<b>Patrimoine net</b> : solde du compte + épargne + comptes rémunérés − dettes restantes.",
        "<b>Export</b> : CSV ou impression PDF du détail mois par mois.",
      ]),
    ],
  },
  {
    emoji: "📅", title: "Calendrier budgétaire", tags: "calendrier echeance solde jour decouvert",
    body: () => [
      p("Le calendrier affiche chaque échéance au bon jour et le <b>solde projeté en fin de journée</b>."),
      ul([
        "Les cases passant sous zéro sont surlignées en rouge : repérez les risques de découvert avant qu'ils arrivent.",
        "Cliquez un jour pour voir le détail et ajouter une transaction réelle à cette date.",
      ]),
      tip("Si une case devient rouge, décalez le jour d'échéance d'un poste (ex. prélèvement au 5 plutôt qu'au 1er) pour lisser."),
    ],
  },
  {
    emoji: "🧾", title: "Suivi réel & import bancaire", tags: "suivi reel transaction import csv releve banque prevu reel categorisation",
    body: () => [
      p("Saisissez vos dépenses réelles pour les comparer au budget prévu, ou importez directement un relevé bancaire."),
      ul([
        "<b>Prévu vs réel</b> : barres de progression par catégorie, dépassements signalés en rouge, « reste à dépenser ».",
        "<b>Import CSV</b> : exportez un relevé depuis votre banque, importez-le ici. L'app détecte les colonnes (et mémorise le format de votre banque), catégorise automatiquement et écarte les doublons.",
        "<b>Apprentissage</b> : chaque catégorie confirmée ou corrigée est mémorisée. Après 2 confirmations, le marchand est reconnu automatiquement aux imports suivants ; seuls les cas inhabituels (libellé inconnu, montant inattendu) vous sont présentés.",
        "<b>Régularités</b> : l'app repère les opérations qui reviennent (loyer, salaire, abonnements…) et propose d'en faire des postes du budget — ou d'ajuster un poste existant si le montant ou la date a dérivé.",
        "<b>Ventilation</b> : un montant peut être réparti sur plusieurs catégories (ex. retrait de 280 € = 180 € courses + 100 € sorties, méthode des enveloppes). L'app retient vos répartitions habituelles et les propose au retrait suivant.",
        "<b>Assistance IA</b> (réglages) : en option, une clé Claude ou Gemini catégorise les libellés inconnus. Seuls les libellés sont envoyés, jamais vos montants.",
        "<b>Export</b> : vos transactions en CSV à tout moment.",
      ]),
    ],
  },
  {
    emoji: "🎯", title: "Objectifs & épargne", tags: "objectif epargne projet livret interet compose compte",
    body: () => [
      p("Fixez des objectifs (fonds d'urgence, permis, voyage, apport immobilier) et suivez votre progression."),
      ul([
        "L'app calcule la mensualité nécessaire pour tenir une date limite, et la date d'atteinte au rythme actuel.",
        "Liez un versement mensuel automatique à un objectif : il compte alors comme de l'épargne.",
        "<b>Comptes rémunérés</b> (Livret A, LEP, assurance-vie) : indiquez le taux, les intérêts composés alimentent les projections de patrimoine.",
      ]),
    ],
  },
  {
    emoji: "💳", title: "Crédits & dettes", tags: "credit dette pret immobilier amortissement mensualite interet",
    body: () => [
      p("Gérez prêts immobiliers, crédits auto, prêts étudiants ou dettes à un proche."),
      ul([
        "Renseignez le capital + (durée OU mensualité) : l'app calcule le reste, le tableau d'amortissement, le coût total des intérêts et la date de fin.",
        "Le remboursement anticipé mensuel raccourcit la durée automatiquement.",
        "Les mensualités sont intégrées aux projections et au calendrier sans rien faire de plus.",
      ]),
    ],
  },
  {
    emoji: "📂", title: "Plusieurs budgets & comparaison", tags: "multi budget scenario comparer couple perso famille dupliquer variante",
    body: () => [
      p("Créez autant de budgets que nécessaire : perso, couple, projet, budget d'un proche…"),
      ul([
        "<b>Dupliquer</b> : copie complète d'un budget.",
        "<b>Scénario</b> : variante d'un budget pour tester des hypothèses sans toucher à l'original (ex. « et si je passe en alternance ? »).",
        "<b>Comparaison</b> : deux budgets côte à côte, graphique superposé et écarts chiffrés.",
      ]),
    ],
  },
  {
    emoji: "💾", title: "Sauvegarde, partage & installation", tags: "sauvegarde export import json partage installer iphone android pwa hors ligne",
    body: () => [
      p("Même sans synchro, vos données sont en sécurité et transférables."),
      ul([
        "<b>Sauvegarde JSON</b> (Réglages) : un fichier de toutes vos données, à conserver ou réimporter ailleurs.",
        "<b>Partager un budget</b> : export d'un seul budget, à envoyer à quelqu'un.",
        "<b>Installer comme une app</b> : iPhone → Safari → Partager → « Sur l'écran d'accueil » ; Android → Chrome → ⋮ → « Ajouter à l'écran d'accueil ».",
        "<b>Hors-ligne</b> : l'app entière tient dans un fichier ; elle fonctionne sans connexion.",
      ]),
      btn("💾 Aller aux réglages de sauvegarde", () => go("settings")),
    ],
  },
  {
    emoji: "🔒", title: "Confidentialité", tags: "confidentialite vie privee donnees securite serveur",
    body: () => [
      p("Par défaut, <b>aucune donnée ne quitte votre appareil</b> : tout est stocké localement dans le navigateur, sans compte ni serveur."),
      p("Si vous activez la synchronisation, les données sont <b>chiffrées de bout en bout</b> (AES-256) avant d'être envoyées vers <b>votre propre</b> base Supabase : sans le code de salon, elles sont illisibles — y compris pour Supabase. Horizon Budget n'a aucun serveur central et ne collecte rien."),
    ],
  },
  {
    emoji: "⌨️", title: "Raccourcis clavier", tags: "raccourci clavier touche",
    body: () => [
      ul([
        "<kbd>1</kbd>–<kbd>8</kbd> : naviguer entre les onglets principaux.",
        "<kbd>n</kbd> : nouvelle transaction réelle.",
        "<kbd>Échap</kbd> : fermer une fenêtre.",
      ]),
    ],
  },
];

function viewHelp(root) {
  const search = el("div", { class: "searchbar", style: "max-width:380px" },
    el("span", { html: ico("search", 15) }),
    el("input", {
      class: "input", placeholder: "Rechercher dans l'aide…", value: _helpSearch,
      oninput: debounce(e => { _helpSearch = e.target.value.toLowerCase().trim(); renderApp(); }, 250)
    }));

  const q = _helpSearch;
  const sections = HELP_SECTIONS.filter(s => !q || (s.title + " " + s.tags).toLowerCase().includes(q));

  const acc = el("div", { class: "grid", style: "gap:10px" }, sections.length ? sections.map((s, i) => {
    const open = !!q || i === 0;
    return el("details", { class: "help-card", open },
      el("summary", {}, el("span", { class: "h-emoji" }, s.emoji), el("span", {}, s.title), el("span", { class: "spacer" }), el("span", { class: "h-chev", html: ico("chevD", 16) })),
      el("div", { class: "help-body" }, ...s.body()));
  }) : [emptyState("🔍", "Aucun résultat", "Essayez un autre mot-clé (ex. « synchro », « crédit », « csv »).")]);

  root.append(el("div", { class: "content-inner" },
    el("div", { class: "flex mb16", style: "flex-wrap:wrap; gap:10px" },
      el("div", {}, el("p", { class: "muted", style: "max-width:560px" }, "Tout ce que fait l'application, expliqué simplement. La synchronisation entre appareils a sa propre fiche détaillée.")),
      el("span", { class: "spacer" }), search),
    el("div", { class: "flex mb16", style: "flex-wrap:wrap; gap:8px" },
      el("button", { class: "btn btn-p", html: ico("sync", 15) + "<span>Configurer la synchronisation</span>", onclick: () => openSyncSetup() }),
      el("button", { class: "btn", html: ico("rocket", 15) + "<span>Relancer l'assistant de démarrage</span>", onclick: () => { State.onboarded = false; persist(); location.reload(); } })),
    acc));
}

/* helpers de contenu */
function p(html) { return el("p", { class: "mb8", style: "line-height:1.7", html }); }
function ul(items) { return el("ul", { class: "help-list" }, items.map(i => el("li", { html: i }))); }
function ol(items) { return el("ol", { class: "help-list ol" }, items.map(i => el("li", { html: i }))); }
function tip(html) { return el("div", { class: "alert a-ok mt8", style: "font-size:0.8125rem" }, el("span", { class: "a-ico", html: ico("info", 16) }), el("span", { html: "💡 " + html })); }
function warn(html) { return el("div", { class: "alert a-warn mt8", style: "font-size:0.8125rem" }, el("span", { class: "a-ico", html: ico("alert", 16) }), el("span", { html })); }
function btn(label, onclick) { return el("button", { class: "btn btn-sm mt8", style: "margin-right:8px", onclick }, label); }
