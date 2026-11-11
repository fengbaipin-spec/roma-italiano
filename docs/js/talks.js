// 情景对话: everyday conversations in Rome. Listen to a whole dialogue, or play one role: the app says the
// other person's lines and waits for yours. Any line can be recorded and played back next to the model,
// and, when switched on in settings, checked by speech recognition.
import { $, esc, ICON, nav, toast, sleep } from "./util.js";
import { settings, saveSettings, talked, saveTalked } from "./store.js";
import { say, speakOne, halt, playList, stopList, player, onPlayer, speech, otherVoice, bringIntoView } from "./speech.js";
import { tapWords, showWord, hintOnce } from "./wordinfo.js";
import { canRecord, record, stopRecording, playClip, stopClip } from "./recorder.js";
import { canRecognize, recognize, stopRecognizing, spellNumbers } from "./listen.js";
import { compare } from "./diff.js";

const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MAX_CLIP = 15000;

let TALKS = [];
export function setTalks(data) { TALKS = data.dialogues; }

let cur = null;            // the dialogue on screen
let rp = null;             // role-play in progress: { role, pos, waiting } (waiting: it is the user's turn)
let token = 0;             // bumped to cancel whatever is playing or waiting
let busy = false;          // the microphone is in use
let fromList = false;      // the dialogue was opened from the list, so going back is a history step
let listFromLearn = false; // the same for the list and the 学习 tab
const clips = new Map();   // line → the user's recording, kept only while this page is open

const myRole = () => (settings.talkRole === "A" ? "A" : "B");
const otherRole = () => (myRole() === "A" ? "B" : "A");
// the user's lines use the voice chosen in settings, the other person a second voice
const voiceFor = who => (who === myRole() ? speech.it : otherVoice());
const lineEl = k => document.querySelector(`#tLines .bub[data-k="${k}"]`);
const speakLine = k => speakOne(cur.lines[k][1], "it", lineEl(k)?.querySelector(".say"), null, voiceFor(cur.lines[k][0]));
// ends a role-play, lets go of the microphone and drops the recordings; a dialogue playing in the player bar goes on
function quiet() {
  token++;
  rp = null;
  if (!player.active) halt();
  stopClip();
  stopRecording();
  stopRecognizing();
  clips.clear();
}
function stopAll() {
  if (player.active && player.kind.startsWith("talk:")) stopList();
  quiet();
}
const TALK_SCREEN = /#talks?(\/|$)/;
addEventListener("hashchange", e => {
  if (TALK_SCREEN.test(e.oldURL) && !TALK_SCREEN.test(location.hash)) quiet();
});

/* ---------- list ---------- */
export function renderTalks(view) {
  quiet();
  if (nav.prev === "learn") listFromLearn = true;
  else if (!nav.prev.startsWith("talk/")) listFromLearn = false;
  const done = TALKS.filter(d => talked.has(d.id)).length;
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="tkClose" aria-label="返回学习首页">${ICON.close}</button>
      <b class="rtitle">情景对话</b><span class="grow"></span><span class="vcount">练过 ${done} / ${TALKS.length}</span>
    </div></header>
    <div class="drill pad">
      <p class="lead">在罗马生活最常遇到的 ${TALKS.length} 个场景。先听整段对话，再做角色扮演：App 说对方的台词，停下来等你说自己的那一句。</p>
      <ul class="tlist">${TALKS.map(d => `<li><a class="titem" href="#talk/${d.id}">
        <span class="lvl">${d.level}</span>
        <span><b>${esc(d.zh)}</b><small lang="it">${esc(d.title)} · ${d.lines.length} 句</small></span>
        ${talked.has(d.id) ? `<span class="ok" title="练过">${ICON.check}</span>` : "<span></span>"}
      </a></li>`).join("")}</ul>
    </div>`;
  $("tkClose").onclick = () => (listFromLearn ? history.back() : location.replace("#learn"));
  return false;
}

/* ---------- one dialogue ---------- */
export function renderTalk(view, id) {
  const d = TALKS.find(x => x.id === id);
  if (!d) { location.replace("#talks"); return true; }
  stopAll();
  cur = d;
  if (nav.prev === "talks") fromList = true;
  else if (!nav.prev.startsWith("talk/")) fromList = false;
  view.innerHTML = `
    <header class="vbar"><div class="vrow">
      <button type="button" class="iconbtn" id="tBack" aria-label="返回对话列表">${ICON.back}</button>
      <div class="rhead"><b>${esc(d.zh)}</b><small lang="it">${esc(d.title)} · ${d.level}</small></div>
      <span class="grow"></span>
    </div></header>
    <div class="talk pad" id="talk">
      <section class="task"><p class="eyebrow">场景</p><p class="tintro">${esc(d.intro)}</p></section>
      <div class="eplay">
        <button type="button" class="pbtn it" id="tListen"></button>
        <button type="button" class="pbtn en" id="tPlay"></button>
      </div>
      <div class="eopts">
        <span class="flabel">我来说</span>
        <div class="seg" id="tRole" role="group" aria-label="我来说哪个角色">
          <button type="button" data-role="B">${esc(d.roles.B)}</button><button type="button" data-role="A">${esc(d.roles.A)}</button>
        </div>
        <button type="button" class="txtbtn" id="tZh">中文</button>
        <button type="button" class="txtbtn" id="tEn">英文</button>
      </div>
      <p class="hint" id="tHint"></p>
      <ol class="bubbles" id="tLines"></ol>
      <div id="tDone"></div>
      <section class="tip"><p class="eyebrow">有用的说法</p>
        <ul class="tips" id="tTips">${d.tips.map(([it, zh], k) => `<li>
          <button type="button" class="exit" data-tip="${k}" lang="it">${esc(it)}${ICON.spk}</button><span class="exzh">${esc(zh)}</span></li>`).join("")}</ul>
      </section>
    </div>`;
  $("tBack").onclick = () => (fromList ? history.back() : location.replace("#talks"));
  $("tListen").onclick = listenAll;
  $("tPlay").onclick = () => (rp ? endRolePlay() : startRolePlay());
  $("tRole").onclick = e => {
    const b = e.target.closest("[data-role]");
    if (!b || b.dataset.role === myRole()) return;
    stopAll();
    settings.talkRole = b.dataset.role;
    saveSettings();
    drawLines();
    drawControls();
  };
  $("tZh").onclick = () => { settings.talkZh = !settings.talkZh; saveSettings(); drawControls(); };
  $("tEn").onclick = () => { settings.talkEn = !settings.talkEn; saveSettings(); drawControls(); };
  $("tLines").onclick = onLineClick;
  $("tTips").onclick = e => {
    const b = e.target.closest("[data-tip]");
    if (b) speakOne(d.tips[Number(b.dataset.tip)][0], "it", b);
  };
  $("tDone").onclick = onDoneClick;
  drawLines();
  drawControls();
  hintOnce();
  return false;
}

function drawLines() {
  const role = myRole();
  $("tLines").classList.remove("rp");
  $("tLines").innerHTML = cur.lines.map(([who, it, zh, en], k) => `
    <li class="bub ${who === role ? "mine" : "theirs"}" data-k="${k}">
      <p class="who">${who === role ? "你" : "对方"} · ${esc(cur.roles[who])}</p>
      <div class="say" data-say="l:${k}" lang="it">${tapWords(it)}<span class="acts"><button type="button" class="sspk" data-act="play" aria-label="朗读这一句">${ICON.spk}</button><button type="button" class="mic" data-act="rec" aria-label="录下我说的这一句">${MIC}</button></span></div>
      <div class="bz zh-part">${esc(zh)}</div>
      <div class="be en-part" lang="en">${esc(en)}</div>
      <div class="recbox" hidden></div>
    </li>`).join("");
  $("tDone").innerHTML = "";
}

function drawControls() {
  const box = $("talk");
  if (!box || !cur) return;
  box.classList.toggle("hide-zh", !settings.talkZh);
  box.classList.toggle("hide-en", !settings.talkEn);
  $("tZh").setAttribute("aria-pressed", String(settings.talkZh));
  $("tEn").setAttribute("aria-pressed", String(settings.talkEn));
  document.querySelectorAll("#tRole button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.role === myRole())));
  const listening = player.active && player.kind === `talk:${cur.id}`;
  $("tListen").innerHTML = listening ? ICON.stop + "停止" : ICON.play + "听整段对话";
  $("tPlay").innerHTML = rp ? ICON.stop + "结束角色扮演" : MIC + "角色扮演";
  const recog = settings.recognize && canRecognize();
  $("tHint").textContent = rp
    ? `角色扮演：App 说${cur.roles[otherRole()]}的台词。轮到你时，看着中文用意大利语说出来，再听标准说法。`
    : `点句子后面的麦克风，${recog ? "说一句，App 会标出没听懂的词" : "录下你说的，再和标准读音对比"}。点句子里的单词可以看解释。`;
}
onPlayer(() => { if ($("tListen")) drawControls(); });

function onLineClick(ev) {
  const li = ev.target.closest(".bub");
  if (!li) return;
  const k = Number(li.dataset.k), line = cur.lines[k];
  // during a role-play turn your sentence is hidden; the first tap on it shows it
  if (li.classList.contains("turn") && !li.classList.contains("shown") && ev.target.closest(".say")) {
    li.classList.add("shown");
    return;
  }
  const wd = ev.target.closest(".wd");
  if (wd) { showWord(line[1], Number(wd.dataset.k), wd, () => speakLine(k)); return; }
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  // while the other person is talking in a role-play, playing or recording would talk over them
  if (rp && !rp.waiting && ["play", "rec", "cmp", "mine"].includes(act)) { toast("等对方说完"); return; }
  if (act === "play") speakLine(k);
  else if (act === "rec") useMic(k, b);
  else if (act === "mine") { const c = clips.get(k); if (c) { halt(); playClip(c); } }
  else if (act === "cmp") compareWithMine(k);
  else if (act === "show") li.classList.add("shown");
  else if (act === "model") { li.classList.add("shown"); speakLine(k); }
  else if (act === "next") nextTurn();
}

/* ---------- recording and recognition ---------- */
function micState(btn, state, sec = 0) {
  btn.classList.toggle("on", !!state);
  const label = btn.classList.contains("txtbtn") ? "说一遍" : "";
  if (state === "rec") btn.innerHTML = `${ICON.stop}<span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}</span>`;
  else if (state === "listen") btn.innerHTML = `${MIC}<span>在听…</span>`;
  else btn.innerHTML = MIC + label;
  btn.setAttribute("aria-label", state ? "停止" : "录下我说的这一句");
}

async function useMic(k, btn) {
  // a second tap while recording or listening stops it
  if (busy) { stopRecording(); stopRecognizing(); return; }
  if (player.active) stopList();
  halt();
  stopClip();
  if (settings.recognize && canRecognize()) { await listenTo(k, btn); return; }
  if (!canRecord()) { toast("这个浏览器不能录音"); return; }
  const t = token;
  busy = true;
  micState(btn, "rec");
  let clip = null;
  try {
    clip = await record(MAX_CLIP, s => micState(btn, "rec", s));
  } catch (e) {
    if (t === token) toast(micError(e));
  }
  busy = false;
  micState(btn, "");
  // the page moved on (next turn, another role, left) while recording: the clip is dropped
  if (t !== token || !clip || !clip.size || !lineEl(k)) return;
  clips.set(k, clip);
  lineEl(k).classList.add("shown");
  const box = lineEl(k).querySelector(".recbox");
  box.hidden = false;
  box.innerHTML = `<div class="btnrow">
      <button type="button" class="txtbtn" data-act="cmp">${ICON.play}先听标准，再听我的</button>
      <button type="button" class="txtbtn" data-act="mine">${ICON.play}只听我的</button>
    </div>
    <p class="note">录音不保存，离开这一页就删掉。</p>`;
  compareWithMine(k);
}

async function compareWithMine(k) {
  const clip = clips.get(k);
  if (!clip) return;
  stopClip();
  const t = token;
  await speakLine(k);
  await sleep(300);
  if (t === token && clips.get(k) === clip && lineEl(k)) await playClip(clip);
}

async function listenTo(k, btn) {
  const t = token;
  busy = true;
  micState(btn, "listen");
  const r = await recognize("it-IT");
  busy = false;
  micState(btn, "");
  const box = lineEl(k)?.querySelector(".recbox");
  if (t !== token || !box) return;
  if (!r.alternatives.length) { toast(recognitionError(r.error)); return; }
  lineEl(k).classList.add("shown");
  // of the guesses Chrome offers, keep the one closest to the sentence
  let best = null;
  for (const alt of r.alternatives) {
    const res = compare(cur.lines[k][1], spellNumbers(alt));
    if (!best || res.right > best.res.right) best = { alt, res };
  }
  const marked = best.res.words.map(x => x.status === "bad" ? `<span class="dw bad">${esc(x.text)}<small class="typed">${esc(x.typed)}</small></span>`
    : x.status === "miss" ? `<span class="dw miss">${esc(x.text)}</span>` : esc(x.text)).join(" ");
  box.hidden = false;
  box.innerHTML = `<p class="verdict ${best.res.perfect ? "good" : "bad"}">${best.res.perfect ? "每个词都听懂了！" : `听懂了 ${best.res.right} / ${best.res.total} 个词`}</p>
    <p class="marked" lang="it">${marked}</p>
    <p class="note">识别到：<span lang="it">${esc(best.alt)}</span></p>
    ${best.res.perfect ? "" : '<p class="note">红底的词没被听懂，后面的小字是被听成的词；虚线是没听到的词。识别结果只能当参考。</p>'}`;
}

function micError(e) {
  const name = e && e.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "需要允许 App 使用麦克风，可以在手机设置的应用权限里打开";
  if (name === "NotFoundError") return "没有找到麦克风";
  return "录音没有成功，再试一次";
}
function recognitionError(code) {
  return {
    "no-speech": "没听到声音，再说一次",
    "audio-capture": "没有找到麦克风",
    "not-allowed": "需要允许使用麦克风",
    "service-not-allowed": "这台手机现在不能用语音识别",
    network: "发音识别需要联网",
    aborted: "已停止",
    unsupported: "这个浏览器不支持语音识别"
  }[code] || "识别没有成功，再试一次";
}

/* ---------- listening and role-play ---------- */
function listenAll() {
  const kind = `talk:${cur.id}`;
  if (player.active && player.kind === kind) { stopList(); return; }
  if (rp) endRolePlay();
  const d = cur;
  playList({
    kind, title: d.zh, items: d.lines.map((_, k) => k), label: k => d.lines[k][1],
    expand: k => [{ text: d.lines[k][1], lang: "it", sel: "l:" + k, gap: 650, voice: voiceFor(d.lines[k][0]) }]
  });
}

function startRolePlay() {
  stopAll();
  drawLines();
  rp = { role: myRole(), pos: 0 };
  const list = $("tLines");
  list.classList.add("rp");
  for (const li of list.children) li.classList.add("future");
  drawControls();
  step(token);
}

// play the other person's lines until it is the user's turn, then wait for "下一句"
async function step(t) {
  while (rp && t === token && $("tLines")) {
    const k = rp.pos, line = cur.lines[k];
    if (!line) { finishRolePlay(); return; }
    const li = lineEl(k);
    li.classList.remove("future");
    bringIntoView(li);
    if (line[0] !== rp.role) {
      await say(line[1], "it", li.querySelector(".say"), null, otherVoice());
      if (t !== token) return;
      await sleep(350);
      if (t !== token) return;
      rp.pos++;
      continue;
    }
    rp.waiting = true;
    li.classList.add("turn");
    li.insertAdjacentHTML("beforeend", `<div class="turnbar">
      <p class="prompt">轮到你，用意大利语说：<b>${esc(line[2])}</b></p>
      <div class="btnrow">
        <button type="button" class="txtbtn primary" data-act="rec">${MIC}说一遍</button>
        <button type="button" class="txtbtn" data-act="show">看意大利语</button>
        <button type="button" class="txtbtn" data-act="model">${ICON.play}听标准说法</button>
        <button type="button" class="txtbtn" data-act="next">下一句${ICON.fwd}</button>
      </div></div>`);
    bringIntoView(li.querySelector(".turnbar"));
    return;
  }
}

function nextTurn() {
  if (!rp || !rp.waiting) return;
  // drop whatever this turn still had going: a recording, the model sentence, a comparison
  token++;
  stopRecording();
  stopRecognizing();
  stopClip();
  const li = lineEl(rp.pos);
  if (li) {
    li.classList.remove("turn");
    li.classList.add("shown");
    li.querySelector(".turnbar")?.remove();
  }
  rp.waiting = false;
  rp.pos++;
  step(token);
}

function finishRolePlay() {
  const mine = cur.lines.filter(l => l[0] === rp.role).length;
  rp = null;
  talked.add(cur.id);
  saveTalked();
  $("tLines").classList.remove("rp");
  $("tDone").innerHTML = `<div class="done">
    <p class="eyebrow">角色扮演完成</p>
    <h2 class="donetitle">你说完了全部 ${mine} 句</h2>
    <p>可以再练一遍，或者换个角色，说对方的台词。</p>
    <div class="donebtns">
      <button type="button" class="bigbtn" data-done="again">再练一遍</button>
      <button type="button" class="bigbtn soft" data-done="swap">换个角色：我来说${esc(cur.roles[otherRole()])}</button>
      <button type="button" class="bigbtn no" data-done="list">回到对话列表</button>
    </div></div>`;
  drawControls();
  bringIntoView($("tDone"));
}

function endRolePlay() {
  stopAll();
  drawLines();
  drawControls();
}

function onDoneClick(e) {
  const b = e.target.closest("[data-done]");
  if (!b) return;
  if (b.dataset.done === "again") startRolePlay();
  else if (b.dataset.done === "swap") {
    settings.talkRole = otherRole();
    saveSettings();
    startRolePlay();
  } else $("tBack").click();
}
