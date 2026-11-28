/**
 * Fuzzy Search + Frecency (Frequency + Recency) Scorer for Command Palette
 */
const STORAGE_KEY = "qhub_cmd_frecency_v1";

interface FrecencyRecord {
  count: number;
  lastUsed: number;
}

function loadRecords(): Record<string, FrecencyRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordCommandUse(id: string): void {
  try {
    const map = loadRecords();
    const prev = map[id] || { count: 0, lastUsed: 0 };
    map[id] = { count: prev.count + 1, lastUsed: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function getFrecencyScore(id: string): number {
  const rec = loadRecords()[id];
  if (!rec) return 0;
  const ageHours = Math.max(0.1, (Date.now() - rec.lastUsed) / 3_600_000);
  const recencyWeight = ageHours < 1 ? 4 : ageHours < 24 ? 2.5 : ageHours < 168 ? 1.5 : 0.7;
  return rec.count * recencyWeight;
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi += 1;
      streak += 1;
      score += 4 + streak * 2;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}
