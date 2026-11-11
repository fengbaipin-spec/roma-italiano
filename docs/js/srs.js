// Learning records: when each word comes back for review, how much was done each day, and dictation mistakes.
import { store, stars } from "./store.js";

const INTERVALS = [1, 3, 7, 14, 30, 60, 120, 240];   // days until the next review, by stage
export const MASTERED = 4;                           // a word that has come back after 30 days counts as mastered
const KEEP_DAYS = 400;

// today as a day number in local time, so a new day starts at midnight in Rome
export function today() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
}

const srs = new Map(Object.entries(store.get("srs", {})));        // headword → [stage, due day, times forgotten]
const days = store.get("days", {});                               // day → [new words, reviews]
const misses = new Map(Object.entries(store.get("misses", {})));  // headword → dictation mistakes since it was last right
const saveSrs = () => store.set("srs", Object.fromEntries(srs));
const saveMisses = () => store.set("misses", Object.fromEntries(misses));
function saveDays() {
  const cut = today() - KEEP_DAYS;
  for (const d of Object.keys(days)) if (Number(d) < cut) delete days[d];
  store.set("days", days);
}
function count(kind) {
  const t = today();
  (days[t] = days[t] || [0, 0])[kind]++;
  saveDays();
}

export const known = it => srs.has(it);
export const stageOf = it => (srs.has(it) ? srs.get(it)[0] : -1);
export const learnedCount = () => srs.size;
export function masteredCount() {
  let n = 0;
  for (const r of srs.values()) if (r[0] >= MASTERED) n++;
  return n;
}
export const doneToday = () => days[today()] || [0, 0];

// a new word: "学会了" comes back tomorrow, "已经认识" in a month
export function learnNew(it, alreadyKnown) {
  const s = alreadyKnown ? MASTERED : 0;
  srs.set(it, [s, today() + INTERVALS[s], 0]);
  saveSrs();
  count(0);
}
// a review: remembered moves the word one step further out, forgotten brings it back tomorrow
export function review(it, remembered) {
  const [stage, , lapses] = srs.get(it) || [0, 0, 0];
  const s = remembered ? Math.min(stage + 1, INTERVALS.length - 1) : 0;
  srs.set(it, [s, today() + INTERVALS[s], lapses + (remembered ? 0 : 1)]);
  saveSrs();
  count(1);
}
// the most overdue first; among words due the same day, the weaker ones first
export function dueWords() {
  const t = today();
  return [...srs].filter(([, r]) => r[1] <= t).sort((a, b) => a[1][1] - b[1][1] || a[1][0] - b[1][0]).map(([it]) => it);
}
// starred words not learned yet come first, then the dictionary in order from the chosen volume
export function freshWords(all, fromVolume, n) {
  const out = [], taken = new Set();
  const take = w => {
    if (out.length < n && !srs.has(w.it) && !taken.has(w.it)) { out.push(w); taken.add(w.it); }
  };
  for (const w of all) if (stars.has(w.it)) take(w);
  for (const w of all) if (w.v >= fromVolume) take(w);
  return out;
}

const active = d => !!days[d] && days[d][0] + days[d][1] > 0;
// days in a row with some study, counting today once something is done, otherwise up to yesterday
export function streak() {
  let d = today();
  if (!active(d)) d--;
  let n = 0;
  while (active(d)) { n++; d--; }
  return n;
}

export const missCount = it => misses.get(it) || 0;
export function noteDictation(it, perfect) {
  if (perfect) misses.delete(it);
  else misses.set(it, (misses.get(it) || 0) + 1);
  saveMisses();
}

export const exportRecords = () => ({ srs: Object.fromEntries(srs), days, misses: Object.fromEntries(misses) });
// merging a backup keeps whichever side got further with each word
export function importRecords(data) {
  const nums = (x, len) => Array.isArray(x) && x.length === len && x.every(Number.isFinite);
  for (const [it, r] of Object.entries(data.srs || {})) {
    const mine = srs.get(it);
    if (nums(r, 3) && (!mine || r[0] > mine[0])) srs.set(it, r);
  }
  for (const [d, c] of Object.entries(data.days || {})) {
    if (!nums(c, 2)) continue;
    const mine = days[d] || [0, 0];
    days[d] = [Math.max(mine[0], c[0]), Math.max(mine[1], c[1])];
  }
  for (const [it, n] of Object.entries(data.misses || {})) {
    if (Number.isFinite(n) && n > (misses.get(it) || 0)) misses.set(it, n);
  }
  saveSrs();
  saveDays();
  saveMisses();
}
