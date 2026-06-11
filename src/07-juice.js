"use strict";
/* ============ animations d'interface : entrées de vue, chiffres, jauges ============ */

const Juice = (() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const on = () => State.settings.juice !== false && !reduced.matches;

  /* ---- retour haptique discret (mobile, confirmation d'action) ---- */
  function buzz(pattern) {
    if (!on() || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  /* ---- chiffres animés : fait défiler la partie numérique d'un texte déjà rendu ---- */
  function countUpText(node, dur) {
    const final = node.textContent;
    const m = final.match(/-?\d(?:[\d\s  ]*\d)?(?:,\d+)?/);
    if (!m) return;
    const raw = m[0];
    const val = parseFloat(raw.replace(/[\s  ]/g, "").replace(",", "."));
    if (!isFinite(val) || Math.abs(val) < 1) return;
    const dec = (raw.split(",")[1] || "").length;
    const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      node.textContent = p >= 1 ? final : final.replace(raw, nf.format(val * e));
      if (p < 1 && node.isConnected) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---- animation d'entrée d'une vue : sections en cascade, chiffres et jauges ---- */
  function view(content) {
    if (!on()) return;
    const inner = $(".content-inner", content) || content;
    [...inner.children].slice(0, 14).forEach((c, i) => {
      c.classList.add("j-stagger");
      c.style.setProperty("--jd", i * 34 + "ms");
    });
    $$(".kpi", content).forEach((k, i) => {
      k.classList.add("j-stagger");
      k.style.setProperty("--jd", i * 40 + "ms");
    });
    $$(".k-value", content).forEach(n => countUpText(n, 620));
    growBars(content);
  }

  /* jauges : pousse de 0 vers leur largeur cible (transition CSS) */
  function growBars(root) {
    if (!on()) return;
    $$(".pbar>i", root).forEach(bar => {
      const w = bar.style.width;
      if (!w || w === "0%") return;
      bar.style.width = "0%";
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = w; }));
    });
  }

  return { on, view, growBars, buzz };
})();
