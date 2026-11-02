#!/usr/bin/env bash
# Builds a signed release APK into ./out/car-info.apk.
# Needs JAVA_HOME (JDK 21) and ANDROID_HOME; signing env comes from ~/.config/car-info/keystore.env.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ANDROID_HOME:=$HOME/Android/Sdk}"
if [ -z "${JAVA_HOME:-}" ] && command -v mise >/dev/null; then JAVA_HOME="$(mise where java@temurin-21 2>/dev/null || true)"; fi
export ANDROID_HOME JAVA_HOME
if [ -z "${CARINFO_KEYSTORE:-}" ] && [ -f "$HOME/.config/car-info/keystore.env" ]; then
  set -a; . "$HOME/.config/car-info/keystore.env"; set +a
fi

(cd web && bun run build && bunx cap sync android)
(cd web/android && ./gradlew --console=plain -q assembleRelease)

mkdir -p out
src=web/android/app/build/outputs/apk/release
if [ -f "$src/app-release.apk" ]; then cp "$src/app-release.apk" out/car-info.apk
else cp "$src/app-release-unsigned.apk" out/car-info-unsigned.apk; echo "warning: no keystore, APK is unsigned" >&2; fi
ls -la out/
