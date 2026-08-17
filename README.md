# Simple Makeup Filter for Google Meet

Google Meet のカメラ映像にローカル処理の美肌・メイクフィルターをかける Chrome 拡張（MV3）。映像・顔データは一切外部送信しない。

A Chrome extension (MV3) that adds fully-local skin smoothing and makeup filters to Google Meet. Your face never leaves your computer — no video or face data is ever sent anywhere.

**[Chrome Web Store](https://chromewebstore.google.com/detail/jffebejmbaaolmjpokllkkhbepgohmnn)**

## Concept / コンセプト

この拡張はビジネスのビデオ通話（リモートワーク・オンライン会議・面接）向けに設計しています。目指すのは自然に身だしなみが整って見えること。カラコン・ヘアカラー・派手なエフェクト等は意図的にスコープ外としています。

This extension is designed for **business video calls** — remote work, online meetings, interviews. The goal is to help you look naturally put-together, not to transform your appearance.

Features are intentionally limited to what looks natural in a professional setting. Cosmetic effects like colored contacts, hair color changes, or dramatic filters are out of scope by design.

## 機能 / Features

- **美肌 / Skin smoothing**: WebGL バイラテラル風フィルター。肌色画素のみ（YCbCr 判定、唇は除外）に作用し、影リフトでほうれい線等の線影を軽減
- **明るさ / 血色 / 彩度 / Brightness / Warmth / Saturation** 補正
- **線・クマの軽減 / Line & dark circle reduction**: ほうれい線・マリオネットライン・目の下の線・クマ（濃さ・横幅・縦幅・横位置・縦位置）。対象領域の楕円のみ強ぼかしのパッチを貼る（領域外は不変）
- **メイク / Makeup**（MediaPipe Face Mesh で顔468点を追跡、動きに追従）
  - リップ / Lip color（濃さ・色・ツヤ・太さ。唇内側くり抜きで歯に乗らない）
  - チーク / Blush（濃さ・色・形状・横位置・縦位置・ぼかし。顔の傾きに追従する楕円）
  - 眉 / Eyebrow（濃さ・色・太さ・眉尻の細さ・アーチの高さ・アーチの位置・眉尻の高さ）
  - アイシャドウ / Eye shadow（濃さ・1〜3色グラデーション・高さ・幅・ぼかし・際色の量）
  - アイライン / Eyeliner（濃さ・色・太さ・上下位置・目尻ハネの長さ / 角度 / 太さ）
  - 涙袋 / Under-eye highlight（ハイライトとシェードの2層。濃さ・色・高さ・横幅・ぼかし）
  - マスカラ / Mascara（濃さ・色・長さ・角度・カール・本数・適用幅）
  - シェーディング / Contouring：ノーズ（濃さ・幅・位置・ぼかし）・輪郭（濃さ・ぼかし）
  - ハイライト / Highlight：鼻筋（濃さ・幅・ぼかし）・頬骨（濃さ・大きさ・横位置・縦位置・ぼかし）・顎先（濃さ・大きさ・縦位置・ぼかし）
- **プリセット / Presets**: ナチュラル / しっかり / 血色感 のワンタップ初期プリセットを用意。設定した内容に名前を付けて保存・呼び出しも可能で、JSON で書き出し / 読み込みもできる（位置ガイドの ON/OFF は含まない）
- **位置ガイド線 / Position guides**: 各パーツの描画位置を線で表示して、重なりやすい部分（クマ消しと涙袋など）の調整を補助する。パーツごとに色分け。通話相手にも見えるため既定は全 OFF で、ON にする際は確認ダイアログを出す。Meet の再読み込みで自動的に OFF に戻る
- **キャリブレーション / Calibration**: 唇除外しきい値・肌色判定の広さを人・環境に合わせて調整可能
- 全パラメータはツールバーのポップアップから会議中でも即時反映 / All parameters adjustable in real time from the toolbar popup

## Setup / セットアップ

### 1. Fetch MediaPipe assets / MediaPipe の同梱物を取得（git 管理外、初回のみ）

```bash
cd "$(dirname "$0")" && mkdir -p vendor/wasm
curl -sL -o vendor/vision_bundle.mjs https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs
curl -sL -o vendor/wasm/vision_wasm_internal.js https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js
curl -sL -o vendor/wasm/vision_wasm_internal.wasm https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm
curl -sL -o vendor/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -sL -o vendor/LICENSE https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE
```

検証用 SHA-256（2026-06-13 取得時点）:

```
e77f281f9619150d937023c355bae170e9120e3b9e43f1e23a2a7bee07197669  vendor/vision_bundle.mjs
9440cf0cc0cea21800e31581ec32aeedcc5fbf9df4509796bbc7d3f99e52ab9c  vendor/wasm/vision_wasm_internal.js
f82a8e6c05e08a44cc9f9e7ec5f845935bcbb1b1500ebe8c2f4812fb4e2917dc  vendor/wasm/vision_wasm_internal.wasm
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff  vendor/face_landmarker.task
```

### 2. Load in Chrome / Chrome に読み込む

1. `chrome://extensions` → Developer mode ON / デベロッパーモード ON
2. "Load unpacked" → select this folder / 「パッケージ化されていない拡張機能を読み込む」→ このフォルダを選択
3. Open Meet (reload if already open), adjust from the toolbar icon / Meet を開き（開いていたらリロード）、ツールバーの拡張アイコンから調整

## Architecture / アーキテクチャ

| File | Role |
|---|---|
| `override.js` | MAIN world. Intercepts `getUserMedia`, processes video via WebGL + Canvas 2D |
| `defaults.js` | Single source of truth for setting defaults; shared across MAIN, ISOLATED, and popup contexts |
| `bridge.js` | ISOLATED world. Relays `chrome.storage.local` settings to MAIN via CustomEvent (JSON string) |
| `popup.html/js` | Settings UI. Changes apply instantly via `storage.local` |

## Gotchas / ハマりどころ

- **CustomEvent の detail はワールド境界でオブジェクトが null になる** → JSON 文字列で渡す
- **`storage.sync` はスライダー連打で書き込みクォータ超過** → `storage.local` を使う
- **Meet は Trusted Types を強制** → MediaPipe の script 読み込みのため、拡張リソース限定の default ポリシーを作成
- **MediaPipe は内部ログを console.error で吐き、拡張の「エラー」に集計される** → ログパターンを debug に格下げするフィルターで対処
- メイクの濃さが全部 0 の間は顔検出を起動しない（負荷ゼロ）
- **manifest の js リストは拡張の再読み込みまで反映されない**: ファイルの中身はページ読み込みごとにディスクから読まれるが、注入するファイルの一覧は拡張ロード時に固定される。content_scripts にファイルを追加したら chrome://extensions の更新（↻）が必須。↻ で直らない場合は削除→再読み込み
- **複数ファイル間のグローバル共有は globalThis 経由 + 未定義ガード**: 注入順が崩れても落ちないよう、利用側は `globalThis.X || {}` で受ける。popup 初回起動時の storage シーディングで値の欠落も防いでいる
- **色調補正（brightness/warmth/saturation）を顔領域だけに限定するのは困難**: skinMask（YCbCr 色判定）で制限すると肌色の閾値がシビアで顔がまだらになる。Face Mesh ランドマークで顔輪郭マスクを作ると円形のマスク境界が不自然に見える。全画素に均一に適用する現行方式が結果的に最も自然

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
