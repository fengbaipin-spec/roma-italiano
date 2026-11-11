// Checks the data, then writes the offline file list (docs/sw.js) and the version number (docs/js/version.js).
// Run it after every change under docs/, before committing.
// Usage: node tools/build.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const docs = path.join(__dirname, "..", "docs");
const read = file => fs.readFileSync(path.join(docs, file));
const LEVELS = ["A1", "A2", "B1", "B2"];
const TYPES = ["描述", "叙述", "非正式信件", "正式信件", "观点", "文章"];
const errors = [];

const vocab = JSON.parse(read("data/vocab.json"));
const heads = new Map();
vocab.volumes.forEach((vol, k) => {
  if (vol.v !== k + 1) errors.push(`volume ${k + 1} is numbered ${vol.v}`);
  for (const w of vol.words) {
    const ok = Array.isArray(w) && (w.length === 7 || w.length === 8) && w.every(x => typeof x === "string" && x.trim());
    if (!ok) { errors.push(`${vol.name}: malformed entry ${JSON.stringify(w).slice(0, 80)}`); continue; }
    if (!vol.tags.includes(w[6])) errors.push(`${vol.name} ${w[0]}: scene ${w[6]} is not in the volume's scene list`);
    // starred words are stored by headword, so a headword may appear only once
    if (heads.has(w[0])) errors.push(`${w[0]} is in both ${heads.get(w[0])} and ${vol.name}`);
    heads.set(w[0], vol.name);
  }
});

const essays = JSON.parse(read("data/essays.json")).essays;
const titles = new Set();
for (const e of essays) {
  for (const k of ["l", "t", "topic", "title", "pit", "pzh", "tip"]) {
    if (typeof e[k] !== "string" || !e[k].trim()) errors.push(`${e.title}: missing ${k}`);
  }
  if (!LEVELS.includes(e.l)) errors.push(`${e.title}: unknown level ${e.l}`);
  if (!TYPES.includes(e.t)) errors.push(`${e.title}: unknown type ${e.t}`);
  if (titles.has(e.title)) errors.push(`duplicate essay title ${e.title}`);
  titles.add(e.title);
  if (!/\(\d+-\d+ parole\)/.test(e.pit)) errors.push(`${e.title}: task has no word range`);
  if (!Array.isArray(e.s) || !e.s.length) errors.push(`${e.title}: no sentences`);
  else e.s.forEach((s, k) => {
    if (!Array.isArray(s) || s.length !== 3 || s.some(x => typeof x !== "string" || !x.trim())) errors.push(`${e.title}: bad sentence ${k}`);
  });
}
const pairCats = JSON.parse(read("data/pairs.json")).categories;
const catIds = new Set();
let pairCount = 0;
for (const c of pairCats) {
  if (!c.id || catIds.has(c.id)) errors.push(`pairs: missing or repeated category id ${c.id}`);
  catIds.add(c.id);
  for (const k of ["name", "tip"]) if (typeof c[k] !== "string" || !c[k].trim()) errors.push(`pairs ${c.id}: missing ${k}`);
  if (!Array.isArray(c.pairs) || !c.pairs.length) { errors.push(`pairs ${c.id}: no pairs`); continue; }
  for (const p of c.pairs) {
    // [word, 中文, other word, 中文]
    if (!Array.isArray(p) || p.length !== 4 || p.some(x => typeof x !== "string" || !x.trim()) || p[0] === p[2]) {
      errors.push(`pairs ${c.id}: bad pair ${JSON.stringify(p)}`);
    }
    pairCount++;
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// every file under docs goes into the offline copy, except the service worker itself
const skip = new Set(["sw.js", "js/version.js", ".nojekyll"]);
const files = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(path.join(docs, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(rel);
    else if (!skip.has(rel)) files.push(rel);
  }
})("");
files.sort();

// the version is a hash of the content, so it changes exactly when something changed
const hash = crypto.createHash("sha256");
for (const f of files) hash.update(f + "\0").update(read(f));
const version = hash.digest("hex").slice(0, 10);

fs.writeFileSync(path.join(docs, "js", "version.js"),
  `// Written by tools/build.js; changes whenever any file of the app changes.\nexport const VERSION = "${version}";\n`);
const assets = ["./", ...files, "js/version.js"];
const sw = fs.readFileSync(path.join(__dirname, "sw-template.js"), "utf8")
  .replace("__VERSION__", version)
  .replace("__ASSETS__", JSON.stringify(assets, null, 2));
fs.writeFileSync(path.join(docs, "sw.js"), sw);

const kb = files.reduce((n, f) => n + fs.statSync(path.join(docs, f)).size, 0) / 1024;
console.log(`${vocab.volumes.length} volumes, ${heads.size} words, ${essays.length} essays, ${pairCount} minimal pairs`);
console.log(`version ${version}: ${assets.length} files cached for offline use, ${kb.toFixed(0)} KB`);
