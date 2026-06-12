const DEFAULTS = {
  enabled: true, smooth: 0.6, bright: 0.05, warmth: 0.04, sat: 1.05,
  lipColor: '#c2476e', lipA: 0,
  blushColor: '#e8889a', blushA: 0, blushShape: 1.6, blushY: 0.06, blushSoft: 1.3,
  browColor: '#5a3d2b', browA: 0, browW: 1.0
};

const RANGES = ['smooth', 'bright', 'warmth', 'sat', 'lipA', 'blushA', 'blushShape', 'blushY', 'blushSoft', 'browA', 'browW'];
const COLORS = ['lipColor', 'blushColor', 'browColor'];

chrome.storage.local.get(DEFAULTS, (s) => {
  document.getElementById('enabled').checked = s.enabled;
  for (const k of RANGES) document.getElementById(k).value = s[k];
  for (const k of COLORS) document.getElementById(k).value = s[k];
});

document.getElementById('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});
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
