"use strict";
/* ============ moteur de récurrence & d'évolution des postes ============ */

/* Montant d'une occurrence du poste au mois donné (paliers + croissance + scénario). */
function amountAt(item, ym, scenarioMode, inflation) {
  let base;
  if (item.variable && scenarioMode && scenarioMode !== "expected") {
    const optimistic = scenarioMode === "optimistic";
    const wantHigh = (item.kind === "income") === optimistic; // revenu haut si optimiste, dépense basse si optimiste
    base = wantHigh ? (item.max ?? item.amount) : (item.min ?? item.amount);
  } else base = item.amount;

  let baseDate = item.startDate || todayStr();
  const target = ym + "-28";
  const steps = (item.steps || []).filter(s => s.date && s.value != null).sort((a, z) => a.date.localeCompare(z.date));
  for (const s of steps) {
    if (s.date + "-01" > target) break;
    if (s.type === "set") { base = +s.value; baseDate = s.date + "-01"; }
    else { base *= 1 + (+s.value) / 100; baseDate = s.date + "-01"; }
  }
  const g = item.growth === "inf" ? (inflation ?? 2) : (+item.growth || 0);
  if (g) {
    const years = Math.floor(Math.max(0, yearsBetween(baseDate, ym + "-15")));
    if (years > 0) base *= Math.pow(1 + g / 100, years);
  }
  return base;
}

/* Le poste est-il actif (au moins partiellement) sur ce mois ? */
function itemCoversMonth(item, ym) {
  const mStart = ym + "-01", mEnd = ym + "-" + String(daysInMonth(ym)).padStart(2, "0");
  if (item.startDate && item.startDate > mEnd) return false;
  if (item.endDate && item.endDate < mStart) return false;
  return true;
}

/* Dates d'occurrence du poste dans le mois (pour le calendrier). */
function occurrenceDatesInMonth(item, ym) {
  if (!itemCoversMonth(item, ym)) return [];
  const dim = daysInMonth(ym);
  const mStart = ym + "-01", mEnd = ym + "-" + String(dim).padStart(2, "0");
  const lo = item.startDate && item.startDate > mStart ? item.startDate : mStart;
  const hi = item.endDate && item.endDate < mEnd ? item.endDate : mEnd;
  if (lo > hi) return [];
  const out = [];

  if (item.freq === "once") {
    if (item.startDate >= lo && item.startDate <= hi) out.push(item.startDate);
    return out;
  }
  if (item.freq === "daily") {
    for (let d = +lo.slice(8); d <= +hi.slice(8); d++) out.push(ym + "-" + String(d).padStart(2, "0"));
    return out;
  }
  if (item.freq === "weekly" || item.freq === "biweekly") {
    const stepMs = (item.freq === "weekly" ? 7 : 14) * 86400000;
    const start = toDate(item.startDate || mStart);
    let t = start.getTime();
    const loT = toDate(lo).getTime(), hiT = toDate(hi).getTime();
    if (t < loT) t += Math.ceil((loT - t) / stepMs) * stepMs;
    for (; t <= hiT; t += stepMs) {
      const d = new Date(t);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
  }
  // fréquences en mois entiers
  const interval = FREQ_MONTHS[item.freq] || 1;
  const anchor = monthIndex(item.startDate || mStart);
  const mi = monthIndex(ym);
  if (mi < anchor || (mi - anchor) % interval !== 0) return [];
  const day = clamp(+item.day || +String(item.startDate || "1").slice(8) || 1, 1, dim);
  const date = ym + "-" + String(day).padStart(2, "0");
  if (date >= lo && date <= hi) out.push(date);
  return out;
}

/* Total du poste sur un mois donné. */
function monthlyAmount(item, ym, scenarioMode, inflation) {
  const n = occurrenceDatesInMonth(item, ym).length;
  return n === 0 ? 0 : n * amountAt(item, ym, scenarioMode, inflation);
}

/* Équivalent mensuel moyen (pour l'affichage des listes). */
function monthlyEquivalent(item) {
  if (item.freq === "once") return 0;
  return item.amount * (FREQS[item.freq].perYear / 12);
}

/* Description lisible de la récurrence d'un poste. */
function freqLabel(item) {
  let s = FREQS[item.freq].label.toLowerCase();
  if (FREQ_MONTHS[item.freq] && item.day) s += ` le ${item.day}`;
  if (item.freq === "once") s = "le " + fmtDate(item.startDate);
  const now = todayStr();
  if (item.startDate && item.startDate > now && item.freq !== "once") s += ` · à partir de ${fmtDateShort(item.startDate)} ${item.startDate.slice(0, 4)}`;
  if (item.endDate) s += ` · jusqu'à ${fmtDateShort(item.endDate)} ${item.endDate.slice(0, 4)}`;
  return s;
}

/* ============ crédits : amortissement ============ */
/* Mensualité d'un prêt (annuité constante). */
function loanPayment(principal, annualRatePct, months) {
  const r = (annualRatePct / 100) / 12;
  if (!months || months <= 0) return 0;
  if (!r) return principal / months;
  return principal * r / (1 - Math.pow(1 + r, -months));
}
/* Nombre de mois pour rembourser avec une mensualité donnée. */
function loanMonths(principal, annualRatePct, payment) {
  const r = (annualRatePct / 100) / 12;
  if (payment <= 0) return Infinity;
  if (!r) return Math.ceil(principal / payment);
  if (payment <= principal * r) return Infinity;
  return Math.ceil(-Math.log(1 - principal * r / payment) / Math.log(1 + r));
}
/* Tableau d'amortissement complet. */
function amortize(debt) {
  const r = ((+debt.rate || 0) / 100) / 12;
  let bal = +debt.principal || 0;
  const pay = +debt.payment || 0;
  const extra = +debt.extra || 0;
  const rows = [];
  let ym = ymOf(debt.startDate || todayStr());
  let guard = 0;
  while (bal > 0.005 && guard++ < 1200) {
    const interest = bal * r;
    let principalPart = Math.min(bal, pay + extra - interest);
    if (principalPart <= 0 && r > 0) { rows.length = 0; break; } // mensualité trop faible
    bal = Math.max(0, bal - principalPart);
    rows.push({ ym, payment: principalPart + interest, interest, principal: principalPart, balance: bal });
    ym = addMonths(ym, 1);
  }
  return rows;
}
function debtMonthly(debt, ym) {
  const rows = amortize(debt);
  const row = rows.find(x => x.ym === ym);
  return row ? row.payment : 0;
}
function debtPayoffYm(debt) {
  const rows = amortize(debt);
  return rows.length ? rows[rows.length - 1].ym : null;
}
