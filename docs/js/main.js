// Starts the app: loads the data, routes between the four tabs and wires the shared player bar.
import { $, ICON, toast, setFab, closeSheet, nav } from "./util.js";
import { settings, saveSettings } from "./store.js";
import { initVoices, player, onPlayer, togglePause, skip, stopList } from "./speech.js";
import { initPwa } from "./pwa.js";
import { setVocab, renderDict, renderFavs } from "./dict.js";
import { setEssays, renderEssays, renderReader } from "./essays.js";
import { renderLearn, renderStudy } from "./learn.js";
import { renderDictation } from "./dictation.js";
import { setPairs, renderPairs } from "./pairs.js";
import { setTalks, renderTalks, renderTalk } from "./talks.js";
import { renderSettings } from "./settings.js";
import { warmLookup } from "./wordinfo.js";

const view = $("view");
// route name → [render(view, arg), tab to highlight]; a render returns true when it placed the scroll itself
const ROUTES = {
  learn: [renderLearn, "learn"],
  study: [renderStudy, "learn"],
  dictation: [renderDictation, "learn"],
  pairs: [renderPairs, "learn"],
  talks: [renderTalks, "learn"],
  talk: [renderTalk, "learn"],
  dict: [renderDict, "dict"],
  favs: [renderFavs, "favs"],
  essays: [renderEssays, "essays"],
  essay: [renderReader, "essays"],
  settings: [renderSettings, "settings"]
};
// screens you go into from a tab and leave with a close or back button; they always start at the top
const FLOWS = new Set(["essay", "study", "dictation", "pairs", "talks", "talk"]);
const scrollMemo = {};

function show() {
  closeSheet(true);
  const [name, arg = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  const route = ROUTES[name] ? name : "learn";
  const key = arg ? `${route}/${arg}` : route;
  if (nav.current) scrollMemo[nav.current] = scrollY;
  nav.prev = nav.current;
  nav.current = key;
  const [render, tab] = ROUTES[route];
  document.querySelectorAll("#tabbar a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
  setFab(null);
  view.dataset.view = route;
  const placed = render(view, arg);
  if (!placed) window.scrollTo(0, FLOWS.has(route) ? 0 : scrollMemo[key] || 0);
}

// tapping the tab you are already on scrolls back to the top (inside a flow it goes back to the tab's first screen)
$("tabbar").addEventListener("click", e => {
  const a = e.target.closest("a[data-tab]");
  if (!a || a.getAttribute("aria-current") !== "page" || FLOWS.has(view.dataset.view)) return;
  e.preventDefault();
  view.querySelector(".vbar")?.classList.remove("hide");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// the header slides away while scrolling down and comes back on the way up
let lastY = scrollY;
addEventListener("scroll", () => {
  const y = scrollY;
  const bar = view.querySelector(".vbar");
  if (bar && !(document.activeElement && document.activeElement.matches("input"))) {
    if (y > lastY + 8 && y > 140) bar.classList.add("hide");
    else if (y < lastY - 8 || y < 60) bar.classList.remove("hide");
  }
  lastY = y;
}, { passive: true });

/* ---------- player bar ---------- */
const RATES = [0.6, 0.8, 1];
function drawPlayer() {
  const on = player.active;
  $("player").hidden = !on;
  document.body.classList.toggle("playing", on);
  if (!on) return;
  const pos = Math.min(player.pos, player.items.length - 1);
  $("plNow").textContent = player.label(player.items[pos]);
  $("plNow").lang = player.kind.endsWith(":en") ? "en" : "it";
  $("plSub").textContent = `${player.title} · ${pos + 1}/${player.items.length}${player.paused ? " · 已暂停" : ""}`;
  $("plPause").innerHTML = player.paused ? ICON.play : ICON.pause;
  $("plPause").setAttribute("aria-label", player.paused ? "继续" : "暂停");
  $("plEx").hidden = player.kind !== "dict";
  $("plEx").setAttribute("aria-pressed", String(settings.playEx));
  $("plRate").textContent = settings.rate + "×";
}
onPlayer(drawPlayer);
$("plNext").innerHTML = ICON.next;
$("plStop").innerHTML = ICON.close;
$("plPause").onclick = togglePause;
$("plNext").onclick = skip;
$("plStop").onclick = () => stopList();
$("plRate").onclick = () => {
  settings.rate = RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length];
  saveSettings();
  drawPlayer();
  toast(`语速 ${settings.rate}×，从下一句开始`);
};
$("plEx").onclick = () => {
  settings.playEx = !settings.playEx;
  saveSettings();
  drawPlayer();
  toast(settings.playEx ? "连读时也读例句" : "连读时只读单词");
};

/* ---------- start ---------- */
async function boot() {
  initPwa();
  initVoices();
  const load = url => fetch(url).then(r => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });
  try {
    const [vocab, essays, pairs, talks] = await Promise.all(
      ["vocab", "essays", "pairs", "dialogues"].map(name => load(`data/${name}.json`)));
    setVocab(vocab);
    setEssays(essays);
    setPairs(pairs);
    setTalks(talks);
  } catch (err) {
    view.innerHTML = '<p class="loading">内容没有加载出来。第一次打开需要联网，请连上网络后重新打开。</p>';
    return;
  }
  addEventListener("hashchange", show);
  show();
  warmLookup();
}
boot();
