// The dictionary (15 volumes) and the favourites list, which share one entry layout.
import { $, esc, norm, ICON, setFab, openSheet, closeSheet } from "./util.js";
import { store, settings, saveSettings, stars, saveStars } from "./store.js";
import { speech, onVoices, speakOne, playList, stopList, player } from "./speech.js";
import { pwa, onPwa, promptInstall } from "./pwa.js";

/* scenes whose conjugation row is not the present tense */
const CONJ_LABELS = { 过去时: "近过去时", 将来时: "将来时", 未完成过去时: "未完成过去时", 虚拟式: "现在虚拟式", 条件式: "条件式",
  远过去时: "远过去时", 先过去时: "先过去时", 未完成虚拟式: "未完成虚拟式", 过去虚拟式: "过去虚拟式", 过去条件式: "过去条件式" };
const LEVEL_NAMES = { A2: "基础", B1: "进阶", B2: "中高级" };
const PAGE = 120;   // search results shown at a time

let VOLS = [];
const ALL = [];
let INDEX = null;
const flip = new Set();   // entries whose example is shown (or hidden) against the default
let quiz = false;         // favourites self-test: meanings stay blurred until tapped

export function setVocab(data) {
  VOLS = data.volumes;
  for (const V of VOLS) {
    V.first = ALL.length;
    V.count = V.words.length;
    for (const w of V.words) {
      ALL.push({ i: ALL.length, v: V.v, it: w[0], zh: w[1], en: w[2], ex: w[3], exZh: w[4], exEn: w[5], tag: w[6], conj: w[7] || "" });
    }
  }
}
export const wordCount = () => ALL.length;
export const clearFlips = () => flip.clear();
const volume = v => VOLS[v - 1];
const isOpen = i => settings.exOpen !== flip.has(i);
const searchIndex = () => INDEX || (INDEX = ALL.map(w => ({
  head: norm(w.it),
  meaning: norm([w.zh, w.en, w.conj].join(" ")),
  example: norm([w.ex, w.exZh, w.exEn].join(" "))
})));
const ARTICLE = /^(il|lo|la|i|gli|le|un|uno|una) |^(l|un)'/;
// headword matches first, then meanings, then words that only appear in an example
function rank(x, q) {
  if (x.head === q || x.head.replace(ARTICLE, "") === q) return 0;
  if (x.head.includes(q)) return 1;
  if (x.meaning.includes(q)) return 2;
  if (x.example.includes(q)) return 3;
  return -1;
}

/* ---------- one entry ---------- */
function entryHTML(i, showVol, showTag) {
  const w = ALL[i], on = stars.has(w.it), open = isOpen(i);
  const where = [showVol ? volume(w.v).name : "", showTag ? w.tag : ""].filter(Boolean).join(" · ");
  return `<li class="entry" data-i="${i}">
    <div class="e-main">
      <button type="button" class="w" data-act="w" data-say="w:${i}" lang="it">${esc(w.it)}${ICON.spk}</button>
      <div class="zh">${esc(w.zh)}</div>
      ${w.conj ? `<button type="button" class="conj" data-act="c" data-say="c:${i}" lang="it"><span class="lbl">${CONJ_LABELS[w.tag] || "现在时"}</span>${esc(w.conj)}${ICON.spk}</button>` : ""}
      <div class="meta">
        <button type="button" class="en" data-act="e" data-say="e:${i}" lang="en">${esc(w.en)}${ICON.spk}</button>
        <button type="button" class="exbtn" data-act="ex" aria-expanded="${open}">例句${ICON.down}</button>
        ${where ? `<span class="tagl">${esc(where)}</span>` : ""}
      </div>
      <div class="ex"${open ? "" : " hidden"}>
        <button type="button" class="exit" data-act="x" data-say="x:${i}" lang="it">${esc(w.ex)}${ICON.spk}</button>
        <div class="exzh">${esc(w.exZh)}</div>
        <button type="button" class="exen" data-act="y" data-say="y:${i}" lang="en">${esc(w.exEn)}${ICON.spk}</button>
      </div>
    </div>
    <button type="button" class="star" data-act="star" aria-pressed="${on}" aria-label="${on ? "取消收藏" : "收藏"} ${esc(w.it)}">${ICON.star}</button>
  </li>`;
}

function setExample(li, open) {
  const i = Number(li.dataset.i);
  li.querySelector(".ex").hidden = !open;
  li.querySelector(".exbtn").setAttribute("aria-expanded", String(open));
  if (open !== settings.exOpen) flip.add(i); else flip.delete(i);
}

function onListClick(e) {
  const li = e.target.closest(".entry");
  if (!li) return;
  const b = e.target.closest("[data-act]");
  const act = b ? b.dataset.act : "";
  // self-test: a tap on a blurred entry shows the answer, unless it was on the word, the star or the example button
  if (li.closest(".quiz") && !li.classList.contains("shown") && !["w", "star", "ex"].includes(act)) {
    li.classList.add("shown");
    return;
  }
  if (!b) return;
  const w = ALL[Number(li.dataset.i)];
  if (act === "star") {
    if (stars.has(w.it)) stars.delete(w.it); else stars.add(w.it);
    saveStars();
    const on = stars.has(w.it);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", (on ? "取消收藏 " : "收藏 ") + w.it);
    if ($("favCount")) $("favCount").textContent = `${stars.size} 个词`;
    return;
  }
  if (act === "ex") { setExample(li, li.querySelector(".ex").hidden); return; }
  const what = { w: [w.it, "it"], c: [w.conj, "it"], e: [w.en, "en"], x: [w.ex, "it"], y: [w.exEn, "en"] }[act];
  if (what) speakOne(what[0], what[1], b);
}

// what one word sounds like inside a list: the word, then (if chosen) its example
function wordParts(i) {
  const w = ALL[i];
  const parts = [{ text: w.it, lang: "it", sel: "w:" + i, gap: settings.playEx ? 500 : 900 }];
  if (settings.playEx) {
    parts.push({ text: w.ex, lang: "it", sel: "x:" + i, gap: 1200, before: () => {
      const li = document.querySelector(`.entry[data-i="${i}"]`);
      if (li && li.querySelector(".ex").hidden) setExample(li, true);
    } });
  }
  return parts;
}

// the first entry not covered by the header, so a list can start reading from where you are
function firstVisible() {
  const bar = document.querySelector(".vbar");
  const top = (bar ? bar.getBoundingClientRect().bottom : 0) + 4;
  for (const li of document.querySelectorAll("#list .entry")) {
    if (li.getBoundingClientRect().bottom > top) return Number(li.dataset.i);
  }
  return null;
}
// run fn without the entry at the top of the screen moving
function keepAnchor(fn) {
  const i = firstVisible();
  const before = i == null ? null : document.querySelector(`.entry[data-i="${i}"]`).getBoundingClientRect().top;
  fn();
  const li = i == null ? null : document.querySelector(`.entry[data-i="${i}"]`);
  if (li) window.scrollBy(0, li.getBoundingClientRect().top - before);
}
function toggleAllExamples(btn) {
  settings.exOpen = !settings.exOpen;
  saveSettings();
  flip.clear();
  btn.setAttribute("aria-pressed", String(settings.exOpen));
  keepAnchor(() => document.querySelectorAll("#list .entry").forEach(li => setExample(li, settings.exOpen)));
}
function playFrom(items, title) {
  const first = firstVisible();
  const start = first == null ? 0 : Math.max(0, items.indexOf(first));
  playList({ kind: "dict", title, items, start, label: i => ALL[i].it, expand: wordParts });
}

/* ---------- dictionary ---------- */
const ds = { ready: false, v: 1, tag: "全部", query: "", searching: false, limit: PAGE, items: [], restore: null };

function initState() {
  const s = store.get("dict", {});
  ds.v = volume(s.v) ? s.v : 1;
  ds.tag = s.tag && volume(ds.v).tags.includes(s.tag) ? s.tag : "全部";
  ds.restore = Number.isInteger(s.i) ? s.i : null;
  ds.ready = true;
}
const saveDict = i => store.set("dict", { v: ds.v, tag: ds.tag, i });
const searchingText = () => ds.searching && ds.query.trim() !== "";

function dictItems() {
  const out = [];
  if (searchingText()) {
    const q = norm(ds.query.trim()), idx = searchIndex(), buckets = [[], [], [], []];
    for (let i = 0; i < ALL.length; i++) {
      const r = rank(idx[i], q);
      if (r >= 0) buckets[r].push(i);
    }
    return buckets.flat();
  }
  const V = volume(ds.v);
  for (let i = V.first; i < V.first + V.count; i++) if (ds.tag === "全部" || ALL[i].tag === ds.tag) out.push(i);
  return out;
}

export function renderDict(view) {
  if (!ds.ready) initState();
  view.innerHTML = `
    <header class="vbar">
      <div class="vrow" id="dictRow"></div>
      <div class="chips" id="chips" role="group" aria-label="场景"></div>
    </header>
    <div id="notices"></div>
    <p class="found pad" id="found" hidden></p>
    <ul class="list" id="list"></ul>
    <div class="more"><button type="button" class="txtbtn" id="more" hidden></button></div>
    <p class="empty pad" id="empty" hidden></p>`;
  $("list").addEventListener("click", onListClick);
  $("chips").addEventListener("click", e => {
    const b = e.target.closest("[data-tag]");
    if (!b || b.dataset.tag === ds.tag) return;
    ds.tag = b.dataset.tag;
    saveDict(null);
    if (player.active && player.kind === "dict") stopList();
    drawChips();
    drawList();
    window.scrollTo(0, 0);
  });
  $("more").onclick = () => { ds.limit += PAGE; drawList(); };
  drawRow();
  drawChips();
  drawList();
  drawNotices();
  setFab("连读", () => {
    const V = volume(ds.v);
    playFrom(ds.items, searchingText() ? "搜索结果" : ds.tag === "全部" ? V.name : `${V.name} · ${ds.tag}`);
  });
  return restorePosition();
}

function drawRow(focus) {
  const row = $("dictRow");
  if (ds.searching) {
    row.innerHTML = `<button type="button" class="iconbtn" id="sBack" aria-label="关闭搜索">${ICON.back}</button>
      <input class="search" id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"
        placeholder="搜索全部 ${ALL.length} 个词：意、中、英都行" aria-label="搜索单词" value="${esc(ds.query)}">`;
    const q = $("q");
    q.addEventListener("input", () => {
      ds.query = q.value;
      ds.limit = PAGE;
      if (player.active && player.kind === "dict") stopList();
      drawList();
      window.scrollTo(0, 0);
    });
    q.addEventListener("keydown", e => { if (e.key === "Enter") q.blur(); });
    $("sBack").onclick = () => {
      ds.searching = false;
      ds.query = "";
      drawRow();
      drawChips();
      drawList();
      window.scrollTo(0, 0);
    };
    if (focus) q.focus();
    return;
  }
  const V = volume(ds.v);
  row.innerHTML = `<button type="button" class="volpick" id="volPick" aria-label="选择分册，现在是${V.name}">
      <span class="lvl">${V.level}</span><b>${V.name}</b>${ICON.down}</button>
    <span class="grow"></span>
    <button type="button" class="txtbtn" id="exAll" aria-pressed="${settings.exOpen}">例句</button>
    <button type="button" class="iconbtn" id="sOpen" aria-label="搜索">${ICON.search}</button>`;
  $("volPick").onclick = pickVolume;
  $("exAll").onclick = e => toggleAllExamples(e.currentTarget);
  $("sOpen").onclick = () => {
    ds.searching = true;
    drawRow(true);
    drawChips();
  };
}

function drawChips() {
  const c = $("chips");
  c.hidden = ds.searching;
  if (ds.searching) return;
  const V = volume(ds.v), counts = {};
  for (let i = V.first; i < V.first + V.count; i++) counts[ALL[i].tag] = (counts[ALL[i].tag] || 0) + 1;
  c.innerHTML = [["全部", V.count], ...V.tags.map(t => [t, counts[t] || 0])].map(([t, n]) =>
    `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${t === ds.tag}">${esc(t)}<span class="n">${n}</span></button>`).join("");
  const on = c.querySelector('[aria-pressed="true"]');
  if (on) c.scrollLeft = on.offsetLeft - (c.clientWidth - on.offsetWidth) / 2;
}

function drawList() {
  const items = ds.items = dictItems();
  const text = searchingText();
  const shown = text ? items.slice(0, ds.limit) : items;
  $("list").innerHTML = shown.map(i => entryHTML(i, text, text || ds.tag === "全部")).join("");
  $("found").hidden = !text || !items.length;
  $("found").textContent = `找到 ${items.length} 个`;
  $("more").hidden = shown.length >= items.length;
  $("more").textContent = `再显示 ${Math.min(PAGE, items.length - shown.length)} 个（还有 ${items.length - shown.length} 个）`;
  $("empty").hidden = items.length > 0;
  $("empty").textContent = "没有找到。可以试试中文或英文，重音符号可以不打（citta 也能搜到 città）。";
}

function drawNotices() {
  const box = $("notices");
  if (!box || $("view").dataset.view !== "dict") return;
  let html = "";
  if (speech.checked && !speech.it) {
    html += `<div class="notice"><p><b>手机上没有找到意大利语声音</b>，发音可能会用其他口音。<a href="#settings">看看怎么安装</a></p></div>`;
  }
  if (pwa.prompt && !pwa.standalone && !store.get("installHintOff", false)) {
    html += `<div class="notice info"><span>安装到手机桌面，以后点图标打开，离线也能用。</span>
      <button type="button" class="txtbtn primary" id="doInstall">安装</button>
      <button type="button" class="iconbtn" id="noInstall" aria-label="不再提示">${ICON.close}</button></div>`;
  }
  box.innerHTML = html;
  if ($("doInstall")) {
    $("doInstall").onclick = () => promptInstall();
    $("noInstall").onclick = () => { store.set("installHintOff", true); drawNotices(); };
  }
}
onVoices(drawNotices);
onPwa(drawNotices);

function pickVolume() {
  const starred = V => ALL.slice(V.first, V.first + V.count).filter(w => stars.has(w.it)).length;
  const html = ["A2", "B1", "B2"].map(L => `<p class="vgroup">${L} · ${LEVEL_NAMES[L]}</p>` +
    VOLS.filter(V => V.level === L).map(V => {
      const s = starred(V);
      return `<button type="button" class="vitem" data-v="${V.v}" aria-current="${V.v === ds.v}">
        <b>${V.name}</b><span class="n">${V.count} 词${s ? ` · ★ ${s}` : ""}</span>
        <small>${V.tags.slice(0, 6).map(esc).join(" · ")}</small></button>`;
    }).join("")).join("");
  openSheet("选择分册", html, e => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    const v = Number(b.dataset.v);
    closeSheet();
    if (v === ds.v) return;
    ds.v = v;
    ds.tag = "全部";
    saveDict(null);
    if (player.active && player.kind === "dict") stopList();
    drawRow();
    drawChips();
    drawList();
    window.scrollTo(0, 0);
  });
}

// on the first visit after a restart, go back to the word you were reading
function restorePosition() {
  if (ds.restore == null) return false;
  const i = ds.restore;
  ds.restore = null;
  const li = document.querySelector(`.entry[data-i="${i}"]`);
  if (!li) return false;
  const bar = document.querySelector(".vbar");
  window.scrollTo(0, li.getBoundingClientRect().top + scrollY - (bar ? bar.offsetHeight : 0));
  return true;
}
let saveTimer = 0;
addEventListener("scroll", () => {
  if ($("view").dataset.view !== "dict" || ds.searching) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDict(firstVisible()), 400);
}, { passive: true });

/* ---------- favourites ---------- */
export function renderFavs(view) {
  const items = ALL.filter(w => stars.has(w.it)).map(w => w.i);
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <h1 class="vtitle">收藏</h1><span class="vcount" id="favCount">${items.length} 个词</span>
      <span class="grow"></span>
      <button type="button" class="txtbtn" id="quiz" aria-pressed="${quiz}">自测</button>
      <button type="button" class="txtbtn" id="exAll" aria-pressed="${settings.exOpen}">例句</button>
    </div></header>
    <p class="found pad" id="quizHint"${quiz ? "" : " hidden"}>先看意大利语想意思，再点模糊的地方看答案。</p>
    <ul class="list${quiz ? " quiz" : ""}" id="list">${items.map(i => entryHTML(i, true, true)).join("")}</ul>
    <p class="empty pad"${items.length ? " hidden" : ""}>还没有收藏。在词典里点词条右边的星星，把记不住的词收进来，就能在这里集中复习和连读。</p>`;
  $("list").addEventListener("click", onListClick);
  $("exAll").onclick = e => toggleAllExamples(e.currentTarget);
  $("quiz").onclick = e => {
    quiz = !quiz;
    e.currentTarget.setAttribute("aria-pressed", String(quiz));
    $("list").classList.toggle("quiz", quiz);
    $("quizHint").hidden = !quiz;
    document.querySelectorAll("#list .shown").forEach(li => li.classList.remove("shown"));
  };
  if (items.length) setFab("连读", () => playFrom(items, "收藏"));
  return false;
}
