// 設定初期値の単一情報源。
// MAIN world（override.js）・ISOLATED world（bridge.js）・popup（popup.js）の
// 3コンテキストすべてで、このファイルを先に読み込んで MBF_DEFAULTS を共有する。
// 項目を追加するときはここだけ更新すればよい（popup.html の input 追加は別途必要）
const MBF_DEFAULTS = {
  enabled: true,

  // --- 肌 ---
  smooth: 0.6,     // 美肌の強さ 0-1
  bright: 0.05,    // 明るさ 0-0.3
  warmth: 0.04,    // 血色（暖色寄せ） 0-0.2
  sat: 1.05,       // 鮮やかさ 0.5-1.5
  nasoA: 0,        // ほうれい線うすめ 0-2（0で無効。1超でぼかし・範囲も強化）
  eyebagLine: 0,   // 目の下の線うすめ 0-2
  eyebagBright: 0, // クマを明るく 0-1

  // --- キャリブレーション（人・環境への校正） ---
  lipThresh: 0.575, // 唇除外のしきい値（Cr）。下げるほど赤みの弱い唇も除外
  skinRange: 1.0,   // 肌色判定の広さ

  // --- リップ ---
  lipColor: '#c2476e',
  lipA: 0,       // 濃さ 0-1
  lipGloss: 0,   // ツヤ 0-1
  lipW: 1.0,     // 太さ 0.8（細め）-1.3（オーバーリップ）

  // --- チーク ---
  blushColor: '#e8889a',
  blushA: 0,       // 濃さ 0-1
  blushShape: 1.6, // 形状 1=丸 - 2.5=横長
  blushY: 0.06,    // 縦位置（顔幅比）
  blushSoft: 1.3,  // ぼかし 1-2.2

  // --- 眉 ---
  browColor: '#5a3d2b',
  browA: 0,      // 濃さ 0-1
  browW: 1.0,    // 太さ 0.25-1.05
  browTaper: 0,  // 眉尻の細さ 0-1
  browArch: 0,   // アーチの高さ -1〜1
  browPeak: 0.6, // アーチの位置 0.2-0.9
  browTail: 0,   // 眉尻の高さ -1〜1

  // --- アイシャドウ ---
  shadowColor: '#9e5a73',  // 際
  shadowColor2: '#c98da1', // 中間
  shadowColor3: '#e8c9c4', // 上
  shadowUse2: true,
  shadowUse3: true,
  shadowA: 0,      // 濃さ 0-1
  shadowH: 1.0,    // 高さ 0.5-2
  shadowW: 1.0,    // 幅 0.8-1.4
  shadowSoft: 1.0, // ぼかし 0.5-3
  shadowBias: 1.0, // 際色の量 1-3

  // --- アイライン ---
  linerColor: '#2b1d1a',
  linerA: 0,       // 濃さ 0-1
  linerW: 1.0,     // 太さ 0.4-2
  linerWing: 0,    // 目尻ハネの長さ 0-1
  linerWingUp: 25, // ハネ角度（度）-60〜60
  linerWingW: 1.5, // ハネの太さ 0.5-3

  // --- シェーディング ---
  shadeColor: '#8a5a40',
  noseA: 0,      // ノーズ濃さ 0-1
  noseW: 1.0,    // ノーズ幅 0.5-2
  noseIn: 0.25,  // ノーズ位置（内側寄せ） 0-0.6
  noseSoft: 1.0, // ノーズぼかし 0.5-3
  jawA: 0,       // 輪郭濃さ 0-1
  jawSoft: 1.0,  // 輪郭ぼかし 0.5-3

  // --- ハイライト ---
  hiColor: '#fff2e2',
  hiA: 0,           // 鼻筋濃さ 0-1
  hiW: 1.0,         // 鼻筋幅 0.5-2
  hiSoft: 1.0,      // 鼻筋ぼかし 0.5-3
  hiCheekA: 0,      // 頬骨濃さ 0-1
  hiCheekW: 1.0,    // 頬骨の大きさ 0.5-2
  hiCheekX: 0,      // 頬骨横位置 -0.08〜0.08
  hiCheekY: 0,      // 頬骨縦位置 -0.08〜0.08
  hiCheekSoft: 1.0, // 頬骨ぼかし 0.5-3
  hiChinA: 0,       // 顎先濃さ 0-1
  hiChinW: 1.0,     // 顎先の大きさ 0.5-2
  hiChinY: 0,       // 顎先縦位置 -0.06〜0.06
  hiChinSoft: 1.0   // 顎先ぼかし 0.5-3
};
