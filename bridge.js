// ISOLATED world。chrome.storage の設定を MAIN world (override.js) へ中継する
// 初期値は defaults.js が単一情報源。
// 万一 defaults.js が先に注入されていなくてもクラッシュさせない
// （sendCurrent は get(null) で storage を全量取得するため、DEFAULTS が空でも保存済みの値だけで動ける）
const DEFAULTS = globalThis.MBF_DEFAULTS || {};

function send(s) {
  // オブジェクトを detail でそのまま渡すと isolated world 境界で null に落ちるため JSON 文字列で渡す
  window.dispatchEvent(new CustomEvent('mbf-settings', { detail: JSON.stringify(s) }));
}

function sendCurrent() {
  // get(null) で全量を取る: DEFAULTS が空（defaults.js 未注入）でも保存済み設定だけで動けるようにする。
  // get(DEFAULTS) は DEFAULTS が {} のとき storage を一切読まない（空指定 = 空の結果が Chrome の仕様）
  chrome.storage.local.get(null, (all) => {
    const s = { ...DEFAULTS };
    for (const k in all) {
      if (!k.startsWith('__')) s[k] = all[k]; // __presets 等の UI 内部用キーは描画設定と無関係
    }
    // MAIN world には chrome.runtime が無いので、vendor/ の URL をここから渡す
    s.__base = chrome.runtime.getURL('');
    s.guideParts = {};
    send(s);
  });
}

window.addEventListener('mbf-ready', sendCurrent);

// popup からの死活確認に応答する（「Meet で動作中」表示用）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'mbf-ping') sendResponse('pong');
});

chrome.storage.onChanged.addListener((changes) => {
  const s = {};
  for (const k in changes) {
    if (k.startsWith('__')) continue; // __presets 等の UI 内部用キーは描画設定と無関係
    s[k] = changes[k].newValue;
  }
  if (Object.keys(s).length > 0) send(s);
});

// 位置ガイドはページ読み込みのたびに必ず全 OFF から始める（この set は永続化のみ。
// MAIN world への OFF は sendCurrent が常に {} を送ることで到着順に依らず成立する）。
// sendCurrent を set のコールバックに入れないこと。失敗時に __base が届かずメイクが無音で止まる
chrome.storage.local.set({ guideParts: {} });
sendCurrent();
