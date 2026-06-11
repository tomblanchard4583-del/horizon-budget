#!/usr/bin/env python3
"""Assemble les sources en :
  - dist/horizon-budget.html : fichier unique autonome (partage hors-ligne, double-clic)
  - docs/                    : version PWA pour GitHub Pages (manifest, service worker, icônes)
"""
import hashlib
import pathlib
import shutil

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"
DOCS = ROOT / "docs"
DIST.mkdir(exist_ok=True)
DOCS.mkdir(exist_ok=True)

template = (SRC / "template.html").read_text(encoding="utf-8")
css = (SRC / "styles.css").read_text(encoding="utf-8")
js_files = sorted(SRC.glob("[0-9][0-9]-*.js"))
js = "\n\n".join(f"/* ===== {f.name} ===== */\n" + f.read_text(encoding="utf-8") for f in js_files)
js = js.replace("</script>", "<\\/script>")  # protège la balise script

html = template.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

# ---- 1. fichier unique autonome ----
standalone = DIST / "horizon-budget.html"
standalone.write_text(html, encoding="utf-8")

# ---- 2. version PWA (GitHub Pages) ----
build_id = hashlib.sha256(html.encode()).hexdigest()[:12]

pwa_head = """<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
"""
pwa_js = """
/* ===== enregistrement du service worker (PWA) ===== */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  let _swActivating = false;
  function _activateNow(w) {
    if (!w || _swActivating) return;
    function tryActivate() {
      if (w.state === "installed") {
        _swActivating = true;
        w.postMessage("skipWaiting");
      }
    }
    if (w.state === "installed") { tryActivate(); return; }
    w.addEventListener("statechange", tryActivate);
  }
  navigator.serviceWorker.register("./sw.js").then(reg => {
    if (reg.waiting) _activateNow(reg.waiting);
    reg.addEventListener("updatefound", () => _activateNow(reg.installing));
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swActivating) { _swActivating = false; location.reload(); }
  });
}
"""
pwa_html = html.replace("<title>", pwa_head + "<title>")
pwa_html = pwa_html.replace("</script>\n</body>", pwa_js + "</script>\n</body>")

(DOCS / "index.html").write_text(pwa_html, encoding="utf-8")
sw = (ASSETS / "sw.js").read_text(encoding="utf-8").replace("__BUILD__", build_id)
(DOCS / "sw.js").write_text(sw, encoding="utf-8")
shutil.copy(ASSETS / "manifest.webmanifest", DOCS / "manifest.webmanifest")
shutil.copy(ASSETS / "icon-192.png", DOCS / "icon-192.png")
shutil.copy(ASSETS / "icon-512.png", DOCS / "icon-512.png")
shutil.copy(ASSETS / "icon-180.png", DOCS / "apple-touch-icon.png")
(DOCS / ".nojekyll").write_text("")

size = standalone.stat().st_size
print(f"OK -> {standalone} ({size/1024:.0f} Ko)")
print(f"OK -> {DOCS}/ (PWA, build {build_id}, {len(js_files)} modules JS)")
