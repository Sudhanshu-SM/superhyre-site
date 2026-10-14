#!/usr/bin/env bash
# Type-scale guard (warn only for now; Phase 5 turns it into a failure).
# Counts font / font-size declarations with a raw px size in src/*.css. Sizes
# belong in the --type-* roles in src/access.css. The sign-in surface
# (access.css lines 1-1626) is out of scope and skipped. The count must fall
# with every type-scale PR.
set -euo pipefail
cd "$(dirname "$0")/.."
pat='font(-size)?:[^;]*[0-9.]+px'
total=0
for f in src/*.css; do
  if [ "$f" = "src/access.css" ]; then
    n=$(awk 'NR>1626' "$f" | grep -cE "$pat" || true)
  else
    n=$(grep -cE "$pat" "$f" || true)
  fi
  if [ "$n" -gt 0 ]; then printf '%6d  %s\n' "$n" "$f"; fi
  total=$((total + n))
done
printf '%6d  total raw px font declarations (warn only)\n' "$total"
exit 0
