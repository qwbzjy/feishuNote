#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")
CACHE="$HOME/Library/Caches/FeishuNote/electron/${ELECTRON_VERSION}-win32-x64"

ensure_win_dist() {
  if [ -f "$CACHE/electron.exe" ]; then
    return
  fi
  mkdir -p "$(dirname "$CACHE")"
  rm -rf "$CACHE" "$CACHE.zip"
  local url="https://npmmirror.com/mirrors/electron/${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"
  echo "Downloading Electron ${ELECTRON_VERSION} (win32-x64)…"
  if ! curl -L --fail --max-time 900 "$url" -o "$CACHE.zip"; then
    url="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"
    curl -L --fail --max-time 900 "$url" -o "$CACHE.zip"
  fi
  mkdir -p "$CACHE"
  unzip -q -o "$CACHE.zip" -d "$CACHE"
  rm -f "$CACHE.zip"
}

ensure_win_dist

if [ -z "${ELECTRON_BUILDER_BINARIES_MIRROR:-}" ]; then
  export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
fi

npm run build

npx electron-builder --win --x64 \
  -c.electronDist="$CACHE" \
  -c.directories.output=release

echo "Created release/FeishuNote-Setup-${VERSION}-x64.exe"
