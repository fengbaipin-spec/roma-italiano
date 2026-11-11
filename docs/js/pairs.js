// 难点听辨: hear one word of a pair that Chinese speakers tend to mix up, and pick which one it was.
import { $, esc, ICON, nav, shuffle } from "./util.js";
import { settings } from "./store.js";
import { speakOne } from "./speech.js";

const ROUND = 10;
const ALL_TIP = "下面每一对词只差一个音，而这个区别中文里没有，所以容易听混，写的时候也容易写错。先点词听一听，再开始听辨。";
let CATS = [];
let cat = "all";
let round = null;   // { items: [{ cat, p, side, flip }], pos, right, missed }

export function setPairs(data) { CATS = data.categories; }
const leave = () => (nav.prev === "learn" ? history.back() : location.replace("#learn"));
const pairsOf = id => (id === "all" ? CATS : CATS.filter(c => c.id === id)).flatMap(c => c.pairs.map(p => ({ cat: c, p })));
const wordBtn = (w, zh) => `<button type="button" class="pw" data-w="${esc(w)}" lang="it"><b>${esc(w)}</b><small>${esc(zh)}</small></button>`;

export function renderPairs(view) {
  round = null;
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="pClose" aria-label="结束听辨">${ICON.close}</button>
      <b class="rtitle">难点听辨</b><span class="grow"></span><span class="vcount" id="pCount"></span>
    </div><div class="pbar"><i id="pBar"></i></div></header>
    <div class="drill pad" id="pBody"></div>`;
  $("pClose").onclick = leave;
  // any word button on these screens can be tapped to hear it
  $("pBody").addEventListener("click", e => {
    const b = e.target.closest("[data-w]");
    if (b) speakOne(b.dataset.w, "it", b);
  });
  drawSetup();
  return false;
}

function drawSetup() {
  const c = CATS.find(x => x.id === cat);
  const list = pairsOf(cat);
  $("pCount").textContent = "";
  $("pBar").style.width = "0";
  $("pBody").innerHTML = `
    <div class="chiprow" id="pCats">${[["all", "全部", pairsOf("all").length], ...CATS.map(x => [x.id, x.name, x.pairs.length])].map(([id, name, n]) =>
      `<button type="button" class="chip" data-cat="${id}" aria-pressed="${id === cat}">${esc(name)}<span class="n">${n}</span></button>`).join("")}</div>
    <p class="lead">${esc(c ? c.tip : ALL_TIP)}</p>
    <button type="button" class="bigbtn" id="pStart">${ICON.play}开始听辨（${Math.min(ROUND, list.length)} 题）</button>
    <h2 class="sub">先听一听</h2>
    <ul class="pairlist">${list.map(({ p }) => `<li>${wordBtn(p[0], p[1])}<span class="vs">/</span>${wordBtn(p[2], p[3])}</li>`).join("")}</ul>`;
  $("pCats").onclick = e => {
    const b = e.target.closest("[data-cat]");
    if (!b || b.dataset.cat === cat) return;
    cat = b.dataset.cat;
    drawSetup();
  };
  $("pStart").onclick = () => start(list);
}

function start(list) {
  const items = shuffle(list.slice()).slice(0, ROUND).map(x => ({ ...x, side: Math.random() < 0.5 ? 0 : 1, flip: Math.random() < 0.5 }));
  round = { items, pos: 0, right: 0, missed: [] };
  drawQuestion();
}

function drawQuestion() {
  const q = round.items[round.pos];
  if (!q) { drawSummary(); return; }
  $("pCount").textContent = `${round.pos + 1} / ${round.items.length}`;
  $("pBar").style.width = `${Math.round((round.pos / round.items.length) * 100)}%`;
  const target = q.p[q.side * 2];
  const order = q.flip ? [1, 0] : [0, 1];
  $("pBody").innerHTML = `
    <p class="eyebrow">${esc(q.cat.name)}</p>
    <button type="button" class="pbtn it" id="pPlay">${ICON.play}再听一遍</button>
    <p class="lead">你听到的是哪一个？</p>
    <div class="choices" id="pChoices">${order.map(s =>
      `<button type="button" class="choice" data-side="${s}" lang="it"><b>${esc(q.p[s * 2])}</b><small>${esc(q.p[s * 2 + 1])}</small></button>`).join("")}</div>
    <p class="verdict" id="pVerdict"></p>
    <button type="button" class="bigbtn" id="pNext" hidden></button>`;
  const play = () => speakOne(target, "it", $("pPlay"));
  $("pPlay").onclick = play;
  let answered = false;
  $("pChoices").onclick = e => {
    const b = e.target.closest("[data-side]");
    if (!b) return;
    const s = Number(b.dataset.side);
    // once answered, both words can be tapped to compare them
    if (answered) { speakOne(q.p[s * 2], "it", b); return; }
    answered = true;
    const ok = s === q.side;
    if (ok) round.right++;
    else round.missed.push(q);
    for (const c of $("pChoices").children) {
      if (Number(c.dataset.side) === q.side) c.classList.add("right");
      else if (c === b) c.classList.add("wrong");
    }
    $("pVerdict").className = `verdict ${ok ? "good" : "bad"}`;
    $("pVerdict").textContent = ok ? "对了！点两个词还可以再对比听一听。" : `不对，读的是 ${target}。点两个词对比听一听。`;
    $("pNext").hidden = false;
    $("pNext").textContent = round.pos + 1 < round.items.length ? "下一题" : "看这一轮的结果";
  };
  $("pNext").onclick = () => {
    round.pos++;
    drawQuestion();
  };
  if (settings.autoSay) play();
}

function drawSummary() {
  $("pCount").textContent = "";
  $("pBar").style.width = "100%";
  const missed = round.missed;
  $("pBody").innerHTML = `<div class="done">
    <p class="eyebrow">这一轮完成</p>
    <h2 class="donetitle">${round.items.length} 题对了 ${round.right} 题</h2>
    ${missed.length ? `<p>听错的几对，多点几遍对比着听：</p>
      <ul class="pairlist">${missed.map(({ p }) => `<li>${wordBtn(p[0], p[1])}<span class="vs">/</span>${wordBtn(p[2], p[3])}</li>`).join("")}</ul>` : "<p>全部听对了。</p>"}
    <div class="donebtns">
      ${missed.length ? `<button type="button" class="bigbtn" id="pRetry">再练听错的 ${missed.length} 对</button>` : ""}
      <button type="button" class="bigbtn soft" id="pAgain">再来一轮</button>
      <button type="button" class="bigbtn no" id="pHome">回到学习首页</button>
    </div></div>`;
  if ($("pRetry")) $("pRetry").onclick = () => start(missed.map(({ cat: c, p }) => ({ cat: c, p })));
  $("pAgain").onclick = () => start(pairsOf(cat));
  $("pHome").onclick = leave;
}
