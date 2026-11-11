// Tap a word in a sentence to see what it means: the sheet that explains it, and the helper that
// draws a sentence with every word tappable.
import { esc, ICON, toast, openSheet, closeSheet } from "./util.js";
import { store, settings, stars, saveStars } from "./store.js";
import { speakOne } from "./speech.js";
import { words, volumes, CONJ_LABELS, openInDict } from "./dict.js";
import { known } from "./srs.js";
import { createLookup, splitWords } from "./lookup.js";

let index = null;
const lookupIndex = () => index || (index = createLookup(words(), e => CONJ_LABELS[e.tag] || "现在时"));
// building the index takes a moment on a phone, so it is done once the app is idle
export function warmLookup() {
  const run = () => lookupIndex();
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

// the sentence with each word wrapped so it can be tapped; data-k is the word's position in the sentence
export function tapWords(text) {
  let k = 0;
  return splitWords(text).map(([isWord, s]) => (isWord ? `<span class="wd" data-k="${k++}">${esc(s)}</span>` : esc(s))).join("");
}

export function hintOnce() {
  if (store.get("wordHint", false)) return;
  store.set("wordHint", true);
  toast("提示：点句子里的单词，可以看解释", 4500);
}

function relation(word, h) {
  if (h.rank === 0) return "";
  if (h.rank === 3) return "包含这个词的词条";
  if (h.label === "后面连着代词") return `${word} 是 ${h.base} 的形式，后面连着代词`;
  if (h.base && h.base !== word) return `${word} 是 ${h.base} 的${h.label || "变化形式"}`;
  return "";
}

function card(e, note) {
  const on = stars.has(e.it), V = volumes()[e.v - 1];
  return `<div class="wi-card">
    ${note ? `<p class="wi-note">${esc(note)}</p>` : ""}
    <div class="wi-head">
      <button type="button" class="w" data-say="${e.i}" lang="it">${esc(e.it)}${ICON.spk}</button>
      <button type="button" class="star" data-star="${e.i}" aria-pressed="${on}" aria-label="${on ? "取消收藏" : "收藏"} ${esc(e.it)}">${ICON.star}</button>
    </div>
    <div class="zh">${esc(e.zh)}</div>
    ${e.conj ? `<p class="wi-conj"><span>${esc(CONJ_LABELS[e.tag] || "现在时")}</span> ${esc(e.conj)}</p>` : ""}
    <div class="meta">
      <button type="button" class="en" data-say-en="${e.i}" lang="en">${esc(e.en)}${ICON.spk}</button>
      <span class="tagl">${V.name} · ${esc(e.tag)}</span>
    </div>
    <button type="button" class="linkbtn" data-open="${e.i}">在词典里看例句${ICON.fwd}</button>
  </div>`;
}
const glossBox = (form, [kind, text]) =>
  `<div class="wi-gloss"><span class="wi-kind">${esc(kind)}</span><b lang="it">${esc(form)}</b><span>${esc(text)}</span></div>`;

// sentence: the Italian sentence; k: which word; el: the tapped word; sayAll: reads the whole sentence
export function showWord(sentence, k, el, sayAll) {
  const r = lookupIndex().lookup(sentence, k);
  if (!r) return;
  const all = words();
  const word = r.word.toLowerCase();
  let html = `<div class="wordinfo">
    <div class="wi-top">
      <button type="button" class="w" data-say-word lang="it">${esc(r.word)}${ICON.spk}</button>
      ${sayAll ? `<button type="button" class="txtbtn" data-sentence>${ICON.play}朗读整句</button>` : ""}
    </div>`;
  // l'affitto: a note for l' and the entry for affitto; c'è: one note for the whole word
  if (r.part && r.part.gloss && r.glossFor !== word) html += glossBox(r.part.form, r.part.gloss);
  if (r.gloss) html += glossBox(r.glossFor, r.gloss);
  if (r.phrases.length) html += `<p class="wi-sec">这里是固定搭配</p>` + r.phrases.map(e => card(e)).join("");
  if (r.hits.length) {
    if (r.phrases.length || r.gloss) html += `<p class="wi-sec">词典里的词条</p>`;
    html += r.hits.map(h => card(h.e, relation(word, h))).join("");
  }
  if (r.guess.length) html += `<p class="wi-sec">词典里没有完全一样的词，可能相关：</p>` + r.guess.map(e => card(e)).join("");
  if (r.name) html += `<p class="wi-note">这个词大写开头，可能是人名或地名。</p>`;
  if (!r.phrases.length && !r.hits.length && !r.gloss && !r.guess.length && !r.name) {
    html += `<p class="wi-note">词典里还没有这个词。</p>`;
  }
  const q = encodeURIComponent(word);
  html += `<p class="wi-links">其他词典：<a href="https://translate.google.com/?sl=it&amp;tl=zh-CN&amp;text=${q}&amp;op=translate" target="_blank" rel="noopener">Google 翻译</a>
    · <a href="https://www.wordreference.com/iten/${q}" target="_blank" rel="noopener">WordReference（英文释义）</a></p></div>`;

  document.querySelectorAll(".wd.on").forEach(x => x.classList.remove("on"));
  if (el) el.classList.add("on");
  openSheet("单词解释", html, ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-say-word")) speakOne(r.word, "it", b);
    else if (b.hasAttribute("data-sentence")) sayAll();
    else if (b.dataset.say) speakOne(all[Number(b.dataset.say)].it, "it", b);
    else if (b.dataset.sayEn) speakOne(all[Number(b.dataset.sayEn)].en, "en", b);
    else if (b.dataset.star) {
      const e = all[Number(b.dataset.star)];
      if (stars.has(e.it)) stars.delete(e.it); else stars.add(e.it);
      saveStars();
      const on = stars.has(e.it);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", (on ? "取消收藏 " : "收藏 ") + e.it);
      toast(!on ? "已取消收藏" : known(e.it) ? "已收藏" : "已收藏，它会优先出现在每天的新词里");
    } else if (b.dataset.open) {
      const e = all[Number(b.dataset.open)];
      closeSheet(false, () => openInDict(e.it));
    }
  });
  if (settings.autoSay) speakOne(r.word, "it", null);
}
