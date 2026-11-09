#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build-dmg.sh both
bash scripts/build-win.sh
