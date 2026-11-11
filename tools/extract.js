// One-off: pulls the word lists and essays out of the standalone pages in the 语言学习 folder into docs/data.
// After this has run, docs/data is the source of truth: edit the JSON there, then run tools/build.js.
// Usage: node tools/extract.js [learning-folder]
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.resolve(process.argv[2] || path.join(root, ".."));
const out = path.join(root, "docs", "data");

const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const NAMES = ["", "第一册", "第二册", "第三册", "第四册", "第五册", "第六册", "第七册", "第八册",
  "第九册", "第十册", "第十一册", "第十二册", "第十三册", "第十四册", "第十五册"];

// 罗马发音词典.html is volume 1; the others end in _第N册.html
function volumeNumber(file) {
  const m = file.match(/_第(.+)册\.html$/);
  if (!m) return 1;
  const s = m[1];
  if (s.length === 1) return NUM[s];
  if (s.length === 2 && s[0] === "十") return 10 + NUM[s[1]];
  throw new Error("unexpected volume file name: " + file);
}
const levelOf = v => (v <= 5 ? "A2" : v <= 9 ? "B1" : "B2");

function grab(html, re, file) {
  const m = html.match(re);
  if (!m) throw new Error(`${file}: pattern not found ${re}`);
  return m[1];
}
const DATA_RE = /const DATA = (\[[\s\S]*?\]);\s*\nconst /;

const volumes = [];
for (const file of fs.readdirSync(src).filter(f => /^罗马发音词典.*\.html$/.test(f))) {
  const html = fs.readFileSync(path.join(src, file), "utf8");
  const v = volumeNumber(file);
  volumes.push({
    v,
    name: NAMES[v],
    level: levelOf(v),
    tags: JSON.parse(grab(html, /const TAGS = (\[[^\n]*\]);/, file)),
    words: JSON.parse(grab(html, DATA_RE, file))
  });
}
volumes.sort((a, b) => a.v - b.v);
volumes.forEach((vol, k) => { if (vol.v !== k + 1) throw new Error("missing volume " + (k + 1)); });

const essayFile = "意大利语写作范文.html";
const essays = JSON.parse(grab(fs.readFileSync(path.join(src, essayFile), "utf8"), DATA_RE, essayFile));

// one record per line keeps the files easy to edit and to diff
const line = x => JSON.stringify(x);
const vocabText = '{"volumes":[\n' + volumes.map(({ words, ...meta }) =>
  line(meta).slice(0, -1) + ',"words":[\n' + words.map(line).join(",\n") + "\n]}").join(",\n") + "\n]}\n";
const essayText = '{"essays":[\n' + essays.map(({ s, ...meta }) =>
  line(meta).slice(0, -1) + ',"s":[\n' + s.map(line).join(",\n") + "\n]}").join(",\n") + "\n]}\n";

JSON.parse(vocabText);
JSON.parse(essayText);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "vocab.json"), vocabText);
fs.writeFileSync(path.join(out, "essays.json"), essayText);

const seen = new Map();
const dupes = [];
for (const vol of volumes) for (const w of vol.words) {
  if (seen.has(w[0])) dupes.push(`${w[0]} (${seen.get(w[0])} / ${vol.name})`);
  else seen.set(w[0], vol.name);
}
for (const vol of volumes) console.log(vol.name, vol.level, vol.words.length, "words,", vol.tags.length, "scenes");
console.log("total", volumes.reduce((n, vol) => n + vol.words.length, 0), "words,", essays.length, "essays");
console.log(dupes.length ? "duplicate headwords: " + dupes.join(", ") : "headwords are unique");
