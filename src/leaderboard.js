// Local leaderboard rules (Ticket-04). Pure functions shared by the server, the browser fallback and the tests.
export const MAX_ENTRIES = 10;
// 3-12 characters, letters (Vietnamese diacritics allowed as a bonus), digits and underscore.
export const NAME_RE = /^[\p{L}\p{N}_]{3,12}$/u;
export const ASCII_NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

export const validName = (name) => typeof name === 'string' && NAME_RE.test(name);

/** Validate a raw entry. Returns the clean entry or throws an Error with a user-readable message. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('entry must be an object');
  if (!validName(e.name)) throw new Error('name must be 3-12 characters: letters, digits or _');
  if (!Number.isInteger(e.score) || e.score < 0) throw new Error('score must be a non-negative integer');
  if (!Number.isInteger(e.nights_won) || e.nights_won < 0 || e.nights_won > 3) throw new Error('nights_won must be 0-3');
  if (typeof e.achieved_at !== 'string' || Number.isNaN(Date.parse(e.achieved_at)) || !/(Z|[+-]\d{2}:\d{2})$/.test(e.achieved_at)) throw new Error('achieved_at must be ISO 8601 with a timezone');
  if (!Number.isInteger(e.seed)) throw new Error('seed must be an integer');
  return { name: e.name, score: e.score, nights_won: e.nights_won, achieved_at: e.achieved_at, seed: e.seed };
}

/** Highest score first; equal scores: whoever achieved it first stays on top. */
export function sortEntries(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e);
}

export const topTen = (entries) => sortEntries(entries).slice(0, MAX_ENTRIES);

/** Add an entry to a list and keep the top 10. */
export function addEntry(entries, raw) {
  return topTen([...entries, cleanEntry(raw)]);
}

/** Tolerant loader: ignores corrupt entries instead of failing. */
export function loadEntries(json) {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { return []; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
  const ok = [];
  for (const e of list) { try { ok.push(cleanEntry(e)); } catch { /* skip */ } }
  return topTen(ok);
}
