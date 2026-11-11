// Speech recognition, an optional setting that is off by default: Chrome sends the recording to Google
// and gets back what it understood. Used only to point out words that were not understood.
const recognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canRecognize = () => !!recognizer();

let active = null;

// resolves with { alternatives: [text…], error } once the speaker stops talking
export function recognize(lang = "it-IT") {
  return new Promise(resolve => {
    const SR = recognizer();
    if (!SR) { resolve({ alternatives: [], error: "unsupported" }); return; }
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 5;
    let alternatives = [], error = null;
    r.onresult = e => {
      const res = e.results[0];
      if (res) alternatives = Array.from(res, a => a.transcript.trim()).filter(Boolean);
    };
    r.onerror = e => { error = e.error || "error"; };
    r.onend = () => {
      if (active === r) active = null;
      resolve({ alternatives, error: alternatives.length ? null : error || "no-speech" });
    };
    active = r;
    try {
      r.start();
    } catch (e) {
      active = null;
      resolve({ alternatives: [], error: "start" });
    }
  });
}
export function stopRecognizing() {
  if (active) active.stop();
}

/* The recognizer writes numbers as digits ("2,80 €", "alle 8", "38 e mezzo"), while the dialogues spell them
   out; spelling the digits out lets the two be compared word by word. */
const UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici",
  "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const TENS = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
function under100(n) {
  if (n < 20) return UNITS[n];
  const tens = TENS[Math.floor(n / 10)], u = n % 10;
  if (!u) return tens;
  // ventuno, trentotto (the vowel drops before uno and otto); ventitré
  return (u === 1 || u === 8 ? tens.slice(0, -1) : tens) + (u === 3 ? "tré" : UNITS[u]);
}
function under1000(n) {
  if (n < 100) return under100(n);
  const head = n < 200 ? "cento" : UNITS[Math.floor(n / 100)] + "cento", rest = n % 100;
  if (!rest) return head;
  const tail = under100(rest);
  return (tail.startsWith("o") ? head.slice(0, -1) : head) + tail;   // centottanta
}
export function numberWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1e6) return String(n);
  if (n < 1000) return under1000(n);
  const head = n < 2000 ? "mille" : under1000(Math.floor(n / 1000)) + "mila";
  return n % 1000 ? head + under1000(n % 1000) : head;
}
const w = s => numberWords(Number(s));
export function spellNumbers(text) {
  return text
    .replace(/(\d{1,3})\.(\d{3})\b/g, "$1$2")                       // 1.500
    .replace(/€\s*(\d+)(?:,(\d{1,2}))?/g, (_, a, b) => `${a}${b ? "," + b : ""} €`)
    .replace(/(\d+),(\d{1,2})\s*(?:€|euro\b)/g, (_, a, b) => `${w(a)} euro e ${w(b.length === 1 ? b + "0" : b)}`)
    .replace(/(\d+)\s*€/g, (_, a) => `${w(a)} euro`)
    .replace(/(\d+),5\b/g, (_, a) => `${w(a)} e mezzo`)
    .replace(/(\d{1,2})[:.](\d{2})\b/g, (_, h, m) => `${w(h)} e ${w(m)}`)
    .replace(/(\d+),(\d+)/g, (_, a, b) => `${w(a)} e ${w(b)}`)
    .replace(/(\d)\s*\+\s*(\d)/g, "$1 più $2")
    .replace(/\d+/g, w)
    .replace(/\s+/g, " ")
    .trim();
}
