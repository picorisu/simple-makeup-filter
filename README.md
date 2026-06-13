# Meet Beauty Filter

Google Meet のカメラ映像にローカル処理の美肌・メイクフィルターをかける Chrome 拡張（MV3）。
映像・顔データは一切外部送信しない。

## 機能

- **美肌**: WebGL バイラテラル風フィルター。肌色画素のみ（YCbCr 判定、唇は除外）に作用し、影リフトでほうれい線等の線影を軽減
- **明るさ / 血色 / 彩度** 補正
- **ほうれい線消し**: 小鼻〜口角ラインの楕円領域のみ強ぼかしのパッチを貼る（領域外は不変）
- **メイク**（MediaPipe Face Mesh で顔468点を追跡、動きに追従）
  - リップ（濃さ・色。唇内側くり抜きで歯に乗らない）
  - チーク（濃さ・色・形状・縦位置・ぼかし。顔の傾きに追従する楕円）
  - 眉（濃さ・色・太さ）
  - アイシャドウ（濃さ・1〜3色グラデーション・高さ・幅・ぼかし・際色の量）
  - アイライン（濃さ・色）
- **キャリブレーション**: 唇除外しきい値・肌色判定の広さを人・環境に合わせて調整可能
- 全パラメータはツールバーのポップアップから会議中でも即時反映

## セットアップ

### 1. MediaPipe の同梱物を取得（git 管理外、初回のみ）

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

### 2. Chrome に読み込む

1. `chrome://extensions` → デベロッパーモード ON
2. 「パッケージ化されていない拡張機能を読み込む」→ このフォルダを選択
3. Meet を開き（開いていたらリロード）、ツールバーの拡張アイコンから調整

## アーキテクチャ

| ファイル | 役割 |
|---|---|
| `override.js` | MAIN world。`getUserMedia` を横取りし WebGL + Canvas 2D で加工した stream を返す |
| `bridge.js` | ISOLATED world。`chrome.storage.local` の設定を CustomEvent（JSON 文字列）で MAIN へ中継 |
| `popup.html/js` | 設定 UI。`storage.local` 経由で即時反映 |

## ハマりどころ（実体験）

- **CustomEvent の detail はワールド境界でオブジェクトが null になる** → JSON 文字列で渡す
- **`storage.sync` はスライダー連打で書き込みクォータ超過** → `storage.local` を使う
- **Meet は Trusted Types を強制** → MediaPipe の script 読み込みのため、拡張リソース限定の default ポリシーを作成
- **MediaPipe は内部ログを console.error で吐き、拡張の「エラー」に集計される** → ログパターンを debug に格下げするフィルターで対処
- メイクの濃さが全部 0 の間は顔検出を起動しない（負荷ゼロ）
- **manifest の js リストは拡張の再読み込みまで反映されない**: ファイルの中身はページ読み込みごとにディスクから読まれるが、注入するファイルの一覧は拡張ロード時に固定される。content_scripts にファイルを追加したら chrome://extensions の更新（↻）が必須。↻ で直らない場合は削除→再読み込み
- **複数ファイル間のグローバル共有は globalThis 経由 + 未定義ガード**: 注入順が崩れても落ちないよう、利用側は `globalThis.X || {}` で受ける。popup 初回起動時の storage シーディングで値の欠落も防いでいる
