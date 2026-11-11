// Reads Italian and English aloud with the phone's own voices: one tap at a time, or a whole list in a row.
import { settings, saveSettings } from "./store.js";
import { sleep, reduceMotion } from "./util.js";

const synth = window.speechSynthesis || null;
export const speech = { supported: !!synth, voices: [], it: null, en: null, checked: !synth };

const voiceListeners = [];
export const onVoices = fn => voiceListeners.push(fn);
const voicesChanged = () => voiceListeners.forEach(fn => fn());
const langOf = v => v.lang.replace("_", "-").toLowerCase();

function score(v, want) {
  const l = langOf(v);
  let s;
  if (l === want) s = 10;
  else if (l.startsWith(want.slice(0, 2))) s = 5;
  else return -1;
  if (/natural|online|google|neural|premium|enhanced/i.test(v.name)) s += 3;
  if (v.localService) s += 1;
  return s;
}
function best(want) {
  let pick = null, top = -1;
  for (const v of speech.voices) {
    const s = score(v, want);
    if (s > top) { top = s; pick = v; }
  }
  return pick;
}
function loadVoices() {
  speech.voices = synth.getVoices();
  speech.it = speech.voices.find(v => v.name === settings.voiceIt && langOf(v).startsWith("it")) || best("it-it");
  speech.en = speech.voices.find(v => v.name === settings.voiceEn && langOf(v).startsWith("en")) || best("en-gb");
  if (speech.voices.length) speech.checked = true;
  voicesChanged();
}
export function initVoices() {
  if (!synth) return;
  loadVoices();
  if ("onvoiceschanged" in synth) synth.addEventListener("voiceschanged", loadVoices);
  // some phones never announce their voices; after a moment, report whatever is there
  setTimeout(() => { speech.checked = true; loadVoices(); }, 1500);
}
export const voicesFor = prefix => speech.voices.filter(v => langOf(v).startsWith(prefix));
// a second Italian voice for the other person in a dialogue, when the phone has one
export const otherVoice = () => voicesFor("it").find(v => v !== speech.it) || speech.it;
export function chooseVoice(lang, name) {
  const v = speech.voices.find(x => x.name === name);
  if (!v) return;
  if (lang === "it") { speech.it = v; settings.voiceIt = name; }
  else { speech.en = v; settings.voiceEn = name; }
  saveSettings();
  voicesChanged();
}

// the text on screen keeps notes the voice should skip: (pl. …), ellipses, slashes between variants
export function clean(t) {
  return t.replace(/\(.*?\)/g, "").replace(/[«»“”]/g, "").replace(/\.\.\.|…/g, "").replace(/·/g, ",")
    .replace(/\s*\/\s*/g, ", ").replace(/\s+[—–]\s+/g, ", ").replace(/–/g, " ")
    .replace(/\s+([?!.,;:])/g, "$1").replace(/\s+/g, " ").trim();
}

/* ---------- one utterance ---------- */
let current = null;
function unmark() {
  document.querySelectorAll(".speaking,.echo").forEach(el => el.classList.remove("speaking", "echo"));
}
// resolves with how long the utterance took, whether it finished, failed or was cut off;
// rate and voice override the settings for this one utterance
export function say(text, lang, el, rate, voice) {
  return new Promise(resolve => {
    if (!synth) { resolve(0); return; }
    const busy = synth.speaking || synth.pending;
    halt();
    const words = clean(text);
    const u = new SpeechSynthesisUtterance(words);
    const v = voice || (lang === "it" ? speech.it : speech.en);
    u.lang = v ? v.lang : lang === "it" ? "it-IT" : "en-GB";
    if (v) u.voice = v;
    u.rate = rate || settings.rate;
    const t0 = performance.now();
    const job = { done: false };
    job.finish = () => {
      if (job.done) return;
      job.done = true;
      clearTimeout(job.timer);
      if (el) el.classList.remove("speaking");
      if (current === job) current = null;
      resolve(performance.now() - t0);
    };
    u.onend = job.finish;
    u.onerror = job.finish;
    // some Android engines never report the end of an utterance; give up after a generous estimate
    job.timer = setTimeout(job.finish, 4000 + words.length * 160 / u.rate);
    current = job;
    if (el) el.classList.add("speaking");
    // Android Chrome can drop an utterance queued right after cancel()
    if (busy) setTimeout(() => { if (current === job) synth.speak(u); }, 80);
    else synth.speak(u);
  });
}
export function halt() {
  if (current) { const job = current; current = null; job.finish(); }
  if (synth) synth.cancel();
  unmark();
}

/* ---------- a list read one item after another ---------- */
// items: anything; expand(item) → [{ text, lang, sel, gap, echo, before }]; label(item) → text for the player bar
export const player = { active: false, paused: false, kind: "", title: "", items: [], pos: 0, expand: null, label: null, token: 0 };
const playerListeners = [];
export const onPlayer = fn => playerListeners.push(fn);
const emit = () => playerListeners.forEach(fn => fn());

export function playList({ kind, title, items, expand, label, start = 0 }) {
  if (!items.length) return;
  stopList(true);
  Object.assign(player, { active: true, paused: false, kind, title, items, expand, label, pos: Math.min(start, items.length - 1) });
  keepAwake(true);
  run();
}
async function run() {
  const token = ++player.token;
  emit();
  while (token === player.token && player.active && !player.paused && player.pos < player.items.length) {
    for (const part of player.expand(player.items[player.pos])) {
      if (part.before) part.before();
      const el = part.sel ? document.querySelector(`[data-say="${part.sel}"]`) : null;
      if (el) bringIntoView(el);
      const ms = await say(part.text, part.lang, el, null, part.voice);
      if (token !== player.token) return;
      let gap = part.gap == null ? 600 : part.gap;
      if (part.echo) {
        // shadowing: leave about as long as the sentence took, so there is time to repeat it
        gap = Math.min(12000, ms * 1.15 + 700);
        if (el) el.classList.add("echo");
      }
      await sleep(gap);
      if (el) el.classList.remove("echo");
      if (token !== player.token) return;
    }
    player.pos++;
    if (player.pos < player.items.length) emit();
  }
  if (token === player.token && player.pos >= player.items.length) stopList();
}
export function togglePause() {
  if (!player.active) return;
  player.paused = !player.paused;
  if (player.paused) {
    player.token++;
    halt();
    keepAwake(false);
    emit();
  } else {
    keepAwake(true);
    run();
  }
}
export function skip() {
  if (!player.active) return;
  player.token++;
  halt();
  player.paused = false;
  player.pos++;
  if (player.pos >= player.items.length) stopList();
  else run();
}
export function stopList(quiet) {
  const was = player.active;
  player.token++;
  player.active = false;
  player.paused = false;
  halt();
  keepAwake(false);
  if (was && !quiet) emit();
}
// a single tap always wins over a list that is playing
export function speakOne(text, lang, el, rate, voice) {
  if (player.active) stopList();
  return say(text, lang, el, rate, voice);
}

export function bringIntoView(el) {
  const r = el.getBoundingClientRect();
  const bar = document.querySelector(".vbar:not(.hide)");
  const top = (bar ? bar.getBoundingClientRect().bottom : 0) + 12;
  const bottom = innerHeight - (document.getElementById("player").offsetHeight || 0) - (document.getElementById("tabbar").offsetHeight || 0) - 12;
  if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
}

// keep the screen on while a list plays, since a locked phone stops the voice
let lock = null;
async function keepAwake(on) {
  try {
    if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") {
      const l = await navigator.wakeLock.request("screen");
      if (!player.active || player.paused) { await l.release(); return; }
      lock = l;
      lock.addEventListener("release", () => { if (lock === l) lock = null; });
    } else if (!on && lock) {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch (e) {
    lock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !player.active || player.paused) return;
  keepAwake(true);
  // the phone may have stopped speaking while the app was in the background; pick up the current item again
  if (synth && !synth.speaking && !synth.pending) run();
});
