const DEFAULTS = MBF_DEFAULTS; // 初期値は defaults.js が単一情報源

const RANGES = ['smooth', 'bright', 'warmth', 'sat', 'lipThresh', 'skinRange', 'nasoA', 'marioA', 'eyebagLine', 'eyebagBright', 'eyebagW', 'eyebagH', 'eyebagX', 'eyebagY', 'lipA', 'lipGloss', 'lipW', 'blushA', 'blushShape', 'blushX', 'blushY', 'blushSoft', 'browA', 'browW', 'browTaper', 'browArch', 'browPeak', 'browTail', 'shadowA', 'shadowH', 'shadowW', 'shadowSoft', 'shadowBias', 'linerA', 'linerW', 'linerY', 'linerWing', 'linerWingUp', 'linerWingW', 'noseA', 'noseW', 'noseIn', 'noseSoft', 'jawA', 'jawSoft', 'hiA', 'hiW', 'hiSoft', 'hiCheekA', 'hiCheekW', 'hiCheekX', 'hiCheekY', 'hiCheekSoft', 'hiChinA', 'hiChinW', 'hiChinY', 'hiChinSoft'];
const COLORS = ['lipColor', 'blushColor', 'browColor', 'shadowColor', 'shadowColor2', 'shadowColor3', 'linerColor', 'shadeColor', 'hiColor'];

const CHECKS = ['enabled', 'shadowUse2', 'shadowUse3'];

function M(key, subs) {
  return chrome.i18n.getMessage(key, subs != null ? [].concat(subs) : undefined);
}

// i18n: data-i18n 属性を持つ要素のテキストを差し替える
document.querySelectorAll('[data-i18n]').forEach(el => {
  const msg = M(el.dataset.i18n);
  if (msg) el.textContent = msg;
});
document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
  const msg = M(el.dataset.i18nPlaceholder);
  if (msg) el.placeholder = msg;
});
document.querySelectorAll('[data-i18n-title]').forEach(el => {
  const msg = M(el.dataset.i18nTitle);
  if (msg) el.title = msg;
});
document.querySelectorAll('[data-i18n-aria]').forEach(el => {
  const msg = M(el.dataset.i18nAria);
  if (msg) el.setAttribute('aria-label', msg);
});

// summary 内の色チップ: クリックでアコーディオンが開閉しないようにする
// （カラーピッカー自体は input の既定動作で開く）
for (const el of document.querySelectorAll('summary input')) {
  el.addEventListener('click', (e) => e.stopPropagation());
}

// 見出しのハート: ♥ピンク=そのカテゴリの効果が効いてる、♡グレー=オフ
const FX_KEYS = {
  skin: ['smooth', 'bright', 'warmth'],
  wrinkle: ['nasoA', 'marioA', 'eyebagLine', 'eyebagBright'],
  lip: ['lipA', 'lipGloss'],
  blush: ['blushA'],
  brow: ['browA'],
  shadow: ['shadowA'],
  liner: ['linerA'],
  shade: ['noseA', 'jawA'],
  hi: ['hiA', 'hiCheekA', 'hiChinA']
};

function updateBadges() {
  for (const [name, keys] of Object.entries(FX_KEYS)) {
    const on = keys.some((k) => parseFloat(document.getElementById(k).value) > 0);
    document.querySelector(`details[data-fx="${name}"]`).classList.toggle('fx-on', on);
  }
}

// 各スライダーのラベル右端に現在値を常時表示する。
// HTML には書かず、起動時にスライダーごとへ自動で差し込む
const valEls = {};
for (const k of RANGES) {
  const input = document.getElementById(k);
  const span = document.createElement('span');
  span.className = 'val';
  input.parentElement.insertBefore(span, input);
  valEls[k] = span;
}

function showVal(k, v) {
  // 0.30000000000004 みたいな浮動小数の尻尾を整える
  valEls[k].textContent = String(Math.round(v * 100) / 100);
}

function refreshUI(s) {
  for (const k of CHECKS) document.getElementById(k).checked = s[k];
  for (const k of RANGES) {
    const el = document.getElementById(k);
    el.value = s[k];
    showVal(k, s[k]);
  }
  for (const k of COLORS) document.getElementById(k).value = s[k];
  updateBadges();
}

chrome.storage.local.get(DEFAULTS, (s) => {
  refreshUI(s);
  updateStatus();
});

// Meet のタブに bridge がいるか死活確認して、動作状態を表示する。
// マスタースイッチ（enabled）OFF のときは接続状態より先にその旨を出す
const statusEl = document.getElementById('status');

function flashStatus(text) {
  const prev = statusEl.textContent;
  const prevOk = statusEl.classList.contains('ok');
  statusEl.textContent = text;
  statusEl.classList.add('ok');
  setTimeout(() => {
    statusEl.textContent = prev;
    statusEl.classList.toggle('ok', prevOk);
  }, 1500);
}

function updateStatus() {
  statusEl.classList.remove('ok');
  if (!document.getElementById('enabled').checked) {
    statusEl.textContent = M('status_off');
    return;
  }
  chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      statusEl.textContent = M('status_no_tab');
      return;
    }
    // 複数タブがあればどれか1つでも応答すれば動作中とみなす
    let pending = tabs.length;
    let alive = false;
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, 'mbf-ping', (resp) => {
        if (!chrome.runtime.lastError && resp === 'pong') alive = true;
        if (--pending === 0) {
          if (alive) {
            statusEl.textContent = M('status_active');
            statusEl.classList.add('ok');
          } else {
            statusEl.textContent = M('status_reload');
          }
        }
      });
    }
  });
}

// 初回起動時に全キーを storage へ書き込んでおく（シーディング）。
// これにより bridge/override は defaults が読めない状況でも storage の値だけで完走できる
chrome.storage.local.get(null, (all) => {
  const missing = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in all)) missing[k] = DEFAULTS[k];
  }
  if (Object.keys(missing).length > 0) chrome.storage.local.set(missing);
});

// 「はじめに」アコーディオンは初回だけ開いた状態にし、開閉状態を記憶する
const intro = document.getElementById('intro');
chrome.storage.local.get({ __introClosed: false }, ({ __introClosed }) => {
  intro.open = !__introClosed;
  // open の初期反映が終わってから toggle の記憶を開始（初期設定で誤記憶しないように）
  intro.addEventListener('toggle', () => {
    chrome.storage.local.set({ __introClosed: !intro.open });
  });
});

// ワンタップ初期プリセット: 「全部0で何も起きない」初回体験の回避が主目的
const QUICK_PRESETS = {
  natural: {
    smooth: 0.55, bright: 0.05, warmth: 0.04, sat: 1.05,
    nasoA: 0.5, eyebagLine: 0.4, eyebagBright: 0.2,
    lipA: 0.3, lipGloss: 0.2, blushA: 0.25, browA: 0.2,
    shadowA: 0.2, linerA: 0.2
  },
  full: {
    smooth: 0.75, bright: 0.08, warmth: 0.06, sat: 1.08,
    nasoA: 1.0, eyebagLine: 0.8, eyebagBright: 0.4,
    lipA: 0.55, lipGloss: 0.35, lipW: 1.06, blushA: 0.4, browA: 0.35,
    shadowA: 0.4, linerA: 0.45, linerWing: 0.3,
    noseA: 0.25, jawA: 0.25, hiA: 0.25, hiCheekA: 0.25
  },
  healthy: {
    smooth: 0.6, bright: 0.06, warmth: 0.09, sat: 1.12,
    eyebagBright: 0.3, lipA: 0.4, lipGloss: 0.3,
    blushA: 0.45, blushSoft: 1.6
  }
};

for (const btn of document.querySelectorAll('[data-quick]')) {
  btn.addEventListener('click', () => {
    const customized = Object.values(FX_KEYS).flat()
      .some((k) => parseFloat(document.getElementById(k).value) > 0);
    if (customized && !confirm(M('confirm_quick'))) return;
    chrome.storage.local.get(DEFAULTS, (cur) => {
      const s = {
        ...DEFAULTS,
        ...QUICK_PRESETS[btn.dataset.quick],
        lipThresh: cur.lipThresh,
        skinRange: cur.skinRange,
        enabled: true
      };
      chrome.storage.local.set(s, () => refreshUI(s));
    });
  });
}

for (const k of CHECKS) {
  document.getElementById(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: e.target.checked });
    if (k === 'enabled') updateStatus();
  });
}
for (const k of RANGES) {
  document.getElementById(k).addEventListener('input', (e) => {
    chrome.storage.local.set({ [k]: parseFloat(e.target.value) });
    showVal(k, parseFloat(e.target.value));
    updateBadges();
  });
}

document.getElementById('resetAll').addEventListener('click', () => {
  if (!confirm(M('confirm_reset'))) return;
  chrome.storage.local.set({ ...DEFAULTS }, () => refreshUI(DEFAULTS));
});
for (const k of COLORS) {
  document.getElementById(k).addEventListener('input', (e) => {
    chrome.storage.local.set({ [k]: e.target.value });
  });
}

// ---------- プリセット ----------
// 保存場所は storage.local の '__presets'（設定キーと衝突しない名前）。
// 取り込み時は DEFAULTS にあるキーだけ通す（未知のキーは無視 = 安全側）

function sanitize(obj) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in obj) || typeof obj[k] !== typeof DEFAULTS[k]) continue;
    let v = obj[k];
    if (RANGES.includes(k)) {
      const el = document.getElementById(k);
      v = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), v));
      if (Number.isNaN(v)) continue;
    } else if (COLORS.includes(k)) {
      if (!/^#[0-9a-f]{6}$/i.test(v)) continue;
    }
    out[k] = v;
  }
  return out;
}

function currentSettings(cb) {
  chrome.storage.local.get(DEFAULTS, cb);
}

function refreshPresetList() {
  chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
    const sel = document.getElementById('presetList');
    sel.innerHTML = '';
    const names = Object.keys(__presets);
    if (names.length === 0) {
      const o = document.createElement('option');
      o.textContent = M('preset_none');
      o.value = '';
      sel.appendChild(o);
      return;
    }
    for (const name of names) {
      const o = document.createElement('option');
      o.textContent = name;
      o.value = name;
      sel.appendChild(o);
    }
  });
}
refreshPresetList();

document.getElementById('presetName').addEventListener('input', (e) => {
  e.target.classList.remove('err');
});

document.getElementById('presetSave').addEventListener('click', () => {
  const nameEl = document.getElementById('presetName');
  const name = nameEl.value.trim();
  if (!name) {
    nameEl.classList.add('err');
    nameEl.focus();
    return;
  }
  currentSettings((s) => {
    chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
      if (__presets[name] && !confirm(M('confirm_overwrite', name))) return;
      __presets[name] = sanitize(s);
      chrome.storage.local.set({ __presets }, () => {
        document.getElementById('presetName').value = '';
        refreshPresetList();
        document.getElementById('presetList').value = name;
      });
    });
  });
});

document.getElementById('presetApply').addEventListener('click', () => {
  const name = document.getElementById('presetList').value;
  if (!name) return;
  chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
    if (!__presets[name]) return;
    const s = sanitize(__presets[name]);
    delete s.enabled;
    chrome.storage.local.set(s, () => {
      chrome.storage.local.get(DEFAULTS, (cur) => {
        refreshUI(cur);
        flashStatus(M('flash_applied', name));
      });
    });
  });
});

document.getElementById('presetDelete').addEventListener('click', () => {
  const name = document.getElementById('presetList').value;
  if (!name) return;
  if (!confirm(M('confirm_delete', name))) return;
  chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
    delete __presets[name];
    chrome.storage.local.set({ __presets }, refreshPresetList);
  });
});

document.getElementById('presetExport').addEventListener('click', () => {
  const name = document.getElementById('presetList').value;
  if (!name) {
    alert(M('alert_export_save_first'));
    return;
  }
  chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
    if (!__presets[name]) return;
    const preset = sanitize(__presets[name]);
    currentSettings((live) => {
      const dirty = JSON.stringify(preset) !== JSON.stringify(sanitize(live));
      if (dirty && !confirm(M('confirm_export_dirty', name))) return;
      const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });
});

document.getElementById('presetImport').addEventListener('click', () => {
  document.getElementById('presetFile').click();
});

document.getElementById('presetFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = sanitize(JSON.parse(reader.result));
      if (Object.keys(s).length === 0) throw new Error(M('alert_no_valid_settings'));
      const name = file.name.replace(/\.json$/i, '') || 'Import';
      chrome.storage.local.get({ __presets: {} }, ({ __presets }) => {
        if (__presets[name] && !confirm(M('confirm_overwrite', name))) return;
        __presets[name] = s;
        chrome.storage.local.set({ __presets }, () => {
          refreshPresetList();
          document.getElementById('presetList').value = name;
          alert(M('alert_imported', name));
        });
      });
    } catch (err) {
      alert(M('alert_import_error', err.message));
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});
