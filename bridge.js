// ISOLATED world。chrome.storage の設定を MAIN world (override.js) へ中継する
const DEFAULTS = {
  enabled: true, smooth: 0.6, bright: 0.05, warmth: 0.04, sat: 1.05, nasoA: 0, eyebagLine: 0, eyebagBright: 0, lipThresh: 0.575, skinRange: 1.0,
  lipColor: '#c2476e', lipA: 0,
  blushColor: '#e8889a', blushA: 0, blushShape: 1.6, blushY: 0.06, blushSoft: 1.3,
  browColor: '#5a3d2b', browA: 0, browW: 1.0,
  shadowColor: '#9e5a73', shadowColor2: '#c98da1', shadowColor3: '#e8c9c4', shadowUse2: true, shadowUse3: true, shadowA: 0, shadowH: 1.0, shadowW: 1.0, shadowSoft: 1.0, shadowBias: 1.0,
  linerColor: '#2b1d1a', linerA: 0, linerW: 1.0, linerWing: 0, linerWingUp: 25, linerWingW: 1.5
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
  for (const k in changes) s[k] = changes[k].newValue;
  send(s);
});
