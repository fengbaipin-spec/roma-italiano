// The 学习 tab: today's plan, the study session (new words and reviews) and progress by volume.
import { $, esc, ICON, nav, openSheet, closeSheet } from "./util.js";
import { settings, saveSettings } from "./store.js";
import { speakOne } from "./speech.js";
import { words, volumes, byHead, CONJ_LABELS } from "./dict.js";
import * as rec from "./srs.js";

const LEVEL_NAMES = { A2: "基础", B1: "进阶", B2: "中高级" };
const MAX_REVIEWS = 60;   // after a long break hundreds can be due; take them one session at a time
const EXTRA = 5;          // "再学 5 个新词"
const PRESETS = [0, 5, 10, 15, 20, 30];
export const MAX_NEW = 100;

// 0 pauses new words and leaves only the reviews
export function setNewPerDay(n) {
  settings.newPerDay = Math.max(0, Math.min(MAX_NEW, Math.round(n)));
  saveSettings();
  return settings.newPerDay;
}

const fromVolume = () => (volumes()[settings.newFrom - 1] ? settings.newFrom : 1);
const newLeft = () => Math.max(0, settings.newPerDay - rec.doneToday()[0]);
const leave = () => (nav.prev === "learn" ? history.back() : location.replace("#learn"));

/* ---------- hub ---------- */
export function renderLearn(view) {
  const due = rec.dueWords().filter(it => byHead(it)).length;
  const fresh = rec.freshWords(words(), fromVolume(), newLeft()).length;
  const done = rec.doneToday(), streak = rec.streak();
  const date = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <h1 class="vtitle">学习</h1><span class="grow"></span>
      <span class="vcount">${date}${streak ? ` · 连续 ${streak} 天` : ""}</span>
    </div></header>
    <div class="hub pad">
      <section class="today">
        <div class="stats">
          <div class="stat"><b>${due}</b><span>待复习</span></div>
          <div class="stat"><b>${fresh}</b><span>今天的新词</span></div>
          <div class="stat"><b>${done[0] + done[1]}</b><span>今天已完成</span></div>
        </div>
        ${due || fresh
          ? `<button type="button" class="bigbtn" id="startStudy">${ICON.play}${done[0] + done[1] ? "继续今天的学习" : "开始今天的学习"}</button>`
          : `<p class="donetext">${settings.newPerDay ? "今天的复习和新词都完成了。" : "今天的复习都完成了，新词已暂停。"}</p>
             <button type="button" class="bigbtn soft" id="startMore">再学 ${EXTRA} 个新词</button>`}
        <p class="note">新词来自 <button type="button" class="linkbtn" id="pickFrom">${volumes()[fromVolume() - 1].name}${ICON.down}</button>，<button type="button" class="linkbtn" id="pickPerDay">${settings.newPerDay ? `每天 ${settings.newPerDay} 个` : "已暂停新词"}${ICON.down}</button>，收藏的词优先。记得的词会隔 1、3、7、14、30 天再出现。</p>
      </section>
      <div class="pcards">
        <a class="pcard" href="#dictation"><b>听写</b><span>听例句写意大利语，标出拼错的地方</span></a>
        <a class="pcard" href="#pairs"><b>难点听辨</b><span>r 和 l、双辅音、清浊音、gli 和 gn</span></a>
      </div>
      <section class="group">
        <h2>进度 · 已学 ${rec.learnedCount()} 个词，已掌握 ${rec.masteredCount()} 个</h2>
        <div class="vprogs">${progressRows()}</div>
        <p class="note">浅色是已学，深色是已掌握（隔 30 天还记得）。</p>
      </section>
    </div>`;
  if ($("startStudy")) $("startStudy").onclick = () => { location.hash = "#study"; };
  if ($("startMore")) $("startMore").onclick = () => { location.hash = "#study/more"; };
  $("pickFrom").onclick = () => pickFrom(view);
  $("pickPerDay").onclick = () => pickPerDay(view);
  return false;
}

function pickPerDay(view) {
  const html = `<div class="perday">
    <div class="chiprow">${PRESETS.map(n =>
      `<button type="button" class="chip" data-n="${n}" aria-pressed="${n === settings.newPerDay}">${n ? `${n} 个` : "暂停新词"}</button>`).join("")}</div>
    <div class="fieldrow">
      <label class="numfield" for="pdInput">自定义
        <input type="number" id="pdInput" inputmode="numeric" min="0" max="${MAX_NEW}" step="1" value="${settings.newPerDay}">个</label>
      <button type="button" class="txtbtn primary" id="pdOk">确定</button>
    </div>
    <p class="note">可以填 0 到 ${MAX_NEW}。填 0 表示先暂停新词，只做复习。今天已经学过的新词也算在里面。</p>
  </div>`;
  const done = n => {
    setNewPerDay(n);
    closeSheet();
    renderLearn(view);
  };
  const typed = () => {
    const box = $("pdInput"), n = Number(box.value);
    if (box.value.trim() === "" || !Number.isFinite(n)) { box.focus(); return; }
    done(n);
  };
  openSheet("每天学几个新词", html, e => {
    const b = e.target.closest("[data-n]");
    if (b) done(Number(b.dataset.n));
    else if (e.target.closest("#pdOk")) typed();
  });
  $("pdInput").addEventListener("keydown", e => { if (e.key === "Enter") typed(); });
}

function progressRows() {
  const all = words();
  return volumes().map(V => {
    let learned = 0, mastered = 0;
    for (let i = V.first; i < V.first + V.count; i++) {
      const s = rec.stageOf(all[i].it);
      if (s >= 0) learned++;
      if (s >= rec.MASTERED) mastered++;
    }
    const pct = n => `${Math.round((n / V.count) * 100)}%`;
    return `<div class="vprog"><span class="vp-name">${V.name}</span>
      <span class="vp-bar"><i class="l" style="width:${pct(learned)}"></i><i class="m" style="width:${pct(mastered)}"></i></span>
      <span class="vp-n">${learned}/${V.count}</span></div>`;
  }).join("");
}

function pickFrom(view) {
  const all = words();
  const html = ["A2", "B1", "B2"].map(L => `<p class="vgroup">${L} · ${LEVEL_NAMES[L]}</p>` +
    volumes().filter(V => V.level === L).map(V => {
      let learned = 0;
      for (let i = V.first; i < V.first + V.count; i++) if (rec.known(all[i].it)) learned++;
      return `<button type="button" class="vitem" data-v="${V.v}" aria-current="${V.v === fromVolume()}">
        <b>${V.name}</b><span class="n">已学 ${learned}/${V.count}</span>
        <small>${V.tags.slice(0, 6).map(esc).join(" · ")}</small></button>`;
    }).join("")).join("");
  openSheet("新词从哪一册开始", html, e => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    settings.newFrom = Number(b.dataset.v);
    saveSettings();
    closeSheet();
    renderLearn(view);
  });
}

/* ---------- study session ---------- */
let ses = null;

function newSession(extra) {
  const items = [];
  if (extra == null) {
    for (const it of rec.dueWords().slice(0, MAX_REVIEWS)) {
      const w = byHead(it);
      if (w) items.push({ kind: "review", w });
    }
  }
  for (const w of rec.freshWords(words(), fromVolume(), extra == null ? newLeft() : extra)) items.push({ kind: "new", w });
  return { items, pos: 0, shown: false, again: new Set(), counts: { fresh: 0, known: 0, review: 0, forgot: 0 } };
}

export function renderStudy(view, arg) {
  ses = newSession(arg === "more" ? EXTRA : null);
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="sClose" aria-label="结束学习">${ICON.close}</button>
      <b class="rtitle">今日学习</b><span class="grow"></span><span class="vcount" id="sCount"></span>
    </div><div class="pbar"><i id="sBar"></i></div></header>
    <div class="study pad" id="sBody"></div>`;
  $("sClose").onclick = leave;
  $("sBody").onclick = onCardClick;
  drawCard();
  return false;
}

function drawCard() {
  const item = ses.items[ses.pos], total = ses.items.length;
  $("sCount").textContent = item ? `${ses.pos + 1} / ${total}` : "";
  $("sBar").style.width = `${total ? Math.round(((item ? ses.pos : total) / total) * 100) : 100}%`;
  if (!item) { drawDone(); return; }
  const w = item.w, V = volumes()[w.v - 1], open = item.kind === "new";
  ses.shown = open;
  const label = { new: "新词", review: "复习", again: "再看一遍" }[item.kind];
  $("sBody").innerHTML = `
    <p class="eyebrow">${label} · ${V.name} · ${esc(w.tag)}</p>
    <button type="button" class="w big" data-s="it" lang="it">${esc(w.it)}${ICON.spk}</button>
    <button type="button" class="peek" id="peek"${open ? " hidden" : ""}>先想一想它的意思，再点这里看答案</button>
    <div class="answer" id="answer"${open ? "" : " hidden"}>
      <div class="zh big">${esc(w.zh)}</div>
      ${w.conj ? `<button type="button" class="conj" data-s="conj" lang="it"><span class="lbl">${CONJ_LABELS[w.tag] || "现在时"}</span>${esc(w.conj)}${ICON.spk}</button>` : ""}
      <div class="meta"><button type="button" class="en" data-s="en" lang="en">${esc(w.en)}${ICON.spk}</button></div>
      <div class="ex">
        <button type="button" class="exit" data-s="ex" lang="it">${esc(w.ex)}${ICON.spk}</button>
        <div class="exzh">${esc(w.exZh)}</div>
        <button type="button" class="exen" data-s="exen" lang="en">${esc(w.exEn)}${ICON.spk}</button>
      </div>
    </div>
    <div class="actions" id="actions"></div>`;
  drawActions(item);
  if (settings.autoSay) speakOne(w.it, "it", $("sBody").querySelector(".w"));
}

function drawActions(item) {
  const btn = (act, text, cls = "") => `<button type="button" class="bigbtn ${cls}" data-a="${act}">${text}</button>`;
  $("actions").innerHTML =
    item.kind === "new" ? btn("known", "已经认识", "no") + btn("learned", "学会了")
    : !ses.shown ? btn("show", "显示答案", "wide")
    : item.kind === "again" ? btn("next", "记住了，下一个", "wide")
    : btn("forgot", "不记得", "no") + btn("remember", "记得");
}

function show() {
  ses.shown = true;
  $("peek").hidden = true;
  $("answer").hidden = false;
  drawActions(ses.items[ses.pos]);
}

function onCardClick(e) {
  const item = ses.items[ses.pos];
  if (!item) return;
  const w = item.w;
  const s = e.target.closest("[data-s]");
  if (s) {
    const [text, lang] = { it: [w.it, "it"], conj: [w.conj, "it"], en: [w.en, "en"], ex: [w.ex, "it"], exen: [w.exEn, "en"] }[s.dataset.s];
    speakOne(text, lang, s);
    return;
  }
  if (e.target.closest("#peek")) { show(); return; }
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const c = ses.counts;
  switch (b.dataset.a) {
    case "show": show(); return;
    case "learned": rec.learnNew(w.it, false); c.fresh++; break;
    case "known": rec.learnNew(w.it, true); c.known++; break;
    case "remember": rec.review(w.it, true); c.review++; break;
    case "forgot":
      rec.review(w.it, false);
      c.review++;
      c.forgot++;
      // a forgotten word comes round once more at the end of today's session
      if (!ses.again.has(w.it)) { ses.again.add(w.it); ses.items.push({ kind: "again", w }); }
      break;
  }
  ses.pos++;
  drawCard();
  window.scrollTo(0, 0);
}

function drawDone() {
  const c = ses.counts, streak = rec.streak();
  const parts = [c.fresh && `学会 ${c.fresh} 个新词`, c.known && `${c.known} 个已经认识`, c.review && `复习 ${c.review} 个`,
    c.forgot && `其中 ${c.forgot} 个明天再复习`].filter(Boolean);
  $("sBody").innerHTML = `<div class="done">
    <p class="eyebrow">${ses.items.length ? "完成" : "没有要学的了"}</p>
    <h2 class="donetitle">${ses.items.length ? "今天的学习完成了" : "今天的都学完了"}</h2>
    <p>${parts.length ? parts.join("，") + "。" : "可以再学几个新词，或者做听写练习。"}${streak ? ` 已经连续学习 ${streak} 天。` : ""}</p>
    <div class="donebtns">
      <button type="button" class="bigbtn" id="dMore">再学 ${EXTRA} 个新词</button>
      <button type="button" class="bigbtn soft" id="dDict">做听写练习</button>
      <button type="button" class="bigbtn no" id="dHome">回到学习首页</button>
    </div></div>`;
  $("dMore").onclick = () => {
    ses = newSession(EXTRA);
    drawCard();
  };
  $("dDict").onclick = () => location.replace("#dictation");
  $("dHome").onclick = leave;
}
