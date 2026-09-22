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
listing_hits = re.findall(r'## 対象バージョン[ \t\r　]*\n(\S+)', listing)
if len(listing_hits) != 1:
    print(f'ERROR: docs/store-listing.md の「## 対象バージョン」が {len(listing_hits)} 件ヒットしました（1件のはず）', file=sys.stderr)
    sys.exit(1)
listing_version = listing_hits[0]

if not re.match(r'^\d+(\.\d+){0,3}$', listing_version):
    print(f'ERROR: docs/store-listing.md の「## 対象バージョン」の値 ({listing_version}) がバージョン形式（数字をドットで区切った形式）ではありません', file=sys.stderr)
    sys.exit(1)

if listing_version != manifest_version:
    print(f'ERROR: 掲載文の対象バージョン ({listing_version}) が manifest.json ({manifest_version}) と一致しません', file=sys.stderr)
    print('docs/store-listing.md の機能一覧を確認し、「## 対象バージョン」を更新してください。', file=sys.stderr)
    print('（README.md の機能一覧もあわせて確認）', file=sys.stderr)
    sys.exit(1)
PY

# 掲載文（docs/store-listing.md）の概要文が _locales の extDescription と食い違うと、
# 配信される説明文とストアに表示される説明文が一致しなくなるため、提出前に検証する。
# 掲載文の構造（セクションの並び・重複の有無）に依存させず、「extDescription がそのまま
# 掲載文のどこかに含まれているか」「似ているが一致しない旧文が残っていないか」だけを見る。
python3 - <<'PY'
import json, sys

listing_path = 'docs/store-listing.md'
listing_lines = open(listing_path, encoding='utf-8').readlines()
listing_text = ''.join(listing_lines)

failed = False
for locale in ('ja', 'en'):
    messages = json.load(open(f'_locales/{locale}/messages.json', encoding='utf-8'))
    desc = messages['extDescription']['message']

    if desc not in listing_text:
        print(f'ERROR: {listing_path} に _locales/{locale}/messages.json の extDescription がそのまま含まれていません', file=sys.stderr)
        print(f'  _locales 側の値: {desc}', file=sys.stderr)
        print(f'{listing_path} の概要文を _locales/{locale}/messages.json の extDescription に合わせて修正してください。', file=sys.stderr)
        failed = True
        continue

    # 似ているが一致しない旧文の残存を検出する。desc の接頭辞（絶対長10文字以上・
    # 全体の15%以上。ja/en で1文字あたりの情報量が違うため割合で動的に求める）が
    # 部分文字列として出現する行のうち、「desc が行の末尾までそのまま続く行」（正しい行。
    # 前置きの `- ja: ` 等は許容し、desc の後ろに余分な文字が続く破損は正しい行として
    # 扱わない）以外を旧文とみなす。
    prefix_len = int(max(10, len(desc) * 0.15))
    prefix = desc[:prefix_len]
    for lineno, line in enumerate(listing_lines, start=1):
        stripped = line.rstrip('\n')
        if stripped.endswith(desc):
            continue
        if prefix in stripped:
            print(f'ERROR: {listing_path} に _locales/{locale}/messages.json の extDescription と似ているが一致しない行が残っています', file=sys.stderr)
            print(f'  _locales 側の値: {desc}', file=sys.stderr)
            print(f'  掲載文側の不一致行 ({lineno}行目): {stripped}', file=sys.stderr)
            print(f'{listing_path} の概要文を _locales/{locale}/messages.json の extDescription に合わせて修正してください。', file=sys.stderr)
            failed = True

if failed:
    sys.exit(1)
PY

# 掲載文（docs/store-listing.md）に未記入のプレースホルダ（TODO/FIXME）が残っていると、
# 未完成のまま提出できてしまうため、提出前に検証する
python3 - <<'PY'
import re, sys

listing_path = 'docs/store-listing.md'
lines = open(listing_path, encoding='utf-8').readlines()
hits = [(i, line.rstrip('\n')) for i, line in enumerate(lines, start=1) if re.search(r'TODO|FIXME', line, re.IGNORECASE)]

if hits:
    print(f'ERROR: {listing_path} に未記入の箇所が残っています。提出前に埋めてください。', file=sys.stderr)
    for lineno, content in hits:
        print(f'  {lineno}: {content}', file=sys.stderr)
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
