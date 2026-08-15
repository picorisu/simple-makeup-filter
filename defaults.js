// 設定初期値の単一情報源。
// MAIN world（override.js）・ISOLATED world（bridge.js）・popup（popup.js）の
// 3コンテキストすべてで、このファイルを先に読み込んで MBF_DEFAULTS を共有する。
// 項目を追加するときはここだけ更新すればよい（popup.html の input 追加は別途必要）。
// const だとファイル間で見えない環境があるため、globalThis に明示的に生やす
// 位置ガイドの線色。popup のガイドトグルが凡例を兼ねるため、色は必ずガイド線と一致させる。
// override.js は defaults.js に依存できない（MAIN world への複数ファイル注入で
// 落ちることがある）ため、同じ値を GUIDE_COLORS として保持している。変更時は両方直す
globalThis.MBF_GUIDE_COLORS = {
  eyebag: '#00e5ff',
  naso: '#ffd400',
  mario: '#ff8c1a',
  lip: '#ff3b30',
  blush: '#ff7fbf',
  brow: '#8b5a2b',
  shadow: '#b14cff',
  tear: '#ff2ed1',
  liner: '#2f6bff',
  nose: '#00c853',
  jaw: '#a8e000',
  hiNose: '#cfd8dc',
  hiCheek: '#cfd8dc',
  hiChin: '#cfd8dc'
};

globalThis.MBF_DEFAULTS = {
  enabled: true,
  // 位置ガイドを表示するパーツ。true のパーツだけ描く（通話相手にも見えるため既定は全 OFF。
  // Meet のページ読み込み時に bridge が {} へ戻す）
  guideParts: {
    eyebag: false,
    naso: false,
    mario: false,
    lip: false,
    blush: false,
    brow: false,
    shadow: false,
    tear: false,
    liner: false,
    nose: false,
    jaw: false,
    hiNose: false,
    hiCheek: false,
    hiChin: false
  },

  // --- 肌 ---
  smooth: 0,       // 美肌の強さ
  bright: 0,       // 明るさ
  warmth: 0,       // 血色（暖色寄せ）
  sat: 1.0,        // 鮮やかさ
  nasoA: 0,        // ほうれい線うすめ（0で無効。1超でぼかし・範囲も強化）
  marioA: 0,       // マリオネットライン（口角下のしわ）うすめ
  eyebagLine: 0,   // 目の下の線うすめ
  eyebagBright: 0, // クマを明るく
  eyebagW: 1.0,    // パッチの横幅倍率
  eyebagH: 1.0,    // パッチの縦幅倍率
  eyebagX: 0,      // クマ横位置オフセット（マイナス=内側、プラス=外側）
  eyebagY: 0,      // クマ縦位置オフセット（マイナス=上、プラス=下）

  // --- キャリブレーション（人・環境への校正） ---
  lipThresh: 0.575, // 唇除外のしきい値（Cr）。下げるほど赤みの弱い唇も除外
  skinRange: 1.0,   // 肌色判定の広さ

  // --- リップ ---
  lipColor: '#c2476e',
  lipA: 0,       // 濃さ
  lipGloss: 0,   // ツヤ
  lipW: 1.0,     // 太さ 0.8（細め）-1.3（オーバーリップ）

  // --- チーク ---
  blushColor: '#e8889a',
  blushA: 0,       // 濃さ
  blushShape: 1.6, // 形状 1=丸 - 2.5=横長
  blushX: 0,       // 横位置（顔幅比）。プラスで外側、マイナスで内側
  blushY: 0.06,    // 縦位置（顔幅比）
  blushSoft: 1.3,  // ぼかし

  // --- 眉 ---
  browColor: '#5a3d2b',
  browA: 0,      // 濃さ
  browW: 1.0,    // 太さ
  browTaper: 0,  // 眉尻の細さ
  browArch: 0,   // アーチの高さ
  browPeak: 0.6, // アーチの位置
  browTail: 0,   // 眉尻の高さ

  // --- アイシャドウ ---
  shadowColor: '#9e5a73',  // 際
  shadowColor2: '#c98da1', // 中間
  shadowColor3: '#e8c9c4', // 上
  shadowUse2: true,
  shadowUse3: true,
  shadowA: 0,      // 濃さ
  shadowH: 1.0,    // 高さ
  shadowW: 1.0,    // 幅
  shadowSoft: 1.0, // ぼかし
  shadowBias: 1.0, // 際色の量

  // --- 涙袋 ---
  tearColor: '#f0d5cd',      // ハイライト色
  tearShadeColor: '#c9a396', // シェイド色（影線）
  tearA: 0,       // ハイライト濃さ
  tearShadeA: 0,  // シェイド濃さ
  tearH: 1.0,     // 高さ（帯の広さ）
  tearW: 1.0,     // 横幅
  tearSoft: 1.0,  // ぼかし

  // --- アイライン ---
  linerColor: '#2b1d1a',
  linerA: 0,       // 濃さ
  linerW: 1.0,     // 太さ
  linerY: 0.002,   // 上下位置（顔幅比）。0=際ぴったり
  linerWing: 0,    // 目尻ハネの長さ
  linerWingUp: 25, // ハネ角度（度）
  linerWingW: 1.5, // ハネの太さ

  // --- 目尻マスカラ（アイラインセクション内） ---
  lashColor: '#2b1d1a',
  lashA: 0,       // 濃さ（0で無効）
  lashLen: 1.0,   // 長さ
  lashUp: 40,     // 角度（度）。上向きほど跳ね上がる
  lashCurl: 0.3,  // カール（0で直線）
  lashN: 8,       // 本数
  lashSpan: 0.25, // 適用幅（際に対する割合）

  // --- シェーディング ---
  shadeColor: '#8a5a40',
  noseA: 0,      // ノーズ濃さ
  noseW: 1.0,    // ノーズ幅
  noseIn: 0.25,  // ノーズ位置（内側寄せ）
  noseSoft: 1.0, // ノーズぼかし
  jawA: 0,       // 輪郭濃さ
  jawSoft: 1.0,  // 輪郭ぼかし

  // --- ハイライト ---
  hiColor: '#fff2e2',
  hiA: 0,           // 鼻筋濃さ
  hiW: 1.0,         // 鼻筋幅
  hiSoft: 1.0,      // 鼻筋ぼかし
  hiCheekA: 0,      // 頬骨濃さ
  hiCheekW: 1.0,    // 頬骨の大きさ
  hiCheekX: 0,      // 頬骨横位置
  hiCheekY: 0,      // 頬骨縦位置
  hiCheekSoft: 1.0, // 頬骨ぼかし
  hiChinA: 0,       // 顎先濃さ
  hiChinW: 1.0,     // 顎先の大きさ
  hiChinY: 0,       // 顎先縦位置
  hiChinSoft: 1.0   // 顎先ぼかし
};
