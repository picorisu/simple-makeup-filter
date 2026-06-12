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

const RANGES = ['smooth', 'bright', 'warmth', 'sat', 'nasoA', 'eyebagLine', 'eyebagBright', 'lipThresh', 'skinRange', 'lipA', 'lipGloss', 'lipW', 'blushA', 'blushShape', 'blushY', 'blushSoft', 'browA', 'browW', 'browTaper', 'browArch', 'browPeak', 'browTail', 'shadowA', 'shadowH', 'shadowW', 'shadowSoft', 'shadowBias', 'linerA', 'linerW', 'linerWing', 'linerWingUp', 'linerWingW', 'noseA', 'noseW', 'noseIn', 'noseSoft', 'jawA', 'jawSoft', 'hiA', 'hiW', 'hiSoft', 'hiCheekA', 'hiCheekW', 'hiCheekX', 'hiCheekY', 'hiCheekSoft', 'hiChinA', 'hiChinW', 'hiChinY', 'hiChinSoft'];
const COLORS = ['lipColor', 'blushColor', 'browColor', 'shadowColor', 'shadowColor2', 'shadowColor3', 'linerColor', 'shadeColor', 'hiColor'];

const CHECKS = ['enabled', 'shadowUse2', 'shadowUse3'];

// summary 内の色チップ: クリックでアコーディオンが開閉しないようにする
// （カラーピッカー自体は input の既定動作で開く）
for (const el of document.querySelectorAll('summary input')) {
  el.addEventListener('click', (e) => e.stopPropagation());
}

chrome.storage.local.get(DEFAULTS, (s) => {
  for (const k of CHECKS) document.getElementById(k).checked = s[k];
  for (const k of RANGES) document.getElementById(k).value = s[k];
  for (const k of COLORS) document.getElementById(k).value = s[k];
});

for (const k of CHECKS) {
  document.getElementById(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: e.target.checked });
  });
}
for (const k of RANGES) {
  document.getElementById(k).addEventListener('input', (e) => {
    chrome.storage.local.set({ [k]: parseFloat(e.target.value) });
  });
}
for (const k of COLORS) {
  document.getElementById(k).addEventListener('input', (e) => {
    chrome.storage.local.set({ [k]: e.target.value });
  });
}
