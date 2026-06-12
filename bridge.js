// ISOLATED world。chrome.storage の設定を MAIN world (override.js) へ中継する
// 初期値は defaults.js が単一情報源。
// 万一 defaults.js が先に注入されていなくてもクラッシュさせない
// （storage は popup 初回起動時に全キーが書き込まれるため、保存済みの値だけで動ける）
const DEFAULTS = globalThis.MBF_DEFAULTS || {};

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
    if (k.startsWith('__')) continue; // __presets 等の UI 内部用キーは描画設定と無関係
    s[k] = changes[k].newValue;
  }
  if (Object.keys(s).length > 0) send(s);
});
