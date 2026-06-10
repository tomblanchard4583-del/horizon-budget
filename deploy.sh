#!/usr/bin/env bash
# Publie / met à jour Horizon Budget sur GitHub Pages.
# Usage : ./deploy.sh ["message de version"]
set -euo pipefail
cd "$(dirname "$0")"

GH="./tools/gh"
command -v gh >/dev/null 2>&1 && GH="gh"
REPO_NAME="horizon-budget"
MSG="${1:-Mise à jour du $(date '+%d/%m/%Y %H:%M')}"

echo "🔨 Build…"
python3 build.py

if ! $GH auth status >/dev/null 2>&1; then
  echo ""
  echo "⚠️  Première utilisation : connexion GitHub requise (une seule fois)."
  echo "    Un code va s'afficher : entrez-le dans le navigateur qui s'ouvre."
  echo ""
  $GH auth login --hostname github.com --git-protocol https --web
fi

git add -A
git commit -m "$MSG" >/dev/null 2>&1 || echo "ℹ️  Aucun changement à publier."

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "📦 Création du dépôt GitHub « $REPO_NAME »…"
  $GH repo create "$REPO_NAME" --public --source . --push
  OWNER=$($GH api user --jq .login)
  echo "🌐 Activation de GitHub Pages (dossier docs/)…"
  $GH api -X POST "repos/$OWNER/$REPO_NAME/pages" \
    -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
    || $GH api -X PUT "repos/$OWNER/$REPO_NAME/pages" \
       -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 || true
  echo ""
  echo "✅ Première publication lancée ! L'application sera disponible d'ici ~2 minutes :"
  echo "   https://$OWNER.github.io/$REPO_NAME/"
else
  git push
  OWNER=$($GH api user --jq .login 2>/dev/null || echo "<votre-compte>")
  echo ""
  echo "✅ Mise à jour publiée ! En ligne d'ici ~1 minute :"
  echo "   https://$OWNER.github.io/$REPO_NAME/"
  echo "   (les téléphones la reçoivent automatiquement à la prochaine ouverture)"
fi
