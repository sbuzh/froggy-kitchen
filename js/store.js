/* Froggy Kitchen — tiny localStorage wrapper (all data stays on-device) */
const FroggyStore = (() => {
  const NS = 'froggy.';

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) {
      console.warn('FroggyStore: could not save', key, e);
    }
  }

  function remove(key) {
    try { localStorage.removeItem(NS + key); } catch (e) { /* ignore */ }
  }

  /** Local-timezone date key, e.g. "2026-07-15" */
  function dayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Day key shifted by n days (negative = past) */
  function dayKeyShifted(days, from = new Date()) {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return dayKey(d);
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  /** Daily food log: { "2026-07-15": [entry, ...] } */
  function getLog(day = dayKey()) {
    const all = get('log', {});
    return all[day] || [];
  }

  function addLogEntry(entry) {
    const all = get('log', {});
    const day = entry.day || dayKey();
    if (!all[day]) all[day] = [];
    all[day].push(entry);
    set('log', all);
  }

  function removeLogEntry(day, id) {
    const all = get('log', {});
    if (all[day]) {
      all[day] = all[day].filter((e) => e.id !== id);
      if (!all[day].length) delete all[day];
      set('log', all);
    }
  }

  /** Water: { "2026-07-15": 4 } */
  function getWater(day = dayKey()) {
    const w = get('water', {});
    return w[day] || 0;
  }

  function setWater(n, day = dayKey()) {
    const w = get('water', {});
    if (n <= 0) delete w[day]; else w[day] = n;
    set('water', w);
  }

  /** Weight: [{ day: "2026-07-15", value: 64.2 }, ...] sorted by day */
  function getWeight() {
    return get('weight', []);
  }

  function addWeight(value, day = dayKey()) {
    const w = get('weight', []).filter((p) => p.day !== day); // one check-in per day (latest wins)
    w.push({ day, value: Number(value) });
    w.sort((a, b) => a.day.localeCompare(b.day));
    set('weight', w.slice(-365)); // keep a year of points
  }

  function clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .forEach((k) => localStorage.removeItem(k));
  }

  function exportAll() {
    const out = {};
    Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .forEach((k) => { try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { out[k] = localStorage.getItem(k); } });
    return out;
  }

  /** Full backup document: metadata + every froggy.* key, ready to download. */
  function buildBackup() {
    return { app: 'froggy-kitchen', version: 1, exportedAt: new Date().toISOString(), data: exportAll() };
  }

  /**
   * Restore a backup's data map into localStorage.
   * Accepts the wrapped format ({app,version,exportedAt,data}) or a bare key map.
   * Returns the number of keys written (0 = not a valid backup).
   */
  function importAll(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 0;
    const data = (input.data && typeof input.data === 'object') ? input.data : input;
    let n = 0;
    for (const k of Object.keys(data).filter((k) => k.startsWith(NS))) {
      const v = data[k];
      try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); n++; } catch (e) { /* ignore */ }
    }
    return n;
  }

  return {
    get, set, remove, dayKey, dayKeyShifted, uid,
    getLog, addLogEntry, removeLogEntry,
    getWater, setWater,
    getWeight, addWeight,
    clearAll, exportAll, buildBackup, importAll,
  };
})();
