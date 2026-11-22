#!/bin/sh
# Fails if RaceIQ source code (AGPL-3.0) ever lands in this repo. We use RaceIQ recordings as data only.
# Patterns: package names and identifiers from RaceIQ's source, and the filenames of reference copies.
set -eu
cd "$(dirname "$0")/.."
PATTERNS='@raceiq|capture-formats|GENERIC_SPARSE_MAGIC|generic-sparse-reference'
if git ls-files | grep -E -i 'generic-sparse-reference|capture-formats|framing\.ts$'; then
  echo "licence guard: RaceIQ reference files found (see above). Remove them." >&2
  exit 1
fi
if git grep -n -I -E "$PATTERNS" -- . ':!scripts/check-licence-guard.sh' ':!THIRD_PARTY.md'; then
  echo "licence guard: RaceIQ identifiers found (see above). No RaceIQ code may be included." >&2
  exit 1
fi
echo "licence guard: ok"
