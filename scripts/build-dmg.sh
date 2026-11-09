#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-both}"
VERSION=$(node -p "require('./package.json').version")
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")
APP_NAME="FeishuNote"

ensure_arm64_dist() {
  local cache="$HOME/Library/Caches/FeishuNote/electron/${ELECTRON_VERSION}-arm64"
  if [ -d "$cache/Electron.app" ]; then
    echo "$cache"
    return
  fi
  mkdir -p "$(dirname "$cache")"
  rm -rf "$cache" "$cache.zip"
  local url="https://npmmirror.com/mirrors/electron/${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-darwin-arm64.zip"
  echo "Downloading Electron ${ELECTRON_VERSION} (arm64)…"
  if ! curl -L --fail --max-time 900 "$url" -o "$cache.zip"; then
    url="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-darwin-arm64.zip"
    curl -L --fail --max-time 900 "$url" -o "$cache.zip"
  fi
  mkdir -p "$cache"
  unzip -q -o "$cache.zip" -d "$cache"
  rm -f "$cache.zip"
  echo "$cache"
}

make_dmg() {
  local arch="$1"
  local app="$2"
  local dmg="release/${APP_NAME}-${VERSION}-${arch}.dmg"
  local staging=".dmg-staging-${arch}"

  codesign --force --deep --sign - "$app"
  codesign --verify --deep --strict "$app" || true

  rm -rf "$staging"
  mkdir -p "$staging"
  cp -R "$app" "$staging/"
  ln -s /Applications "$staging/Applications"
  hdiutil create \
    -volname "${APP_NAME} ${VERSION}" \
    -srcfolder "$staging" \
    -ov -format UDZO \
    "$dmg"
  rm -rf "$staging"
  echo "Created $dmg"
}

build_arch() {
  local arch="$1"
  if [ "$arch" = "arm64" ]; then
    local dist
    dist=$(ensure_arm64_dist)
    npx electron-builder --mac --arm64 --dir \
      -c.electronDist="$dist" \
      -c.directories.output="release/arm64"
    make_dmg arm64 "release/arm64/mac-arm64/${APP_NAME}.app"
  else
    npx electron-builder --mac --x64 --dir
    make_dmg x64 "release/mac/${APP_NAME}.app"
  fi
}

npm run build

HOST_ARCH=$(uname -m)
if [ "$TARGET" = "both" ]; then
  # 最后构建本机架构，保证 release/mac 或 release/arm64 中留下可直接运行的 App
  if [ "$HOST_ARCH" = "arm64" ]; then
    build_arch x64
    build_arch arm64
  else
    build_arch arm64
    build_arch x64
  fi
elif [ "$TARGET" = "x64" ]; then
  build_arch x64
elif [ "$TARGET" = "arm64" ]; then
  build_arch arm64
else
  echo "Usage: $0 [both|x64|arm64]" >&2
  exit 1
fi
