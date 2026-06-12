# Simple Makeup Filter for Google Meet — プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-06-13

## 日本語

**Simple Makeup Filter for Google Meet**（以下「本拡張機能」）は、Google Meet のカメラ映像に美肌補正・メイクアップ効果を適用する Chrome 拡張機能です。

### データの収集について

本拡張機能は、**いかなるデータも収集・送信しません。**

- **カメラ映像**: すべての映像処理（美肌補正・顔ランドマーク検出・メイク描画）は、お使いのパソコンのブラウザ内で完結します。映像・画像・顔データが外部サーバーに送信されることは一切ありません。
- **顔検出**: 顔の特徴点検出には Google MediaPipe（オープンソース）を使用していますが、検出モデルは拡張機能に同梱されており、検出処理はすべてローカルで実行されます。
- **設定データ**: フィルターの設定値（スライダーの値・色など）は、Chrome の拡張機能用ストレージ（`chrome.storage.local`）にのみ保存されます。これはお使いのブラウザ内のローカル領域であり、開発者を含む第三者がアクセスすることはできません。
- **アナリティクス・トラッキング**: 一切使用していません。

### 権限について

本拡張機能が要求する権限は以下のみです。

| 権限 | 用途 |
|---|---|
| `storage` | フィルター設定をブラウザ内に保存するため |
| `meet.google.com` へのアクセス | Google Meet のページ上でのみフィルターを動作させるため |

ネットワーク通信に関する権限は要求しておらず、外部との通信機能を持ちません。

### お問い合わせ

本ポリシーに関するお問い合わせは、Chrome ウェブストアの掲載ページに記載の連絡先までお願いします。

## English

**Simple Makeup Filter for Google Meet** ("the Extension") is a Chrome extension that applies skin smoothing and makeup effects to your camera feed in Google Meet.

### Data Collection

The Extension **does not collect or transmit any data.**

- **Camera feed**: All video processing (skin smoothing, face landmark detection, and makeup rendering) happens entirely within your browser. No video, images, or facial data ever leave your computer.
- **Face detection**: Face landmark detection uses Google MediaPipe (open source). The detection model is bundled with the Extension and runs fully on-device.
- **Settings**: Filter settings (slider values, colors) are stored only in Chrome's extension storage (`chrome.storage.local`) on your device. No one, including the developer, can access them.
- **Analytics / tracking**: None.

### Permissions

The Extension requests only: `storage` (to save your filter settings locally) and access to `meet.google.com` (to run only on Google Meet pages). It requests no network-related permissions and has no capability to communicate with external servers.

### Contact

For questions about this policy, please use the contact information listed on the Chrome Web Store page.
