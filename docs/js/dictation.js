// 听写: hear an example sentence, type what you heard, and see each mistake marked by kind.
import { $, esc, ICON, nav, shuffle } from "./util.js";
import { settings, stars } from "./store.js";
import { speakOne } from "./speech.js";
import { words, volumes } from "./dict.js";
import * as rec from "./srs.js";
import { compare, KIND_NAMES } from "./diff.js";

const ROUND = 10;
const KEYS = ["à", "è", "é", "ì", "ò", "ù", "'"];
let source = null;   // which words the sentences come from
let round = null;    // { items, pos, results }

const leave = () => (nav.prev === "learn" ? history.back() : location.replace("#learn"));

function sources() {
  const all = words(), vols = volumes();
  const V = vols[settings.newFrom - 1] || vols[0];
  return [
    { id: "learned", name: "已学的词", list: all.filter(w => rec.known(w.it)) },
    { id: "stars", name: "收藏", list: all.filter(w => stars.has(w.it)) },
    { id: "volume", name: V.name, list: all.slice(V.first, V.first + V.count) }
  ];
}

export function renderDictation(view) {
  round = null;
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="xClose" aria-label="结束听写">${ICON.close}</button>
      <b class="rtitle">听写</b><span class="grow"></span><span class="vcount" id="xCount"></span>
    </div><div class="pbar"><i id="xBar"></i></div></header>
    <div class="drill pad" id="xBody"></div>`;
  $("xClose").onclick = leave;
  drawSetup();
  return false;
}

function drawSetup() {
  const src = sources();
  if (!src.some(s => s.id === source && s.list.length)) source = (src.find(s => s.list.length >= 5) || src[2]).id;
  $("xCount").textContent = "";
  $("xBar").style.width = "0";
  $("xBody").innerHTML = `
    <p class="lead">每轮 ${ROUND} 句。App 读一句例句，你把听到的意大利语写下来，再点“检查”，拼错的地方会标出来，并告诉你是重音、双辅音、冠词还是拼写的问题。</p>
    <div class="field"><span class="flabel">句子来自</span>
      <div class="chiprow" id="xSrc">${src.map(s => `<button type="button" class="chip" data-src="${s.id}" aria-pressed="${s.id === source}"${s.list.length ? "" : " disabled"}>${esc(s.name)}<span class="n">${s.list.length}</span></button>`).join("")}</div>
    </div>
    <button type="button" class="bigbtn" id="xStart">${ICON.play}开始听写</button>
    <p class="note">写错过的句子会更常出现，全对一次后恢复正常。重音字母可以用输入框下面的按钮，也可以在手机键盘上长按元音。</p>`;
  $("xSrc").onclick = e => {
    const b = e.target.closest("[data-src]");
    if (!b || b.disabled) return;
    source = b.dataset.src;
    drawSetup();
  };
  $("xStart").onclick = () => start(sources().find(s => s.id === source).list);
}

// sentences written wrong before come first, then the words learned most recently; random among equals
function start(list) {
  const pool = shuffle(list.slice());
  pool.sort((a, b) => rec.missCount(b.it) - rec.missCount(a.it) || rec.stageOf(a.it) - rec.stageOf(b.it));
  round = { items: shuffle(pool.slice(0, ROUND)), pos: 0, results: [] };
  drawItem();
}

function drawItem() {
  const w = round.items[round.pos];
  if (!w) { drawSummary(); return; }
  $("xCount").textContent = `${round.pos + 1} / ${round.items.length}`;
  $("xBar").style.width = `${Math.round((round.pos / round.items.length) * 100)}%`;
  $("xBody").innerHTML = `
    <div class="eplay">
      <button type="button" class="pbtn it" id="xPlay">${ICON.play}再听一遍</button>
      <button type="button" class="pbtn en" id="xSlow">${ICON.play}慢速</button>
    </div>
    <textarea class="dict-ans" id="xAns" rows="3" lang="it" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
      aria-label="写下你听到的意大利语" placeholder="写下你听到的意大利语"></textarea>
    <div class="keys" id="xKeys">${KEYS.map(c => `<button type="button" data-ch="${c}" aria-label="输入 ${c}">${c}</button>`).join("")}</div>
    <button type="button" class="bigbtn" id="xCheck">检查</button>
    <button type="button" class="linkbtn" id="xHintBtn">看中文提示</button>
    <p class="exzh" id="xHint" hidden>${esc(w.exZh)}</p>
    <div id="xResult"></div>`;
  const play = rate => speakOne(w.ex, "it", null, rate);
  $("xPlay").onclick = () => play();
  $("xSlow").onclick = () => play(0.6);
  // insert on pointerdown so the text box keeps its focus and the keyboard stays open
  $("xKeys").onpointerdown = e => {
    const b = e.target.closest("[data-ch]");
    if (!b) return;
    e.preventDefault();
    insert($("xAns"), b.dataset.ch);
  };
  $("xKeys").onclick = e => {
    const b = e.target.closest("[data-ch]");
    if (b && e.detail === 0) insert($("xAns"), b.dataset.ch);   // keyboard activation
  };
  $("xHintBtn").onclick = () => { $("xHint").hidden = false; $("xHintBtn").hidden = true; };
  $("xCheck").onclick = check;
  if (settings.autoSay) play();
}

function insert(box, ch) {
  const s = box.selectionStart, e = box.selectionEnd;
  box.value = box.value.slice(0, s) + ch + box.value.slice(e);
  box.selectionStart = box.selectionEnd = s + ch.length;
  box.focus();
}

const marked = res => res.words.map(x => {
  if (x.status === "bad") return `<span class="dw bad">${esc(x.text)}<small class="typed">${esc(x.typed)}</small></span>`;
  if (x.status === "miss") return `<span class="dw miss">${esc(x.text)}</span>`;
  return esc(x.text);
}).join(" ");
const kindsText = counts => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${KIND_NAMES[k]} ${n} 处`).join("，");

function check() {
  const w = round.items[round.pos], box = $("xAns");
  if (!box.value.trim()) { box.focus(); return; }
  const res = compare(w.ex, box.value);
  round.results.push({ w, res });
  rec.noteDictation(w.it, res.perfect);
  box.readOnly = true;
  box.blur();
  $("xKeys").hidden = true;
  $("xHintBtn").hidden = true;
  $("xHint").hidden = true;
  $("xResult").innerHTML = `<div class="result ${res.perfect ? "good" : "bad"}">
    <p class="verdict">${res.perfect ? "全对！" : `对了 ${res.right} / ${res.total} 个词：${kindsText(res.counts)}`}</p>
    <p class="marked" lang="it">${marked(res)}</p>
    ${res.extras.length ? `<p class="note">多写了：<span lang="it">${res.extras.map(esc).join(" ")}</span></p>` : ""}
    ${res.perfect ? "" : '<p class="note">红底是写错的词，后面的小字是你写的；虚线是漏写的词。</p>'}
    <p class="exzh">${esc(w.exZh)}</p>
    <p class="note">这句来自词条 <b lang="it">${esc(w.it)}</b>（${esc(w.zh)}）</p>
  </div>`;
  const btn = $("xCheck");
  btn.textContent = round.pos + 1 < round.items.length ? "下一句" : "看这一轮的结果";
  btn.onclick = () => {
    round.pos++;
    drawItem();
    window.scrollTo(0, 0);
  };
}

function drawSummary() {
  $("xCount").textContent = "";
  $("xBar").style.width = "100%";
  const r = round.results, perfect = r.filter(x => x.res.perfect).length;
  const tally = {};
  for (const x of r) for (const [k, n] of Object.entries(x.res.counts)) tally[k] = (tally[k] || 0) + n;
  const wrong = r.filter(x => !x.res.perfect);
  $("xBody").innerHTML = `<div class="done">
    <p class="eyebrow">这一轮完成</p>
    <h2 class="donetitle">${r.length} 句里全对 ${perfect} 句</h2>
    ${Object.keys(tally).length ? `<p>最常出错的是：${kindsText(tally)}。</p>` : "<p>一个错也没有。</p>"}
    ${wrong.length ? `<ul class="wronglist" id="xWrong">${wrong.map((x, k) => `<li>
      <button type="button" class="exit" data-k="${k}" lang="it">${esc(x.w.ex)}${ICON.spk}</button>
      <span class="exzh">${esc(x.w.exZh)}</span></li>`).join("")}</ul>` : ""}
    <div class="donebtns">
      ${wrong.length ? `<button type="button" class="bigbtn" id="xRetry">再练写错的 ${wrong.length} 句</button>` : ""}
      <button type="button" class="bigbtn soft" id="xAgain">换一组</button>
      <button type="button" class="bigbtn no" id="xHome">回到学习首页</button>
    </div></div>`;
  if ($("xWrong")) $("xWrong").onclick = e => {
    const b = e.target.closest("[data-k]");
    if (b) speakOne(wrong[Number(b.dataset.k)].w.ex, "it", b);
  };
  if ($("xRetry")) $("xRetry").onclick = () => {
    round = { items: wrong.map(x => x.w), pos: 0, results: [] };
    drawItem();
  };
  $("xAgain").onclick = () => start(sources().find(s => s.id === source).list);
  $("xHome").onclick = leave;
}
