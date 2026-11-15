// Checkpoint save/load via localStorage.
const KEY = 'metro2039_save_v1';
const SETTINGS_KEY = 'metro2039_settings_v1';

export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { console.warn('save failed', e); return false; }
}

export function loadGame() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

export function hasSave() { return !!loadGame(); }
export function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}
export function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}