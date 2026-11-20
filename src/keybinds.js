// Rebindable controls (Ticket-04 accessibility). Pure logic, no DOM, so it can be tested.
export const ACTIONS = [
  ['up', 'Đi tới'], ['down', 'Đi lùi'], ['left', 'Sang trái'], ['right', 'Sang phải'],
  ['jump', 'Nhảy'], ['dash', 'Lướt'], ['interact', 'Tương tác (thắp / châm dầu)'], ['pulse', 'Tỏa Sáng'], ['pause', 'Tạm dừng'],
  ['camL', 'Xoay camera trái'], ['camR', 'Xoay camera phải'],
];
export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft',
  interact: 'KeyE', pulse: 'KeyF', pause: 'Escape', camL: 'KeyQ', camR: 'KeyR',
};

/** Human-readable name of a KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Space', ShiftLeft: 'Shift trái', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl trái', ControlRight: 'Ctrl phải', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab' };
  return map[code] || code;
}

/** Which action already uses this key (other than `action`)? Returns the action id or null. */
export function findConflict(keys, action, code) {
  for (const [a] of ACTIONS) if (a !== action && keys[a] === code) return a;
  return null;
}

/** Try to bind. Returns {ok:true, keys} or {ok:false, conflict}. Never mutates the input. */
export function rebind(keys, action, code) {
  if (!ACTIONS.some(([a]) => a === action)) throw new Error(`unknown action ${action}`);
  const conflict = findConflict(keys, action, code);
  if (conflict) return { ok: false, conflict };
  return { ok: true, keys: { ...keys, [action]: code } };
}

/** Load saved bindings, falling back to defaults for anything missing, unknown or conflicting. */
export function loadKeys(raw) {
  let data = {};
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { data = {}; }
  const keys = { ...DEFAULT_KEYS };
  const used = new Set();
  for (const [a] of ACTIONS) {
    const c = typeof data[a] === 'string' && data[a] ? data[a] : DEFAULT_KEYS[a];
    if (used.has(c)) { keys[a] = null; continue; } // saved file had a duplicate: fix below
    keys[a] = c; used.add(c);
  }
  for (const [a] of ACTIONS) if (keys[a] === null) { keys[a] = [...Object.values(DEFAULT_KEYS)].find((c) => !used.has(c)) ?? DEFAULT_KEYS[a]; used.add(keys[a]); }
  return keys;
}
