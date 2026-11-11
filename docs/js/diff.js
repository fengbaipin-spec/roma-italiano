// Compares a typed sentence with the one that was read out, word by word, and names each kind of mistake.
// No DOM here, so it can be tested on its own with Node.
const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const single = s => s.replace(/(\p{L})\1/gu, "$1");
const SMALL = new Set(("il lo la i gli le l un uno una di a da in con su per tra fra del dello della dei degli delle " +
  "al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle").split(" "));

export const KIND_NAMES = { accent: "重音", double: "双辅音", article: "冠词或介词", spelling: "拼写", miss: "漏写", extra: "多写" };

// a space typed after an elided article or preposition still makes one word (l' affitto = l'affitto),
// but not after a shortened word: un po' di stays three words
const ELISION = /(^|[\s(«"“])(l|un|d|c|m|t|s|v|n|dell|all|dall|nell|sull|coll|quest|quell|bell|sant|tutt|anch|com|dov|nient|senz|qual|buon|grand|mezz)'\s+/g;

// words for comparing: lower case, no punctuation, apostrophes kept inside words (l'affitto, c'è)
export function tokens(text) {
  return text.toLowerCase().replace(/[’‘`´]/g, "'").replace(ELISION, "$1$2'")
    .replace(/[.,;:!?¡¿«»"“”()[\]…–—\-/]/g, " ")
    .split(/\s+/).map(t => t.replace(/^'+|'+$/g, "")).filter(Boolean);
}

export function kind(want, got) {
  const a = strip(want), b = strip(got);
  if (a === b) return "accent";
  if (single(a) === single(b)) return "double";
  if (SMALL.has(a) && SMALL.has(b)) return "article";
  return "spelling";
}

function lev(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(up + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}
// cheap to pair words that differ by an accent or a double letter, dear to pair unrelated words
function cost(want, got) {
  if (want === got) return 0;
  const k = kind(want, got);
  if (k === "accent" || k === "double") return 0.3;
  if (k === "article") return 0.7;
  const close = lev(strip(want), strip(got)) <= Math.max(1, Math.round(Math.max(want.length, got.length) / 3));
  return close ? 0.9 : 1.9;
}

// → { words: [{ text, status: ok|bad|miss|none, typed, kind }], extras, counts: { kind: n }, right, total, perfect }
export function compare(sentence, typed) {
  const shown = sentence.split(/\s+/).filter(Boolean);
  const exp = [];
  shown.forEach((w, wi) => tokens(w).forEach(t => exp.push({ t, wi })));
  const got = tokens(typed);
  const n = exp.length, m = got.length;
  const D = [];
  for (let i = 0; i <= n; i++) { D.push(new Float64Array(m + 1)); D[i][0] = i; }
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost(exp[i - 1].t, got[j - 1]));
    }
  }
  // walk back through the table to see which typed word went with which word of the sentence
  const status = exp.map(() => ({ st: "miss", kind: "miss" }));
  const extras = [];
  const same = (x, y) => Math.abs(x - y) < 1e-9;
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && same(D[i][j], D[i - 1][j - 1] + cost(exp[i - 1].t, got[j - 1]))) {
      const want = exp[i - 1].t, g = got[j - 1];
      status[i - 1] = want === g ? { st: "ok" } : { st: "bad", typed: g, kind: kind(want, g) };
      i--; j--;
    } else if (i > 0 && same(D[i][j], D[i - 1][j] + 1)) {
      i--;
    } else {
      extras.unshift(got[j - 1]);
      j--;
    }
  }
  const words = shown.map((text, wi) => {
    const mine = status.filter((_, k) => exp[k].wi === wi);
    if (!mine.length) return { text, status: "none" };
    const bad = mine.filter(s => s.st === "bad");
    if (bad.length) return { text, status: "bad", typed: bad.map(s => s.typed).join(" "), kind: bad[0].kind };
    if (mine.some(s => s.st === "miss")) return { text, status: "miss", kind: "miss" };
    return { text, status: "ok" };
  });
  const counts = {};
  for (const s of status) if (s.st !== "ok") counts[s.kind] = (counts[s.kind] || 0) + 1;
  if (extras.length) counts.extra = extras.length;
  const right = status.filter(s => s.st === "ok").length;
  return { words, extras, counts, right, total: n, perfect: right === n && !extras.length };
}
