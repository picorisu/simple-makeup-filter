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

# _locales が揃っているか確認（default_locale 宣言があるのに _locales が無い zip はストアに弾かれる）
for f in _locales/ja/messages.json _locales/en/messages.json; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f がありません" >&2
    exit 1
  fi
done

# ガイド色の二重管理（override.js の GUIDE_COLORS / defaults.js の MBF_GUIDE_COLORS）が
# 食い違うと popup の凡例が実際の線の色と合わなくなるため、提出前に一致を検証する
python3 - <<'PY'
import re, sys

def colors(path, name):
    src = open(path, encoding='utf-8').read()
    m = re.search(name + r'\s*=\s*\{([^}]*)\}', src)
    if not m:
        print(f'ERROR: {path} に {name} が見つかりません', file=sys.stderr)
        sys.exit(1)
    return re.findall(r"(\w+):\s*'(#[0-9a-fA-F]{6})'", m.group(1))

a = colors('override.js', 'GUIDE_COLORS')
b = colors('defaults.js', 'MBF_GUIDE_COLORS')
if a != b:
    print('ERROR: ガイド色が override.js と defaults.js で一致しません（キー順含む）', file=sys.stderr)
    print(f'  override.js : {a}', file=sys.stderr)
    print(f'  defaults.js : {b}', file=sys.stderr)
    sys.exit(1)
PY

# blushSoft の値域（popup.html のスライダー属性と override.js のクランプ式）が
# 食い違うと、スライダーで選べる値をクランプが黙って潰す（または範囲外の値が素通りする）ため、
# 提出前に一致を検証する
python3 - <<'PY'
import re, sys

html = open('popup.html', encoding='utf-8').read()
html_hits = re.findall(r'id="blushSoft"[^>]*\bmin="([^"]+)"[^>]*\bmax="([^"]+)"', html)
if len(html_hits) != 1:
    print(f'ERROR: popup.html の id="blushSoft" min/max 属性が {len(html_hits)} 件ヒットしました（1件のはず）', file=sys.stderr)
    sys.exit(1)
html_min, html_max = html_hits[0]

js = open('override.js', encoding='utf-8').read()
js_hits = re.findall(r'Math\.min\(([\d.]+),\s*Math\.max\(([\d.]+),\s*settings\.blushSoft\)\)', js)
if len(js_hits) != 1:
    print(f'ERROR: override.js の blushSoft クランプ式が {len(js_hits)} 件ヒットしました（1件のはず）', file=sys.stderr)
    sys.exit(1)
js_max, js_min = js_hits[0]

if (html_min, html_max) != (js_min, js_max):
    print('ERROR: blushSoft の値域が popup.html と override.js で一致しません', file=sys.stderr)
    print(f'  popup.html  : min={html_min} max={html_max}', file=sys.stderr)
    print(f'  override.js : min={js_min} max={js_max}', file=sys.stderr)
    sys.exit(1)
PY

# 掲載文（docs/store-listing.md）の対象バージョンが manifest.json と食い違うと、
# 機能を追加してもストア掲載文が更新されないまま提出される事故につながるため、
# 提出前に一致を検証する
python3 - <<'PY'
import json, re, sys

manifest_version = json.load(open('manifest.json'))['version']

listing = open('docs/store-listing.md', encoding='utf-8').read()
m = re.search(r'## 対象バージョン\s*\n(\S+)', listing)
if not m:
    print('ERROR: docs/store-listing.md に「## 対象バージョン」が見つかりません', file=sys.stderr)
    sys.exit(1)
listing_version = m.group(1)

if listing_version != manifest_version:
    print(f'掲載文の対象バージョン ({listing_version}) が manifest.json ({manifest_version}) と一致しません。', file=sys.stderr)
    print('docs/store-listing.md の機能一覧を確認し、「## 対象バージョン」を更新してください。', file=sys.stderr)
    print('（README.md の機能一覧もあわせて確認）', file=sys.stderr)
    sys.exit(1)
PY

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/simple-makeup-filter-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"

# ストアに必要なファイルだけを含める（開発用ファイルは除外）
zip -r "$OUT" \
  manifest.json \
  defaults.js \
  override.js \
  bridge.js \
  popup.html \
  popup.js \
  icons \
  vendor \
  _locales \
  -x "*.DS_Store"

echo ""
echo "✅ 作成完了: $OUT"
unzip -l "$OUT" | tail -3
