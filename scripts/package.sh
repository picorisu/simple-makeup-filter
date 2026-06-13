#!/bin/bash
# Chrome ウェブストア提出用の zip を作る
# 使い方: ./scripts/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# vendor/ が揃っているか確認（無いとメイク機能が動かないパッケージになる）
for f in vendor/vision_bundle.mjs vendor/wasm/vision_wasm_internal.js vendor/wasm/vision_wasm_internal.wasm vendor/face_landmarker.task vendor/LICENSE; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f がありません。README の手順で vendor/ をダウンロードしてください" >&2
    exit 1
  fi
done

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/simple-makeup-filter-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"

# ストアに必要なファイルだけを含める（開発用ファイルは除外）
zip -r "$OUT" \
  manifest.json \
  override.js \
  bridge.js \
  popup.html \
  popup.js \
  icons \
  vendor \
  -x "*.DS_Store"

echo ""
echo "✅ 作成完了: $OUT"
unzip -l "$OUT" | tail -3
