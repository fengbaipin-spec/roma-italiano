// Settings: voices and speed, display options, backup of starred words, install and updates.
import { $, esc, toast } from "./util.js";
import { settings, saveSettings, stars, learned, saveStars, saveLearned } from "./store.js";
import { speech, voicesFor, chooseVoice, onVoices, speakOne } from "./speech.js";
import { pwa, onPwa, promptInstall, checkForUpdate } from "./pwa.js";
import { wordCount, clearFlips } from "./dict.js";
import { essayCount } from "./essays.js";
import { learnedCount, masteredCount, exportRecords, importRecords } from "./srs.js";
import { VERSION } from "./version.js";

const SAMPLE = { it: "Buongiorno, vorrei un caffè, per favore.", en: "Good morning. How are you today?" };

export function renderSettings(view) {
  view.innerHTML = `
    <header class="vbar"><div class="vrow"><h1 class="vtitle">设置</h1></div></header>
    <div class="settings pad">
      <section class="group" id="gInstall"></section>

      <section class="group">
        <h2>发音</h2>
        <p id="vStatus"></p>
        <div class="field">
          <label for="vIt">意大利语声音</label>
          <div class="fieldrow"><select id="vIt"></select><button type="button" class="txtbtn" id="testIt">试听</button></div>
        </div>
        <div class="field">
          <label for="vEn">英语声音</label>
          <div class="fieldrow"><select id="vEn"></select><button type="button" class="txtbtn" id="testEn">试听</button></div>
        </div>
        <div class="notice" id="vWarn" hidden></div>
        <div class="field">
          <span class="flabel">语速</span>
          <div class="fieldrow"><div class="seg" id="rates" role="group" aria-label="语速">
            <button type="button" data-rate="0.6">慢速</button><button type="button" data-rate="0.8">中速</button><button type="button" data-rate="1">正常</button>
          </div></div>
        </div>
      </section>

      <section class="group">
        <h2>学习</h2>
        <div class="field">
          <span class="flabel">每天新词</span>
          <div class="fieldrow"><div class="seg" id="perDay" role="group" aria-label="每天新词">
            <button type="button" data-n="5">5 个</button><button type="button" data-n="10">10 个</button><button type="button" data-n="15">15 个</button><button type="button" data-n="20">20 个</button>
          </div></div>
        </div>
        <label class="switch"><span>新词、听写和听辨自动朗读</span><input type="checkbox" id="sAuto"></label>
      </section>

      <section class="group">
        <h2>词典</h2>
        <label class="switch"><span>例句默认展开</span><input type="checkbox" id="sExOpen"></label>
        <label class="switch"><span>连读时也读例句</span><input type="checkbox" id="sPlayEx"></label>
      </section>

      <section class="group">
        <h2>学习记录</h2>
        <p id="records"></p>
        <div class="btnrow">
          <button type="button" class="txtbtn" id="exportBtn">导出备份</button>
          <button type="button" class="txtbtn" id="importBtn">导入备份</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
        <p class="note">学习进度、收藏和“已掌握”只保存在这台手机上。换手机或清除浏览器数据之前，先导出一份备份。</p>
      </section>

      <section class="group">
        <h2>离线和更新</h2>
        <p id="offline"></p>
        <div class="btnrow"><button type="button" class="txtbtn" id="updBtn">检查更新</button></div>
      </section>

      <section class="group about">
        <h2>说明</h2>
        <p>词典 15 册共 ${wordCount()} 个词，范文 ${essayCount()} 篇（A1 到 B2）。</p>
        <p>发音用的是手机自带的语音，不同手机听起来会略有不同。</p>
        <p>例句和范文用第一人称，形容词和过去分词按男性写（stanco、sono andato）。女性把词尾换成 -a（stanca、sono andata）。</p>
        <p>内容没有经过意大利语母语老师审校。</p>
      </section>
    </div>`;

  $("vIt").onchange = e => { chooseVoice("it", e.target.value); speakOne(SAMPLE.it, "it", $("testIt")); };
  $("vEn").onchange = e => { chooseVoice("en", e.target.value); speakOne(SAMPLE.en, "en", $("testEn")); };
  $("testIt").onclick = e => speakOne(SAMPLE.it, "it", e.currentTarget);
  $("testEn").onclick = e => speakOne(SAMPLE.en, "en", e.currentTarget);
  $("rates").onclick = e => {
    const b = e.target.closest("[data-rate]");
    if (!b) return;
    settings.rate = Number(b.dataset.rate);
    saveSettings();
    drawRates();
  };
  $("perDay").onclick = e => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    settings.newPerDay = Number(b.dataset.n);
    saveSettings();
    drawPerDay();
  };
  $("sAuto").checked = settings.autoSay;
  $("sAuto").onchange = e => { settings.autoSay = e.target.checked; saveSettings(); };
  $("sExOpen").checked = settings.exOpen;
  $("sExOpen").onchange = e => { settings.exOpen = e.target.checked; clearFlips(); saveSettings(); };
  $("sPlayEx").checked = settings.playEx;
  $("sPlayEx").onchange = e => { settings.playEx = e.target.checked; saveSettings(); };
  $("exportBtn").onclick = exportBackup;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = importBackup;
  $("updBtn").onclick = async () => toast(await checkForUpdate());

  drawInstall();
  drawVoices();
  drawRates();
  drawPerDay();
  drawRecords();
  drawOffline();
  return false;
}

function drawInstall() {
  const g = $("gInstall");
  if (!g) return;
  if (pwa.standalone) { g.hidden = true; return; }
  g.innerHTML = `<h2>安装到桌面</h2><p>安装以后从桌面图标打开，全屏显示，没有网络也能用。</p>` + (pwa.prompt
    ? `<div class="btnrow"><button type="button" class="txtbtn primary" id="installBtn">安装</button></div>`
    : `<p class="note">在 Chrome 里点右上角的菜单 ⋮，选“安装应用”或“添加到主屏幕”。</p>`);
  if ($("installBtn")) $("installBtn").onclick = () => promptInstall();
}

function fill(sel, list, chosen) {
  sel.innerHTML = list.length
    ? list.map(v => `<option value="${esc(v.name)}"${chosen && v.name === chosen.name ? " selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")
    : '<option value="">没有找到这种语言的声音</option>';
  sel.disabled = !list.length;
}
function drawVoices() {
  if (!$("vIt")) return;
  fill($("vIt"), voicesFor("it"), speech.it);
  fill($("vEn"), voicesFor("en"), speech.en);
  const status = $("vStatus"), warn = $("vWarn");
  if (!speech.supported) {
    status.textContent = "这个浏览器不能朗读。请用 Chrome 打开。";
    warn.hidden = true;
    return;
  }
  if (!speech.checked) { status.textContent = "正在读取手机里的声音…"; return; }
  const missing = [!speech.it && "意大利语", !speech.en && "英语"].filter(Boolean);
  status.textContent = speech.it ? `意大利语：${speech.it.name}` : "";
  warn.hidden = !missing.length;
  warn.innerHTML = `<p><b>没有找到${missing.join("和")}声音。</b>现在点发音，可能会用其他语言的口音读出来。</p><ul>
    <li>安卓：打开手机“设置”，搜索“文字转语音”，首选引擎选 Google 语音服务，点旁边的齿轮 → 安装语音数据，下载 Italiano (Italia) 和 English (United Kingdom)。</li>
    <li>装好以后，把这个 App 完全关掉再打开。</li>
    <li>iPhone：设置 → 辅助功能 → 朗读内容 → 声音，下载意大利语和英语（英国）。</li></ul>`;
}
onVoices(drawVoices);

function drawRates() {
  document.querySelectorAll("#rates button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === settings.rate)));
}
function drawPerDay() {
  document.querySelectorAll("#perDay button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === settings.newPerDay)));
}
function drawRecords() {
  if ($("records")) {
    $("records").textContent = `已学 ${learnedCount()} 个词（已掌握 ${masteredCount()} 个）· 收藏 ${stars.size} 个词 · 已掌握范文 ${learned.size} 篇`;
  }
}
function drawOffline() {
  const p = $("offline");
  if (!p) return;
  p.textContent = !pwa.supported ? "这个浏览器不支持离线使用。"
    : pwa.offlineReady ? `已可离线使用 · 版本 ${VERSION}`
    : pwa.failed ? `离线功能没有启动，联网时可以正常使用 · 版本 ${VERSION}`
    : `正在准备离线内容… · 版本 ${VERSION}`;
}
onPwa(() => { drawInstall(); drawOffline(); });

function exportBackup() {
  const data = { app: "roma-italiano", format: 2, exported: new Date().toISOString(), stars: [...stars], learned: [...learned], ...exportRecords() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `罗马意大利语备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("备份文件已生成，在手机的“下载”里");
}

async function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "roma-italiano" || !Array.isArray(data.stars) || !Array.isArray(data.learned)) throw new Error("not a backup");
    data.stars.forEach(s => { if (typeof s === "string") stars.add(s); });
    data.learned.forEach(k => { if (typeof k === "string") learned.add(k); });
    saveStars();
    saveLearned();
    importRecords(data);
    drawRecords();
    toast(`已导入：已学 ${learnedCount()} 个词，收藏 ${stars.size} 个，已掌握范文 ${learned.size} 篇`);
  } catch (err) {
    toast("这个文件不是本 App 导出的备份");
  }
}
