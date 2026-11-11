// Italian numbers in words, both ways: 38 ↔ trentotto. Speech recognition writes numbers as digits, so they are
// spelled out before comparing; and a number word tapped in a sentence is explained with its value.
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

// 0 … 999999 → words: 1995 → millenovecentonovantacinque
export function numberWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1e6) return String(n);
  if (n < 1000) return under1000(n);
  const head = n < 2000 ? "mille" : under1000(Math.floor(n / 1000)) + "mila";
  return n % 1000 ? head + under1000(n % 1000) : head;
}

// words → value, for every number up to 2999 and the round thousands above; null when it is not a number word
let byWord = null;
export function numberValue(word) {
  if (!byWord) {
    byWord = new Map();
    const put = n => {
      const w = numberWords(n);
      byWord.set(w, n);
      if (w.endsWith("tré")) byWord.set(w.slice(0, -1) + "e", n);   // ventitre, written without the accent
    };
    for (let n = 0; n < 3000; n++) put(n);
    for (let k = 3; k < 1000; k++) put(k * 1000);
  }
  const v = byWord.get(String(word).toLowerCase());
  return v === undefined ? null : v;
}
