// ISOLATED world。chrome.storage の設定を MAIN world (override.js) へ中継する
const DEFAULTS = {
  enabled: true, smooth: 0.6, bright: 0.05, warmth: 0.04, sat: 1.05, nasoA: 0, eyebagLine: 0, eyebagBright: 0, lipThresh: 0.575, skinRange: 1.0,
  lipColor: '#c2476e', lipA: 0, lipGloss: 0, lipW: 1.0,
  blushColor: '#e8889a', blushA: 0, blushShape: 1.6, blushY: 0.06, blushSoft: 1.3,
  browColor: '#5a3d2b', browA: 0, browW: 1.0, browTaper: 0, browArch: 0, browPeak: 0.6, browTail: 0,
  shadowColor: '#9e5a73', shadowColor2: '#c98da1', shadowColor3: '#e8c9c4', shadowUse2: true, shadowUse3: true, shadowA: 0, shadowH: 1.0, shadowW: 1.0, shadowSoft: 1.0, shadowBias: 1.0,
  linerColor: '#2b1d1a', linerA: 0, linerW: 1.0, linerWing: 0, linerWingUp: 25, linerWingW: 1.5,
  shadeColor: '#8a5a40', noseA: 0, noseW: 1.0, noseIn: 0.25, noseSoft: 1.0, jawA: 0, jawSoft: 1.0,
  hiColor: '#fff2e2', hiA: 0, hiW: 1.0, hiSoft: 1.0, hiCheekA: 0, hiCheekW: 1.0, hiCheekX: 0, hiCheekY: 0, hiCheekSoft: 1.0,
  hiChinA: 0, hiChinW: 1.0, hiChinY: 0, hiChinSoft: 1.0
};

function send(s) {
  // オブジェクトを detail でそのまま渡すと isolated world 境界で null に落ちるため JSON 文字列で渡す
  window.dispatchEvent(new CustomEvent('mbf-settings', { detail: JSON.stringify(s) }));
}

function sendCurrent() {
  chrome.storage.local.get(DEFAULTS, (s) => {
    // MAIN world には chrome.runtime が無いので、vendor/ の URL をここから渡す
    s.__base = chrome.runtime.getURL('');
    send(s);
  });
}

window.addEventListener('mbf-ready', sendCurrent);
sendCurrent();

chrome.storage.onChanged.addListener((changes) => {
  const s = {};
  for (const k in changes) {
    if (k === '__presets') continue; // プリセット一覧の変更は描画設定と無関係
    s[k] = changes[k].newValue;
  }
  if (Object.keys(s).length > 0) send(s);
});
