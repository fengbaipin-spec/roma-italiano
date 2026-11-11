// The 80 model essays: a list for each level, and a reader that reads every sentence aloud.
import { $, esc, ICON, nav, wordsIn } from "./util.js";
import { store, settings, saveSettings, learned, saveLearned } from "./store.js";
import { speakOne, playList, stopList, player, onPlayer } from "./speech.js";

const LEVELS = [{ id: "A1", name: "入门" }, { id: "A2", name: "基础" }, { id: "B1", name: "进阶" }, { id: "B2", name: "中高级" }];
const TYPES = ["描述", "叙述", "非正式信件", "正式信件", "观点", "文章"];
let ESSAYS = [];
const BY = {};

export function setEssays(data) {
  ESSAYS = data.essays;
  for (const L of LEVELS) BY[L.id] = [];
  ESSAYS.forEach((e, i) => {
    e.n = BY[e.l].push(i);
    e.key = `${e.l}-${e.n}`;
    e.slug = e.key.toLowerCase();
    e.wc = wordsIn(e.s.map(s => s[0]).join(" "));
    const m = e.pit.match(/\((\d+)-(\d+) parole\)/);
    e.range = m ? `${m[1]}–${m[2]}` : "";
  });
}
export const essayCount = () => ESSAYS.length;

const es = Object.assign({ level: "A1", type: "全部" }, store.get("essays", {}));
const saveEs = () => store.set("essays", { level: es.level, type: es.type });
const isLetter = e => e.t.includes("信件");

/* ---------- list ---------- */
export function renderEssays(view) {
  if (!BY[es.level]) es.level = "A1";
  view.innerHTML = `
    <header class="vbar">
      <div class="levels" id="levels" role="group" aria-label="级别"></div>
      <div class="chips" id="types" role="group" aria-label="文体"></div>
    </header>
    <ol class="elist" id="elist"></ol>`;
  drawLevels();
  drawTypes();
  drawList();
  $("levels").onclick = e => {
    const b = e.target.closest("[data-level]");
    if (!b || b.dataset.level === es.level) return;
    es.level = b.dataset.level;
    saveEs();
    drawLevels();
    drawTypes();
    drawList();
    window.scrollTo(0, 0);
  };
  $("types").onclick = e => {
    const b = e.target.closest("[data-type]");
    if (!b || b.dataset.type === es.type) return;
    es.type = b.dataset.type;
    saveEs();
    drawTypes();
    drawList();
    window.scrollTo(0, 0);
  };
  return false;
}
function drawLevels() {
  $("levels").innerHTML = LEVELS.map(L => {
    const done = BY[L.id].filter(i => learned.has(ESSAYS[i].key)).length;
    return `<button type="button" class="lv" data-level="${L.id}" aria-pressed="${L.id === es.level}">
      <b>${L.id}</b><span>${L.name}${done ? ` · ✓${done}` : ""}</span></button>`;
  }).join("");
}
function drawTypes() {
  const counts = {};
  BY[es.level].forEach(i => { counts[ESSAYS[i].t] = (counts[ESSAYS[i].t] || 0) + 1; });
  if (es.type !== "全部" && !counts[es.type]) es.type = "全部";
  $("types").innerHTML = [["全部", BY[es.level].length], ...TYPES.filter(t => counts[t]).map(t => [t, counts[t]])].map(([t, n]) =>
    `<button type="button" class="chip" data-type="${t}" aria-pressed="${t === es.type}">${t}<span class="n">${n}</span></button>`).join("");
}
function drawList() {
  const list = BY[es.level].filter(i => es.type === "全部" || ESSAYS[i].t === es.type);
  $("elist").innerHTML = list.map(i => {
    const e = ESSAYS[i];
    return `<li><a class="eitem" href="#essay/${e.slug}">
      <span class="no">${String(e.n).padStart(2, "0")}</span>
      <span><b lang="it">${esc(e.title)}</b><small>${e.t} · ${e.topic} · ${e.wc} 词</small></span>
      ${learned.has(e.key) ? `<span class="ok" title="已掌握">${ICON.check}</span>` : "<span></span>"}
    </a></li>`;
  }).join("");
}

/* ---------- reader ---------- */
let shown = null;        // the essay on screen
let fromList = false;    // opened from the list, so "back" can simply go back

export function renderReader(view, slug) {
  const i = ESSAYS.findIndex(x => x.slug === slug);
  if (i < 0) { location.replace("#essays"); return true; }
  const e = shown = ESSAYS[i];
  if (nav.prev === "essays") fromList = true;
  else if (!nav.prev.startsWith("essay/")) fromList = false;
  if (es.level !== e.l) { es.level = e.l; saveEs(); }
  if (player.active && player.kind.startsWith("essay:") && !player.kind.startsWith(`essay:${e.key}:`)) stopList();
  const list = BY[e.l], at = list.indexOf(i);
  const prev = at > 0 ? ESSAYS[list[at - 1]] : null;
  const next = at < list.length - 1 ? ESSAYS[list[at + 1]] : null;
  const pg = (x, dir) => `<button type="button" class="pg ${dir}" data-go="${x.slug}">
    <span>${dir === "prev" ? "← 上一篇" : "下一篇 →"}</span><b lang="it">${esc(x.title)}</b></button>`;
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="rBack" aria-label="返回范文目录">${ICON.back}</button>
      <div class="rhead"><b>${e.l} · 第 ${e.n} 篇</b><small>${e.t} · ${e.topic}</small></div>
      <span class="grow"></span>
      <button type="button" class="iconbtn" data-go="${prev ? prev.slug : ""}" aria-label="上一篇"${prev ? "" : " disabled"}>${ICON.back}</button>
      <button type="button" class="iconbtn" data-go="${next ? next.slug : ""}" aria-label="下一篇"${next ? "" : " disabled"}>${ICON.fwd}</button>
    </div></header>
    <article class="essay pad" id="essay">
      <h2><button type="button" class="btn-title" data-act="title" lang="it">${esc(e.title)}${ICON.spk}</button></h2>
      <div class="emeta">
        <span class="wc"><b>${e.wc}</b> parole · 题目要求 ${e.range} 词</span>
        <button type="button" class="learn" id="learn"></button>
      </div>
      <section class="task">
        <p class="eyebrow">Compito · 题目</p>
        <button type="button" class="btn-task" data-act="task" lang="it">${esc(e.pit)}${ICON.spk}</button>
        <p class="task-zh">${esc(e.pzh)}</p>
      </section>
      <div class="eplay">
        <button type="button" class="pbtn it" id="pIt"></button>
        <button type="button" class="pbtn en" id="pEn"></button>
      </div>
      <div class="eopts">
        <div class="seg" id="views" role="group" aria-label="显示方式">
          <button type="button" data-view="sent">逐句</button><button type="button" data-view="full">全文</button>
        </div>
        <button type="button" class="txtbtn" id="tZh">中文</button>
        <button type="button" class="txtbtn" id="tEn">英文</button>
        <button type="button" class="txtbtn" id="tHide">遮住原文</button>
        <button type="button" class="txtbtn" id="tEcho">跟读停顿</button>
      </div>
      <p class="hint" id="hint"></p>
      <div id="ebody"></div>
      <section class="tip"><p class="eyebrow">写作要点</p><p>${esc(e.tip)}</p></section>
      <div class="pager">${prev ? pg(prev, "prev") : ""}${next ? pg(next, "next") : ""}</div>
    </article>`;

  $("rBack").onclick = () => (fromList ? history.back() : location.replace("#essays"));
  // prev/next replace the reader in history, so "back" still returns to the list in one step
  const goTo = ev => {
    const go = ev.target.closest("[data-go]");
    if (go && go.dataset.go) location.replace("#essay/" + go.dataset.go);
    return !!go;
  };
  view.querySelector(".vbar").onclick = goTo;
  $("essay").onclick = ev => {
    if (goTo(ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, k = Number(b.dataset.k);
    if (act === "title") speakOne(e.title, "it", b);
    else if (act === "task") speakOne(e.pit, "it", b);
    else if (act === "s") {
      if (settings.essayHide) b.classList.add("shown");
      speakOne(e.s[k][0], "it", b);
    } else if (act === "t") speakOne(e.s[k][2], "en", b);
  };
  $("essay").onkeydown = ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".fs")) { ev.preventDefault(); ev.target.click(); }
  };
  $("learn").onclick = () => {
    if (learned.has(e.key)) learned.delete(e.key); else learned.add(e.key);
    saveLearned();
    drawLearn();
  };
  $("pIt").onclick = () => togglePlay("it");
  $("pEn").onclick = () => togglePlay("en");
  $("views").onclick = ev => {
    const b = ev.target.closest("[data-view]");
    if (!b || b.dataset.view === settings.essayView) return;
    if (player.active && player.kind.startsWith(`essay:${e.key}:`)) stopList();
    settings.essayView = b.dataset.view;
    saveSettings();
    drawBody();
    applyOptions();
  };
  const flipOption = key => () => { settings[key] = !settings[key]; saveSettings(); applyOptions(); };
  $("tZh").onclick = flipOption("essayZh");
  $("tEn").onclick = flipOption("essayEn");
  $("tEcho").onclick = flipOption("echo");
  $("tHide").onclick = () => {
    flipOption("essayHide")();
    document.querySelectorAll("#ebody .shown").forEach(el => el.classList.remove("shown"));
  };

  drawLearn();
  drawBody();
  applyOptions();
  drawPlayButtons();
  return false;
}

function drawLearn() {
  const b = $("learn"), on = learned.has(shown.key);
  b.setAttribute("aria-pressed", String(on));
  b.innerHTML = on ? ICON.check + "已掌握" : "标记为已掌握";
}

// paragraphs for the full-text view: letters get salutation, body and sign-off on their own lines
function blocks(e) {
  const n = e.s.length, all = [...Array(n).keys()];
  if (isLetter(e)) {
    const close = n > 3 && wordsIn(e.s[n - 1][0]) <= 3 ? n - 2 : n - 1;
    return [[0], all.slice(1, close), ...all.slice(close).map(k => [k])].filter(b => b.length);
  }
  if (n >= 7) return [[0], all.slice(1, n - 1), [n - 1]];
  return [all];
}

function drawBody() {
  const e = shown;
  if (settings.essayView !== "full") {
    $("ebody").innerHTML = `<ol class="sents">${e.s.map(([it, zh, en], k) => `<li class="sent">
      <button type="button" class="s-it" data-act="s" data-k="${k}" data-say="s:${k}" lang="it"><span class="txt">${esc(it)}</span>${ICON.spk}</button>
      <div class="s-zh zh-part">${esc(zh)}</div>
      <button type="button" class="s-en en-part" data-act="t" data-k="${k}" data-say="t:${k}" lang="en">${esc(en)}${ICON.spk}</button>
    </li>`).join("")}</ol>`;
    return;
  }
  const B = blocks(e), letter = isLetter(e);
  const span = (k, col, act) => `<span class="fs" role="button" tabindex="0" data-act="${act}" data-k="${k}" data-say="${act}:${k}">${esc(e.s[k][col])}</span>`;
  const paper = B.map((b, bi) => `<p${letter && bi > 0 && b.length > 1 ? ' class="body"' : ""}>${b.map(k => span(k, 0, "s")).join(" ")}</p>`).join("");
  const zh = B.map(b => `<p>${b.map(k => esc(e.s[k][1])).join("")}</p>`).join("");
  const en = B.map(b => `<p>${b.map(k => span(k, 2, "t")).join(" ")}</p>`).join("");
  $("ebody").innerHTML = `<div class="full">
    <div class="paper${letter ? " letter" : ""}" lang="it">${paper}</div>
    <div class="trans zh zh-part"><p class="eyebrow">中文翻译</p>${zh}</div>
    <div class="trans en en-part" lang="en"><p class="eyebrow">English</p>${en}</div>
  </div>`;
}

function applyOptions() {
  const a = $("essay");
  a.classList.toggle("hide-zh", !settings.essayZh);
  a.classList.toggle("hide-en", !settings.essayEn);
  a.classList.toggle("hide-it", settings.essayHide);
  $("tZh").setAttribute("aria-pressed", String(settings.essayZh));
  $("tEn").setAttribute("aria-pressed", String(settings.essayEn));
  $("tHide").setAttribute("aria-pressed", String(settings.essayHide));
  $("tEcho").setAttribute("aria-pressed", String(settings.echo));
  document.querySelectorAll("#views button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === settings.essayView)));
  $("hint").textContent = settings.essayHide
    ? "回译练习：先看中文自己写出意大利语，再点模糊的句子对照答案。"
    : settings.echo ? "跟读停顿：朗读全文时，每句读完会停一会儿，留时间给你跟着说。" : "";
}

function togglePlay(lang) {
  const e = shown, kind = `essay:${e.key}:${lang}`;
  if (player.active && player.kind === kind) { stopList(); return; }
  const col = lang === "it" ? 0 : 2, pre = lang === "it" ? "s:" : "t:";
  playList({
    kind, title: e.title, items: e.s.map((_, k) => k), label: k => e.s[k][col],
    expand: k => [{ text: e.s[k][col], lang, sel: pre + k, gap: 450, echo: settings.echo }]
  });
}
function drawPlayButtons() {
  const it = $("pIt"), en = $("pEn");
  if (!it || !shown) return;
  const kind = player.active ? player.kind : "";
  it.innerHTML = kind === `essay:${shown.key}:it` ? ICON.stop + "停止" : ICON.play + "朗读全文";
  en.innerHTML = kind === `essay:${shown.key}:en` ? ICON.stop + "停止" : ICON.play + "英文朗读";
}
onPlayer(drawPlayButtons);
