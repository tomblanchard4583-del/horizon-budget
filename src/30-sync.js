"use strict";
/* ============ synchronisation multi-appareils (Supabase REST, sans dépendance) ============
 *
 * Modèle : un "salon" (room) = un code secret partagé par la famille. Le document complet
 * (réglages + budgets + transactions + tombstones) est stocké dans une ligne Supabase.
 * Fusion par enregistrement : chaque record porte un _rev (timestamp ms). À la fusion, la
 * version la plus récente de chaque record gagne ; les suppressions sont propagées via un
 * cimetière (graveyard) de tombstones. Deux personnes peuvent éditer en même temps sans
 * s'écraser, sauf modification simultanée du MÊME champ du MÊME record (dernier gagne).
 *
 * Transport : REST direct (fetch). Quasi temps réel par interrogation courte (4 s visible).
 * Hors-ligne : tout est mis en pause et reprend automatiquement au retour du réseau.
 */
const Sync = (() => {
  const SUBCOLLS = ["categories", "items", "debts", "goals", "accounts", "events"];
  const GRAVE_TTL = 90 * 86400000; // 90 jours

  let _base = {};            // empreinte du dernier état synchronisé { "type:id": contentString }
  let _prevSettingsSnap = {}; // snapshot des valeurs de settings au dernier buildBase() — pour détection par champ
  let _pushTimer = null;
  let _pollTimer = null;
  let _busy = false;
  let _pending = false;
  let status = "off";        // off | connecting | synced | syncing | offline | error
  let lastError = "";

  /* Champs ignorés par stable() — métadonnées de sync, pas du contenu. */
  const STABLE_SKIP = new Set(["_rev", "_ts", "_revs"]);
  /* Champs de settings locaux à l'appareil : jamais fusionnés depuis le distant. */
  const DEVICE_LOCAL_SETTINGS = new Set(["theme"]);

  /* ---------- sérialisation stable (ignore métadonnées sync) ---------- */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object")
      return "{" + Object.keys(v).filter(k => !STABLE_SKIP.has(k)).sort()
        .map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    return JSON.stringify(v);
  }
  function budgetScalar(b) {
    const o = {};
    for (const k in b) if (!SUBCOLLS.includes(k) && !STABLE_SKIP.has(k)) o[k] = b[k];
    return stable(o);
  }
  function buildBase() {
    _prevSettingsSnap = {};
    for (const k in State.settings) {
      if (STABLE_SKIP.has(k)) continue;
      _prevSettingsSnap[k] = JSON.stringify(State.settings[k]);
    }
    const m = {};
    m["settings:_"] = stable(State.settings);
    for (const b of State.budgets) {
      m["budget:" + b.id] = budgetScalar(b);
      for (const sc of SUBCOLLS) for (const r of (b[sc] || [])) m[sc + ":" + r.id] = stable(r);
    }
    for (const t of State.transactions) m["tx:" + t.id] = stable(t);
    return m;
  }

  /* ---------- détection des changements locaux → stamping _rev/_ts + tombstones ---------- */
  function stampChanges() {
    // Lamport : initialiser depuis Date.now() si premier usage (rétrocompat timestamps existants)
    if (!State.sync.lamport) State.sync.lamport = Date.now();
    State.sync.lamport++;
    const L = State.sync.lamport;
    const ts = Date.now();

    const seen = {};
    const mark = (key, contentNow, rec) => {
      seen[key] = 1;
      if (_base[key] !== contentNow) { rec._rev = L; rec._ts = ts; }
    };

    // Settings : détection par champ pour _revs
    const settingsStable = stable(State.settings);
    seen["settings:_"] = 1;
    if (_base["settings:_"] !== settingsStable) {
      State.settings._rev = L;
      State.settings._ts = ts;
      if (!State.settings._revs) State.settings._revs = {};
      for (const k in State.settings) {
        if (STABLE_SKIP.has(k)) continue;
        if (_prevSettingsSnap[k] !== JSON.stringify(State.settings[k])) {
          State.settings._revs[k] = L;
        }
      }
    }

    for (const b of State.budgets) {
      mark("budget:" + b.id, budgetScalar(b), b);
      for (const sc of SUBCOLLS) for (const r of (b[sc] || [])) mark(sc + ":" + r.id, stable(r), r);
    }
    for (const t of State.transactions) mark("tx:" + t.id, stable(t), t);
    // suppressions : présents dans la base mais plus dans l'état courant
    for (const key in _base) {
      if (key === "settings:_") continue;
      if (!seen[key]) State.sync.graveyard[key] = ts; // wall-clock pour compatibilité TTL
    }
    pruneGraveyard();
    _base = buildBase();
  }
  function pruneGraveyard() {
    const cut = Date.now() - GRAVE_TTL;
    for (const k in State.sync.graveyard) if (State.sync.graveyard[k] < cut) delete State.sync.graveyard[k];
  }

  /* Max _rev vu dans un document — pour mettre à jour le compteur de Lamport local. */
  function _maxRevInDoc(doc) {
    let m = 0;
    if (doc && doc.settings) m = Math.max(m, doc.settings._rev || 0);
    for (const b of (doc && doc.budgets || [])) {
      m = Math.max(m, b._rev || 0);
      for (const sc of SUBCOLLS) for (const r of (b[sc] || [])) m = Math.max(m, r._rev || 0);
    }
    for (const t of (doc && doc.transactions || [])) m = Math.max(m, t._rev || 0);
    return m;
  }

  /* ---------- fusion de deux documents ---------- */
  function mergeArr(a, b, type, grave) {
    const out = {};
    for (const r of (a || [])) out[r.id] = r;
    for (const r of (b || [])) { const ex = out[r.id]; if (!ex || (r._rev || 0) > (ex._rev || 0)) out[r.id] = r; }
    return Object.values(out).filter(r => {
      const g = grave[type + ":" + r.id];
      if (!g) return true;
      // Comparer le graveyard (wall-clock) avec _ts du record si disponible (nouveaux records),
      // sinon avec _rev (anciens records dont _rev était un timestamp wall-clock).
      const rTs = r._ts || r._rev || 0;
      return !(g >= rTs);
    });
  }

  /* Fusion champ par champ des settings — chaque champ garde la version au _revs le plus élevé. */
  function mergeSettings(L_set, R_set) {
    const l_revs = (L_set && L_set._revs) || {};
    const r_revs = (R_set && R_set._revs) || {};
    const out = {}, out_revs = {};
    const allKeys = new Set([
      ...Object.keys(L_set || {}),
      ...Object.keys(R_set || {}),
    ].filter(k => !STABLE_SKIP.has(k)));
    for (const k of allKeys) {
      if (DEVICE_LOCAL_SETTINGS.has(k)) {
        // Champ local à l'appareil : toujours garder la valeur de L (l'appareil local)
        out[k] = k in (L_set || {}) ? L_set[k] : (R_set || {})[k];
      } else {
        const l_r = l_revs[k] || 0;
        const r_r = r_revs[k] || 0;
        if (r_r > l_r) { out[k] = (R_set || {})[k]; out_revs[k] = r_r; }
        else            { out[k] = (L_set || {})[k]; out_revs[k] = l_r; }
      }
    }
    out._rev  = Math.max((L_set && L_set._rev) || 0, (R_set && R_set._rev) || 0);
    out._revs = out_revs;
    return out;
  }

  function mergeDoc(L, R) {
    const grave = {};
    for (const k in (L.graveyard || {})) grave[k] = L.graveyard[k];
    for (const k in (R.graveyard || {})) grave[k] = Math.max(grave[k] || 0, R.graveyard[k]);
    const settings = mergeSettings(L.settings, R.settings);
    const bmap = {};
    for (const x of (L.budgets || [])) (bmap[x.id] = bmap[x.id] || {}).L = x;
    for (const x of (R.budgets || [])) (bmap[x.id] = bmap[x.id] || {}).R = x;
    const budgets = [];
    for (const id in bmap) {
      const bl = bmap[id].L, br = bmap[id].R;
      const rev = Math.max(bl && bl._rev || 0, br && br._rev || 0);
      const g = grave["budget:" + id];
      if (g && g >= rev) continue;
      const base = (bl && br) ? ((br._rev || 0) > (bl._rev || 0) ? br : bl) : (bl || br);
      const merged = Object.assign({}, base);
      for (const sc of SUBCOLLS) merged[sc] = mergeArr(bl && bl[sc], br && br[sc], sc, grave);
      budgets.push(merged);
    }
    const transactions = mergeArr(L.transactions, R.transactions, "tx", grave);
    return { settings, budgets, transactions, graveyard: grave };
  }

  /* ---------- document ⇄ état ---------- */
  const docFromState = () => ({
    settings: State.settings, budgets: State.budgets,
    transactions: State.transactions, graveyard: State.sync.graveyard,
  });
  function applyDoc(doc) {
    // mergeSettings() conserve déjà les champs DEVICE_LOCAL_SETTINGS depuis L (local),
    // donc State.settings.theme est déjà correct dans doc.settings.
    if (doc.settings) State.settings = doc.settings;
    State.budgets = doc.budgets || [];
    State.transactions = doc.transactions || [];
    State.sync.graveyard = doc.graveyard || {};
    // Mettre à jour le Lamport local pour qu'il reste ≥ à toute valeur vue
    State.sync.lamport = Math.max(State.sync.lamport || 0, _maxRevInDoc(doc));
    if (!State.budgets.find(b => b.id === State.activeBudgetId))
      State.activeBudgetId = (State.budgets.find(b => !b.archived) || State.budgets[0] || {}).id || null;
  }

  /* ---------- chiffrement de bout en bout (AES-256-GCM, clé dérivée du code de salon) ---------- */
  let _keyCache = { room: null, key: null };
  async function roomKey() {
    const room = State.sync.room.trim().toUpperCase();
    if (_keyCache.room === room && _keyCache.key) return _keyCache.key;
    const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(room), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: new TextEncoder().encode("horizon-budget:" + room), iterations: 150000, hash: "SHA-256" },
      mat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    _keyCache = { room, key };
    return key;
  }
  async function encryptDoc(doc) {
    const key = await roomKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(doc))));
    const all = new Uint8Array(iv.length + ct.length);
    all.set(iv); all.set(ct, iv.length);
    let bin = ""; for (let i = 0; i < all.length; i += 8192) bin += String.fromCharCode.apply(null, all.subarray(i, i + 8192));
    return { e: btoa(bin) }; // seul un blob chiffré part sur le serveur
  }
  async function decryptDoc(doc) {
    if (!doc) return doc;
    if (!doc.e) return doc; // document historique non chiffré : accepté en lecture
    const bin = atob(doc.e);
    const all = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) all[i] = bin.charCodeAt(i);
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, await roomKey(), all.subarray(12));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) {
      throw new Error("Déchiffrement impossible — code de salon incorrect ?");
    }
  }

  /* ---------- réseau (Supabase REST) ---------- */
  const cleanUrl = u => (u || "").trim().replace(/\/+$/, "");
  function headers(extra) {
    return Object.assign({
      "apikey": State.sync.anonKey.trim(),
      "Authorization": "Bearer " + State.sync.anonKey.trim(),
      "Content-Type": "application/json",
    }, extra || {});
  }
  const ROOM = () => encodeURIComponent(State.sync.room.trim());
  async function getRow() {
    const u = `${cleanUrl(State.sync.url)}/rest/v1/horizon_rooms?room=eq.${ROOM()}&select=doc,rev`;
    const r = await fetch(u, { headers: headers() });
    if (!r.ok) throw new Error("HTTP " + r.status + (r.status === 404 || r.status === 400 ? " — table introuvable ?" : ""));
    const a = await r.json();
    if (a[0]) a[0].doc = await decryptDoc(a[0].doc);
    return a[0] || null;
  }
  async function insertRow(doc) {
    const u = `${cleanUrl(State.sync.url)}/rest/v1/horizon_rooms`;
    const r = await fetch(u, {
      method: "POST", headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([{ room: State.sync.room.trim(), doc: await encryptDoc(doc), rev: 1, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok) return false;
    const a = await r.json().catch(() => []);
    return a.length > 0;
  }
  async function patchRow(doc, expectedRev) {
    const u = `${cleanUrl(State.sync.url)}/rest/v1/horizon_rooms?room=eq.${ROOM()}&rev=eq.${expectedRev}`;
    const r = await fetch(u, {
      method: "PATCH", headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ doc: await encryptDoc(doc), rev: expectedRev + 1, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return false;
    const a = await r.json().catch(() => []);
    return a.length > 0;
  }

  /* ---------- statut ---------- */
  function setStatus(s, err) {
    status = s; lastError = err || "";
    const chip = document.getElementById("sync-chip");
    if (chip) renderChipInto(chip);
  }
  const STATUS_META = {
    off: ["", "", "", false],
    connecting: ["sync", "Connexion…", "info", true],
    syncing: ["sync", "Synchro…", "info", true],
    synced: ["check", "À jour", "ok", false],
    offline: ["cloud", "Hors-ligne", "mut", false],
    error: ["alert", "Erreur sync", "danger", false],
  };
  function renderChipInto(chip) {
    const [icon, label, tone, spin] = STATUS_META[status] || STATUS_META.off;
    if (status === "off") { chip.style.display = "none"; return; }
    chip.style.display = "";
    chip.className = "sync-chip sc-" + tone;
    chip.title = lastError || (label + (State.sync.room ? " · salon " + State.sync.room : ""));
    chip.innerHTML = `<span class="ico ${spin ? "spin" : ""}" style="width:14px;height:14px;display:inline-grid;place-items:center">${I[icon] || ""}</span><span class="sc-label">${label}</span>`;
    chip.onclick = () => openSyncSetup();
  }
  function chipEl() {
    const chip = el("div", { id: "sync-chip", class: "sync-chip", role: "button", tabindex: 0 });
    renderChipInto(chip);
    return chip;
  }

  /* ---------- cœur : pousser (fusion + écriture concurrente) ---------- */
  async function pushNow() {
    if (!State.sync.enabled) return;
    if (!navigator.onLine) { setStatus("offline"); _pending = true; return; }
    if (_busy) { _pending = true; return; }
    _busy = true; _pending = false;
    setStatus("syncing");
    try {
      stampChanges();
      let local = docFromState();
      let changedRemote = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await getRow();
        // Mettre à jour Lamport depuis les données distantes avant de fusionner
        if (remote && remote.doc) State.sync.lamport = Math.max(State.sync.lamport || 0, _maxRevInDoc(remote.doc));
        const merged = remote ? mergeDoc(local, remote.doc || {}) : local;
        const ok = remote ? await patchRow(merged, remote.rev) : await insertRow(merged);
        if (ok) {
          const before = State.budgets.length + State.transactions.length;
          if (remote) { // la fusion peut avoir ramené des changements distants
            const prev = stableDocHash(local);
            applyDoc(merged);
            changedRemote = stableDocHash(docFromState()) !== prev;
          }
          State.sync.lastRev = (remote ? remote.rev : 0) + 1;
          _base = buildBase();
          try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); } catch (e) {}
          setStatus("synced");
          if (remote && !_openModals.length) renderApp();
          _busy = false;
          if (_pending) schedulePush();
          return;
        }
        local = docFromState(); // conflit : on relit et on refusionne
      }
      setStatus("error", "Conflit d'écriture persistant — réessai au prochain changement.");
    } catch (e) {
      setStatus(navigator.onLine ? "error" : "offline", String(e.message || e));
    } finally {
      _busy = false;
      if (_pending && navigator.onLine) schedulePush();
    }
  }
  function stableDocHash(doc) {
    let h = doc.transactions.length + "|" + doc.budgets.length + "|" + (doc.settings && doc.settings._rev || 0);
    for (const t of (doc.transactions || [])) h += "|" + (t._rev || 0);
    for (const b of (doc.budgets || [])) {
      h += "|b" + (b._rev || 0);
      for (const sc of SUBCOLLS) for (const r of (b[sc] || [])) h += "," + (r._rev || 0);
    }
    return h;
  }

  /* ---------- interrogation périodique ---------- */
  async function poll() {
    if (!State.sync.enabled || _busy || !navigator.onLine) return;
    if (_openModals.length) return; // ne pas perturber une saisie en cours
    try {
      const remote = await getRow();
      if (remote && remote.rev > (State.sync.lastRev || 0)) {
        if (remote.doc) State.sync.lamport = Math.max(State.sync.lamport || 0, _maxRevInDoc(remote.doc));
        const merged = mergeDoc(docFromState(), remote.doc || {});
        applyDoc(merged);
        State.sync.lastRev = remote.rev;
        _base = buildBase();
        try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); } catch (e) {}
        setStatus("synced");
        renderApp();
      } else if (status === "offline" || status === "error") setStatus("synced");
    } catch (e) {
      setStatus(navigator.onLine ? "error" : "offline", String(e.message || e));
    }
  }

  /* ---------- planification ---------- */
  function schedulePush() {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => { _pushTimer = null; pushNow(); }, 600);
  }
  function startLoop() {
    clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 4000);
  }

  /* ---------- API publique ---------- */
  function init() {
    if (!State.sync.deviceId) State.sync.deviceId = uid();
    _base = buildBase();
    window.addEventListener("online", () => { setStatus("connecting"); pushNow(); poll(); });
    window.addEventListener("offline", () => setStatus("offline"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") poll();
      else if (State.sync.enabled && _pushTimer !== null) { clearTimeout(_pushTimer); _pushTimer = null; pushNow(); }
    });
    if (State.sync.enabled && State.sync.url && State.sync.room) {
      setStatus("connecting");
      startLoop();
      poll().then(pushNow);
    } else setStatus("off");
  }

  async function connect(opts) {
    // opts: {url, anonKey, room, strategy} strategy: merge | pullCloud | pushLocal
    State.sync.url = cleanUrl(opts.url);
    State.sync.anonKey = opts.anonKey.trim();
    State.sync.room = opts.room.trim();
    setStatus("connecting");
    const remote = await getRow(); // lève si table absente / creds faux
    const haveLocal = State.budgets.length > 0;
    const haveRemote = remote && remote.doc && (remote.doc.budgets || []).length > 0;
    if (haveRemote && opts.strategy === "pullCloud") {
      applyDoc(mergeDoc({ graveyard: {} }, remote.doc));
      State.sync.lastRev = remote.rev;
    } else if (haveRemote && opts.strategy === "merge") {
      applyDoc(mergeDoc(docFromState(), remote.doc));
      State.sync.lastRev = remote.rev;
    }
    // pushLocal (ou pas de données distantes) : on garde le local tel quel, pushNow l'enverra
    State.sync.enabled = true;
    _base = buildBase();
    // force l'envoi initial : on neutralise la base pour tout estampiller
    if (!haveRemote || opts.strategy === "pushLocal") _base = {};
    persist();
    startLoop();
    await pushNow();
    return { haveLocal, haveRemote };
  }
  async function probe(opts) {
    const u = cleanUrl(opts.url);
    const r = await fetch(`${u}/rest/v1/horizon_rooms?select=room&limit=1`, {
      headers: { apikey: opts.anonKey.trim(), Authorization: "Bearer " + opts.anonKey.trim() },
    });
    if (r.status === 404 || r.status === 400) throw new Error("Table « horizon_rooms » introuvable. Exécutez le script SQL d'abord.");
    if (r.status === 401 || r.status === 403) throw new Error("Clé ou URL incorrecte (accès refusé).");
    if (!r.ok) throw new Error("Connexion impossible (HTTP " + r.status + ").");
    return true;
  }
  function disconnect() {
    State.sync.enabled = false;
    clearInterval(_pollTimer);
    setStatus("off");
    persist();
  }

  return {
    init, connect, probe, disconnect, pushNow, poll, schedulePush,
    chipEl, mergeDoc, _internals: { buildBase, stampChanges, get base() { return _base; } },
    get status() { return status; }, get error() { return lastError; },
    get enabled() { return State.sync.enabled; },
  };
})();
window.Sync = Sync;
