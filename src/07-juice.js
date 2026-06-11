"use strict";
/* ============ juice : micro-animations, célébrations & série quotidienne ============ */

const Juice = (() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const on = () => State.settings.juice !== false && !reduced.matches;

  /* ---- retour haptique (mobile) ---- */
  function buzz(pattern) {
    if (!on() || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  /* ---- moteur confettis : un canvas plein écran partagé, retiré quand tout est retombé ---- */
  const COLORS = ["#10b981", "#34d399", "#f59e0b", "#3b82f6", "#8b5cf6", "#f43f5e", "#fbbf24"];
  let cv = null, ctx = null, parts = [], raf = 0;

  function ensureCanvas() {
    if (!cv) {
      cv = el("canvas", { class: "fx-canvas" });
      document.body.append(cv);
      ctx = cv.getContext("2d");
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) {
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function spawn(n, mk) {
    if (!on()) return;
    ensureCanvas();
    const born = performance.now();
    for (let i = 0; i < n; i++) { const p = mk(i); p.born = born; parts.push(p); }
    if (!raf) loop();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // purge : fin de vie, sorti de l'écran, ou trop vieux (onglet resté en arrière-plan)
    const now = performance.now();
    parts = parts.filter(p => p.life < p.ttl && p.y < innerHeight + 40 && now - p.born < 12000);
    if (!parts.length) {
      cancelAnimationFrame(raf); raf = 0;
      cv.remove(); cv = ctx = null;
      return;
    }
    for (const p of parts) {
      p.life++;
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx + (p.sway ? Math.sin(p.life * 0.08 + p.sway) * 0.8 : 0);
      p.y += p.vy;
      p.rot += p.vr;
      ctx.globalAlpha = clamp(1 - Math.max(0, (p.life - p.ttl * 0.7) / (p.ttl * 0.3)), 0, 1);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, 7); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const burstPart = (x, y) => {
    const a = Math.random() * Math.PI * 2;
    const v = 5.5 * (0.4 + Math.random());
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4,
      g: 0.26, drag: 0.985,
      rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.35,
      size: 4 + Math.random() * 5,
      color: COLORS[Math.random() * COLORS.length | 0],
      shape: Math.random() < 0.4 ? 1 : 0,
      life: 0, ttl: 60 + Math.random() * 50, sway: 0,
    };
  };

  /* éclat localisé — accepte un nœud, un événement de clic, ou rien (centre bas de l'écran) */
  function pop(target, n) {
    if (!on()) return;
    if (target && target.currentTarget) target = target.currentTarget;
    let x = innerWidth / 2, y = innerHeight * 0.7;
    if (target && target.getBoundingClientRect) {
      const r = target.getBoundingClientRect();
      if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
    }
    spawn(n || 22, () => burstPart(x, y));
  }

  /* pluie de confettis : grande célébration */
  function rain(n) {
    spawn(n || 130, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 1.6, vy: 2 + Math.random() * 3.2,
      g: 0.045, drag: 0.999,
      rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.25,
      size: 5 + Math.random() * 5,
      color: COLORS[Math.random() * COLORS.length | 0],
      shape: Math.random() < 0.4 ? 1 : 0,
      life: 0, ttl: 330, sway: Math.random() * 6.3,
    }));
  }

  /* ---- chiffres animés : fait défiler la partie numérique d'un texte déjà rendu ---- */
  function countUpText(node, dur) {
    const final = node.textContent;
    const m = final.match(/-?\d(?:[\d\s  ]*\d)?(?:,\d+)?/);
    if (!m) return;
    const raw = m[0];
    const val = parseFloat(raw.replace(/[\s  ]/g, "").replace(",", "."));
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
      c.style.setProperty("--jd", i * 38 + "ms");
    });
    $$(".kpi", content).forEach((k, i) => {
      k.classList.add("j-stagger");
      k.style.setProperty("--jd", i * 45 + "ms");
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

  /* ---- série quotidienne (streak) ---- */
  const MILESTONES = [3, 5, 7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365];

  /* À appeler une fois au démarrage. Retourne le palier atteint aujourd'hui, sinon 0. */
  function touchStreak() {
    const g = State.gami;
    const today = todayStr();
    if (g.lastDay === today) return 0;
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    g.streak = g.lastDay === yesterday ? g.streak + 1 : 1;
    g.lastDay = today;
    if (g.streak > (g.best || 0)) g.best = g.streak;
    persist();
    return MILESTONES.includes(g.streak) ? g.streak : 0;
  }

  function streakMilestone(n) {
    rain(150);
    buzz([20, 60, 30, 60, 80]);
    toast(`🔥 ${n} jours d'affilée ! Votre budget vous dit merci.`, { ms: 5200 });
  }

  function streakChip() {
    const g = State.gami;
    if (!g || !g.streak) return null;
    return el("button", {
      class: "streak-chip",
      title: `Série : ${g.streak} jour${g.streak > 1 ? "s" : ""} d'affilée · record ${g.best}`,
      onclick: openStreakModal,
    }, el("span", { class: "fl" }, "🔥"), el("b", {}, String(g.streak)));
  }

  function openStreakModal() {
    const g = State.gami;
    const next = MILESTONES.find(x => x > g.streak) || g.streak + 1;
    const prev = [...MILESTONES].reverse().find(x => x <= g.streak) || 0;
    const pct = clamp((g.streak - prev) / (next - prev), 0.05, 1);
    const stat = (emoji, v, label) => el("div", { style: "text-align:center" },
      el("div", { style: "font-size:18px" }, emoji),
      el("div", { style: "font-weight:800; font-size:17px" }, String(v)),
      el("div", { class: "xs muted" }, label));
    const m = modal({
      title: "Votre série",
      body: el("div", { style: "text-align:center; padding:8px 0 6px" },
        el("div", { class: "streak-big" }, "🔥"),
        el("div", { style: "font-size:32px; font-weight:800; letter-spacing:-.02em" }, String(g.streak)),
        el("div", { class: "muted small" }, `jour${g.streak > 1 ? "s" : ""} d'affilée à garder un œil sur votre budget`),
        el("div", { class: "mt16", style: "text-align:left" },
          el("div", { class: "flex small mb8" },
            el("span", { class: "muted" }, "Prochain palier"),
            el("span", { class: "spacer" }),
            el("b", {}, `${next} jours`)),
          el("div", { class: "pbar", style: "height:10px" },
            el("i", { style: `width:${pct * 100}%; background:linear-gradient(90deg,#f59e0b,#ef4444)` }))),
        el("div", { class: "flex mt16", style: "justify-content:center; gap:26px" },
          stat("🏆", g.best || g.streak, "record"),
          stat("🎖️", MILESTONES.filter(x => x <= (g.best || 0)).length, "paliers atteints")),
        el("p", { class: "xs muted mt16", style: "line-height:1.7" },
          "Ouvrez l'application chaque jour pour faire grandir la flamme — un jour manqué et la série repart de zéro. Le suivi régulier, c'est le secret d'un budget tenu.")),
    });
    growBars(m.root);
  }

  /* ---- célébrations ---- */
  const TX_TOASTS = [
    "💪 C'est noté !", "👏 Suivi à jour", "✨ Bien joué", "📒 Enregistré, rien ne vous échappe",
    "🧠 Noté = maîtrisé", "🎯 Toujours au point",
  ];
  let _txStep = Math.random() * TX_TOASTS.length | 0;

  function txAdded(target) {
    pop(target, 20);
    buzz(12);
    toast(TX_TOASTS[_txStep++ % TX_TOASTS.length], { ms: 1700 });
  }

  function goalReached(g) {
    rain(190);
    buzz([25, 70, 35, 70, 120]);
    toast(`🎉 Objectif « ${g.name} » atteint, félicitations !`, { ms: 6500 });
  }

  function welcome() {
    rain(140);
    buzz([15, 50, 25]);
  }

  return { on, view, growBars, pop, rain, buzz, txAdded, goalReached, welcome, touchStreak, streakMilestone, streakChip };
})();
