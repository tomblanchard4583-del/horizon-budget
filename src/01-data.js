"use strict";
/* ============ données par défaut : catégories, fréquences, modèles ============ */

const FREQS = {
  once:       { label: "Une seule fois",        perYear: 0 },
  daily:      { label: "Tous les jours",        perYear: 365.25 },
  weekly:     { label: "Toutes les semaines",   perYear: 52.18 },
  biweekly:   { label: "Toutes les 2 semaines", perYear: 26.09 },
  monthly:    { label: "Tous les mois",         perYear: 12 },
  bimonthly:  { label: "Tous les 2 mois",       perYear: 6 },
  quarterly:  { label: "Tous les trimestres",   perYear: 4 },
  semiannual: { label: "Tous les 6 mois",       perYear: 2 },
  annual:     { label: "Tous les ans",          perYear: 1 },
};
const FREQ_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };
const freqSuffix = { once: "une fois", daily: "/jour", weekly: "/sem.", biweekly: "/2 sem.", monthly: "/mois", bimonthly: "/2 mois", quarterly: "/trim.", semiannual: "/6 mois", annual: "/an" };

/* Catégories par défaut — [emoji, nom, couleur, [sous-catégories]] */
const DEFAULT_EXPENSE_CATS = [
  ["🏠", "Logement", "#0ea5e9", ["Loyer", "Crédit immobilier", "Charges de copropriété", "Électricité", "Gaz & chauffage", "Eau", "Internet & box", "Assurance habitation", "Taxe foncière", "Entretien & travaux", "Mobilier & équipement"]],
  ["🛒", "Alimentation", "#10b981", ["Courses", "Restaurants", "Livraison & à emporter", "Cantine / RU", "Café & snacks"]],
  ["🚗", "Transport", "#f59e0b", ["Carburant", "Transports en commun", "Assurance auto/moto", "Entretien & réparations", "Péage & stationnement", "Taxi & VTC", "Train & avion", "Location de véhicule", "Vélo & trottinette"]],
  ["💊", "Santé", "#ef4444", ["Mutuelle", "Médecin & spécialistes", "Pharmacie", "Dentaire", "Optique", "Psy & thérapies"]],
  ["📱", "Abonnements & télécom", "#8b5cf6", ["Forfait mobile", "Streaming & musique", "Logiciels & cloud", "Presse & médias", "Jeux & applis", "Autres abonnements"]],
  ["🎉", "Loisirs & sorties", "#ec4899", ["Sport & salle", "Cinéma & culture", "Sorties & bars", "Hobbies & passions", "Livres & jeux", "Événements & concerts"]],
  ["✈️", "Voyages & vacances", "#06b6d4", ["Hébergement", "Transport vacances", "Activités sur place", "Budget vacances global"]],
  ["👕", "Shopping & personnel", "#d946ef", ["Vêtements & chaussures", "Beauté & coiffeur", "High-tech", "Cadeaux offerts"]],
  ["🎓", "Études & formation", "#6366f1", ["Frais de scolarité", "Fournitures & livres", "Formation continue", "Permis de conduire", "Logement étudiant (CROUS…)"]],
  ["👶", "Enfants & famille", "#f97316", ["Garde d'enfants", "École & activités", "Vêtements & équipement enfant", "Pension alimentaire versée", "Aide à un proche"]],
  ["🐾", "Animaux", "#84cc16", ["Nourriture animale", "Vétérinaire", "Accessoires & garde"]],
  ["🛡️", "Assurances & prévoyance", "#64748b", ["Assurance vie", "Prévoyance & obsèques", "Responsabilité civile", "Autres assurances"]],
  ["🏛️", "Impôts & taxes", "#a16207", ["Impôt sur le revenu", "Taxe d'habitation", "Cotisations URSSAF / CFE", "Redevances & amendes"]],
  ["💳", "Dettes & frais bancaires", "#dc2626", ["Crédit à la consommation", "Prêt étudiant", "Remboursement à un proche", "Frais bancaires & agios"]],
  ["💰", "Épargne & investissement", "#059669", ["Épargne de précaution", "Livret & comptes épargne", "Bourse / PEA / assurance-vie", "Épargne retraite", "Crypto", "Épargne projet"]],
  ["❤️", "Dons & solidarité", "#e11d48", ["Dons aux associations", "Cagnottes & soutien"]],
  ["📦", "Divers & imprévus", "#78716c", ["Imprévus", "Frais administratifs", "Autres dépenses"]],
];
const DEFAULT_INCOME_CATS = [
  ["💼", "Salaire & emploi", "#10b981", ["Salaire net", "Primes & bonus", "13e mois", "Heures supplémentaires", "Indemnités (transport, repas…)"]],
  ["🧑‍💻", "Activité indépendante", "#8b5cf6", ["Chiffre d'affaires freelance", "Micro-entreprise", "Dividendes", "Droits d'auteur"]],
  ["🎓", "Étudiant & alternance", "#6366f1", ["Bourse (CROUS…)", "Salaire d'alternance", "Job étudiant", "Stage gratifié", "Aide des parents", "Prêt étudiant reçu"]],
  ["🏛️", "Aides & prestations", "#0ea5e9", ["APL / aides au logement", "RSA", "Prime d'activité", "Allocations familiales", "Chômage (ARE)", "Indemnités journalières", "Autres aides"]],
  ["🏦", "Revenus du patrimoine", "#f59e0b", ["Intérêts d'épargne", "Dividendes & plus-values", "Revenus locatifs", "Rente"]],
  ["👵", "Retraite & pensions", "#f97316", ["Pension de retraite", "Pension alimentaire reçue", "Pension d'invalidité"]],
  ["🔄", "Autres revenus", "#64748b", ["Ventes d'occasion", "Remboursements reçus", "Cadeaux & dons reçus", "Revenus exceptionnels"]],
];

function buildDefaultCategories() {
  const cats = [];
  const make = (defs, kind) => defs.forEach(([emoji, name, color, subs]) => {
    const id = uid();
    cats.push({ id, kind, name, emoji, color, parentId: null });
    (subs || []).forEach(s => cats.push({ id: uid(), kind, name: s, emoji, color, parentId: id }));
  });
  make(DEFAULT_EXPENSE_CATS, "expense");
  make(DEFAULT_INCOME_CATS, "income");
  return cats;
}

/* Situations (onboarding + modèles de budget) */
const SITUATIONS = [
  { id: "etudiant", emoji: "🎓", t: "Étudiant·e", d: "Bourse, APL, job, aide des parents" },
  { id: "salarie", emoji: "💼", t: "Salarié·e", d: "Revenus fixes, primes éventuelles" },
  { id: "independant", emoji: "🧑‍💻", t: "Indépendant·e", d: "Revenus variables, URSSAF, charges pro" },
  { id: "famille", emoji: "👨‍👩‍👧", t: "Famille / couple", d: "Budget commun, enfants, allocations" },
  { id: "retraite", emoji: "🌅", t: "Retraité·e", d: "Pensions, complémentaires" },
  { id: "transition", emoji: "🧭", t: "En transition", d: "Recherche d'emploi, reconversion, chômage" },
  { id: "vide", emoji: "📄", t: "Partir de zéro", d: "Budget vierge, je remplis tout moi-même" },
];

/* Postes proposés par situation : [kind, nom, catégorie, montant indicatif, freq, variable, jour] */
const TEMPLATE_ITEMS = {
  etudiant: [
    ["income", "Bourse du CROUS", "Bourse (CROUS…)", 460, "monthly", false, 5],
    ["income", "APL", "APL / aides au logement", 180, "monthly", false, 25],
    ["income", "Aide des parents", "Aide des parents", 200, "monthly", false, 1],
    ["income", "Job étudiant", "Job étudiant", 350, "monthly", true, 28],
    ["expense", "Loyer studio / résidence", "Loyer", 450, "monthly", false, 5],
    ["expense", "Courses", "Courses", 200, "monthly", true, 12],
    ["expense", "Resto U / cantine", "Cantine / RU", 40, "monthly", true, 15],
    ["expense", "Forfait mobile", "Forfait mobile", 12, "monthly", false, 8],
    ["expense", "Transports en commun", "Transports en commun", 25, "monthly", false, 3],
    ["expense", "Sorties", "Sorties & bars", 60, "monthly", true, 20],
    ["expense", "Frais de scolarité", "Frais de scolarité", 175, "annual", false, 10],
  ],
  salarie: [
    ["income", "Salaire net", "Salaire net", 2100, "monthly", false, 28],
    ["expense", "Loyer / crédit", "Loyer", 750, "monthly", false, 3],
    ["expense", "Électricité & gaz", "Électricité", 90, "monthly", false, 10],
    ["expense", "Courses", "Courses", 320, "monthly", true, 12],
    ["expense", "Restaurants & sorties", "Restaurants", 120, "monthly", true, 18],
    ["expense", "Transport", "Transports en commun", 75, "monthly", false, 5],
    ["expense", "Forfait mobile + box", "Forfait mobile", 45, "monthly", false, 8],
    ["expense", "Mutuelle", "Mutuelle", 40, "monthly", false, 6],
    ["expense", "Abonnements streaming", "Streaming & musique", 25, "monthly", false, 15],
    ["expense", "Épargne automatique", "Épargne de précaution", 200, "monthly", false, 2],
    ["expense", "Impôt sur le revenu", "Impôt sur le revenu", 110, "monthly", false, 15],
  ],
  independant: [
    ["income", "Chiffre d'affaires", "Chiffre d'affaires freelance", 3200, "monthly", true, 15],
    ["expense", "Cotisations URSSAF", "Cotisations URSSAF / CFE", 700, "monthly", true, 5],
    ["expense", "Impôt sur le revenu", "Impôt sur le revenu", 250, "monthly", true, 15],
    ["expense", "Loyer", "Loyer", 800, "monthly", false, 3],
    ["expense", "Logiciels & outils pro", "Logiciels & cloud", 60, "monthly", false, 10],
    ["expense", "Mutuelle & prévoyance", "Mutuelle", 80, "monthly", false, 6],
    ["expense", "Courses", "Courses", 350, "monthly", true, 12],
    ["expense", "Épargne lissage revenus", "Épargne de précaution", 400, "monthly", false, 20],
  ],
  famille: [
    ["income", "Salaire net 1", "Salaire net", 2300, "monthly", false, 28],
    ["income", "Salaire net 2", "Salaire net", 1900, "monthly", false, 1],
    ["income", "Allocations familiales", "Allocations familiales", 140, "monthly", false, 5],
    ["expense", "Crédit immobilier", "Crédit immobilier", 1100, "monthly", false, 5],
    ["expense", "Courses", "Courses", 650, "monthly", true, 10],
    ["expense", "Garde d'enfants", "Garde d'enfants", 450, "monthly", false, 2],
    ["expense", "Électricité & gaz", "Électricité", 140, "monthly", false, 10],
    ["expense", "Assurances (auto, habitation…)", "Assurance auto/moto", 130, "monthly", false, 7],
    ["expense", "Carburant", "Carburant", 180, "monthly", true, 14],
    ["expense", "Activités enfants", "École & activités", 80, "monthly", false, 8],
    ["expense", "Impôt sur le revenu", "Impôt sur le revenu", 280, "monthly", false, 15],
    ["expense", "Épargne & projets", "Épargne projet", 300, "monthly", false, 2],
  ],
  retraite: [
    ["income", "Pension de retraite", "Pension de retraite", 1500, "monthly", false, 9],
    ["income", "Retraite complémentaire", "Pension de retraite", 480, "monthly", false, 1],
    ["expense", "Logement (charges, taxe…)", "Charges de copropriété", 250, "monthly", false, 5],
    ["expense", "Courses", "Courses", 300, "monthly", true, 12],
    ["expense", "Santé & mutuelle", "Mutuelle", 120, "monthly", false, 6],
    ["expense", "Loisirs & sorties", "Sorties & bars", 100, "monthly", true, 18],
    ["expense", "Aide aux enfants / petits-enfants", "Aide à un proche", 100, "monthly", true, 20],
  ],
  transition: [
    ["income", "Allocation chômage (ARE)", "Chômage (ARE)", 1150, "monthly", false, 3],
    ["expense", "Loyer", "Loyer", 600, "monthly", false, 5],
    ["expense", "Courses", "Courses", 250, "monthly", true, 12],
    ["expense", "Forfait mobile + internet", "Forfait mobile", 40, "monthly", false, 8],
    ["expense", "Transport", "Transports en commun", 40, "monthly", true, 10],
    ["expense", "Mutuelle", "Mutuelle", 35, "monthly", false, 6],
  ],
  vide: [],
};

/* Mots-clés pour la catégorisation automatique des imports CSV */
const AUTO_CAT_KEYWORDS = [
  [/carrefour|leclerc|auchan|lidl|aldi|intermarche|monoprix|franprix|casino|super u|biocoop|grand frais/i, "Courses"],
  [/uber eats|deliveroo|just eat|mcdo|mcdonald|burger king|kfc|domino|pizza/i, "Livraison & à emporter"],
  [/restaurant|resto|brasserie|bistro/i, "Restaurants"],
  [/sncf|ouigo|ratp|navigo|tcl|ter\b|blablacar|flixbus/i, "Transports en commun"],
  [/total|esso|shell|station|essence|carburant/i, "Carburant"],
  [/uber\b|bolt|free now|heetch/i, "Taxi & VTC"],
  [/netflix|spotify|disney|prime video|canal|deezer|youtube premium|apple music|hbo|crunchyroll/i, "Streaming & musique"],
  [/free|orange|sfr|bouygues|sosh|red by|prixtel/i, "Forfait mobile"],
  [/edf|engie|totalenergies|enercoop|ekwateur/i, "Électricité"],
  [/loyer|agence immo|foncia|nexity/i, "Loyer"],
  [/pharmacie|docteur|medecin|dentiste|laboratoire|hopital|clinique/i, "Pharmacie"],
  [/mutuelle|harmonie|mgen|maif sante/i, "Mutuelle"],
  [/basic fit|fitness|neoness|salle de sport|decathlon/i, "Sport & salle"],
  [/cinema|ugc|pathe|gaumont|fnac|steam|playstation|nintendo/i, "Cinéma & culture"],
  [/zara|h&m|uniqlo|kiabi|vinted|zalando|nike|adidas/i, "Vêtements & chaussures"],
  [/airbnb|booking|hotel|ryanair|easyjet|air france|transavia/i, "Hébergement"],
  [/impot|dgfip|tresor public|amende/i, "Impôt sur le revenu"],
  [/caf\b|apl/i, "APL / aides au logement"],
  [/pole emploi|france travail/i, "Chômage (ARE)"],
  [/salaire|paie|paye|virement employeur/i, "Salaire net"],
  [/crous/i, "Bourse (CROUS…)"],
  [/veterinaire|animalerie|croquettes/i, "Vétérinaire"],
  [/assurance|maif|macif|matmut|axa|allianz|groupama/i, "Autres assurances"],
];

const BUDGET_EMOJIS = ["💼", "🏠", "🎓", "✈️", "💍", "👶", "🚀", "🏖️", "🛠️", "🎯", "🧪", "📊"];
const BUDGET_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4", "#ef4444", "#84cc16"];
